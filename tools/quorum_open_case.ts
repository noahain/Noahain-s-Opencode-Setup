import { tool } from "@opencode-ai/plugin";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getDocketPaths, ensureDir, writeJson } from "../lib/docket.js";
import { setLogPath, appendLog } from "../lib/log.js";
import { resolveConfig } from "../lib/config.js";

interface SkillEntry {
  id: string;
  description: string;
}

async function discoverSkills(worktree: string): Promise<SkillEntry[]> {
  const skills: SkillEntry[] = [];
  const seen = new Set<string>();

  const roots = [
    path.resolve(process.env.HOME || process.env.USERPROFILE || ".", ".config", "opencode", "skills"),
    path.join(worktree, ".opencode", "skills"),
  ];

  for (const root of roots) {
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || seen.has(entry.name)) continue;
      seen.add(entry.name);

      const skillMd = path.join(root, entry.name, "SKILL.md");
      try {
        const content = await fs.readFile(skillMd, "utf8");
        const descMatch = content.match(/^description:\s*(.+)$/m);
        skills.push({
          id: entry.name,
          description: descMatch?.[1]?.trim() || content.slice(0, 120).replace(/\n/g, " "),
        });
      } catch {}
    }
  }

  return skills;
}

export default tool({
  description: `Open a new Quorum case. Creates the Docket folder structure and writes the task + scope.
Returns the caseId, paths, and availableSkills catalog for the Clerk.`,
  args: {
    task: tool.schema.string().describe("What to investigate or verify"),
    scope: tool.schema
      .string()
      .describe(
        "Scope description — what code to look at, what to ignore, any constraints"
      ),
  },
  async execute(args, context) {
    const caseId = randomUUID();
    const paths = getDocketPaths(caseId);

    await ensureDir(paths.root);
    await ensureDir(paths.contextDir);
    await ensureDir(paths.witnessBriefsDir);
    await ensureDir(paths.jurorBriefsDir);
    await ensureDir(paths.testimonyDir);
    await ensureDir(paths.verdictsDir);

    setLogPath(paths.logNdjson);

    const caseContent = `# Quorum Case: ${caseId}

## Task
${args.task}

## Scope
${args.scope}
`;

    await fs.writeFile(paths.caseMd, caseContent, "utf8");

    const availableSkills = await discoverSkills(context.worktree);
    await writeJson(path.join(paths.root, "skill_catalog.json"), availableSkills);

    await appendLog({ event: "case_opened", caseId, task: args.task, skillCount: availableSkills.length });

    const config = resolveConfig();
    const skillLines = availableSkills.map((s) => `  ${s.id}: ${s.description.slice(0, 80)}`).join("\n");

    return {
      output: `Case opened: ${caseId}
Docket: ${paths.root}
Witness models: ${config.witnessModels.join(", ")} (concurrency: ${config.witnessConcurrency})
Juror model: ${config.jurorModel}

Available skills (${availableSkills.length}):
${skillLines || "  (none found)"}`,
      metadata: { caseId },
    };
  },
});
