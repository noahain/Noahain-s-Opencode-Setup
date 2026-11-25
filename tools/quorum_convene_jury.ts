import { tool } from "@opencode-ai/plugin";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  getDocketPaths,
  readJson,
  fileExists,
  ensureDir,
  readFileSafe,
  writeJson,
} from "../lib/docket.js";
import { callModel } from "../lib/http.js";
import { appendLog } from "../lib/log.js";
import { resolveConfig } from "../lib/config.js";

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

function buildJurorPrompt(
  category: string,
  findings: NormalizedFinding[],
  missionCriteria: string,
  agentsMd: string,
  contextBundle: string
): string {
  const claimsJson = JSON.stringify(
    findings.filter((f) => f.category === category),
    null,
    2
  );

  return `# ROLE
You are a Juror in a Quorum run — an independent reviewer from a different model
lineage than the Witnesses. You vote on each claim; you do not hunt for new ones.

# MISSION CRITERIA
${missionCriteria}
${agentsMd ? `\n# HOUSE RULES\n${agentsMd}\n` : ""}
# CONTEXT
${contextBundle}

# CLAIMS TO JUDGE
${claimsJson}

# HOW TO VOTE
For each claim id return: { claim_id, verdict, rationale }.
- endorse      — the evidence holds; the claim is real and in scope.
- reject       — the evidence is wrong, the code/spec doesn't say that, or it's a non-issue. REJECT freely; a clean reject beats a soft pass.
- insufficient — plausible, but the evidence doesn't prove it.
You are EXPECTED to reject some. Do not rubber-stamp. Output ONLY the JSON array.`;
}

export default tool({
  description: `Convene the jury for one defect category. Fires 3 parallel Juror calls and writes verdicts/<category>/<juror>.json. Category must be a defect type present in findings.`,
  args: {
    caseId: tool.schema.string().describe("The case ID from open_case"),
    category: tool.schema.string().describe("Defect category to judge (from collect_findings categoriesPresent)"),
    missionCriteria: tool.schema.string().describe(
      "What counts as a valid claim, e.g. 'The defect is real, in scope, and the evidence proves it.'"
    ),
  },
  async execute(args, context) {
    const paths = getDocketPaths(args.caseId);
    const config = resolveConfig();

    if (!(await fileExists(paths.findingsJson))) {
      return `No findings for case ${args.caseId}. Run collect_findings first.`;
    }

    const findings = await readJson<NormalizedFinding[]>(paths.findingsJson);
    const categoryFindings = findings.filter(
      (f) => f.category === args.category
    );

    if (categoryFindings.length === 0) {
      const available = [...new Set(findings.map((f) => f.category))];
      return `ERROR: no findings with category "${args.category}". Categories present in findings: ${JSON.stringify(available)}. This is a hard error — check collect_findings output for the correct category names.`;
    }

    const plan = await readJson<{
      missionType: string;
      missionCriteria?: string;
    }>(paths.planJson).catch(() => ({ missionType: "bug-audit" }));

    const catDir = path.join(paths.verdictsDir, args.category);
    await ensureDir(catDir);

    const agentsMd = await loadAgentsMd(context.worktree);
    const contextBundle =
      (await readFileSafe(path.join(paths.contextDir, `${args.category}.md`))) ||
      "(no context bundle)";

    const missionCriteria =
      args.missionCriteria ||
      plan.missionCriteria ||
      "The claim is real, supported by evidence, and within scope.";

    const jurorCount = 3;
    const jurorPromises = Array.from({ length: jurorCount }, (_, i) =>
      callModel({
        endpoint: config.jurorEndpoint,
        apiKey: config.jurorApiKey,
        model: config.jurorModel,
        userPrompt: buildJurorPrompt(
          args.category,
          findings,
          missionCriteria,
          agentsMd,
          contextBundle
        ),
        temperature: 0.2,
        maxTokens: 8000,
      })
    );

    const results = await Promise.all(jurorPromises);

    let okCount = 0;
    const jurorStatuses: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const jurorId = `deepseek-v4-pro#${i + 1}`;
      const result = results[i];

      const outputPath = path.join(catDir, `${jurorId}.json`);
      await writeJson(outputPath, {
        juror: jurorId,
        ok: result.ok,
        content: result.content,
        error: result.error,
      });

      if (!result.ok) {
        await writeJson(
          path.join(catDir, `${jurorId}.error.json`),
          {
            juror: jurorId,
            error: result.error,
            attempt: result.attempt,
            timestamp: new Date().toISOString(),
          }
        );
      }

      if (result.ok && !result.error) {
        okCount++;
        jurorStatuses.push(`${jurorId}: OK`);
      } else {
        jurorStatuses.push(`${jurorId}: ERROR — ${result.error?.slice(0, 200)}`);
      }

      await appendLog({
        event: "juror_done",
        caseId: args.caseId,
        category: args.category,
        juror: jurorId,
        ok: result.ok,
        error: result.error,
      });
    }

    return `Jury for "${args.category}" (${categoryFindings.length} claims):` +
      `\n  Responded: ${okCount}/${jurorCount}` +
      `\n  ${jurorStatuses.join("\n  ")}` +
      `\nVerdicts: ${catDir}`;
  },
});

async function loadAgentsMd(worktree: string): Promise<string> {
  const content = await readFileSafe(path.join(worktree, "AGENTS.md"));
  return content || "";
}
