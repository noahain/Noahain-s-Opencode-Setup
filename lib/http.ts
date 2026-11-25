import { resolveConfig } from "./config.js";

const config = resolveConfig();

export interface ModelCallParams {
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelCallResult {
  model: string;
  content: string;
  ok: boolean;
  error?: string;
  attempt: number;
  nonRetryable: boolean;
}

const NON_RETRYABLE_PATTERNS = [
  "ECONNREFUSED",
  "ENOTFOUND",
  "ECONNRESET",
  "ETIMEDOUT",
  "EADDRNOTAVAIL",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_HAS_EXPIRED",
];

const TRANSIENT_PATTERNS = [
  "fetch failed",
  "network timeout",
  "ETIMEOUT",
  "connect ETIM",
  "socket hang up",
];

function isNonRetryable(error: string | undefined): boolean {
  if (!error) return false;
  const upper = error.toUpperCase();

  for (const pat of NON_RETRYABLE_PATTERNS) {
    if (upper.includes(pat)) return true;
  }

  const isTransient = TRANSIENT_PATTERNS.some((p) => upper.includes(p.toUpperCase()));
  return !isTransient;
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function singleCall(
  params: ModelCallParams,
  attempt: number,
  signal?: AbortSignal
): Promise<ModelCallResult> {
  const timeoutMs = config.callTimeoutMs;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const messages: { role: string; content: string }[] = [];
  if (params.systemPrompt) {
    messages.push({ role: "system", content: params.systemPrompt });
  }
  messages.push({ role: "user", content: params.userPrompt });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (params.apiKey) {
    headers["Authorization"] = `Bearer ${params.apiKey}`;
  }

  try {
    const res = await fetch(`${params.endpoint}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: params.model,
        messages,
        temperature: params.temperature ?? 0.2,
        max_tokens: params.maxTokens ?? 8000,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const errorMsg = `HTTP ${res.status}: ${body.slice(0, 500)}`;
      return {
        model: params.model,
        content: "",
        ok: false,
        error: errorMsg,
        attempt,
        nonRetryable: !isRetryableHttpStatus(res.status),
      };
    }

    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";

    return { model: params.model, content, ok: true, attempt, nonRetryable: false };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);

    const isAbort = err instanceof Error && err.name === "AbortError";
    const isTimeout = isAbort || msg.includes("timed out") || msg.includes("aborted");

    return {
      model: params.model,
      content: "",
      ok: false,
      error: msg,
      attempt,
      nonRetryable: isTimeout ? false : isNonRetryable(msg),
    };
  }
}

export async function callModel(
  params: ModelCallParams,
  signal?: AbortSignal
): Promise<ModelCallResult> {
  let last: ModelCallResult = {
    model: params.model,
    content: "",
    ok: false,
    error: "No attempts made",
    attempt: 0,
    nonRetryable: false,
  };

  for (let i = 0; i < config.maxRetries; i++) {
    last = await singleCall(params, i + 1, signal);
    if (last.ok) return last;
    if (last.nonRetryable) return last;

    if (i < config.maxRetries - 1) {
      const delay = backoffDelay(i, last.error);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return last;
}

function backoffDelay(attempt: number, error?: string): number {
  const base = Math.min(Math.pow(2, attempt) * 1000, 30000);
  const jitter = Math.floor(Math.random() * 1000);
  return base + jitter;
}

export function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < tasks.length) {
      const i = idx++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (err) {
        results[i] = { status: "rejected", reason: err };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    worker()
  );
  return Promise.all(workers).then(() => results);
}
