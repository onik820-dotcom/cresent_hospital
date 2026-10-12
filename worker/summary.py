"""Post-call summary, outcome and cost. All best-effort: failures fall back to heuristics, never raise."""
from __future__ import annotations

import asyncio
import json
from typing import Any, Iterable

import structlog

from config import Settings

log = structlog.get_logger("summary")

OUTCOMES = ("info", "booked", "cancelled", "rescheduled", "transferred", "callback", "abandoned")

_TOOL_OUTCOME = {
    "book_appointment": "booked",
    "cancel_appointment": "cancelled",
    "reschedule_appointment": "rescheduled",
    "create_callback_request": "callback",
}


def heuristic_outcome(succeeded: Iterable[str], transferred: bool, caller_spoke: bool) -> str:
    if transferred:
        return "transferred"
    done = set(succeeded)
    for tool, outcome in _TOOL_OUTCOME.items():  # precedence: booking-type changes first
        if tool in done:
            return outcome
    return "info" if caller_spoke else "abandoned"


def _prompt(lines: list[str]) -> str:
    return (
        "You summarise hospital phone calls. Reply with JSON only: "
        '{"summary_bn":"<1-2 sentences in Bangla: what the caller wanted and what happened>",'
        f'"outcome":"<one of {", ".join(OUTCOMES)}>"}}\n\nTranscript:\n' + "\n".join(lines)
    )


async def summarize(
    transcript: list[tuple[str, str]],
    settings: Settings,
    *,
    succeeded: Iterable[str] = (),
    transferred: bool = False,
    client: Any | None = None,
) -> tuple[str, str]:
    """Returns (summary_bn, outcome). `transcript` is [(role, text)] with role in caller|agent."""
    caller_spoke = any(role == "caller" and text.strip() for role, text in transcript)
    fallback = heuristic_outcome(succeeded, transferred, caller_spoke)
    if not caller_spoke:
        return "", fallback

    lines = [f"{'Caller' if r == 'caller' else 'Agent'}: {t}" for r, t in transcript][-200:]
    text = "\n".join(lines)[-12000:]
    try:
        if client is None:
            from google import genai

            client = genai.Client(api_key=settings.google_api_key)
        from google.genai import types

        res = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=settings.summary_model,
                contents=_prompt([text]),
                config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.2),
            ),
            timeout=settings.summary_timeout_s,
        )
        parsed = json.loads(res.text or "{}")
        summary = str(parsed.get("summary_bn", ""))[:800]
        outcome = parsed.get("outcome")
        outcome = outcome if outcome in OUTCOMES else fallback
        if transferred:
            outcome = "transferred"
        return summary, outcome
    except Exception as exc:
        log.warning("summary_failed", error=type(exc).__name__, detail=str(exc)[:200])
        return "", fallback


def compute_usage(model_usage: Iterable[Any], settings: Settings, duration_s: float) -> dict[str, Any]:
    """Aggregate real token usage from the session and price it with the configured rates."""
    in_audio = in_text = out_audio = out_text = in_total = out_total = 0
    for u in model_usage:
        if getattr(u, "type", "") != "llm_usage":
            continue
        in_audio += getattr(u, "input_audio_tokens", 0) or 0
        in_text += getattr(u, "input_text_tokens", 0) or 0
        out_audio += getattr(u, "output_audio_tokens", 0) or 0
        out_text += getattr(u, "output_text_tokens", 0) or 0
        in_total += getattr(u, "input_tokens", 0) or 0
        out_total += getattr(u, "output_tokens", 0) or 0
    # Providers that do not split by modality: price the remainder as audio (voice-dominant workload).
    in_audio += max(0, in_total - in_audio - in_text)
    out_audio += max(0, out_total - out_audio - out_text)
    cost = (
        in_audio * settings.cost_in_audio_per_mtok
        + out_audio * settings.cost_out_audio_per_mtok
        + in_text * settings.cost_in_text_per_mtok
        + out_text * settings.cost_out_text_per_mtok
    ) / 1_000_000
    return {
        "minutes": round(duration_s / 60, 3),
        "input_tokens": in_audio + in_text,
        "output_tokens": out_audio + out_text,
        "cost_usd": round(cost, 6),
    }
