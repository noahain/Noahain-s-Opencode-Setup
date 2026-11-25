export interface QuorumConfig {
  witnessEndpoint: string;
  witnessModels: string[];
  witnessApiKey: string;
  witnessConcurrency: number;
  jurorEndpoint: string;
  jurorModel: string;
  jurorApiKey: string;
  maxRetries: number;
  callTimeoutMs: number;
  maxRpm: number;
  runsDir: string;
}

function safeInt(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw || "", 10);
  return isNaN(parsed) ? fallback : parsed;
}

export function resolveConfig(): QuorumConfig {
  const runsDir =
    process.env.QUORUM_RUNS_DIR ||
    `${process.env.HOME ?? process.env.USERPROFILE ?? "."}/.quorum/runs`;

  const witnessModels = (process.env.QUORUM_WITNESS_MODELS || "glm-5.2,kimi-k2.7-code")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (witnessModels.length === 0) {
    throw new Error(
      "QUORUM_WITNESS_MODELS: no valid models after parsing. Check your environment variable."
    );
  }

  const jurorApiKey = process.env.QUORUM_JUROR_API_KEY;
  if (!jurorApiKey) {
    throw new Error(
      "QUORUM_JUROR_API_KEY is required. Set it in your environment."
    );
  }

  return {
    witnessEndpoint:
      process.env.QUORUM_WITNESS_ENDPOINT || "http://localhost:8867/v1",
    witnessModels,
    witnessApiKey: process.env.QUORUM_WITNESS_API_KEY || "",
    witnessConcurrency: safeInt(process.env.QUORUM_WITNESS_CONCURRENCY, 2),
    jurorEndpoint:
      process.env.QUORUM_JUROR_ENDPOINT || "https://api.deepseek.com/v1",
    jurorModel: process.env.QUORUM_JUROR_MODEL || "deepseek-v4-pro",
    jurorApiKey,
    maxRetries: safeInt(process.env.QUORUM_MAX_RETRIES, 3),
    callTimeoutMs: safeInt(process.env.QUORUM_CALL_TIMEOUT_MS, 120000),
    maxRpm: safeInt(process.env.QUORUM_MAX_RPM, 500),
    runsDir,
  };
}
