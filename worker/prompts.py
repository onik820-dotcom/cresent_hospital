"""System prompt rendering. The template is tenant-neutral; hospital specifics come from agent config."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from bn import now_time_bn, today_bn

TEMPLATE_PATH = Path(__file__).parent / "prompts" / "system_bn.md"
DEFAULT_TZ = "Asia/Dhaka"

APOLOGY_BN = "দুঃখিত, এই মুহূর্তে আমি সেবা দিতে পারছি না। আপনাকে হাসপাতালের রিসেপশনে সংযুক্ত করছি।"
NO_TRANSFER_APOLOGY_BN = "দুঃখিত, এই মুহূর্তে সেবা দেওয়া সম্ভব হচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পর আবার ফোন করুন।"


def load_template() -> str:
    return TEMPLATE_PATH.read_text(encoding="utf-8")


def format_departments(departments: list[dict] | None) -> str:
    names = []
    for d in departments or []:
        en, bn = (d.get("name_en") or "").strip(), (d.get("name_bn") or "").strip()
        if en and bn and en != bn:
            names.append(f"{en} ({bn})")
        elif en or bn:
            names.append(en or bn)
    return ", ".join(names) if names else "(not configured)"


def format_office_hours(office_hours) -> str:
    """agent_configs.office_hours is free-form jsonb; render it compactly for the prompt."""
    if not office_hours:
        return "24/7"
    if isinstance(office_hours, str):
        return office_hours
    if isinstance(office_hours, dict):
        return "; ".join(f"{k}: {v}" for k, v in office_hours.items())
    return str(office_hours)


def render_system_prompt(cfg: dict, caller_number: str, now: datetime | None = None, template: str | None = None) -> str:
    tz = ZoneInfo(cfg.get("timezone") or DEFAULT_TZ)
    now = (now or datetime.now(tz)).astimezone(tz)
    values = {
        "agent_name": cfg.get("agent_name") or "সামিহা",
        "hospital_name": cfg.get("hospital_name") or "the hospital",
        "hospital_address": cfg.get("hospital_address") or "",
        "today_bn": today_bn(now),
        "today_iso": now.date().isoformat(),
        "now_time_bn": now_time_bn(now),
        "office_hours": format_office_hours(cfg.get("office_hours")),
        "departments": format_departments(cfg.get("departments")),
        "caller_number": caller_number or "unknown",
        "extra": (cfg.get("system_prompt_extra") or "").strip() or "(none)",
    }
    out = template if template is not None else load_template()
    for key, val in values.items():
        out = out.replace("{" + key + "}", str(val))
    return out
