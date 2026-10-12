"""Non-blocking live transcript logging.

Everything the dashboard shows live goes through log_event. Audio must never wait on HTTP, so events are
queued and a background task flushes them every ~300 ms, in order. Consecutive transcript lines are sent
as one batched `message` event (the API accepts payload.messages[]).
"""
from __future__ import annotations

import asyncio
from typing import Any

import structlog

from tools import AgentApi

log = structlog.get_logger("events")
FLUSH_INTERVAL_S = 0.3


class EventLog:
    def __init__(self, api: AgentApi, interval: float = FLUSH_INTERVAL_S) -> None:
        self.api = api
        self.interval = interval
        self._queue: list[tuple[str, dict[str, Any]]] = []
        self._task: asyncio.Task | None = None
        self._stopping = False
        self._lock = asyncio.Lock()  # one flush at a time keeps events in order

    # ---- producers (sync, never block) ----
    def message(self, role: str, text: str) -> None:
        self._queue.append(("message", {"role": role, "text": text}))

    def tool(self, name: str, args: dict, result: Any) -> None:
        self._queue.append(("tool", {"tool_name": name, "tool_args": args, "tool_result": result}))

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="event-log")

    # ---- consumer ----
    async def _run(self) -> None:
        while not self._stopping:
            await asyncio.sleep(self.interval)
            await self.flush()

    async def flush(self) -> None:
        """Send everything queued so far, preserving order; batch consecutive messages."""
        async with self._lock:
            pending, self._queue = self._queue, []
            i = 0
            while i < len(pending):
                kind, payload = pending[i]
                if kind == "message":
                    batch = [payload]
                    while i + 1 < len(pending) and pending[i + 1][0] == "message":
                        i += 1
                        batch.append(pending[i][1])
                    await self._send("message", {"messages": batch})
                else:
                    await self._send(kind, payload)
                i += 1

    async def _send(self, kind: str, payload: dict[str, Any]) -> None:
        try:
            env = await self.api.call("log_event", {"type": kind, "payload": payload})
            if not env.get("ok"):
                log.warning("log_event_rejected", kind=kind, error=env.get("error"))
        except Exception as exc:  # logging must never break a call
            log.warning("log_event_failed", kind=kind, error=str(exc))

    async def send_now(self, kind: str, payload: dict[str, Any]) -> None:
        """Flush the queue first so ordering holds, then send this event immediately."""
        await self.flush()
        await self._send(kind, payload)

    async def close(self) -> None:
        self._stopping = True
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self.flush()
