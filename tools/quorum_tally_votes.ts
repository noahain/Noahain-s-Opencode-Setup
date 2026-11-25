import { tool } from "@opencode-ai/plugin";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  getDocketPaths,
  readJson,
  fileExists,
  writeJson,
  readFileSafe,
} from "../lib/docket.js";
import { appendLog } from "../lib/log.js";

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

interface VerdictFile {
  juror: string;
  ok: boolean;
  content: string;
  error?: string;
}

interface ParsedVerdict {
  claim_id: string;
  verdict: "endorse" | "reject" | "insufficient";
  rationale: string;
  juror: string;
}

interface VerdictResult {
  claim_id: string;
  juror: string;
  verdict: "endorse" | "reject" | "insufficient" | "error";
  error?: string;
}

interface VoteEntry {
  endorse: number;
  reject: number;
  insufficient: number;
  jurorErrors: number;
  claim: NormalizedFinding;
}

interface CategoryTally {
  category: string;
  totalFindings: number;
  endorsed: number;
  rejected: number;
  unresolved: number;
  jurorErrors: number;
  status: "conclusive" | "inconclusive";
  reason?: string;
}

function extractVerdicts(content: string): ParsedVerdict[] {
  const match = content.match(/\[[\s\S]*\]\s*$/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) return parsed as ParsedVerdict[];
    return [];
  } catch {
    return [];
  }
}

export default tool({
  description: `Tally juror votes across all categories. Keeps claims with >=2/3 endorsements. Returns per-finding tally + run status (conclusive/inconclusive).`,
  args: {
    caseId: tool.schema.string().describe("The case ID from open_case"),
  },
  async execute(args) {
    const paths = getDocketPaths(args.caseId);

    if (!(await fileExists(paths.findingsJson))) {
      return `No findings for case ${args.caseId}. Run collect_findings first.`;
    }

    const findings = await readJson<NormalizedFinding[]>(paths.findingsJson);

    const allVerdictResults: VerdictResult[] = [];
    const jurorErrorDetails: { juror: string; category: string; error: string }[] = [];

    let verdictDirs: string[] = [];
    let verdictReadFailed = false;
    try {
      verdictDirs = (await fs.readdir(paths.verdictsDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      verdictReadFailed = true;
    }

    for (const cat of verdictDirs) {
      const catDir = path.join(paths.verdictsDir, cat);
      let files: string[] = [];
      try {
        files = await fs.readdir(catDir);
      } catch {
        continue;
      }

      for (const f of files) {
        const data = await readFileSafe(path.join(catDir, f));
        if (!data) continue;
        try {
          const record = JSON.parse(data) as VerdictFile;
          if (!record.ok) {
            jurorErrorDetails.push({
              juror: record.juror || f,
              category: cat,
              error: record.error || "juror call failed",
            });

            const categoryFindings = findings.filter((fn) => fn.category === cat);
            for (const fn of categoryFindings) {
              allVerdictResults.push({
                claim_id: fn.id,
                juror: record.juror || f,
                verdict: "error",
                error: record.error || "juror call failed",
              });
            }
            continue;
          }

          if (record.content) {
            const verdicts = extractVerdicts(record.content);
            if (verdicts.length === 0) {
              const categoryFindings = findings.filter((fn) => fn.category === cat);
              for (const fn of categoryFindings) {
                allVerdictResults.push({
                  claim_id: fn.id,
                  juror: record.juror,
                  verdict: "error",
                  error: "no parseable verdicts in juror response",
                });
              }
            } else {
              for (const v of verdicts) {
                allVerdictResults.push({
                  claim_id: v.claim_id,
                  juror: v.juror || record.juror,
                  verdict: v.verdict,
                });
              }
            }
          } else {
            jurorErrorDetails.push({
              juror: record.juror || f,
              category: cat,
              error: "empty juror response",
            });

            const categoryFindings = findings.filter((fn) => fn.category === cat);
            for (const fn of categoryFindings) {
              allVerdictResults.push({
                claim_id: fn.id,
                juror: record.juror || f,
                verdict: "error",
                error: "empty juror response",
              });
            }
          }
        } catch (parseErr) {
          const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          jurorErrorDetails.push({
            juror: f,
            category: cat,
            error: `corrupt verdict file: ${errMsg}`,
          });
          const categoryFindings = findings.filter((fn) => fn.category === cat);
          for (const fn of categoryFindings) {
            allVerdictResults.push({
              claim_id: fn.id,
              juror: f,
              verdict: "error",
              error: "corrupt verdict file",
            });
          }
        }
      }
    }

    const voteMap = new Map<string, VoteEntry>();
    for (const f of findings) {
      voteMap.set(f.id, {
        endorse: 0,
        reject: 0,
        insufficient: 0,
        jurorErrors: 0,
        claim: f,
      });
    }

    for (const v of allVerdictResults) {
      const entry = voteMap.get(v.claim_id);
      if (!entry) continue;
      if (v.verdict === "endorse") entry.endorse++;
      else if (v.verdict === "reject") entry.reject++;
      else if (v.verdict === "insufficient") entry.insufficient++;
      else if (v.verdict === "error") entry.jurorErrors++;
    }

    const shortlisted: NormalizedFinding[] = [];
    const dropped: { id: string; endorse: number; total: number; reason: string; claim: NormalizedFinding }[] = [];

    for (const [id, entry] of voteMap) {
      if (entry.endorse >= 2) {
        shortlisted.push(entry.claim);
      } else {
        const total = entry.endorse + entry.reject + entry.insufficient + entry.jurorErrors;
        let reason = "rejected_by_jury";
        if (entry.jurorErrors === total && total > 0) {
          reason = "unresolved_juror_error";
        } else if (entry.jurorErrors > 0) {
          reason = `mixed (${entry.jurorErrors}/${total} juror errors)`;
        }
        dropped.push({ id, endorse: entry.endorse, total, reason, claim: entry.claim });
      }
    }

    const categoryTallies: CategoryTally[] = [];
    const allCategories = new Set(findings.map((f) => f.category));
    for (const cat of allCategories) {
      const catFindings = findings.filter((f) => f.category === cat);
      const catDropped = dropped.filter((d) => catFindings.some((f) => f.id === d.id));
      const catEndorsed = shortlisted.filter((f) => f.category === cat);

      let jurorErrors = 0;
      for (const d of catDropped) {
        if (d.reason === "unresolved_juror_error") jurorErrors++;
      }

      const jurorErrsForCat = jurorErrorDetails.filter((e) => e.category === cat);
      const isConclusive = jurorErrsForCat.length < 3;
      const status = isConclusive ? "conclusive" : "inconclusive";
      const reason = !isConclusive
        ? `all ${jurorErrsForCat.length} jurors failed: ${jurorErrsForCat.map((e) => e.error).join("; ")}`
        : undefined;

      categoryTallies.push({
        category: cat,
        totalFindings: catFindings.length,
        endorsed: catEndorsed.length,
        rejected: catDropped.filter((d) => d.reason === "rejected_by_jury").length,
        unresolved: catDropped.filter((d) => d.reason !== "rejected_by_jury").length,
        jurorErrors,
        status,
        reason,
      });
    }

    let runStatus = categoryTallies.every((c) => c.status === "conclusive")
      ? "conclusive"
      : "inconclusive";

    if (findings.length > 0 && allVerdictResults.length === 0) {
      runStatus = "inconclusive";
    }

    const tallyManifest = {
      runStatus,
      categoryTallies,
      shortlistedIds: shortlisted.map((f) => f.id),
      droppedReasons: dropped.map((d) => ({ id: d.id, reason: d.reason, endorse: d.endorse, total: d.total })),
      jurorErrors: jurorErrorDetails,
    };

    await writeJson(paths.shortlistJson, shortlisted);
    await writeJson(
      path.join(paths.verdictsDir, "..", "tally_manifest.json"),
      tallyManifest
    );

    await appendLog({
      event: "votes_tallied",
      caseId: args.caseId,
      runStatus,
      shortlistedCount: shortlisted.length,
      droppedCount: dropped.length,
      totalVerdicts: allVerdictResults.length,
    });

    const catLines = categoryTallies.map((c) => {
      const flag = c.status === "inconclusive" ? " INCONCLUSIVE" : "";
      return `  ${c.category}: ${c.endorsed} endorsed, ${c.rejected} rejected, ${c.unresolved} unresolved${flag}` +
        (c.reason ? ` — ${c.reason}` : "");
    }).join("\n");

    return `Tally: ${runStatus.toUpperCase()}` +
      `\nEndorsed (>=2/3): ${shortlisted.length}, Dropped: ${dropped.length}` +
      `\nJuror errors: ${jurorErrorDetails.length}` +
      `\n\nPer category:` +
      `\n${catLines}`;
  },
});
