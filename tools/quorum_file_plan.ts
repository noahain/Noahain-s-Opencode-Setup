import { tool } from "@opencode-ai/plugin";
import * as path from "node:path";
import { getDocketPaths, writeJson, fileExists, readJson, readFileSafe } from "../lib/docket.js";
import { appendLog } from "../lib/log.js";

interface SkillEntry {
  id: string;
  description: string;
}

interface WorkItem {
  id: string;
  skills: string[];
}

export default tool({
  description: `File the Clerk's plan for this case. Persists work items, categories, and context policies to the Docket. Validates skill assignments against the skill catalog.`,
  args: {
    caseId: tool.schema.string().describe("The case ID from open_case"),
    plan: tool.schema
      .string()
      .describe(
        "JSON plan string with workItems, missionType, mission, missionCriteria"
      ),
  },
  async execute(args) {
    const paths = getDocketPaths(args.caseId);

    if (!(await fileExists(paths.caseMd))) {
      return `Case ${args.caseId} not found. Run open_case first.`;
    }

    let plan;
    try {
      plan = JSON.parse(args.plan);
    } catch {
      return "Invalid JSON in plan argument.";
    }

    if (!plan.workItems || !Array.isArray(plan.workItems)) {
      return "Plan must have a workItems array.";
    }

    const catalogPath = path.join(paths.root, "skill_catalog.json");
    const catalog = await readFileSafe(catalogPath);
    const availableSkills: SkillEntry[] = catalog ? JSON.parse(catalog) : [];
    const validIds = new Set(availableSkills.map((s) => s.id));

    for (const item of plan.workItems as WorkItem[]) {
      if (!item.skills || item.skills.length === 0) continue;
      for (const skillId of item.skills) {
        if (!validIds.has(skillId)) {
          return `Invalid skill "${skillId}" in work item "${item.id}". Valid skill ids: ${[...validIds].sort().join(", ")}`;
        }
      }
    }

    await writeJson(paths.planJson, plan);
    await appendLog({
      event: "plan_filed",
      caseId: args.caseId,
      itemCount: plan.workItems.length,
    });

    return `Plan filed: ${plan.workItems.length} work items.
Mission: ${plan.missionType || "unspecified"}`;
  },
});
