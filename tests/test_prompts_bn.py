import re
from datetime import datetime
from zoneinfo import ZoneInfo

from bn import (date_bn, normalize_any_number, normalize_mobile, now_time_bn, time_bn, to_bn_digits, today_bn,
                weekday_bn)
from prompts import APOLOGY_BN, format_departments, render_system_prompt

DHAKA = ZoneInfo("Asia/Dhaka")
CFG = {
    "agent_name": "Afreen", "hospital_name": "Uttara Crescent Hospital", "hospital_address": "Uttara, Dhaka",
    "office_hours": {"daily": "08:00-22:00"}, "system_prompt_extra": "Visitors: 5-7 PM.",
    "departments": [{"name_en": "Cardiology", "name_bn": "হৃদরোগ"}, {"name_en": "ENT", "name_bn": "ENT"}],
}


def test_weekday_index_matches_bangladesh_week_starting_saturday():
    assert weekday_bn(datetime(2026, 10, 10)) == "শনিবার"   # Saturday
    assert weekday_bn(datetime(2026, 10, 7)) == "বুধবার"    # Wednesday
    assert weekday_bn(datetime(2026, 10, 9)) == "শুক্রবার"  # Friday


def test_date_and_today_bn():
    assert date_bn(datetime(2026, 10, 11)) == "১১ অক্টোবর"
    assert today_bn(datetime(2026, 10, 7)) == "বুধবার, ৭ অক্টোবর ২০২৬"


def test_time_bn_matches_api_style():
    assert time_bn(17) == "সন্ধ্যা ৫টা"
    assert time_bn(10, 30) == "সকাল ১০টা ৩০ মিনিট"
    assert time_bn(0) == "রাত ১২টা"
    assert time_bn(13) == "দুপুর ১টা"


def test_phone_normalisation_matches_edge_function():
    assert normalize_any_number("09611132581") == "+8809611132581"
    assert normalize_any_number("+8809611132581") == "+8809611132581"
    assert normalize_any_number("8809611132581") == "+8809611132581"
    assert normalize_any_number("০৯৬১১১৩২৫৮১") == "+8809611132581"
    assert normalize_mobile("01712345678") == "+8801712345678"
    assert normalize_mobile("8801712345678") == "+8801712345678"
    assert normalize_mobile("১৭১২৩৪৫৬৭৮") == "+8801712345678"
    assert normalize_mobile("09611132581") is None
    assert normalize_mobile("anonymous") is None


def test_prompt_renders_with_no_placeholders_left():
    now = datetime(2026, 10, 7, 17, 30, tzinfo=DHAKA)
    out = render_system_prompt(CFG, "+8801712345678", now=now)
    assert not re.findall(r"\{[a-z_]+\}", out), re.findall(r"\{[a-z_]+\}", out)
    assert "Afreen" in out and "Uttara Crescent Hospital" in out
    assert "বুধবার, ৭ অক্টোবর ২০২৬ (2026-10-07)" in out
    assert "সন্ধ্যা ৫টা ৩০ মিনিট" in out
    assert "Cardiology (হৃদরোগ), ENT" in out
    assert "Visitors: 5-7 PM." in out and "+8801712345678" in out


def test_prompt_handles_sparse_config_and_unknown_caller():
    out = render_system_prompt({"hospital_name": "X"}, "unknown", now=datetime(2026, 10, 7, 9, tzinfo=DHAKA))
    assert "Caller's number: unknown" in out and "(not configured)" in out and "24/7" in out


def test_extra_text_with_braces_is_not_interpreted():
    out = render_system_prompt({**CFG, "system_prompt_extra": "Use {caller_number} literally"}, "+8801712345678")
    assert "Use {caller_number} literally" in out


def test_departments_formatting_and_apology_is_bangla():
    assert format_departments([]) == "(not configured)"
    assert any("ঀ" <= c <= "৿" for c in APOLOGY_BN)
    assert to_bn_digits(2026) == "২০২৬"
