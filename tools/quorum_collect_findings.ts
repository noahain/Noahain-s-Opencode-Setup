import { tool } from "@opencode-ai/plugin";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { getDocketPaths, readJson, fileExists, writeJson, readFileSafe } from "../lib/docket.js";
import { appendLog } from "../lib/log.js";

interface RawFinding {
  file?: string;
  line?: number;
  category?: string;
  type?: string;
  severity?: string;
  summary?: string;
  evidence?: string;
  suggested_fix?: string;
}

interface NormalizedFinding {
  id: string;
  file: string;
  line: number;
  category: string;
  type: string;
  severity: string;
  summary: string;
  evidence: string;
  suggested_fix?: string;
  source_workers: string[];
}

type CategoryEnum = "security" | "correctness" | "perf" | "bug" | "test-gap";

const CATEGORY_KEYWORDS: Record<CategoryEnum, string[]> = {
  security: [
    "security", "path traversal", "traversal", "injection", "xss", "csrf",
    "auth", "authentication", "authorization", "access control", "token",
    "jwt", "cors", "sanitize", "escape", "validation bypass",
    "input validation", "unsafe", "sensitive", "exposure", "disclosure",
    "privilege", "escalation", "secret", "credential", "key",
  ],
  correctness: [
    "correctness", "logic", "race", "toctou", "atomic", "consistency",
    "order", "edge case", "error handling", "validation", "invariant",
    "contract", "precondition", "postcondition", "off-by-one", "overflow",
    "underflow", "deadlock", "livelock", "starvation", "ordering",
    "concurrency", "corruption", "state", "transition",
  ],
  perf: [
    "perf", "performance", "slow", "latency", "memory", "leak",
    "optimization", "throughput", "allocation", "gc", "cache",
    "blocking", "synchronous", "n+1",
  ],
  bug: [
    "bug", "defect", "crash", "null", "undefined", "exception",
    "type error", "typo", "wrong", "incorrect", "broken", "fault",
    "missing", "empty", "undefined behavior",
  ],
  "test-gap": [
    "test-gap", "test", "coverage", "missing test", "untested",
    "uncovered", "no test", "spec",
  ],
};

function mapToCategory(raw: string | undefined, type: string | undefined): CategoryEnum {
  const text = ((raw || "") + " " + (type || "")).toLowerCase();

  const scores: Record<CategoryEnum, number> = {
    security: 0, correctness: 0, perf: 0, bug: 0, "test-gap": 0,
  };

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [CategoryEnum, string[]][]) {
    for (const kw of keywords) {
      if (text.includes(kw)) scores[cat] += kw.length;
    }
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best[1] > 0) return best[0];

  const typeLower = (type || "").toLowerCase();
  if (typeLower === "security") return "security";
  if (typeLower === "perf" || typeLower === "performance") return "perf";
  if (typeLower === "test-gap" || typeLower === "test") return "test-gap";
  if (typeLower === "bug") return "bug";
  return "correctness";
}

function severityOrder(s: string): number {
  const map: Record<string, number> = { critical: 0, high: 1, med: 2, low: 3 };
  return map[s] ?? 2;
}

function clusterFindings(raw: Omit<NormalizedFinding, "source_workers">[]): NormalizedFinding[] {
  const clusters: NormalizedFinding[] = [];
  const used = new Set<number>();
  let idCounter = 0;

  for (let i = 0; i < raw.length; i++) {
    if (used.has(i)) continue;
    used.add(i);

    const base = raw[i];
    const workers = new Set<string>([base.source_workers[0]]);
    let bestEvidence = base.evidence;
    let bestSeverity = base.severity;
    let bestSummary = base.summary;

    for (let j = i + 1; j < raw.length; j++) {
      if (used.has(j)) continue;
      const other = raw[j];

      const sameFile = base.file === other.file;
      const closeLine = Math.abs(base.line - other.line) <= 10;
      const summaryOverlap = longestCommonWords(base.summary, other.summary) >= 3;

      if (sameFile && closeLine && summaryOverlap) {
        used.add(j);
        for (const w of other.source_workers) workers.add(w);
        if (other.evidence.length > bestEvidence.length) bestEvidence = other.evidence;
        if (severityOrder(other.severity) < severityOrder(bestSeverity)) {
          bestSeverity = other.severity;
        }
        if (other.summary.length > bestSummary.length) bestSummary = other.summary;
      }
    }

    clusters.push({
      id: `f_${String(++idCounter).padStart(4, "0")}`,
      file: base.file,
      line: base.line,
      category: base.category,
      type: base.type,
      severity: bestSeverity,
      summary: bestSummary,
      evidence: bestEvidence,
      suggested_fix: base.suggested_fix,
      source_workers: [...workers].sort(),
    });
  }

  return clusters;
}

function longestCommonWords(a: string, b: string): number {
  const wa = a.toLowerCase().split(/\s+/);
  const wb = b.toLowerCase().split(/\s+/);
  let count = 0;
  for (const w of wa) {
    if (w.length < 3) continue;
    if (wb.includes(w)) count++;
  }
  return count;
}

function normalizeFindings(
  testimony: { content: string; model: string; itemId: string }[]
): { findings: NormalizedFinding[]; parseErrors: { itemId: string; model: string; reason: string; rawSnippet: string }[] } {
  const rawFindings: Omit<NormalizedFinding, "source_workers">[] = [];
  const parseErrors: { itemId: string; model: string; reason: string; rawSnippet: string }[] = [];
  let idCounter = 0;

  for (const t of testimony) {
    const jsonStr = extractJson(t.content);
    if (!jsonStr) {
      parseErrors.push({
        itemId: t.itemId,
        model: t.model,
        reason: "no JSON array/object found in response",
        rawSnippet: t.content.slice(0, 500),
      });
      continue;
    }

    let parsed: RawFinding[];
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      parseErrors.push({
        itemId: t.itemId,
        model: t.model,
        reason: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
        rawSnippet: jsonStr.slice(0, 500),
      });
      continue;
    }

    if (!Array.isArray(parsed)) {
      parseErrors.push({
        itemId: t.itemId,
        model: t.model,
        reason: "parsed value is not an array",
        rawSnippet: jsonStr.slice(0, 500),
      });
      continue;
    }

    for (const raw of parsed) {
      if (!raw.file || !raw.summary || !raw.evidence) continue;

      const category = mapToCategory(raw.category, raw.type);

      rawFindings.push({
        id: `f_${String(++idCounter).padStart(4, "0")}`,
        file: raw.file,
        line: raw.line ?? 0,
        category,
        type: raw.type ?? "correctness",
        severity: raw.severity ?? "med",
        summary: raw.summary,
        evidence: raw.evidence,
        suggested_fix: raw.suggested_fix,
        source_workers: [t.model],
      });
    }
  }

  const clusters = clusterFindings(rawFindings);
  return { findings: clusters, parseErrors };
}

function stripCodeFences(text: string): string {
  let stripped = text
    .replace(/^```(?:json)?\s*\n?/gm, "")
    .replace(/```\s*$/gm, "");
  const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)```/g;
  let match;
  while ((match = fencePattern.exec(stripped)) !== null) {
    stripped = stripped.replace(match[0], match[1]);
  }
  return stripped;
}

function extractJson(text: string): string | null {
  const clean = stripCodeFences(text);
  let match = clean.match(/\[[\s\S]*\]/);
  if (match) return match[0];
  match = clean.match(/\{[\s\S]*\}/);
  return match ? `[${match[0]}]` : null;
}

export default tool({
  description: `Collect and normalize all witness testimony into findings.json. Maps free-form categories to closed enum (security/correctness/perf/bug/test-gap), clusters duplicates by file+line+root cause, and assigns stable IDs. Returns categoriesPresent with counts for jury scheduling.`,
  args: {
    caseId: tool.schema.string().describe("The case ID from open_case"),
  },
  async execute(args) {
    const paths = getDocketPaths(args.caseId);

    let testimonyFiles: string[] = [];
    try {
      testimonyFiles = await fs.readdir(paths.testimonyDir);
    } catch {
      return `No testimony found for case ${args.caseId}. Summon witnesses first.`;
    }

    const testimony: { content: string; model: string; itemId: string }[] = [];
    const parseErrors: { itemId: string; model: string; reason: string; rawSnippet: string }[] = [];

    for (const f of testimonyFiles) {
      const data = await readFileSafe(path.join(paths.testimonyDir, f));
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as { item_id: string; model: string; ok: boolean; content: string; error?: string };
        const itemId = parsed.item_id || f.replace(/\.(json|error\.json|raw\.txt)$/, "");
        const model = parsed.model || "unknown";

        if (!parsed.ok) {
          parseErrors.push({
            itemId,
            model,
            reason: parsed.error || "unknown error",
            rawSnippet: parsed.content?.slice(0, 500) || "",
          });
          continue;
        }

        if (parsed.content) {
          testimony.push({ content: parsed.content, model, itemId });
        } else {
          parseErrors.push({
            itemId,
            model,
            reason: "empty content in response",
            rawSnippet: "",
          });
        }
      } catch {
        parseErrors.push({
          itemId: f,
          model: "unknown",
          reason: "malformed testimony file",
          rawSnippet: data.slice(0, 500),
        });
      }
    }

    const result = normalizeFindings(testimony);
    const allParseErrors = [...parseErrors, ...result.parseErrors];

    if (allParseErrors.length > 0) {
      await writeJson(
        path.join(paths.testimonyDir, "..", "parse_errors.json"),
        allParseErrors
      );
    }

    const findings = result.findings;

    const categoryCounts: Record<string, number> = {};
    for (const f of findings) {
      categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
    }

    await writeJson(paths.findingsJson, findings);
    await appendLog({
      event: "findings_collected",
      caseId: args.caseId,
      findingCount: findings.length,
      testimonyCount: testimony.length,
      categoriesPresent: Object.keys(categoryCounts),
    });

    const catLines = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, n]) => `  ${cat}: ${n}`)
      .join("\n");

    const categoriesPresent = Object.keys(categoryCounts);

    return `Collected ${findings.length} distinct claims from ${testimony.length} testimony responses.` +
      `\nJury categories:\n${catLines || "  (none)"}` +
      `\nParse errors: ${allParseErrors.length}` +
      `\ncategoriesPresent: ${JSON.stringify(categoriesPresent)}`;
  },
});
