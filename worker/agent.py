"""Smartkaj Voice worker: answers hospital calls in Bangla with Gemini Live over LiveKit.

One job = one call (a LiveKit room). Phone calls arrive through Asterisk -> LiveKit SIP; the dashboard's
Test Call page creates a 'test-...' room and dispatches this same agent by name.
"""
from __future__ import annotations

import asyncio
import json
import logging
import statistics
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import structlog
from dotenv import load_dotenv
from google.genai import types
from livekit import rtc
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, RunContext, cli, function_tool, room_io
from livekit.plugins import google

from bn import normalize_any_number, normalize_mobile
from config import Settings, get_settings
from events import EventLog
from prompts import APOLOGY_BN, NO_TRANSFER_APOLOGY_BN, render_system_prompt
from summary import OUTCOMES, compute_usage, summarize
from tools import AgentApi, ToolRunner

load_dotenv(Path(__file__).parent / ".env")  # exports LIVEKIT_URL / KEY / SECRET for the framework
log = structlog.get_logger("agent")
SETTINGS = get_settings()
server = AgentServer()


# --------------------------------------------------------------------------------------
# Call detection (pure, unit-tested)
# --------------------------------------------------------------------------------------
@dataclass
class CallInfo:
    channel: Literal["phone", "web_test"]
    room: str
    from_number: str = ""
    to_number: str = ""
    tenant_id: str | None = None


def _json_obj(raw: str | None) -> dict:
    try:
        val = json.loads(raw) if raw else {}
        return val if isinstance(val, dict) else {}
    except ValueError:
        return {}


def detect_call(room: str, is_sip: bool, attributes: dict[str, str], *metadata: str | None) -> CallInfo:
    """Phone: dialled number = sip.trunkPhoneNumber, caller = sip.phoneNumber.
    Web test: tenant_id comes from room / dispatch / participant metadata."""
    if is_sip:
        return CallInfo(
            channel="phone",
            room=room,
            from_number=attributes.get("sip.phoneNumber", ""),
            to_number=attributes.get("sip.trunkPhoneNumber", ""),
        )
    tenant_id = None
    for raw in metadata:
        tenant_id = tenant_id or _json_obj(raw).get("tenant_id")
    return CallInfo(channel="web_test", room=room, tenant_id=tenant_id)


def caller_for_prompt(from_number: str) -> str:
    """What the model sees as {caller_number}: a normalised BD mobile, else 'unknown'."""
    return normalize_mobile(from_number) or "unknown"


# --------------------------------------------------------------------------------------
# Runtime state for one call
# --------------------------------------------------------------------------------------
@dataclass
class CallRuntime:
    ctx: JobContext
    participant: rtc.RemoteParticipant
    info: CallInfo
    settings: Settings
    api: AgentApi
    events: EventLog
    transfer_number: str = ""
    session: AgentSession | None = None
    started_mono: float = field(default_factory=time.monotonic)
    started_iso: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    transcript: list[tuple[str, str]] = field(default_factory=list)
    succeeded: set[str] = field(default_factory=set)
    ttfts: list[float] = field(default_factory=list)
    transferred: bool = False
    failed: bool = False
    finalized: bool = False
    outcome_hint: str | None = None
    tasks: list[asyncio.Task] = field(default_factory=list)

    async def hangup(self) -> None:
        try:
            await self.ctx.delete_room()
        except Exception as exc:
            log.warning("delete_room_failed", error=str(exc))


# --------------------------------------------------------------------------------------
# The agent: every API tool is a thin wrapper around ToolRunner
# --------------------------------------------------------------------------------------
class Receptionist(Agent):
    def __init__(self, instructions: str, runner: ToolRunner, rt: CallRuntime) -> None:
        super().__init__(instructions=instructions)
        self.runner = runner
        self.rt = rt

    @function_tool()
    async def get_hospital_info(self, query: str) -> str:
        """Look up hospital facts: location, visiting hours, tests and prices, emergency and ambulance
        numbers, insurance, pharmacy. `query` is a short phrase in Bangla, English or Banglish."""
        return await self.runner.run("get_hospital_info", query=query)

    @function_tool()
    async def list_departments(self) -> str:
        """List the hospital's departments (Bangla and English names)."""
        return await self.runner.run("list_departments")

    @function_tool()
    async def find_doctors(
        self, name: str | None = None, department: str | None = None, weekday: int | None = None, limit: int = 5
    ) -> str:
        """Find doctors by name (Bangla or English, fuzzy) and/or department. `weekday` is 0=Saturday ..
        6=Friday. Returns doctor_id, names, department, fees and a Bangla schedule summary."""
        return await self.runner.run("find_doctors", name=name, department=department, weekday=weekday, limit=limit)

    @function_tool()
    async def get_doctor_availability(self, doctor_id: str, from_date: str | None = None, days: int = 7) -> str:
        """Open chamber sessions for a doctor over the next `days` days (default 7), from `from_date`
        (YYYY-MM-DD, default today). Each has session_id, date, time and serials_left; FULL / leave days
        are marked."""
        return await self.runner.run("get_doctor_availability", doctor_id=doctor_id, from_date=from_date, days=days)

    @function_tool()
    async def book_appointment(
        self,
        doctor_id: str,
        session_id: str,
        date: str,
        patient_name: str,
        patient_phone: str,
        visit_type: Literal["new", "followup"] = "new",
        patient_age: int | None = None,
    ) -> str:
        """Book a serial. Only call AFTER the caller said yes to your one-sentence confirmation.
        `date` is YYYY-MM-DD. Returns the serial number and reporting time; an SMS is sent."""
        return await self.runner.run(
            "book_appointment",
            doctor_id=doctor_id, session_id=session_id, date=date, patient_name=patient_name,
            patient_phone=patient_phone, visit_type=visit_type, patient_age=patient_age,
        )

    @function_tool()
    async def find_my_appointments(self, patient_phone: str) -> str:
        """Upcoming bookings for the caller's own phone number (never another person's)."""
        return await self.runner.run("find_my_appointments", patient_phone=patient_phone)

    @function_tool()
    async def cancel_appointment(self, appointment_id: str, reason: str | None = None) -> str:
        """Cancel a booking after the caller confirmed. An SMS is sent."""
        return await self.runner.run("cancel_appointment", appointment_id=appointment_id, reason=reason)

    @function_tool()
    async def reschedule_appointment(self, appointment_id: str, new_session_id: str, new_date: str) -> str:
        """Move a booking to another session/date (YYYY-MM-DD) after confirmation. Gives a new serial."""
        return await self.runner.run(
            "reschedule_appointment", appointment_id=appointment_id, new_session_id=new_session_id, new_date=new_date
        )

    @function_tool()
    async def create_callback_request(self, name: str, phone: str, message: str) -> str:
        """Leave a message for reception to call the caller back. Use when you cannot finish a task or
        it is outside office hours."""
        return await self.runner.run("create_callback_request", name=name, phone=phone, message=message)

    # ---- worker-only tools ----
    @function_tool()
    async def transfer_to_human(self, context: RunContext, reason: str) -> str:
        """Transfer the call to hospital reception. Say one short Bangla sentence first, then call this."""
        rt = self.rt
        if rt.info.channel != "phone":
            rt.transferred = True
            self.runner.events.tool("transfer_to_human", {"reason": reason}, {"simulated": True})
            return "Web test: no real transfer. Tell the caller they would now be connected to reception."
        if not rt.transfer_number:
            return "No transfer number is configured. Apologise and use create_callback_request instead."
        await context.wait_for_playout()
        try:
            await rt.ctx.transfer_sip_participant(rt.participant, "tel:" + rt.transfer_number)
        except Exception as exc:
            log.error("transfer_failed", error=str(exc))
            self.runner.events.tool("transfer_to_human", {"reason": reason}, {"error": "TRANSFER_FAILED"})
            return "The transfer failed. Apologise once and use create_callback_request."
        rt.transferred = True
        self.runner.events.tool("transfer_to_human", {"reason": reason}, {"transferred_to": rt.transfer_number})
        return "Transferred."

    @function_tool()
    async def end_call(
        self, context: RunContext, outcome: Literal["info", "booked", "cancelled", "rescheduled", "transferred", "callback", "abandoned"]
    ) -> str:
        """End the call after saying goodbye. `outcome` is what happened on the call."""
        self.rt.outcome_hint = outcome
        await context.wait_for_playout()
        await self.rt.hangup()
        return "Call ended."


# --------------------------------------------------------------------------------------
# Session helpers
# --------------------------------------------------------------------------------------
def build_model(settings: Settings, voice: str | None) -> google.realtime.RealtimeModel:
    kwargs: dict[str, Any] = dict(
        model=settings.gemini_model,
        api_key=settings.google_api_key,
        voice=voice or "Kore",
        temperature=settings.temperature,
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )
    if settings.gemini_language:  # native-audio models auto-detect; only set when explicitly configured
        kwargs["language"] = settings.gemini_language
    return google.realtime.RealtimeModel(**kwargs)


def spawn(rt: CallRuntime, coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    rt.tasks.append(task)
    return task


async def say_and_wait(rt: CallRuntime, instructions: str) -> None:
    assert rt.session is not None
    try:
        await rt.session.generate_reply(instructions=instructions)
    except Exception as exc:
        log.warning("generate_reply_failed", error=str(exc))


async def silence_flow(rt: CallRuntime) -> None:
    """Caller silent: gentle prompt, then (if still silent) polite goodbye and hang up."""
    s = rt.settings
    await say_and_wait(rt, "The caller has been silent. Gently ask in Bangla, in one short sentence, if they are still there.")
    await asyncio.sleep(max(0.0, s.silence_hangup_s - s.silence_prompt_s))
    await say_and_wait(rt, "Politely say goodbye in Bangla in one sentence: 'ক্রিসেন্ট হাসপাতালে ফোন করার জন্য ধন্যবাদ। ভালো থাকবেন।'")
    rt.outcome_hint = rt.outcome_hint or "abandoned"
    await rt.hangup()


async def max_call_flow(rt: CallRuntime) -> None:
    """Gemini Live audio sessions are time-limited: wrap up before the limit."""
    s = rt.settings
    await asyncio.sleep(max(1, s.max_call_s - 60))
    await say_and_wait(
        rt,
        "The call time limit is almost reached. In Bangla, in one sentence, offer to take a callback request "
        "(create_callback_request) or transfer to reception, and wrap up.",
    )
    await asyncio.sleep(60)
    await say_and_wait(rt, "Say goodbye politely in Bangla in one sentence.")
    await rt.hangup()


def wire_session_events(rt: CallRuntime, session: AgentSession) -> None:
    @session.on("conversation_item_added")
    def _item(ev) -> None:
        item = ev.item
        if getattr(item, "type", "") != "message" or item.role not in ("user", "assistant"):
            return
        text = (item.text_content or "").strip()
        if not text:
            return
        role = "caller" if item.role == "user" else "agent"
        rt.transcript.append((role, text))
        rt.events.message(role, text)

    @session.on("user_state_changed")
    def _user_state(ev) -> None:
        for t in [t for t in rt.tasks if t.get_name() == "silence"]:
            t.cancel()
            rt.tasks.remove(t)
        if ev.new_state == "away":
            task = spawn(rt, silence_flow(rt))
            task.set_name("silence")

    @session.on("metrics_collected")
    def _metrics(ev) -> None:
        m = ev.metrics
        if getattr(m, "type", "") == "realtime_model_metrics" and getattr(m, "ttft", 0) and m.ttft > 0:
            rt.ttfts.append(m.ttft)
            log.info("turn_latency", ttft_s=round(m.ttft, 3))

    @session.on("error")
    def _error(ev) -> None:
        log.error("session_error", error=str(getattr(ev, "error", ev)))
        if not getattr(ev.error, "recoverable", True):
            rt.failed = True


async def finalize(rt: CallRuntime) -> None:
    """Runs once when the room closes (caller hung up, we hung up, or transfer completed)."""
    if rt.finalized:
        return
    rt.finalized = True
    for t in rt.tasks:
        t.cancel()
    duration = time.monotonic() - rt.started_mono
    try:
        usage = compute_usage(rt.session.usage.model_usage if rt.session else [], rt.settings, duration)
    except Exception as exc:
        log.warning("usage_failed", error=str(exc))
        usage = compute_usage([], rt.settings, duration)
    summary_bn, outcome = await summarize(
        rt.transcript, rt.settings, succeeded=rt.succeeded, transferred=rt.transferred
    )
    if not summary_bn and outcome == "info" and rt.outcome_hint in OUTCOMES:
        outcome = rt.outcome_hint
    status = "failed" if rt.failed else ("transferred" if rt.transferred else "ended")
    await rt.events.close()  # drain queued transcript lines first
    await rt.events.send_now("usage", usage)
    await rt.events.send_now(
        "call_ended",
        {
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "duration_s": round(duration),
            "status": status,
            "outcome": outcome,
            "summary_bn": summary_bn,
            "transferred": rt.transferred,
        },
    )
    if rt.ttfts:
        log.info("call_latency", median_ttft_s=round(statistics.median(rt.ttfts), 3), turns=len(rt.ttfts))
    log.info("call_done", room=rt.info.room, status=status, outcome=outcome, duration_s=round(duration), **usage)
    await rt.api.aclose()


async def fallback_transfer(ctx: JobContext, participant: rtc.RemoteParticipant, settings: Settings, number: str, voice: str | None) -> None:
    """Tenant unknown / agent switched off: short Bangla apology, then hand the caller to the hospital."""
    number = number or settings.fallback_transfer_number
    session = AgentSession(llm=build_model(settings, voice))
    await session.start(
        agent=Agent(instructions="You are a phone line announcement. Say exactly what you are told, in Bangla, nothing else."),
        room=ctx.room,
        room_options=room_io.RoomOptions(participant_identity=participant.identity),
    )
    text = APOLOGY_BN if number else NO_TRANSFER_APOLOGY_BN
    await say_and_wait_session(session, f"Say exactly this sentence in Bangla, word for word: {text}")
    if number:
        try:
            await ctx.transfer_sip_participant(participant, "tel:" + normalize_any_number(number))
            log.info("fallback_transferred", number_tail=number[-4:])
            return
        except Exception as exc:
            log.error("fallback_transfer_failed", error=str(exc))
    await ctx.delete_room()


async def say_and_wait_session(session: AgentSession, instructions: str) -> None:
    try:
        await session.generate_reply(instructions=instructions)
    except Exception as exc:
        log.warning("generate_reply_failed", error=str(exc))


# --------------------------------------------------------------------------------------
# Entrypoint
# --------------------------------------------------------------------------------------
@server.rtc_session(agent_name=SETTINGS.agent_name)
async def entrypoint(ctx: JobContext) -> None:
    settings = SETTINGS
    await ctx.connect()
    participant = await ctx.wait_for_participant()
    is_sip = participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
    info = detect_call(
        ctx.room.name, is_sip, dict(participant.attributes), ctx.room.metadata, ctx.job.metadata, participant.metadata
    )
    structlog.contextvars.bind_contextvars(room=info.room, channel=info.channel)
    log.info("call_received", from_tail=info.from_number[-4:], to=info.to_number)

    api = AgentApi(settings.agent_api_base, settings.agent_api_key, info.room, info.tenant_id, settings.http_timeout_s)
    cfg_args = {"tenant_id": info.tenant_id} if info.tenant_id else {"to_number": normalize_any_number(info.to_number)}
    env = await api.call("get_agent_config", cfg_args, timeout=settings.config_timeout_s)
    cfg = env.get("data") if env.get("ok") else None

    if info.channel == "phone" and (not cfg or not cfg.get("is_live")):
        reason = "unknown_number" if not cfg else "agent_not_live"
        log.warning("phone_call_not_served", reason=reason, to=info.to_number)
        number = (cfg or {}).get("transfer_number") or (cfg or {}).get("hospital_phone") or ""
        await api.aclose()
        await fallback_transfer(ctx, participant, settings, number, (cfg or {}).get("voice"))
        return
    if not cfg:
        log.error("web_test_without_tenant", error=env.get("error"))
        await api.aclose()
        await ctx.delete_room()
        return

    api.tenant_id = cfg["tenant_id"]
    events = EventLog(api)
    rt = CallRuntime(ctx=ctx, participant=participant, info=info, settings=settings, api=api, events=events,
                     transfer_number=normalize_any_number(cfg.get("transfer_number") or ""))
    ctx.add_shutdown_callback(lambda: finalize(rt))

    await api.call(
        "log_event",
        {"type": "call_started", "payload": {
            "channel": info.channel, "from_number": info.from_number or None, "to_number": info.to_number or None,
            "started_at": rt.started_iso}},
    )
    events.start()

    instructions = render_system_prompt(cfg, caller_for_prompt(info.from_number))
    agent = Receptionist(instructions, ToolRunner(api, events, rt.succeeded), rt)
    session = AgentSession(llm=build_model(settings, cfg.get("voice")), user_away_timeout=settings.silence_prompt_s)
    rt.session = session
    wire_session_events(rt, session)

    await session.start(
        agent=agent,
        room=ctx.room,
        room_options=room_io.RoomOptions(participant_identity=participant.identity, text_input=True),
    )
    spawn(rt, max_call_flow(rt))
    greeting = (cfg.get("greeting_bn") or "").strip()
    await say_and_wait(
        rt,
        "Greet the caller now. Say exactly this in Bangla, word for word: " + greeting
        if greeting
        else "Greet the caller in Bangla, say you are the hospital's digital assistant and the call may be recorded, and ask how you can help.",
    )


def main() -> None:
    logging.basicConfig(level=SETTINGS.log_level)
    missing = SETTINGS.missing()
    if missing:
        raise SystemExit(f"Missing required settings: {', '.join(missing)} (see deploy/.env.example)")
    cli.run_app(server)


if __name__ == "__main__":
    main()
