#!/usr/bin/env python3
"""Join a fresh room as a fake web caller, wait for the agent to greet, and report latency.

Needs a running worker and LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET, plus TENANT_ID
(the tenant uuid shown in the dashboard) so the worker can load that hospital's config.

    python scripts/smoke_test.py            # exit 0 = agent joined and spoke within TIMEOUT seconds
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import uuid

from livekit import api, rtc


async def main() -> int:
    url, key, secret = (os.environ.get(k, "") for k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"))
    tenant = os.environ.get("TENANT_ID", "")
    agent_name = os.environ.get("AGENT_NAME", "receptionist")
    timeout = float(os.environ.get("TIMEOUT", "15"))
    if not (url and key and secret and tenant):
        print("Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET and TENANT_ID.", file=sys.stderr)
        return 2

    room_name = f"test-smoke-{uuid.uuid4().hex[:8]}"
    meta = json.dumps({"tenant_id": tenant, "channel": "web_test"})
    token = (
        api.AccessToken(key, secret)
        .with_identity("smoke-caller")
        .with_grants(api.VideoGrants(room_join=True, room=room_name))
        .with_room_config(api.RoomConfiguration(agents=[api.RoomAgentDispatch(agent_name=agent_name, metadata=meta)]))
        .to_jwt()
    )
    room = rtc.Room()
    spoke = asyncio.Event()
    t0 = time.monotonic()

    @room.on("track_subscribed")
    def _on_track(track: rtc.Track, *_):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            spoke.set()

    ws_url = url.replace("http://", "ws://").replace("https://", "wss://")
    await room.connect(ws_url, token)
    print(f"joined {room_name}; waiting up to {timeout:.0f}s for the agent's greeting...")
    try:
        await asyncio.wait_for(spoke.wait(), timeout)
    except asyncio.TimeoutError:
        print("FAIL: no agent audio. Is the worker running? Is the tenant uuid right? Check worker logs.")
        await room.disconnect()
        return 1
    print(f"OK: agent audio after {time.monotonic() - t0:.2f}s")
    await room.disconnect()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
