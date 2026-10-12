import json

import httpx
import pytest
import respx

from tools import FAILURE_HINT, AgentApi, ToolRunner, format_result

BASE = "https://x.supabase.co/functions/v1"
URL = BASE + "/agent-tools/{}"


def make_api(**kw):
    return AgentApi(BASE, "KEY", "call-123", tenant_id=kw.pop("tenant_id", "t-1"), **kw)


class FakeEvents:
    def __init__(self):
        self.tools = []

    def tool(self, name, args, result):
        self.tools.append((name, args, result))


@respx.mock
async def test_success_sends_contract_headers_and_body():
    route = respx.post(URL.format("find_doctors")).mock(
        return_value=httpx.Response(200, json={"ok": True, "data": {"doctors": [{"name_bn": "ডা. রহিম"}]}})
    )
    env = await make_api().call("find_doctors", {"name": "রহিম"})
    assert env["ok"] is True
    req = route.calls.last.request
    assert req.headers["authorization"] == "Bearer KEY"
    assert req.headers["x-call-id"] == "call-123"
    assert req.headers["x-tenant-id"] == "t-1"
    assert json.loads(req.content) == {"name": "রহিম"}


@respx.mock
async def test_no_tenant_header_before_config_is_known():
    route = respx.post(URL.format("get_agent_config")).mock(return_value=httpx.Response(200, json={"ok": True, "data": {}}))
    await AgentApi(BASE, "KEY", "call-1").call("get_agent_config", {"to_number": "+8809611132581"})
    assert "x-tenant-id" not in route.calls.last.request.headers


@respx.mock
async def test_retries_once_on_network_error_then_succeeds():
    route = respx.post(URL.format("book_appointment")).mock(
        side_effect=[httpx.ConnectError("boom"), httpx.Response(200, json={"ok": True, "data": {"serial_no": 7}})]
    )
    env = await make_api().call("book_appointment", {"x": 1})
    assert env["ok"] and route.call_count == 2


@respx.mock
async def test_timeout_twice_gives_network_failure_envelope():
    route = respx.post(URL.format("find_doctors")).mock(side_effect=httpx.ReadTimeout("slow"))
    env = await make_api().call("find_doctors", {})
    assert route.call_count == 2  # exactly one retry, never more
    assert env["ok"] is False and env["error"] == "NETWORK"
    assert format_result(env) == FAILURE_HINT


@respx.mock
async def test_no_retry_on_http_error_status():
    route = respx.post(URL.format("book_appointment")).mock(
        return_value=httpx.Response(401, json={"ok": False, "error": "UNAUTHORIZED", "message_bn": "অনুমতি নেই।"})
    )
    env = await make_api().call("book_appointment", {})
    assert route.call_count == 1
    assert env["error"] == "UNAUTHORIZED"


@respx.mock
async def test_non_json_response_is_a_failure_not_a_crash():
    respx.post(URL.format("find_doctors")).mock(return_value=httpx.Response(502, text="<html>bad gateway</html>"))
    env = await make_api().call("find_doctors", {})
    assert env == {"ok": False, "error": "HTTP_502", "message_bn": ""}
    assert format_result(env) == FAILURE_HINT


def test_format_result_keeps_bangla_readable_and_full_next_open():
    ok = format_result({"ok": True, "data": {"serial_no_bn": "সাত"}})
    assert ok == '{"serial_no_bn":"সাত"}'
    full = format_result({"ok": False, "error": "FULL", "message_bn": "শেষ", "data": {"next_open": [{"date_bn": "১১ অক্টোবর"}]}})
    assert json.loads(full)["error"] == "FULL"
    assert json.loads(full)["data"]["next_open"][0]["date_bn"] == "১১ অক্টোবর"


@respx.mock
async def test_runner_drops_none_args_logs_event_and_tracks_success():
    route = respx.post(URL.format("find_doctors")).mock(return_value=httpx.Response(200, json={"ok": True, "data": {"doctors": []}}))
    ev, done = FakeEvents(), set()
    out = await ToolRunner(make_api(), ev, done).run("find_doctors", name="x", department=None, weekday=None, limit=5)
    assert json.loads(route.calls.last.request.content) == {"name": "x", "limit": 5}
    assert done == {"find_doctors"}
    assert ev.tools[0][0] == "find_doctors" and out == '{"doctors":[]}'


@respx.mock
async def test_runner_does_not_mark_failed_tool_as_succeeded():
    respx.post(URL.format("book_appointment")).mock(
        return_value=httpx.Response(200, json={"ok": False, "error": "FULL", "message_bn": "শেষ"})
    )
    done = set()
    await ToolRunner(make_api(), FakeEvents(), done).run("book_appointment", doctor_id="d")
    assert done == set()
