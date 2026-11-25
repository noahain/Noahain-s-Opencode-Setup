import { tool } from "@opencode-ai/plugin";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { getDocketPaths, readJson, fileExists, ensureDir, readFileSafe } from "../lib/docket.js";
import { appendLog } from "../lib/log.js";

interface WorkItem {
  id: string;
  target: string;
  category: string;
  skills: string[];
}

interface ContextManifest {
  items: {
    id: string;
    fileCount: number;
    files: string[];
    error?: string;
  }[];
}

function buildWitnessPrompt(
  item: WorkItem,
  contextBundle: string,
  mission: string,
  agentsMd: string,
  skills: string
): string {
  return `# ROLE
You are a Witness in a Quorum run. You investigate ONE narrow scope and report
structured findings. You do not fix anything and you do not comment on code
outside your scope.

# MISSION
${mission}
${agentsMd ? `\n# HOUSE RULES (authoritative)\n${agentsMd}\n` : ""}# SKILLS
${skills}

# CONTEXT (read generously; your focus target is marked)
${contextBundle}
# FOCUS: ${item.target}

# OUTPUT — STRICT (8k token cap includes thinking)
- Do NOT reason aloud. Do NOT write any prose, commentary, introductions, or
  explanations. Your visible output must be ONLY the JSON array — nothing before,
  nothing after.
- Each finding: { file, line, category, type, severity, summary, evidence, suggested_fix? }.
- evidence MUST quote the exact code/spec line that proves the claim. No evidence -> do not emit the finding.
- Precision over exhaustiveness: a wrong finding costs you at the vote.
- Keep each finding's evidence/summary concise. Prefer 3 strong findings over 10 vague ones.
- type is one of: bug, security, perf, test-gap, correctness
- severity is one of: low, med, high, critical`;
}

async function loadSkillDocs(
  skillNames: string[],
  worktree: string
): Promise<string> {
  if (skillNames.length === 0) return "(none)";
  const results: string[] = [];

  const skillDirs = [
    path.resolve(process.env.HOME || process.env.USERPROFILE || ".", ".config", "opencode", "skills"),
    path.join(worktree, ".opencode", "skills"),
  ];

  for (const name of skillNames) {
    for (const dir of skillDirs) {
      const skillPath = path.join(dir, name, "SKILL.md");
      const content = await readFileSafe(skillPath);
      if (content) {
        results.push(`## ${name}\n${content}`);
        break;
      }
    }
  }

  return results.length > 0 ? results.join("\n\n") : "(none)";
}

async function loadAgentsMd(worktree: string): Promise<string> {
  const locations = [
    path.join(worktree, "AGENTS.md"),
  ];
  for (const loc of locations) {
    const content = await readFileSafe(loc);
    if (content) return content;
  }
  return "";
}

export default tool({
  description:
    "Expand the witness template into per-item prompt briefs. Writes briefs/witness/<item>.md. Requires gather_context to have run first.",
  args: {
    caseId: tool.schema.string().describe("The case ID from open_case"),
    mission: tool.schema.string().describe(
      "Mission string for witnesses, e.g. 'Find real bugs / security / perf / correctness issues.'"
    ),
  },
  async execute(args, context) {
    const paths = getDocketPaths(args.caseId);

    if (!(await fileExists(paths.planJson))) {
      return `Plan not found for case ${args.caseId}. Run file_plan first.`;
    }

    const manifestPath = path.join(paths.contextDir, "manifest.json");
    if (!(await fileExists(manifestPath))) {
      return `Context manifest not found at context/manifest.json. Run gather_context first — expand_briefs depends on the context bundles gather_context produces.`;
    }

    const manifest = await readJson<ContextManifest>(manifestPath);

    const plan = await readJson<{
      workItems: WorkItem[];
      missionType: string;
    }>(paths.planJson);

    if (manifest.items.length < plan.workItems.length) {
      return `Context incomplete: manifest covers ${manifest.items.length} of ${plan.workItems.length} work items. Re-run gather_context before expand_briefs.`;
    }

    for (const item of plan.workItems) {
      const contextPath = path.join(paths.contextDir, `${item.id}.md`);
      if (!(await fileExists(contextPath))) {
        return `Context bundle missing for item "${item.id}" at ${contextPath}. Re-run gather_context before expand_briefs.`;
      }
    }

    await ensureDir(paths.witnessBriefsDir);

    const agentsMd = await loadAgentsMd(context.worktree);
    let count = 0;
    let skipped = 0;
    const worktree = path.resolve(context.worktree);

    for (const item of plan.workItems) {
      const manifestEntry = manifest.items.find((m) => m.id === item.id);
      if (manifestEntry && manifestEntry.fileCount === 0) {
        await appendLog({
          event: "brief_skipped",
          caseId: args.caseId,
          itemId: item.id,
          reason: "zero files in context",
        });
        skipped++;
        continue;
      }

      const contextPath = path.join(paths.contextDir, `${item.id}.md`);
      const contextBundle = await readFileSafe(contextPath);
      if (!contextBundle) {
        return `Failed to read context bundle for item "${item.id}". Re-run gather_context.`;
      }

      const skills = await loadSkillDocs(item.skills || [], worktree);

      const prompt = buildWitnessPrompt(
        item,
        contextBundle,
        args.mission,
        agentsMd,
        skills
      );

      const briefPath = path.join(paths.witnessBriefsDir, `${item.id}.md`);
      await fs.writeFile(briefPath, prompt, "utf8");
      count++;
    }

    await appendLog({
      event: "briefs_expanded",
      caseId: args.caseId,
      briefCount: count,
      skippedCount: skipped,
    });

    const skippedMsg = skipped > 0 ? ` (${skipped} skipped — zero files in context)` : "";
    return `Expanded ${count} witness briefs to ${paths.witnessBriefsDir}${skippedMsg}`;
  },
});
