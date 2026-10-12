import json
from types import SimpleNamespace

import httpx
import respx

import agent as A
from config import Settings
from events import EventLog
from tools import AgentApi, ToolRunner

BASE = "https://x.supabase.co/functions/v1"
LOG = BASE + "/agent-tools/log_event"


class FakeCtx:
    def __init__(self, fail_transfer=False):
        self.transfers, self.deleted, self.fail_transfer = [], 0, fail_transfer

    async def transfer_sip_participant(self, participant, to):
        if self.fail_transfer:
            raise RuntimeError("REFER rejected")
        self.transfers.append(to)

    async def delete_room(self):
        self.deleted += 1


class FakeRunContext:
    async def wait_for_playout(self):
        pass


def make_rt(channel="phone", ctx=None, transfer_number="+8801308400333"):
    api = AgentApi(BASE, "K", "call-1", "t-1")
    events = EventLog(api)
    rt = A.CallRuntime(
        ctx=ctx or FakeCtx(), participant=SimpleNamespace(identity="sip_1"), info=A.CallInfo(channel=channel, room="call-1"),
        settings=Settings(google_api_key="k"), api=api, events=events, transfer_number=transfer_number,
    )
    return rt


def make_agent(rt):
    return A.Receptionist("x", ToolRunner(rt.api, rt.events, rt.succeeded), rt)


def sent(route):
    return [json.loads(c.request.content) for c in route.calls]


@respx.mock
async def test_finalize_flushes_transcript_then_usage_then_call_ended(monkeypatch):
    route = respx.post(LOG).mock(return_value=httpx.Response(200, json={"ok": True, "data": {}}))
    rt = make_rt()
    rt.transcript = [("agent", "হ্যালো"), ("caller", "সিরিয়াল চাই")]
    rt.succeeded.add("book_appointment")
    rt.events.message("caller", "সিরিয়াল চাই")

    async def fake_summary(*a, **kw):
        return "রোগী সিরিয়াল নিয়েছেন", "booked"
    monkeypatch.setattr(A, "summarize", fake_summary)
    await A.finalize(rt)
    await A.finalize(rt)  # second call is a no-op

    types = [b["type"] for b in sent(route)]
    assert types == ["message", "usage", "call_ended"]
    ended = sent(route)[-1]["payload"]
    assert (ended["status"], ended["outcome"], ended["transferred"]) == ("ended", "booked", False)
    assert ended["summary_bn"] == "রোগী সিরিয়াল নিয়েছেন" and "duration_s" in ended and "ended_at" in ended
    assert set(sent(route)[1]["payload"]) == {"minutes", "input_tokens", "output_tokens", "cost_usd"}


@respx.mock
async def test_finalize_marks_transferred_and_failed_status(monkeypatch):
    route = respx.post(LOG).mock(return_value=httpx.Response(200, json={"ok": True, "data": {}}))

    async def fake_summary(*a, **kw):
        return "", "transferred"
    monkeypatch.setattr(A, "summarize", fake_summary)
    rt = make_rt(); rt.transferred = True
    await A.finalize(rt)
    assert sent(route)[-1]["payload"]["status"] == "transferred"

    route.calls.reset()
    rt2 = make_rt(); rt2.failed = True
    await A.finalize(rt2)
    assert sent(route)[-1]["payload"]["status"] == "failed"


@respx.mock
async def test_finalize_uses_end_call_hint_when_summary_unavailable(monkeypatch):
    route = respx.post(LOG).mock(return_value=httpx.Response(200, json={"ok": True, "data": {}}))

    async def fake_summary(*a, **kw):
        return "", "info"
    monkeypatch.setattr(A, "summarize", fake_summary)
    rt = make_rt(); rt.outcome_hint = "callback"
    await A.finalize(rt)
    assert sent(route)[-1]["payload"]["outcome"] == "callback"


async def test_phone_transfer_uses_tel_uri_and_marks_transferred():
    ctx = FakeCtx()
    rt = make_rt(ctx=ctx)
    out = await make_agent(rt).transfer_to_human(FakeRunContext(), "complaint")
    assert ctx.transfers == ["tel:+8801308400333"] and rt.transferred and out == "Transferred."


async def test_phone_transfer_failure_is_reported_to_the_model_not_raised():
    rt = make_rt(ctx=FakeCtx(fail_transfer=True))
    out = await make_agent(rt).transfer_to_human(FakeRunContext(), "complaint")
    assert not rt.transferred and "callback" in out


async def test_transfer_without_number_offers_callback_and_does_not_touch_sip():
    ctx = FakeCtx()
    rt = make_rt(ctx=ctx, transfer_number="")
    out = await make_agent(rt).transfer_to_human(FakeRunContext(), "x")
    assert ctx.transfers == [] and "create_callback_request" in out


async def test_web_test_transfer_is_simulated():
    ctx = FakeCtx()
    rt = make_rt(channel="web_test", ctx=ctx)
    await make_agent(rt).transfer_to_human(FakeRunContext(), "x")
    assert ctx.transfers == [] and rt.transferred


async def test_end_call_records_outcome_and_removes_room():
    ctx = FakeCtx()
    rt = make_rt(ctx=ctx)
    await make_agent(rt).end_call(FakeRunContext(), "booked")
    assert rt.outcome_hint == "booked" and ctx.deleted == 1
