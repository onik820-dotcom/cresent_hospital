import json
from types import SimpleNamespace

import pytest

from agent import caller_for_prompt, detect_call
from config import Settings
from summary import compute_usage, heuristic_outcome, summarize


def test_detect_phone_call_from_sip_attributes():
    info = detect_call("call-abc", True, {"sip.trunkPhoneNumber": "09611132581", "sip.phoneNumber": "8801712345678"}, None)
    assert (info.channel, info.to_number, info.from_number, info.tenant_id) == ("phone", "09611132581", "8801712345678", None)


def test_detect_web_test_reads_tenant_from_any_metadata_source():
    meta = json.dumps({"tenant_id": "t-9", "channel": "web_test"})
    assert detect_call("test-t-1", False, {}, meta).tenant_id == "t-9"
    assert detect_call("test-t-1", False, {}, "", "not json", meta).tenant_id == "t-9"
    assert detect_call("test-t-1", False, {}, None, None, None).tenant_id is None


def test_caller_number_for_prompt():
    assert caller_for_prompt("8801712345678") == "+8801712345678"
    assert caller_for_prompt("") == "unknown"
    assert caller_for_prompt("anonymous") == "unknown"


def test_heuristic_outcome_precedence():
    assert heuristic_outcome({"book_appointment"}, False, True) == "booked"
    assert heuristic_outcome({"book_appointment"}, True, True) == "transferred"
    assert heuristic_outcome({"cancel_appointment"}, False, True) == "cancelled"
    assert heuristic_outcome({"find_doctors"}, False, True) == "info"
    assert heuristic_outcome(set(), False, False) == "abandoned"


class FakeGenai:
    def __init__(self, text=None, exc=None):
        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._gen))
        self._text, self._exc = text, exc

    async def _gen(self, **kw):
        if self._exc:
            raise self._exc
        return SimpleNamespace(text=self._text)


S = Settings(google_api_key="k")
T = [("agent", "হ্যালো"), ("caller", "সিরিয়াল চাই"), ("agent", "ঠিক আছে")]


async def test_summarize_uses_model_output():
    client = FakeGenai('{"summary_bn":"রোগী সিরিয়াল নিয়েছেন","outcome":"booked"}')
    assert await summarize(T, S, client=client) == ("রোগী সিরিয়াল নিয়েছেন", "booked")


async def test_summarize_rejects_unknown_outcome_and_falls_back():
    client = FakeGenai('{"summary_bn":"x","outcome":"weird"}')
    assert (await summarize(T, S, succeeded={"cancel_appointment"}, client=client))[1] == "cancelled"


async def test_summarize_failure_falls_back_to_heuristic_never_raises():
    s, o = await summarize(T, S, succeeded={"book_appointment"}, client=FakeGenai(exc=RuntimeError("api down")))
    assert (s, o) == ("", "booked")


async def test_summarize_transferred_overrides_model():
    client = FakeGenai('{"summary_bn":"x","outcome":"info"}')
    assert (await summarize(T, S, transferred=True, client=client))[1] == "transferred"


async def test_silent_call_is_abandoned_without_calling_the_model():
    assert await summarize([("agent", "হ্যালো")], S, client=FakeGenai(exc=AssertionError("must not call"))) == ("", "abandoned")


def test_compute_usage_prices_audio_and_text_tokens():
    u = SimpleNamespace(type="llm_usage", input_audio_tokens=1_000_000, input_text_tokens=0, output_audio_tokens=1_000_000,
                        output_text_tokens=0, input_tokens=1_000_000, output_tokens=1_000_000)
    s = Settings(cost_in_audio_per_mtok=3.0, cost_out_audio_per_mtok=12.0)
    out = compute_usage([u], s, 150)
    assert out == {"minutes": 2.5, "input_tokens": 1_000_000, "output_tokens": 1_000_000, "cost_usd": 15.0}


def test_compute_usage_unsplit_tokens_are_priced_as_audio_and_other_types_ignored():
    u = SimpleNamespace(type="llm_usage", input_audio_tokens=0, input_text_tokens=0, output_audio_tokens=0,
                        output_text_tokens=0, input_tokens=500_000, output_tokens=0)
    other = SimpleNamespace(type="stt_usage", input_tokens=9_999_999)
    out = compute_usage([u, other], Settings(cost_in_audio_per_mtok=2.0), 60)
    assert out["cost_usd"] == 1.0 and out["input_tokens"] == 500_000


def test_settings_report_missing_required():
    assert set(Settings().missing()) == {"AGENT_API_BASE", "AGENT_API_KEY", "GOOGLE_API_KEY"}
    assert Settings(agent_api_base="b", agent_api_key="k", google_api_key="g").missing() == []
