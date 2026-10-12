#!/usr/bin/env python3
"""Create (idempotently) the LiveKit inbound SIP trunk and dispatch rule used by the hotline.

  trunk:    accepts calls only from Asterisk on localhost (allowed_addresses), optionally only for INBOUND_NUMBERS
  dispatch: one room per call (prefix "call-") and explicit dispatch of the agent named AGENT_NAME

Run on the VPS after `docker compose up -d`:
    docker compose run --rm worker python /app/scripts/setup_sip.py     (see README)
or locally with LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET exported.
Safe to run again: existing objects with the same names are replaced.
"""
from __future__ import annotations

import asyncio
import os
import sys

from livekit import api

TRUNK_NAME = "smartkaj-asterisk-inbound"
RULE_NAME = "smartkaj-individual-rooms"


def number_variants(raw: str) -> list[str]:
    """Hotline in the forms an IPTSP / Asterisk may present: 09611132581, 8809611132581, +8809611132581."""
    out: list[str] = []
    for n in (x.strip() for x in raw.split(",")):
        digits = "".join(c for c in n if c.isdigit())
        if not digits:
            continue
        local = "0" + digits[3:] if digits.startswith("880") else digits
        intl = "880" + local[1:] if local.startswith("0") else digits
        for v in (local, intl, "+" + intl):
            if v not in out:
                out.append(v)
    return out


def build_trunk(numbers: list[str]) -> api.CreateSIPInboundTrunkRequest:
    return api.CreateSIPInboundTrunkRequest(
        trunk=api.SIPInboundTrunkInfo(name=TRUNK_NAME, numbers=numbers, allowed_addresses=["127.0.0.1"])
    )


def build_rule(trunk_id: str, agent_name: str) -> api.CreateSIPDispatchRuleRequest:
    return api.CreateSIPDispatchRuleRequest(
        dispatch_rule=api.SIPDispatchRuleInfo(
            name=RULE_NAME,
            trunk_ids=[trunk_id],
            rule=api.SIPDispatchRule(dispatch_rule_individual=api.SIPDispatchRuleIndividual(room_prefix="call-")),
            room_config=api.RoomConfiguration(agents=[api.RoomAgentDispatch(agent_name=agent_name)]),
        )
    )


async def apply(lk: api.LiveKitAPI, numbers: list[str], agent_name: str) -> tuple[str, str]:
    sip = lk.sip
    for r in (await sip.list_dispatch_rule(api.ListSIPDispatchRuleRequest())).items:
        if r.name == RULE_NAME:
            await sip.delete_dispatch_rule(api.DeleteSIPDispatchRuleRequest(sip_dispatch_rule_id=r.sip_dispatch_rule_id))
    for t in (await sip.list_inbound_trunk(api.ListSIPInboundTrunkRequest())).items:
        if t.name == TRUNK_NAME:
            await sip.delete_trunk(api.DeleteSIPTrunkRequest(sip_trunk_id=t.sip_trunk_id))
    trunk = await sip.create_inbound_trunk(build_trunk(numbers))
    rule = await sip.create_dispatch_rule(build_rule(trunk.sip_trunk_id, agent_name))
    return trunk.sip_trunk_id, rule.sip_dispatch_rule_id


async def main() -> int:
    url = os.environ.get("LIVEKIT_URL", "")
    key, secret = os.environ.get("LIVEKIT_API_KEY", ""), os.environ.get("LIVEKIT_API_SECRET", "")
    if not (url and key and secret):
        print("Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.", file=sys.stderr)
        return 2
    numbers = number_variants(os.environ.get("INBOUND_NUMBERS", ""))
    agent = os.environ.get("AGENT_NAME", "receptionist")
    async with api.LiveKitAPI(url, key, secret) as lk:
        trunk_id, rule_id = await apply(lk, numbers, agent)
    print(f"inbound trunk   {trunk_id}  numbers={numbers or 'any'}  allowed=127.0.0.1")
    print(f"dispatch rule   {rule_id}  rooms=call-*  agent={agent}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
