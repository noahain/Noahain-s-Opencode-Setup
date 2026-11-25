# Stateful BFF Playbook — DeepSeek Chat

The second reference implementation. Where the Wapq example is stateless with native tool calls, this one is **stateful, single-prompt, and emulated** — the harder shape, and the one most consumer chat sites use.

Use this file as a checklist, not as code to paste. Endpoint names and field names are target-specific; the mechanisms are not.

## Target specifics

| Item | Value |
|---|---|
| BFF | `https://chat.deepseek.com/api/v0/chat/completion` |
| Auth | `Authorization: Bearer <userToken>` from browser storage (optionally `Cookie`) |
| Conversation | `chat_session_id` + `parent_message_id` (stateful threading) |
| Body | one `prompt` string, not `messages[]` |
| Tools | none native — DSML markup parsed into OpenAI `tool_calls` |
| Stream | JSON-patch ops (`p`/`o`/`v`) over SSE |
| Extra | per-request proof-of-work header, image upload + readiness poll |

## The request body

```json
{
  "chat_session_id": "<uuid>",
  "parent_message_id": 12,
  "model_type": "default",
  "prompt": "User: hello",
  "ref_file_ids": [],
  "thinking_enabled": false,
  "search_enabled": false,
  "action": null,
  "preempt": false
}
```

- `parent_message_id: null` on the first turn; the reply's message id becomes the next parent.
- `thinking_enabled` is the *only* difference between the "chat" and "reasoner" models.
- `ref_file_ids` carries uploaded attachment ids, not image bytes.

Everything else is a constant or a capability flag. Confirm each one against a capture; do not assume the names.

## The stream protocol

SSE whose data payloads are JSON-patch-ish ops. Five shapes appear:

```
event: ready
data: {"response_message_id": 47}                     # state, don't forward

data: {"p":"response/fragments","o":"APPEND","v":[{"type":"THINK","content":"..."}]}
data: {"p":"response/fragments/-1/content","o":"APPEND","v":"more text"}
data: {"v":"inherits the previous p and o"}           # bare continuation
data: {"p":"response/accumulated_token_usage","o":"SET","v":74}
data: {"p":"response/status","o":"SET","v":"FINISHED"}
data: {"p":"response/fragments","o":"BATCH","v":[{"p":"-1/content","o":"APPEND","v":"x"}]}
event: close
data: {}
```

Rules:

| Op | Meaning |
|---|---|
| `APPEND` on `…/content` | delta text for the current fragment |
| `SET` on `…/content` | cumulative snapshot — emit only the suffix past what you emitted |
| `APPEND` on `response/fragments` with a list | new fragments; each carries `type: THINK \| RESPONSE` |
| `BATCH` | `v` is a list of `{p,o,v}`; sub-paths are appended to the parent path |
| payload with only `v` and no `p`/`o` | either a bare continuation **or** a whole-response snapshot |
| omitted `p` or `o` | inherit from the previous event |

The last fragment's `type` decides whether subsequently appended `content` is reasoning or answer. Track the fragment list; do not infer from the text.

Termination is signalled twice (`status: FINISHED` and a `close` event). Make both idempotent, and emit `[DONE]` from the close, not from the status — the status arrives before the final ops drain.

## Prompt building — three shapes, one function

```python
if parent_message_id is not None and last_role == "tool":
    prompt = tool_results_only(messages)          # names resolved from the prior assistant turn
elif parent_message_id is not None and last_role == "user":
    prompt = message_text(messages[-1])           # delta only
elif len(non_system) > 1:
    prompt = labeled_transcript(messages) + additions   # bootstrap with history
else:
    prompt = "\n\n".join(system_blocks + additions + [last_text])
```

`additions` = effort prelude + tool contract, **new session only**. On a continuation they are inherited from the upstream history; re-sending them wastes tokens and confuses the model with a second copy.

The labeled transcript is what makes a stateless client work against a stateful BFF:

```
System: you are a coding agent
User: read the file
Assistant: [tool calls: read]
Tool result (read):
...
```

`[tool calls: name]` for an assistant turn with no text is what keeps the transcript intelligible — without it, a tool-calling assistant turn renders as an empty line and the model loses the causal link between call and result.

## Tool calling via DSML

The model emits this when told to:

```
<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="shell">
<｜｜DSML｜｜ parameter name="command" string="true">dir</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>
```

Observed variants, all of which must parse:

- one pipe or two (`<｜DSML｜｜`, `<｜｜DSML｜｜`)
- `<dsml>` with a JSON body instead of `invoke`/`parameter` tags
- a bare JSON object or list, with `name`/`tool`, `arguments`/`parameters`, or a `function` wrapper
- a complete block followed by stray `</…invoke>` / `</…calls>`
- a block left open when the stream finishes

Parser order: scan tags sequentially (each `<…invoke>` / `<…parameter>`, open or closed, in order) so an unclosed parameter or invoke is recovered at flush; if no tags, `json.JSONDecoder.raw_decode` scans for objects. `string="false"` parameters are JSON-decoded; everything else stays a string **until schema normalization coerces it**. Arguments are re-serialized compactly because OpenAI clients expect `arguments` to be a JSON **string**.

The contract header must show one complete example and forbid the wrong path explicitly:

> Call these tools directly — do not search the catalog for them, and do not call them as `tools.<name>` inside execute (the execute sandbox can only reach MCP tools).

Without that sentence, an agent client with its own tool catalog searches it, finds only unrelated namespaces, and concludes the filesystem tools do not exist.

Tool results return as:

```
Tool result (shell):
<output>

Tool result (read):
<output>
```

Consecutive `role: "tool"` messages are batched into one prompt. The name comes from matching `tool_call_id` against the immediately preceding assistant message.

## Usage accounting

`accumulated_token_usage` is the turn's **prompt + visible output**, not the completion count. Two measurements pin this down:

| Request | Reported | What it means |
|---|---|---|
| 20,000-char filler prompt, answer `OK` | 4544 | almost entirely prompt |
| `hi`, ~9 visible tokens out, ~77 thinking tokens | 74 | prompt + visible output; thinking excluded |

The thinking exclusion is provable: cl100k counts 86 for that response's reasoning plus answer, already above the reported 74, so the counter cannot include both.

Split it, keeping the sum exact:

```python
def _estimate_tokens(text: str) -> int:
    if not text:
        return 0
    cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff" or "\u3040" <= ch <= "\u30ff" or "\uac00" <= ch <= "\ud7af")
    return max(1, round(cjk / 1.5 + (len(text) - cjk) / 4.2))


def usage(self) -> dict:
    completion = _estimate_tokens(self.content) + _estimate_tokens(self._tool_text)  # visible + raw markup
    prompt = max(self.usage_tokens - completion, 0)
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": prompt + completion,
    }
```

- Accumulate raw markup (`marker + block + close`) while parsing; counting only parsed arguments undercounts tool-call turns.
- ~4.2 chars/token for ASCII, ~1.5 for CJK, rounded, floored at 1 for non-empty text. The estimate only shifts tokens between the two fields.
- **Do not report `reasoning_tokens`** — you have no count, and clients that compute `context = input + output + reasoning + cache` will add your estimate on top.
- Do not emit `prompt_tokens_details` / `cached_tokens` either; a client that subtracts a fabricated cache count corrupts the context figure.
- `total_tokens` is `prompt + completion` — the upstream counter, unchanged. Never emit the counter as `completion_tokens` *and* as `total_tokens`.
- Emit the chunk only on a normal close and only when `stream_options.include_usage` is set; non-streaming always includes usage. An abnormal close emits neither usage nor `[DONE]`.

Symptom this fixes: the client shows 4k–16k TPS because it divides a 20k–40k context by the generation time.

## Argument validation and rejection

The contract renders declared types; it does not enforce them. Build `name → {param: type}` from the live `tools[]` and coerce one level:

- text → `integer`/`number`: `int` then `int(float)`, or `float`; keep the original text when it does not parse
- text → `boolean`: `strip().lower()` of `"true"`/`"false"` only
- JSON text → `array`/`object`: `json.loads`, keep the original text on failure
- key absent from `properties`: drop it only when `additionalProperties` is absent or falsy; keep it when explicitly `true`
- unknown tool names pass through untouched

Do not walk `items.type` or nested `properties` — say so in the module rather than half-applying it. Buffer the whole call and normalize once, because OpenAI `arguments` is a single JSON string.

Measured failures from production traffic that this removes: 18 numbers emitted as strings, 2 stray `string` attributes. It does **not** add missing required keys — if the model omits `code` entirely, coercion cannot rescue the call.

When the client rejects a call (`{"error": …, "Invalid arguments for tool"}`), do not retry it yourself. Detect it narrowly — text starting with `{"error"` *and* containing `Invalid arguments for tool` — so log output that merely mentions the phrase does not fire. Keep the raw payload in the next continuation prompt and append:

```
The previous tool call was rejected by the harness. Re-issue it with the exact parameter
names and types: text uses string="true"; integers, numbers, booleans, arrays and objects
use string="false" with JSON.
```

The direction matters: the model emits attributes, so non-text values go inside `string="false"` as JSON literals. A hint saying "don't use string=false, emit JSON" is inverted and reproduces the rejection. The rejected call stays in history; the reminder is what stops it being re-emitted verbatim. Append it once per continuation, not once per batched result.

## Session cache

```python
key = sha1(json.dumps([{"role": r, "content": text, "images": digests}]).encode()).hexdigest()

prefix = messages[:-1]
while prefix and prefix[-1]["role"] == "tool":
    prefix = prefix[:-1]

entry = sessions.get(conversation_key(prefix)) if last_role in ("user", "tool") else None
```

- The **assistant `tool_calls` turn is not resent** by the client, so trailing tool messages must be stripped before hashing or the second tool turn always misses.
- Store the key of `messages + [assistant reply]` → `(session_id, response_message_id)`, taken from `remember()` after the stream drains.
- **Image content hash belongs in the key.** Two screenshots with identical text must not share a chat.
- FIFO 256, in-memory. A restart means the next turn opens a new upstream chat — acceptable, but it must be documented because it silently changes upstream history.

## Proof-of-work header

The BFF demands a per-request `x-ds-pow-response`:

1. `POST /api/v0/chat/create_pow_challenge` with `{"target_path": "<endpoint>"}`
2. Solve `wasm_solve(challenge, f"{salt}_{expire_at}_", difficulty)`
3. Base64 the JSON `{algorithm, challenge, salt, answer, signature, target_path}`

Port the site's own wasm with `wasmtime` rather than reimplementing the hash. Keep one solver instance (module instantiation is the expensive part) and re-acquire a challenge **per request** — challenges are single-use.

`target_path` is not always the completion endpoint: uploads need their own challenge for `/api/v0/file/upload_file`. A wrong target path produces a challenge loop, not a clear error.

Header mimicry matters as much as the PoW: `Origin`, `Referer`, `x-client-version`, `x-client-platform`, `x-client-bundle-id`, locale, and a **stable** `x-device-id` generated once per client, not per request.

## Attachment flow

```
POST multipart /api/v0/file/upload_file   + PoW(target_path=upload)
  → data.biz_data.id

GET /api/v0/file/fetch_files?file_ids=<id>   (poll ~5 × 0.5s)
  → status: SUCCESS | FAILED

POST /api/v0/chat/completion  { "ref_file_ids": ["<id>"], ... }
```

The upload returns before the file is readable. Polling is mandatory; without it the model receives an id for a file that does not exist yet and answers as if no image was attached.

The proxy downloads user-supplied `image_url`s, so it is an SSRF target. Guard: `http(s)` only, resolve DNS and reject non-global addresses, re-check after each redirect (2 max), require `image/*`, cap at 10 MB. Cache by `sha256(bytes)` — clients resend the same image on every turn.

Known limitation: only the newest message's images are uploaded. Older turns degrade to `[Image N]` placeholders, so follow-up questions about an earlier image fail. Say so instead of pretending.

## Test patterns

| Test | What it proves |
|---|---|
| replay `captures/chat-completion.network-response` through `feed_line` | the parser matches production, chunk for chunk |
| pinned captured PoW challenge → known answer | the wasm solver is correct, not merely self-consistent |
| second turn reuses session and chains parent | the cache key is right |
| tool-result turn reuses the same session | trailing-tool stripping works |
| new session prompt contains the contract; continuation does not | injection scoping |
| stream with `include_usage` → `finish → usage → [DONE]` | chunk ordering |
| large counter + one-word answer → `prompt ≈ total`, `completion` small, sum equals total | the usage split, not just the envelope |
| stringified `"5"` / `"true"` args → integers and booleans in emitted `arguments` | schema coercion actually runs |
| unknown key dropped when `additionalProperties` absent, kept when `true` | the closed-schema rule |
| rejected tool result → hint appended exactly once to the next prompt | rejection detection and dedupe |
| request dump appends JSONL | the diagnostic actually wires up |

Assert on `feed_line` output and HTTP responses. Do not assert on private helpers — the parser will be rewritten several times as variants appear.

## Failure map

| Symptom | Cause |
|---|---|
| Model says the tool does not exist | `tools[]` dropped, or contract not injected on a new session |
| Model calls `tools.shell` inside execute | anti-catalog line missing from the contract |
| Model answers as if no image was attached | upload not polled to `SUCCESS`, or `ref_file_ids` not passed |
| Second turn restarts the conversation | prefix hash includes the trailing tool message |
| Wrong image referenced | image digest missing from the conversation key |
| Text duplicated mid-answer | `SET` op treated as append instead of diffed |
| TPS shows 4k–16k, context looks wrong | total counter emitted as `completion_tokens` with `prompt_tokens: 0` |
| Client rejects a call: `Invalid arguments for tool` | stringified integer/boolean; no schema coercion |
| Same bad call re-emitted after rejection | no reminder appended to the next continuation |
| Trailing argument missing from a call | paired open/close tag regexes; use a sequential tag scan |
| Empty reply, client shows nothing | upstream emitted only `THINK`; no `RESPONSE` fragment arrived |
| Thinking appears in the visible answer | `THINK` fragments mapped to `content` |
| 401 after a while | token expired — refresh `.env`, restart |
| Challenge loop / 403 on upload | PoW solved for the wrong `target_path` |
| Response stalls at the end | `close` handled only via `status: FINISHED`, or `[DONE]` never emitted |

## Deciding which reference applies

Ask in this order; stop at the first yes.

1. Does the BFF echo back `messages[]` and stream OpenAI-shaped chunks? → **Wapq example**. You may need almost no code.
2. Does the request body contain a `sessionId` but no parent id, and accept only the newest turn? → per-request session; use the Wapq structure plus Phase 4.
3. Does the body contain `parent_message_id`, `chat_session_id`, or a single `prompt` string? → **this file**.
4. Does the stream use `p`/`o`/`v`, `op`, or accumulated snapshots? → this file's Phase 6 handling regardless of the rest.

The two shapes can coexist in one BFF family (different endpoints, different versions). Classify per endpoint, not per site.
