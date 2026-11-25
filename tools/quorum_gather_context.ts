import { tool } from "@opencode-ai/plugin";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import fg from "fast-glob";
import { getDocketPaths, readJson, fileExists, writeJson, ensureDir } from "../lib/docket.js";
import { appendLog } from "../lib/log.js";

interface WorkItem {
  id: string;
  target: string;
  category: string;
  skills: string[];
  include: string[];
  exclude: string[];
}

interface ContextManifest {
  items: {
    id: string;
    fileCount: number;
    files: string[];
    error?: string;
  }[];
}

const HARD_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/target/**",
  "**/build/**",
  "**/__pycache__/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
  "**/.opencode/node_modules/**",
];

const MAX_FILES_PER_ITEM = 200;
const MAX_INLINE_FILES = 30;
const MAX_DEPTH = 15;
const RG_TIMEOUT_MS = 30000;

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

async function tryRipgrep(
  pattern: string,
  cwd: string
): Promise<string[] | null> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const proc = spawn(
      "rg",
      ["--files", "-g", pattern, "--no-heading", "--no-ignore"],
      {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      }
    );

    let out = "";
    proc.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve(null);
    }, RG_TIMEOUT_MS);

    const done = () => {
      clearTimeout(timeout);
      proc.removeAllListeners();
      proc.kill();
    };

    proc.on("close", (code) => {
      if (code === 0 || (code === 1 && out.trim())) {
        resolve(out.trim().split("\n").filter((l) => l));
      } else {
        done();
        resolve(null);
      }
    });

    proc.on("error", () => {
      done();
      resolve(null);
    });
  });
}

async function expandGlobs(
  globs: string[],
  root: string
): Promise<string[]> {
  if (globs.length === 0) return [];

  const patterns = globs.filter((g) => !g.startsWith("!"));
  if (patterns.length === 0) return [];

  const normalizedRoot = normalizePath(root);

  const rgResult = await tryRipgrep(patterns[0], root);
  if (rgResult !== null) {
    return rgResult.map((f) => path.resolve(root, f));
  }

  const relativePatterns = patterns.map((p) => {
    const normalized = normalizePath(p);
    if (path.isAbsolute(p)) {
      return normalizePath(path.relative(root, p));
    }
    return normalized;
  });

  const files = await fg(relativePatterns, {
    cwd: normalizedRoot,
    absolute: true,
    ignore: HARD_IGNORE,
    onlyFiles: true,
    dot: true,
    deep: MAX_DEPTH,
    suppressErrors: true,
  });

  return files;
}

async function readFileContent(
  filePath: string
): Promise<string | null> {
  try {
    await fs.stat(filePath);
    const content = await fs.readFile(filePath, "utf8");
    return `\n## File: ${filePath}\n\`\`\`\n${content.slice(0, 15000)}\n\`\`\`\n`;
  } catch {
    return null;
  }
}

export default tool({
  description:
    "Assemble context bundles for each work item per the plan's context policy. Resolves globs and writes context/*.md files.",
  args: {
    caseId: tool.schema.string().describe("The case ID from open_case"),
  },
  async execute(args, context) {
    const paths = getDocketPaths(args.caseId);

    if (!(await fileExists(paths.planJson))) {
      return `Plan not found for case ${args.caseId}. Run file_plan first.`;
    }

    const plan = await readJson<{
      workItems: WorkItem[];
      missionType: string;
      mission: string;
    }>(paths.planJson);

    const root = path.resolve(context.worktree);
    const manifest: ContextManifest = { items: [] };
    let resolved = 0;
    let emptyCount = 0;

    await ensureDir(paths.contextDir);

    for (const item of plan.workItems) {
      let bundle = `# Context Bundle for ${item.id}\n`;
      bundle += `## Target: ${item.target}\n`;
      bundle += `## Category: ${item.category}\n\n`;

      const files: string[] = [];

      if (item.include.length > 0) {
        const included = await expandGlobs(item.include, root);
        files.push(...included);
      }

      const excludeSet = new Set<string>();
      if (item.exclude.length > 0) {
        const excluded = await expandGlobs(item.exclude, root);
        for (const f of excluded) {
          excludeSet.add(normalizePath(f));
        }
      }

      const deduped = [...new Set(files)].filter(
        (f) => !excludeSet.has(normalizePath(f))
      );

      if (deduped.length > MAX_FILES_PER_ITEM) {
        throw new Error(
          `Work item "${item.id}" matched ${deduped.length} files (max ${MAX_FILES_PER_ITEM}). Narrow the include globs.`
        );
      }

      if (deduped.length === 0) {
        const errorEntry = {
          item_id: item.id,
          target: item.target,
          error: "resolved zero files",
          include: item.include,
          root,
        };
        await writeJson(
          path.join(paths.contextDir, `${item.id}.error.json`),
          errorEntry
        );
        emptyCount++;

        bundle += `### ERROR: No files resolved\nInclude patterns: ${item.include.join(", ")}\nRoot: ${root}\n\n`;

        manifest.items.push({
          id: item.id,
          fileCount: 0,
          files: [],
          error: "resolved zero files",
        });
      } else {
        const capped = deduped.length > MAX_INLINE_FILES;
        bundle += `### Files Loaded (${Math.min(deduped.length, MAX_INLINE_FILES)} of ${deduped.length}${capped ? " — capped" : ""})\n\n`;
        for (const filePath of deduped.slice(0, MAX_INLINE_FILES)) {
          const content = await readFileContent(filePath);
          if (content) bundle += content;
        }

        manifest.items.push({
          id: item.id,
          fileCount: deduped.length,
          files: deduped.map(normalizePath),
        });
      }

      const bundlePath = path.join(paths.contextDir, `${item.id}.md`);
      await fs.writeFile(bundlePath, bundle, "utf8");

      resolved++;
    }

    const manifestPath = path.join(paths.contextDir, "manifest.json");
    await writeJson(manifestPath, manifest);

    await appendLog({
      event: "context_gathered",
      caseId: args.caseId,
      itemsResolved: resolved,
      emptyItems: emptyCount,
    });

    if (emptyCount > 0) {
      return `Context gathered: ${resolved} bundles (${emptyCount} empty — check context/*.error.json). Manifest: context/manifest.json`;
    }

    return `Context gathered: ${resolved} bundles written to ${paths.contextDir}\nManifest: context/manifest.json`;
  },
});
