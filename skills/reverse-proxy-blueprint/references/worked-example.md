# Worked Example — Wapq Proxy (api.wapq.cn / LivenHub)

The reference implementation this blueprint was distilled from. Target specifics:

- Site: `api.wapq.cn` (a New API fork). Native `/v1` API tokens were suspended until QQ binding — the web playground BFF was the only working door.
- BFF: `POST /pg/chat/completions`, auth = `session` cookie + `New-Api-User` header (~488-char gin securecookie value).
- Discoveries: the BFF was **already OpenAI-shaped** (thin passthrough, no prompt injection needed), and **tool calling was native** (streaming `tool_calls` deltas verified live). Captures live in `F:\Coding Projects\Wapq Proxy\captures\`.

Treat paths, header names, and injected fields (`group`) as target-specific — the shapes below are the reusable part.

## Contents

1. [translator.py](#translatorpy) — pure mapping + error table
2. [upstream.py](#upstreampy) — auth client + true streaming relay
3. [server.py](#serverpy) — FastAPI routes + SSE classifier
4. [Test patterns](#test-patterns-respx) — respx streaming mocks

## translator.py

```python
import json

SESSION_HINTS = ("not logged in", "new-api-user header not provided", "未登录")

ERROR_TYPES = {
    "model_not_found": "invalid_request_error",
    "unauthorized": "authentication_error",
    "rate_limited": "rate_limit_error",
    "upstream_error": "api_error",
}


def to_upstream_body(openai_body: dict, group: str) -> dict:
    body = {key: value for key, value in openai_body.items() if key != "user"}
    body["group"] = group
    body["stream"] = bool(body.get("stream"))
    return body


def to_models_response(names: list[str]) -> dict:
    return {
        "object": "list",
        "data": [
            {"id": name, "object": "model", "created": 0, "owned_by": "wapq"}
            for name in names
        ],
    }


def map_error(status: int, body_text: str) -> tuple[int, dict]:
    message = _extract_message(body_text)
    lowered = (body_text or "").lower()
    if status == 401 or any(hint in lowered for hint in SESSION_HINTS):
        detail = "WapQ session invalid or expired — refresh WAPQ_SESSION in .env"
        if message:
            detail += f" (upstream: {message})"
        return 401, _error(detail, "unauthorized")
    if status == 429:
        return 429, _error(message or "rate limited by upstream", "rate_limited")
    if status in (400, 404):
        return status, _error(message or "model not found", "model_not_found")
    return 502, _error(message or "upstream error", "upstream_error")


def _error(message: str, code: str) -> dict:
    return {"error": {"message": message, "type": ERROR_TYPES[code], "code": code}}


def _extract_message(body_text: str) -> str:
    try:
        payload = json.loads(body_text)
    except (TypeError, ValueError):
        return (body_text or "").strip()
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if isinstance(error, dict) and isinstance(error.get("message"), str):
        return error["message"]
    if isinstance(payload.get("message"), str):
        return payload["message"]
    return ""
```

Notes: `map_error` checks session hints in the body **regardless of status** (notes: this mattered). The 502 fallback catches connect errors and unknown shapes. The error message tells the operator exactly what to do (refresh the cookie).

## upstream.py

```python
import codecs
from collections.abc import AsyncIterator

import httpx


class UpstreamError(Exception):
    def __init__(self, status: int, body_text: str):
        super().__init__(f"upstream returned {status}")
        self.status = status
        self.body_text = body_text


class Upstream:
    USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/155.0.0.0"

    def __init__(self, base_url: str, session: str, user_id: int):
        self.base_url = base_url.rstrip("/")
        self._headers = {
            "Cookie": f"session={session}",
            "New-Api-User": str(user_id),
            "Accept": "*/*",
            "User-Agent": self.USER_AGENT,
        }
        self._client = httpx.AsyncClient()

    async def chat(self, body: dict) -> tuple[int, str]:
        response = await self._client.post(
            f"{self.base_url}/pg/chat/completions",
            headers=self._json_headers(),
            json=body,
            timeout=httpx.Timeout(300.0, connect=10.0),
        )
        return response.status_code, response.text

    async def models(self) -> tuple[int, str]:
        response = await self._client.get(
            f"{self.base_url}/api/user/models",
            headers=self._headers,
            timeout=httpx.Timeout(30.0, connect=10.0),
        )
        return response.status_code, response.text

    async def chat_stream(self, body: dict) -> AsyncIterator[str]:
        request = self._client.build_request(
            "POST",
            f"{self.base_url}/pg/chat/completions",
            headers=self._json_headers(),
            json=body,
            timeout=httpx.Timeout(None, connect=10.0),
        )
        response = await self._client.send(request, stream=True)
        if response.status_code != 200:
            text = (await response.aread()).decode("utf-8", "replace")
            await response.aclose()
            raise UpstreamError(response.status_code, text)
        try:
            decoder = codecs.getincrementaldecoder("utf-8")()
            buffer = ""
            async for raw in response.aiter_raw():
                buffer += decoder.decode(raw)
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    yield line.rstrip("\r")
            buffer += decoder.decode(b"", True)
            if buffer:
                yield buffer.rstrip("\r")
        finally:
            await response.aclose()

    def _json_headers(self) -> dict:
        return {**self._headers, "Content-Type": "application/json"}
```

Notes: `aiter_raw()` + incremental decoder = true streaming (pitfall #1). Streaming calls have no read timeout (`Timeout(None, connect=10.0)`) so long generations survive; buffered calls get 300s. Non-200 before any stream data raises `UpstreamError` carrying the body so the server can map it. Browser-ish User-Agent — sites sometimes filter non-browser clients.

## server.py

Key parts (config loading and models route trimmed; full file in the project):

```python
import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict

from wapq_proxy.translator import map_error, to_models_response, to_upstream_body
from wapq_proxy.upstream import Upstream, UpstreamError

# Settings: frozen dataclass ({base_url, session, user_id, group, port}) loaded
# from env/.env at startup; raises with a clear message when required vars are missing.


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="allow")  # pass unknown OpenAI params through

    model: str
    messages: list[dict]
    stream: bool | None = None


def classify_sse_line(line: str) -> tuple[str | None, bool]:
    stripped = line.strip()
    if not stripped or stripped.startswith(":"):
        return None, False                                        # drop heartbeats
    if stripped.startswith("data:"):
        return stripped + "\n\n", stripped == "data: [DONE]"      # forward verbatim
    if stripped.startswith("{") and '"error"' in stripped:
        return "data: " + stripped + "\n\ndata: [DONE]\n\n", True # 200-then-error
    return None, False


def create_app(settings: Settings, upstream=None) -> FastAPI:
    app = FastAPI()
    upstream = upstream or Upstream(
        base_url=settings.base_url, session=settings.session, user_id=settings.user_id
    )

    def error_response(status: int, body_text: str) -> JSONResponse:
        mapped_status, payload = map_error(status, body_text)
        return JSONResponse(payload, status_code=mapped_status)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/v1/chat/completions")
    async def chat_completions(req: ChatRequest):
        body = to_upstream_body(req.model_dump(), settings.group)
        if not body["stream"]:
            try:
                status, text = await upstream.chat(body)
            except httpx.HTTPError:
                return error_response(502, "")
            if status != 200:
                return error_response(status, text)
            return Response(content=text, media_type="application/json")

        stream = upstream.chat_stream(body)
        try:
            first_line = await stream.__anext__()     # surface pre-stream errors as HTTP errors
        except StopAsyncIteration:
            first_line = None
        except UpstreamError as exc:
            return error_response(exc.status, exc.body_text)
        except httpx.HTTPError:
            return error_response(502, "")

        async def relay():
            line = first_line
            try:
                while line is not None:
                    emit, stop = classify_sse_line(line)
                    if emit:
                        yield emit
                    if stop:
                        return
                    try:
                        line = await stream.__anext__()
                    except StopAsyncIteration:
                        return              # abnormal close: no fabricated [DONE]
            finally:
                await stream.aclose()

        return StreamingResponse(relay(), media_type="text/event-stream")

    return app
```

Notes: pulling the first line before returning `StreamingResponse` lets pre-stream upstream errors become proper HTTP status codes instead of a broken 200 stream. The relay never fabricates `[DONE]` on abnormal close. Config (`.env`) fails fast at startup when `WAPQ_SESSION` / `WAPQ_USER_ID` are missing, with instructions in the error message.

## Test patterns (respx)

Streaming mock helper — the only shape that works:

```python
def sse_response(chunks, status=200):
    async def gen():
        for chunk in chunks:
            yield chunk
    return httpx.Response(status, headers={"content-type": "text/event-stream"}, content=gen())


@respx.mock
async def test_chat_stream_yields_lines_reassembled_across_chunk_boundaries():
    chunks = [
        b'data: {"choices":[{"delta":{"content":"4"}}]}\n\ndata: {"choices":[{"delta"',
        b':{}}]}\n\n',
        b"data: [DONE]\n\n",
    ]
    respx.post(f"{BASE}/pg/chat/completions").mock(
        side_effect=lambda request: sse_response(chunks)   # NOT return_value / NOT .mock(fn)
    )
    lines = [
        line
        async for line in make_upstream().chat_stream({"model": "m", "stream": True})
    ]
    assert lines == [
        'data: {"choices":[{"delta":{"content":"4"}}]}',
        "",
        'data: {"choices":[{"delta":{}}]}',
        "",
        "data: [DONE]",
        "",
    ]
```

Auth-header assertion pattern:

```python
route = respx.post(f"{BASE}/pg/chat/completions").mock(
    return_value=httpx.Response(200, json={"choices": []})
)
status, text = await make_upstream().chat({"model": "m", "messages": []})
request = route.calls.last.request
assert request.headers["cookie"] == "session=SESSIONVAL"
assert request.headers["new-api-user"] == "1056"
```

Non-stream mocks use plain `return_value=httpx.Response(...)`. Pre-stream errors: mock `return_value=httpx.Response(401, text='{"message":"Unauthorized, not logged in..."}')` and assert `UpstreamError.status == 401` on first iteration.
