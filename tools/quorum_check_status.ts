import { tool } from "@opencode-ai/plugin";
import * as path from "node:path";
import { getDocketPaths, fileExists, readJson, readFileSafe } from "../lib/docket.js";
import * as fs from "node:fs/promises";
import { resolveConfig } from "../lib/config.js";

export default tool({
  description:
    "Check the progress of a Quorum run by reading the Docket. Returns witness/juror success/error counts with reasons.",
  args: {
    caseId: tool.schema.string().describe("The case ID from open_case"),
  },
  async execute(args) {
    const paths = getDocketPaths(args.caseId);

    if (!(await fileExists(paths.caseMd))) {
      return `Case ${args.caseId} not found.`;
    }

    const plan = (await fileExists(paths.planJson))
      ? await readJson<{ workItems: { id: string }[] }>(paths.planJson)
      : null;

    let testimonyFiles: string[] = [];
    try {
      testimonyFiles = await fs.readdir(paths.testimonyDir);
    } catch {}

    const testimonies: { itemId: string; model: string; ok: boolean; error?: string }[] = [];
    for (const f of testimonyFiles) {
      const isErrorFile = f.endsWith(".error.json");
      const data = await readFileSafe(path.join(paths.testimonyDir, f));
      if (!data) continue;
      try {
        const raw = JSON.parse(data) as {
          item_id: string;
          model: string;
          ok?: boolean;
          error?: string;
          status?: string;
        };
        testimonies.push({
          itemId: raw.item_id,
          model: raw.model,
          ok: isErrorFile ? false : !!raw.ok,
          error: raw.error || raw.status,
        });
      } catch {}
    }

    const witnessFailed = testimonies.filter((t) => !t.ok);
    const witnessSuccess = testimonies.filter((t) => t.ok);
    const witnessErrors = witnessFailed.map(
      (t) => `  ${t.itemId}/${t.model}: ${t.error?.slice(0, 120) || "failed"}`
    );

    const jurorStatuses: string[] = [];
    let totalJurorFiles = 0;
    let jurorOk = 0;
    let jurorErrors: string[] = [];

    try {
      const cats = await fs.readdir(paths.verdictsDir, { withFileTypes: true });
      for (const cat of cats) {
        if (!cat.isDirectory()) continue;
        const catDir = path.join(paths.verdictsDir, cat.name);
        const files = await fs.readdir(catDir);
        for (const f of files) {
          totalJurorFiles++;
          const data = await readFileSafe(path.join(catDir, f));
          if (!data) continue;
          try {
            const record = JSON.parse(data) as { ok: boolean; error?: string; juror: string };
            if (record.ok && !record.error) {
              jurorOk++;
              jurorStatuses.push(`  ${cat.name}/${record.juror}: OK`);
            } else {
              jurorErrors.push(`  ${cat.name}/${record.juror || f}: ${record.error?.slice(0, 120) || "error"}`);
            }
          } catch {}
        }
      }
    } catch {}

    const findingsReady = await fileExists(paths.findingsJson);
    const shortlistReady = await fileExists(paths.shortlistJson);

    const config = resolveConfig();
    const modelCount = config.witnessModels.length;
    const expectedWitnessCalls = plan ? plan.workItems.length * modelCount : "?";
    const completedWitnesses = testimonies.length;
    const succeededWitnesses = witnessSuccess.length;
    const failedWitnesses = witnessFailed.length;

    let status = "in_progress";
    if (plan && completedWitnesses >= plan.workItems.length * modelCount) {
      if (totalJurorFiles > 0) {
        status = totalJurorFiles >= 3 ? "judging" : "judging_partial";
      } else if (findingsReady) {
        status = "findings_ready";
      } else {
        status = "testimony_done";
      }
    }

    let output = `Case ${args.caseId} — ${status}\n`;
    output += `\nWitnesses: ${completedWitnesses}/${expectedWitnessCalls} completed (${succeededWitnesses} ok, ${failedWitnesses} failed)`;
    if (witnessErrors.length > 0) {
      output += `\n  Failed (${witnessFailed.length}):\n${witnessErrors.slice(0, 10).join("\n")}`;
    }

    output += `\n\nJurors: ${totalJurorFiles} files, ${jurorOk} OK`;
    if (jurorErrors.length > 0) {
      output += `\n  Errors (${jurorErrors.length}):\n${jurorErrors.slice(0, 10).join("\n")}`;
    }

    output += `\n\nFindings: ${findingsReady ? "ready" : "pending"} | Shortlist: ${shortlistReady ? "ready" : "pending"}`;

    return output;
  },
});
