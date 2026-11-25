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
import { callModel, withConcurrency } from "../lib/http.js";
import { appendLog } from "../lib/log.js";
import { resolveConfig } from "../lib/config.js";

interface WorkItem {
  id: string;
  target: string;
  category: string;
}

interface BatchItem {
  id: string;
}

export default tool({
  description: `Fire a batch of Witnesses (GLM + Kimi per item) in parallel. Writes testimony/*.json to the Docket. Returns status only — raw output stays on disk.`,
  args: {
    caseId: tool.schema.string().describe("The case ID from open_case"),
    batch: tool.schema
      .string()
      .describe(
        "JSON array of {id} objects — the work item IDs to summon this batch"
      ),
  },
  async execute(args) {
    const paths = getDocketPaths(args.caseId);
    const config = resolveConfig();

    if (!(await fileExists(paths.planJson))) {
      return `Plan not found for case ${args.caseId}. Run file_plan first.`;
    }

    const plan = await readJson<{ workItems: WorkItem[] }>(paths.planJson);

    let batch: BatchItem[];
    try {
      batch = JSON.parse(args.batch);
    } catch {
      return "Invalid JSON for batch argument.";
    }

    if (!Array.isArray(batch) || batch.length === 0) {
      return "Batch must be a non-empty array of {id} objects.";
    }

    await ensureDir(paths.testimonyDir);

    const planItemMap = new Map(plan.workItems.map((w) => [w.id, w]));
    const tasks: (() => Promise<void>)[] = [];

    for (const { id } of batch) {
      const item = planItemMap.get(id);
      if (!item) continue;

      const briefPath = path.join(paths.witnessBriefsDir, `${id}.md`);
      const prompt = (await readFileSafe(briefPath)) || "";

      for (const model of config.witnessModels) {
        tasks.push(async () => {
          const baseName = `${id}_${model}`;
          const result = await callModel({
            endpoint: config.witnessEndpoint,
            apiKey: config.witnessApiKey,
            model,
            userPrompt: prompt,
            temperature: 0.2,
            maxTokens: 8000,
          });

          if (!result.ok) {
            await writeJson(
              path.join(paths.testimonyDir, `${baseName}.error.json`),
              {
                item_id: id,
                model,
                status: "http_error",
                error: result.error,
                attempt: result.attempt,
                timestamp: new Date().toISOString(),
              }
            );

            if (result.content) {
              await fs.writeFile(
                path.join(paths.testimonyDir, `${baseName}.raw.txt`),
                result.content,
                "utf8"
              ).catch(() => {});
            }

            await appendLog({
              event: "witness_failed",
              caseId: args.caseId,
              itemId: id,
              model,
              error: result.error,
            });
            return;
          }

          await writeJson(
            path.join(paths.testimonyDir, `${baseName}.json`),
            {
              item_id: id,
              model,
              ok: true,
              content: result.content,
              attempt: result.attempt,
            }
          );

          await appendLog({
            event: "witness_done",
            caseId: args.caseId,
            itemId: id,
            model,
            ok: true,
          });
        });
      }
    }

    await withConcurrency(tasks, config.witnessConcurrency);

    await appendLog({
      event: "batch_complete",
      caseId: args.caseId,
      taskCount: tasks.length,
    });

    return `Batch dispatched: ${tasks.length} calls across ${batch.length} items. Testimony in ${paths.testimonyDir}`;
  },
});
