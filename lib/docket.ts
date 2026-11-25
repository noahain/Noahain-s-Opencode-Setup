import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveConfig } from "./config.js";

const config = resolveConfig();

export interface DocketPaths {
  caseId: string;
  root: string;
  caseMd: string;
  planJson: string;
  contextDir: string;
  witnessBriefsDir: string;
  jurorBriefsDir: string;
  testimonyDir: string;
  verdictsDir: string;
  findingsJson: string;
  shortlistJson: string;
  verdictMd: string;
  logNdjson: string;
}

export function getDocketPaths(caseId: string): DocketPaths {
  const root = path.join(config.runsDir, caseId);
  return {
    caseId,
    root,
    caseMd: path.join(root, "case.md"),
    planJson: path.join(root, "plan.json"),
    contextDir: path.join(root, "context"),
    witnessBriefsDir: path.join(root, "briefs", "witness"),
    jurorBriefsDir: path.join(root, "briefs", "juror"),
    testimonyDir: path.join(root, "testimony"),
    verdictsDir: path.join(root, "verdicts"),
    findingsJson: path.join(root, "findings.json"),
    shortlistJson: path.join(root, "shortlist.json"),
    verdictMd: path.join(root, "verdict.md"),
    logNdjson: path.join(root, "log.ndjson"),
  };
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Corrupt JSON file at ${filePath}`);
  }
}

export async function writeJson(
  filePath: string,
  data: unknown
): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function readFileSafe(
  filePath: string
): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
