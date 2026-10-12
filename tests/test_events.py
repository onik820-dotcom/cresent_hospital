import httpx
import respx

from events import EventLog
from tools import AgentApi

URL = "https://x.supabase.co/functions/v1/agent-tools/log_event"


@respx.mock
async def test_flush_batches_consecutive_messages_and_keeps_order():
    route = respx.post(URL).mock(return_value=httpx.Response(200, json={"ok": True, "data": {}}))
    ev = EventLog(AgentApi("https://x.supabase.co/functions/v1", "K", "room-1", "t"))
    ev.message("agent", "হ্যালো")
    ev.message("caller", "ডাক্তার চাই")
    ev.tool("find_doctors", {"name": "x"}, {"doctors": []})
    ev.message("agent", "একটু অপেক্ষা করুন")
    await ev.flush()
    import json
    bodies = [json.loads(c.request.content) for c in route.calls]
    assert [b["type"] for b in bodies] == ["message", "tool", "message"]
    assert [m["role"] for m in bodies[0]["payload"]["messages"]] == ["agent", "caller"]
    assert bodies[1]["payload"]["tool_name"] == "find_doctors"


@respx.mock
async def test_background_loop_sends_without_explicit_flush():
    import asyncio
    route = respx.post(URL).mock(return_value=httpx.Response(200, json={"ok": True, "data": {}}))
    ev = EventLog(AgentApi("https://x.supabase.co/functions/v1", "K", "room-1", "t"), interval=0.05)
    ev.start()
    ev.message("caller", "hi")
    await asyncio.sleep(0.2)
    await ev.close()
    assert route.call_count == 1


@respx.mock
async def test_failed_log_event_never_raises():
    respx.post(URL).mock(side_effect=httpx.ConnectError("down"))
    ev = EventLog(AgentApi("https://x.supabase.co/functions/v1", "K", "room-1", "t"))
    ev.message("agent", "x")
    await ev.flush()  # must not raise
