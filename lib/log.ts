import * as fs from "node:fs/promises";

let logPath: string | null = null;

export function setLogPath(p: string): void {
  logPath = p;
}

export type LogEntry = {
  ts: string;
  event: string;
  [key: string]: unknown;
};

export async function appendLog(entry: Omit<LogEntry, "ts">): Promise<void> {
  if (!logPath) return;
  try {
    const record: LogEntry = {
      ts: new Date().toISOString(),
      ...entry,
    };
    await fs.appendFile(logPath, JSON.stringify(record) + "\n", "utf8");
  } catch {}
}
