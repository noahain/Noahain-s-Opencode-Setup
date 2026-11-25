---
name: reverse-proxy-blueprint
description: 'Builds OpenAI-compatible proxies that wrap a web app''s internal BFF (usually behind a session cookie) so OpenAI clients can use its models locally at /v1. Use when the user wants a site or playground usable from OpenAI clients/tools, mentions wrapping or proxying a web backend as an API, wants captured .network-request/.network-response traffic turned into a local API, or asks to build/extend the Wapq Proxy (F:\Coding Projects\Wapq Proxy) or the DeepSeek Proxy (F:\Coding Projects\deepseek proxy). Triggers on: "make site X work with OpenAI clients", "wrap this playground as an API", "reverse proxy blueprint", "proxy the BFF". NOT for generic API gateways or static scraping — if the target ships a native OpenAI-compatible API, use that instead.'
metadata:
  version: 2.1.0
  category: engineering
  tags: [proxy, openai, bff, reverse-engineering, fastapi, httpx, sse, tdd, stateful, streaming]
  difficulty: advanced
  phase: build
---

# Reverse Proxy Blueprint

Pattern for wrapping a web app's internal BFF as an OpenAI-compatible API.

Two reference implementations bracket the design space. Read the one that matches your target — the difference is not cosmetic, it is a different program:

| Reference | BFF shape | Tool calls | Stream |
|---|---|---|---|
| `references/worked-example.md` (Wapq) | stateless, OpenAI-shaped body | native | OpenAI delta SSE |
| `references/stateful-bff-playbook.md` (DeepSeek) | stateful, single `prompt` string | emulated via prompt | JSON-patch ops, `THINK`/`RESPONSE` fragments |

## Phase 0: Shape the target before writing code

Four questions decide the architecture. Answer them from captures, not from docs or intuition:

| Question | If yes | If no |
|---|---|---|
| Does the BFF take `messages[]` or one `prompt` string? | thin passthrough | flatten transcripts; send only deltas on continuation |
| Is conversation state threaded by a parent id? | cache and chain it | replay full context every request |
| Does `tools[]` actually work? | relay natively | render a contract into the prompt |
| Does the stream carry deltas or patches? | relay and suppress | maintain state and apply ops |

Getting these wrong produces a proxy that "works" for one turn and corrupts every turn after.

### Capture matrix

Capture **five** turns, not one. A single happy-path request hides all four answers above:

1. first user turn — session creation, auth headers
2. second user turn — reveals parent chaining vs full replay
3. a tool-call turn **and** the follow-up request carrying the result
4. a failing request (expired auth, bad model)
5. an attachment turn, if the UI supports uploads

## Phase 1: Recon

1. Chrome DevTools → Network → log in → send a message
2. Save each request/response body as `.network-request` / `.network-response`
3. Record **every** request header, not just auth: `Origin`, `Referer`, `x-client-*`, device ids, and any challenge header
4. Find the model-list, user-info, session-create, and (if any) upload endpoints
5. **Grep the site's own JS bundle** for `/api/`, `challenge`, `upload`, `target_path`. It names endpoints the UI never calls directly and reveals how derived headers are computed
6. Note whether a fresh session UUID works or the BFF demands a pre-created one

## Phase 2: Bootstrap

```
pip install fastapi uvicorn httpx pytest pytest-asyncio respx
```

Single `pyproject.toml`, no framework boilerplate. Split by concern, not by layer count:

| Module | Responsibility | Imports |
|---|---|---|
| `translator.py` | OpenAI ↔ BFF body conversion, parsing, error mapping | zero I/O, pure functions |
| `upstream.py` | HTTP client to the BFF | httpx only |
| `server.py` | routes, session cache, SSE relay | wires translator + upstream |
| `pow.py` / `auth.py` | challenge solving, header derivation | only when the BFF requires it |
| `images.py` | attachment fetch/validate | only when the BFF accepts uploads |

Non-Python assets (wasm, key material) must be declared in `package-data` or `pip install .` ships a broken package:

```toml
[tool.setuptools.package-data]
"my_proxy" = ["*.wasm"]
```

## Phase 3: Reverse-Engineer the BFF

Map every captured field to its OpenAI equivalent. Anything that does not map is hardcoded, derived, or state.

```json
{"messages":[...],"model":"...","sessionId":"<uuid>","userMessageId":"<uuid>","assistantMessageId":"<uuid>","userText":"...","hasAttachments":false}
```

**Conversation model — pick exactly one:**

| Shape | Tells | Strategy |
|---|---|---|
| Stateless | full `messages[]` accepted per request | replace `model`, pass through |
| Per-request session | `sessionId` only, no parent | create on first turn, reuse while alive |
| Stateful threading | `chat_session_id` + `parent_message_id` | send newest turn + parent; hash-key the cache |

**Prompt shape.** If the body takes one `prompt` string, you need two builders:
- **cache miss** → labeled transcript (`System: …\nUser: …\nAssistant: …`), refusing to send only the last message and losing all context
- **continuation** → just the new user text, or just the new tool results

Sending the transcript on every turn duplicates context and burns the token budget. Sending only the delta on a miss loses the conversation.

**Model names → capability flags.** Variants usually map to booleans (`thinking_enabled`, `search_enabled`), not to different endpoints. Check what the UI toggles, not what the docs say.

## Phase 4: State & Conversation Identity

For stateful BFFs, the session cache is the core of the proxy. Get the key wrong and conversations leak into each other.

```python
def conversation_key(messages: list[dict]) -> str:
    canonical = [
        {"role": m.get("role"), "content": message_text(m), "images": image_digests(m)}
        for m in messages
    ]
    return sha1(json.dumps(canonical, ensure_ascii=False).encode()).hexdigest()

# The assistant tool_calls turn is not in the next request's prefix.
prefix = messages[:-1]
while prefix and prefix[-1].get("role") == "tool":
    prefix = prefix[:-1]
entry = sessions.get(conversation_key(prefix))
```

Rules that each cost a real bug:
- **Strip trailing `tool` messages before hashing.** The client's next request drops the assistant `tool_calls` turn, so an un-stripped hash never matches.
- **Hash image URLs/content into the key.** Otherwise two different screenshots share one upstream chat and the model answers about the wrong picture.
- **Store `(session_id, parent_message_id)`**, with the parent taken from the stream's `ready`/control event — not from the request.
- **FIFO-evict** (256 is plenty). Restarting the process loses the map; the next turn opens a *new upstream chat*. Document that instead of persisting it.
- **Never create a new session for a continuation.** Check for a hit first; a miss mid-conversation means the client changed context, which is correct but expensive.

A poisoned session stays poisoned: if the model once concluded "there is no shell tool", every later turn inherits that belief. Test state changes in fresh sessions, never in the one you just broke.

## Phase 5: Tool Calling (Prompt Injection)

If the BFF has no native function calling, the model can only call what its prompt says exists — and it will invent a conclusion if you stay silent.

1. **Render the contract from the live `tools[]` schemas**, never from a hand-written list. Walk `parameters.properties` and `required`, render `name(param: type, optional?: type)`, truncate descriptions to one sentence.
2. **Inject only when starting a session.** Continuations inherit it from history; re-injecting wastes tokens and duplicates instructions.
3. **State the exact format**, with a complete example block, and one line forbidding alternatives: *"Call these tools directly — do not search the catalog for them."* That sentence is the difference between a working agent and a search spiral.
4. Strip parsed blocks from `content`; emit `tool_calls` deltas with `index`, `id`, `type`, `function.name`, `function.arguments`.
5. `finish_reason: "tool_calls"` when any call was emitted, `"stop"` otherwise — in both streaming and non-streaming.
6. Non-streaming: return `content: null` alongside `tool_calls` (OpenAI convention).

```python
def render_tool_contract(tools: list) -> str:
    lines = []
    for tool in tools:
        fn = tool.get("function") or {}
        name = fn.get("name")
        if not name:
            continue
        params = (fn.get("parameters") or {}).get("properties") or {}
        required = set((fn.get("parameters") or {}).get("required") or [])
        rendered = ", ".join(
            f"{p}: {spec.get('type', 'string')}" + ("" if p in required else "?")
            for p, spec in params.items()
        )
        lines.append(f"- {name}({rendered})")
    return CONTRACT_HEADER + "\n" + "\n".join(lines)
```

**Validate arguments against the schema you just rendered.** The contract teaches the shape; it does not enforce it. Build `name → {param: declared type}` from the live `tools[]` and coerce every parsed value before emitting:

- text → `integer`: `int(text)`, falling back to `int(float(text))`, falling back to the original text
- text → `number`: `float(text)`, falling back to the original text
- text → `boolean`: `text.strip().lower()` of `"true"`/`"false"` only
- text → `array`/`object`: `json.loads(text)`, falling back to the original text
- key absent from `properties`: drop it **only** when the schema is closed — `additionalProperties` absent or falsy. When `additionalProperties: true`, keep it.
- unknown tool name: pass through untouched, no coercion

Coerce one level only — `items.type` and nested `properties` are not walked. Say so in the module, because a half-applied coercion is worse than none. **Buffer the whole call before emitting:** OpenAI `arguments` is a single JSON *string*, so normalize once at the end of the block rather than streaming partial, uncoerced fragments.

This is deterministic and cheaper than asking the model to retry. It removes the measured string-vs-number and stray-attribute failures; it cannot invent a *missing* required key, so do not claim it fixes those.

**A rejected call is a signal, not a retry.** Harnesses reply with an error payload such as `{"error": …, "Invalid arguments for tool"}`. Detect it narrowly — a tool result whose text starts with `{"error"` **and** contains `Invalid arguments for tool` — so a file listing or log that merely mentions the phrase does not trigger it. Then append this to the *next* continuation prompt:

```
The previous tool call was rejected by the harness. Re-issue it with the exact parameter
names and types: text uses string="true"; integers, numbers, booleans, arrays and objects
use string="false" with JSON.
```

Note the direction: the model emits **attributes**, so non-text values go inside `string="false"` as a JSON literal. Telling it to "emit a JSON value instead of string=false" is backwards and produces the same rejection again.

Keep the raw rejection payload in the prompt alongside the hint; the model needs the parameter name it got wrong. Do not auto-retry the call yourself, and do not append the hint twice when consecutive results are batched.

**Tool result follow-ups.** OpenAI clients send `role: "tool"`. Convert to a continuation prompt, naming the tool and batching consecutive results:

```
Tool result (shell):
<output>

Tool result (read):
<output>
```

Resolve names by matching `tool_call_id` against the preceding assistant message. On a stateful BFF, send *only* these results — the transcript is already upstream.

**Parse liberally.** The model will not respect your format consistently. Scan tags sequentially — each `<…invoke>` / `<…parameter>` tag, open or closed, in order — then fall back to scanning for JSON objects with `json.JSONDecoder.raw_decode` and normalizing `name`/`tool`, `arguments`/`parameters`, and `function` wrappers. A sequential scan recovers an unclosed parameter or invoke; a paired open-tag/close-tag regex silently drops the trailing argument when one close tag is missing.

## Phase 6: Stream Protocol Shapes

Classify the stream before writing the relay. Three shapes exist, and only the first is trivial:

| Shape | Looks like | Handling |
|---|---|---|
| Delta SSE | each event is a finished OpenAI-ish chunk | forward, suppress tool markup |
| Snapshot | each event resends accumulated content | diff against emitted; never re-emit |
| JSON patch | `{p, o, v}` ops, `BATCH`, whole-response snapshots | maintain a mini state machine |

**Control-plane events are not data.** `ready`, `close`, `title`, `update_session` carry the next turn's parent id, the termination signal, and a chat title. Consume them for state; do not forward them to the client. A stream often terminates twice — a `status: FINISHED` patch *and* a socket `close`. Make both idempotent.

**Separate reasoning from answer.** If fragments are typed (`THINK` / `RESPONSE`), map thinking to `reasoning_content` and the answer to `content`. Folding thinking into `content` pollutes the response; dropping it loses the client's reasoning display.

**Cumulative SET ops duplicate content** unless you emit only the tail:

```python
def set_suffix(emitted: str, snapshot: str) -> str | None:
    """Upstream SET resends the whole value; emit only what is new."""
    return snapshot[len(emitted):] if snapshot.startswith(emitted) else None
```

`None` means "not a continuation of what I emitted" — ignore it rather than restarting the message.

**Usage.** Emit one final chunk with `"choices": []` and a `usage` object *before* `[DONE]`, gated on `stream_options.include_usage`. Non-streaming responses always include `usage`.

The counter most BFFs expose is **not** a completion count. `accumulated_token_usage` and its lookalikes are the turn's **prompt + visible output**: a 20k-char prompt with a one-word answer reports ~4,500, while a short greeting reports 74. Emitting that number as `completion_tokens` makes the client divide a whole context by a few seconds and display 4k–16k TPS. Split it instead:

```python
def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff" or "\u3040" <= ch <= "\u30ff" or "\uac00" <= ch <= "\ud7af")
    return max(1, round(cjk / 1.5 + (len(text) - cjk) / 4.2))


def usage(total: int, content: str, tool_markup: str) -> dict:
    completion = estimate_tokens(content) + estimate_tokens(tool_markup)  # visible output only
    prompt = max(total - completion, 0)
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": prompt + completion,   # == total unless completion exceeded it
    }
```

- Estimate with ~4.2 chars/token for ASCII and ~1.5 for CJK, and count the **raw tool markup**, not just the parsed arguments. The estimate only moves tokens between fields; `prompt + completion` stays exactly the upstream total, so context is never wrong by more than the output estimate.
- **Floor non-empty output at 1 token.** A `completion_tokens: 0` for a visible answer makes the client's TPS undefined or infinite; `max(1, …)` costs nothing and removes the edge case.
- `total_tokens` must equal `prompt + completion` (= the upstream counter). Omitting it, or setting it to the counter while `completion` holds the counter, is the same bug in a different field.
- If the estimate ever exceeds the counter, `prompt_tokens` floors at 0 and `total_tokens` becomes the estimate. Log it — that means the estimator or the counter is wrong, and hiding it in the clamp is how the next bug survives.
- **Thinking is often excluded.** Verify against a capture: if reasoning plus answer tokenizes *above* the reported total, the counter counts visible output only.
- If thinking is excluded from the total, do **not** report `reasoning_tokens` — you have no count for it, and clients that add `output + reasoning` will inflate context.
- Omit `prompt_tokens_details`, `cached_tokens` and `completion_tokens_details` unless you actually measure them. Some clients subtract `cached_tokens` from the prompt, so a fabricated cache count silently corrupts the context figure.
- Emit usage on a **normal close** only. An abnormal upstream close omits both the usage chunk and `[DONE]` — do not fabricate either.
- `prompt_tokens: 0` is correct only when the BFF gives no total at all. When it does, a zero makes the client's context meter read zero — that is the bug, not the safe default.

## Phase 7: Attachments

Attachments are almost never inline in the completion body. The usual flow is three steps:

1. `POST` multipart to an upload endpoint → get a `file_id`
2. **Poll a fetch/status endpoint until `SUCCESS`** — the upload returns before the file is readable
3. Pass the ids in the completion body (`ref_file_ids`, `attachments`, …)

Cache uploads by `sha256(bytes)`; clients resend the same image on every turn.

**If the proxy fetches user-supplied URLs itself, it is now an SSRF vector.** Guard it: `http`/`https` only, resolve DNS and reject non-global addresses, cap bytes and redirects, require an `image/*` content type, and re-check the host after every redirect. Data URLs need base64 validation and the same size cap.

Older-turn images usually cannot be re-uploaded cheaply. Replace them with `[Image N]` in transcripts and document the limitation rather than pretending it works.

## Phase 8: Error Mapping

| BFF signal | Proxy returns |
|---|---|
| 400 | 400 invalid_request |
| 401, or body hints (`unauthorized`, `not logged in`, `未登录`) | 401 unauthorized |
| 404 | 404 model_not_found |
| 429 | 429 rate_limited |
| 5xx, connect error, unknown shape | 502 upstream_error |

- Detect expired auth **in the body regardless of status code** — many BFFs return 200 with an error payload.
- Make the message actionable: `"token invalid or expired — refresh DEEPSEEK_USER_TOKEN in .env"`, not `"unauthorized"`.
- **Pull the first stream line before returning `StreamingResponse`.** Pre-stream failures then become real HTTP status codes instead of a 200 with a broken body. Do not fabricate `[DONE]` on an abnormal close.

## Phase 9: TDD Flow

1. Drop the captures into `captures/` and use them as fixtures.
2. Write tests against the **public surface** (`feed_line` output, HTTP status/body) — not private helpers.
3. `pytest` → fail → implement → pass.
4. Replay the real captured stream end-to-end and assert the exact chunk sequence, including `finish_reason` and usage ordering.

The highest-fidelity tests in both reference implementations replay production traffic verbatim:

```python
lines = (CAPTURES / "chat-completion.network-response").read_text(encoding="utf-8").splitlines()
chunks = [c for line in lines for c in translator.feed_line(line)]
assert chunks[-1] == "data: [DONE]\n\n"
```

For challenge/PoW code, pin a captured challenge and its known-good answer — it proves the solver against the live site instead of against your own reading of the algorithm.

Upstream tests use `respx`; streaming mocks need `side_effect` (see Common Pitfalls).

## Phase 10: Hardening & Ops

- **Bind `127.0.0.1` only.** The proxy forwards full account access and has no auth of its own.
- Keep `.env` and dumps gitignored; never log tokens or cookies, including in error bodies.
- Add an env-gated request dump **before** you need it: append each request body as JSONL (`MYPROXY_DUMP_REQUESTS=path`). It is the single highest-value diagnostic — you can see exactly what the client sent, including `tools[]` and `stream_options`.
- Write one dump file per process; concurrent writers interleave and corrupt JSONL.
- Dump the **translated** body too. The incoming request does not show what your prompt injection actually produced, which is where the bugs are.

## Common Pitfalls

1. **httpx streaming:** `aiter_text()` buffers the whole response in httpx 0.28+. Use `aiter_raw()` + `codecs.getincrementaldecoder("utf-8")`.
2. **respx streaming:** use `.mock(side_effect=fn)`, not `.mock(fn)`. The side effect must return an `httpx.Response`.
3. **Session creation:** test a known session id *and* a fresh UUID; the answer decides your whole architecture.
4. **Duplicate prompt injections:** check for a marker before appending; strip the old block, then append.
5. **`pytestmark` overwriting:** `pytestmark = X; pytestmark = Y` keeps only `Y`. Use a list.
6. **Cookie vs API key:** check whether a native OpenAI-compatible API already exists before building anything.
7. **`caplog` + `propagate`:** setting `logger.propagate = False` breaks the fixture. Use a `NullHandler`.
8. **Dropping `tools[]` is a silent catastrophe.** The model sees no tools, searches the catalog, finds only unrelated namespaces, and concludes the tool does not exist. It then repeats that conclusion for the rest of the session.
9. **Trailing `tool` messages must be stripped before hashing** the session prefix — the assistant `tool_calls` turn is absent from the next request.
10. **Image identity belongs in the conversation key** or two different images share one upstream chat.
11. **Empty assistant turns poison conversations.** Upstream emits only `THINK`, the client renders nothing, the user types "resume", and the history now contains that. Diagnose from the dump, not the UI, and prefer a visible fallback over silence.
12. **Cumulative `SET` ops duplicate text** unless diffed against what you already emitted.
13. **Markup variants are normal:** single/double fullwidth pipes, stray closing tags after a complete block, and blocks left open at `FINISHED`. Handle all three; flush and parse the unclosed block instead of dropping it.
14. **Cumulative counters arrive inside `BATCH` ops**, not only as top-level fields. Read them from every path that carries them.
15. **Windows console is cp1252.** Printing fullwidth characters (`｜`) raises `UnicodeEncodeError`. Write previews and logs to UTF-8 files and read them back.
16. **`prompt_tokens: 0` is only correct when the BFF exposes no total.** When a counter exists, report the split — a zero makes the client's context meter and TPS meaningless.
17. **Restarting the proxy loses in-memory sessions**; the next turn opens a new upstream chat. Plan restarts around long conversations.
18. **Concurrent processes corrupt a shared JSONL dump.** One file per process, or parse line-by-line tolerantly.
19. **`pip install .` drops non-Python assets** unless they are declared in `package-data`.
20. **A "think harder" prompt prelude must be gated to models with a hidden reasoning channel** — on a plain chat model it dumps deliberation into the visible answer.
21. **A total token counter is not a completion count.** It is prompt + visible output; using it as `completion_tokens` yields 4k–16k TPS.
22. **The contract teaches types but does not enforce them.** Coerce parsed arguments against the live schema or the client rejects stringified integers.
23. **Rejected tool calls need a hint, not a retry.** Detect the harness error and add the JSON-types reminder to the next continuation.

## Stream Suppression Pattern

The naive helper assumes one tag spelling, always-closed blocks, and a caller that re-scans the whole accumulated buffer. All three assumptions fail in production. Separate the concerns instead:

```python
def marker_holdback(buffer: str) -> int:
    """Length of a trailing fragment that could still become a marker."""
    lowered = buffer.lower()
    return max(
        (
            size
            for candidate in MARKER_PREFIXES          # ("<|---dsml---|", "<dsml", "</", "</|")
            for size in range(min(len(candidate), len(lowered)), 0, -1)
            if lowered.endswith(candidate[:size])
        ),
        default=0,
    )
```

Maintain one growing `pending` buffer. While outside a block:

- no marker found → emit `pending[:-holdback]`, keep the tail
- marker found → emit the text before it, enter block mode, drop the marker

While inside a block:

- closing tag not yet present → emit nothing, keep buffering
- closing tag found → parse the block body, emit `tool_calls`, leave block mode
- at `FINISHED`/`close` with the block still open → parse what is there anyway

Scrub orphaned closing tags (`</…invoke>`, `</…calls>`) from emitted content. Re-scanning the whole buffer on every chunk is what makes partial markers safe; feeding only new chunks is what leaks them.

Inside a block, scan tags sequentially rather than pairing an open-tag regex with a close-tag regex. One pass that accepts each tag in order, and treats a close tag as the end of the current parameter, recovers both an unclosed parameter and an unclosed invoke at flush. Paired regexes drop the trailing argument instead.

## Reference files

| File | Contents | Load when |
|---|---|---|
| `references/worked-example.md` | Stateless Wapq implementation: translator / upstream / server, respx test patterns | Target has an OpenAI-shaped BFF with native tools |
| `references/stateful-bff-playbook.md` | Stateful DeepSeek implementation: parent chaining, tool contract, JSON-patch stream, image upload, PoW | Target takes a single prompt or threads by parent id |
