"""HTTP client for the Supabase `agent-tools` Edge Function, plus the tool runner the agent uses.

The worker never touches the database: every tool goes through this API (see the build plan, section 6).
Retry policy: one retry, only on a network error. That is safe for book/cancel/reschedule because the
API derives its idempotency key from the call (room) id, so a replay returns the same booking.
"""
from __future__ import annotations

import json
import time
from typing import Any

import httpx
import structlog

log = structlog.get_logger("tools")

# Returned to the model when the API cannot be reached or answers with something unusable.
FAILURE_HINT = (
    "TOOL_FAILED: the system could not complete this. Apologise once in Bangla, then offer to "
    "create_callback_request or transfer_to_human. Do not guess the answer."
)


class AgentApi:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        call_id: str,
        tenant_id: str | None = None,
        timeout: float = 3.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.call_id = call_id
        self.tenant_id = tenant_id
        self.timeout = timeout
        self._client = client or httpx.AsyncClient()
        self._owns_client = client is None

    def _headers(self) -> dict[str, str]:
        h = {"Authorization": f"Bearer {self.api_key}", "X-Call-Id": self.call_id, "Content-Type": "application/json"}
        if self.tenant_id:
            h["X-Tenant-Id"] = self.tenant_id
        return h

    async def call(self, tool: str, body: dict[str, Any] | None = None, *, timeout: float | None = None) -> dict[str, Any]:
        """POST /agent-tools/{tool}. Always returns the API envelope: {ok, data} or {ok:false, error, message_bn}."""
        url = f"{self.base_url}/agent-tools/{tool}"
        t0 = time.perf_counter()
        last_exc: Exception | None = None
        for attempt in (1, 2):
            try:
                res = await self._client.post(url, json=body or {}, headers=self._headers(), timeout=timeout or self.timeout)
            except (httpx.TransportError, httpx.TimeoutException) as exc:  # network error only
                last_exc = exc
                log.warning("api_network_error", tool=tool, attempt=attempt, error=type(exc).__name__)
                continue
            ms = round((time.perf_counter() - t0) * 1000)
            try:
                env = res.json()
                if not isinstance(env, dict) or "ok" not in env:
                    raise ValueError("not an envelope")
            except ValueError:
                log.error("api_bad_response", tool=tool, status=res.status_code, ms=ms)
                return {"ok": False, "error": f"HTTP_{res.status_code}", "message_bn": ""}
            log.info("api_call", tool=tool, status=res.status_code, ok=env.get("ok"), ms=ms)
            return env
        return {"ok": False, "error": "NETWORK", "message_bn": "", "_exc": type(last_exc).__name__ if last_exc else ""}

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()


def format_result(env: dict[str, Any]) -> str:
    """Compact JSON the model reads aloud: keep Bangla readable, drop noise."""
    if env.get("ok"):
        return json.dumps(env.get("data", {}), ensure_ascii=False, separators=(",", ":"))
    if env.get("error") in {"NETWORK"} or str(env.get("error", "")).startswith("HTTP_5"):
        return FAILURE_HINT
    out: dict[str, Any] = {"ok": False, "error": env.get("error"), "message_bn": env.get("message_bn", "")}
    if env.get("data"):
        out["data"] = env["data"]  # e.g. FULL carries next_open dates
    return json.dumps(out, ensure_ascii=False, separators=(",", ":"))


class ToolRunner:
    """Runs one API tool, logs it to the live view, and remembers what succeeded (for the call outcome)."""

    def __init__(self, api: AgentApi, events: "EventLogLike", succeeded: set[str]) -> None:
        self.api = api
        self.events = events
        self.succeeded = succeeded

    async def run(self, tool: str, **args: Any) -> str:
        args = {k: v for k, v in args.items() if v is not None}
        env = await self.api.call(tool, args)
        if env.get("ok"):
            self.succeeded.add(tool)
        self.events.tool(tool, args, env.get("data") if env.get("ok") else {"error": env.get("error")})
        return format_result(env)


class EventLogLike:  # structural stub for typing only
    def tool(self, name: str, args: dict, result: Any) -> None: ...
