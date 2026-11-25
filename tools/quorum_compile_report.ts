import { tool } from "@opencode-ai/plugin";
import * as path from "node:path";
import {
  getDocketPaths,
  readJson,
  fileExists,
  readFileSafe,
} from "../lib/docket.js";
import * as fs from "node:fs/promises";
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

interface TallyManifest {
  runStatus: "conclusive" | "inconclusive";
  categoryTallies: {
    category: string;
    totalFindings: number;
    endorsed: number;
    rejected: number;
    unresolved: number;
    jurorErrors: number;
    status: "conclusive" | "inconclusive";
    reason?: string;
  }[];
  shortlistedIds: string[];
  droppedReasons: { id: string; reason: string; endorse: number; total: number }[];
  jurorErrors: { juror: string; category: string; error: string }[];
}

export default tool({
  description: `Compile the final verdict report from the shortlist. Writes verdict.md and returns the report.`,
  args: {
    caseId: tool.schema.string().describe("The case ID from open_case"),
  },
  async execute(args) {
    const paths = getDocketPaths(args.caseId);

    const caseContent = await readFileSafe(paths.caseMd);
    const taskLine = caseContent
      ?.match(/## Task\n(.+)/)?.[1]
      ?.trim();

    let findings: NormalizedFinding[] = [];
    if (await fileExists(paths.shortlistJson)) {
      findings = await readJson<NormalizedFinding[]>(paths.shortlistJson);
    }

    let tallyManifest: TallyManifest | null = null;
    const manifestPath = path.join(paths.verdictsDir, "..", "tally_manifest.json");
    if (await fileExists(manifestPath)) {
      tallyManifest = await readJson<TallyManifest>(manifestPath);
    }

    const groups = new Map<string, Map<string, NormalizedFinding[]>>();
    for (const f of findings) {
      if (!groups.has(f.category)) {
        groups.set(f.category, new Map());
      }
      const catGroup = groups.get(f.category)!;
      if (!catGroup.has(f.severity)) {
        catGroup.set(f.severity, []);
      }
      catGroup.get(f.severity)!.push(f);
    }

    const severityOrder = ["critical", "high", "med", "low"];

    let report = `# Quorum Verdict\n\n`;
    report += `**Case:** ${args.caseId}\n`;
    report += `**Task:** ${taskLine || "unspecified"}\n`;

    if (tallyManifest) {
      report += `**Run status:** ${tallyManifest.runStatus.toUpperCase()}\n`;

      if (tallyManifest.runStatus === "inconclusive") {
        report += `\n## INCONCLUSIVE — JURY FAILURE\n`;
        report += `One or more categories could not be judged because jurors failed.\n\n`;
        for (const err of tallyManifest.jurorErrors) {
          report += `- **${err.category}**: juror "${err.juror}" — ${err.error}\n`;
        }
        report += `\nThe results below are partial or unavailable. Fix the juror configuration and re-run.\n\n`;
      }
    }

    if (findings.length === 0) {
      report += `\n## No Confirmed Findings\n\n`;
      if (tallyManifest) {
        const allRejected = tallyManifest.categoryTallies.every(
          (c) => c.endorsed === 0 && c.rejected > 0 && c.unresolved === 0
        );
        const allUnresolved = tallyManifest.categoryTallies.every(
          (c) => c.endorsed === 0 && c.rejected === 0 && c.unresolved > 0
        );

        if (allUnresolved) {
          report += `**0 confirmed (jury never ran or all jurors failed).** See INCONCLUSIVE section above.\n\n`;
        } else if (allRejected) {
          report += `**0 confirmed — all claims were rejected by the jury.** The audit found no confirmed defects.\n\n`;
        } else {
          report += `**0 confirmed.** Some claims were rejected, some unresolved. See tally details.\n\n`;
        }
      } else {
        report += `**No findings were produced by witnesses. The audit found no defects.**\n\n`;
      }
    } else {
      report += `\n## Confirmed Findings (${findings.length})\n\n`;
    }

    for (const [category, severityMap] of groups) {
      report += `### ${category}\n\n`;
      for (const sev of severityOrder) {
        const items = severityMap.get(sev);
        if (!items || items.length === 0) continue;
        for (const f of items) {
          report += `#### [${f.severity.toUpperCase()}] ${f.type}: ${f.summary}\n`;
          report += `- **File:** \`${f.file}:${f.line}\`\n`;
          report += `- **Evidence:** ${f.evidence}\n`;
          if (f.suggested_fix) {
            report += `- **Suggested fix:** ${f.suggested_fix}\n`;
          }
          report += `- **Source:** ${f.source_workers.join(", ")} (${f.source_workers.length} witnesses)\n\n`;
        }
      }
    }

    if (tallyManifest) {
      report += `## Tally Details\n\n`;
      for (const ct of tallyManifest.categoryTallies) {
        const flag = ct.status === "inconclusive" ? " **INCONCLUSIVE**" : "";
        report += `- **${ct.category}**${flag}: ${ct.endorsed} endorsed, ${ct.rejected} rejected, ${ct.unresolved} unresolved`;
        if (ct.reason) report += ` (${ct.reason})`;
        report += `\n`;
      }
      report += `\n`;
    }

    report += `---\n*Report generated by Quorum*\n`;

    await fs.writeFile(paths.verdictMd, report, "utf8");
    await appendLog({
      event: "report_compiled",
      caseId: args.caseId,
      findingCount: findings.length,
      runStatus: tallyManifest?.runStatus,
    });

    return report;
  },
});
