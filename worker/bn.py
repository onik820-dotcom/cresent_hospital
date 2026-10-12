"""Bangla formatting + phone helpers. The model reads these strings aloud, so everything is spelled
the way a person would say it. Mirrors the Edge Function's _shared/bn.ts."""
from __future__ import annotations

import re
from datetime import datetime

_DIGITS = "০১২৩৪৫৬৭৮৯"
WEEKDAY_BN = ["শনিবার", "রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার"]  # 0 = Saturday
MONTH_BN = [
    "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
    "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
]


def to_bn_digits(value: str | int) -> str:
    return "".join(_DIGITS[int(c)] if c.isdigit() and c.isascii() else c for c in str(value))


def bn_to_ascii_digits(value: str) -> str:
    return "".join(str(_DIGITS.index(c)) if c in _DIGITS else c for c in value)


def bd_weekday(d: datetime) -> int:
    """Bangladesh weekday index (0 = Saturday) for a datetime."""
    return (d.weekday() + 2) % 7


def weekday_bn(d: datetime) -> str:
    return WEEKDAY_BN[bd_weekday(d)]


def date_bn(d: datetime) -> str:
    return f"{to_bn_digits(d.day)} {MONTH_BN[d.month - 1]}"


def today_bn(d: datetime) -> str:
    """'মঙ্গলবার, ৭ অক্টোবর ২০২৬'"""
    return f"{weekday_bn(d)}, {date_bn(d)} {to_bn_digits(d.year)}"


def time_bn(hour: int, minute: int = 0) -> str:
    """17:00 -> 'সন্ধ্যা ৫টা'; 10:30 -> 'সকাল ১০টা ৩০ মিনিট'."""
    if 4 <= hour < 6:
        period = "ভোর"
    elif 6 <= hour < 12:
        period = "সকাল"
    elif 12 <= hour < 15:
        period = "দুপুর"
    elif 15 <= hour < 17:
        period = "বিকেল"
    elif 17 <= hour < 19:
        period = "সন্ধ্যা"
    else:
        period = "রাত"
    h12 = 12 if hour % 12 == 0 else hour % 12
    base = f"{period} {to_bn_digits(h12)}টা"
    return f"{base} {to_bn_digits(minute)} মিনিট" if minute else base


def now_time_bn(d: datetime) -> str:
    return time_bn(d.hour, d.minute)


def normalize_any_number(raw: str) -> str:
    """Lenient E.164 for hotline / IP numbers (09611..., +88096..., 8809611...). Same rule as the API."""
    d = re.sub(r"\D", "", bn_to_ascii_digits(raw or ""))
    if d.startswith("880"):
        return "+" + d
    if d.startswith("0"):
        return "+880" + d[1:]
    return "+" + d if d else ""


def normalize_mobile(raw: str) -> str | None:
    """BD mobile -> +8801XXXXXXXXX, or None when it is not a mobile number."""
    d = re.sub(r"\D", "", bn_to_ascii_digits(raw or ""))
    if re.fullmatch(r"8801[3-9]\d{8}", d):
        return "+" + d
    if re.fullmatch(r"01[3-9]\d{8}", d):
        return "+88" + d
    if re.fullmatch(r"1[3-9]\d{8}", d):
        return "+880" + d
    return None
