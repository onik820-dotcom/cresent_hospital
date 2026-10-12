from setup_sip import RULE_NAME, TRUNK_NAME, build_rule, build_trunk, number_variants


def test_number_variants_cover_all_forms_without_duplicates():
    assert number_variants("09611132581") == ["09611132581", "8809611132581", "+8809611132581"]
    assert number_variants("+8809611132581") == ["09611132581", "8809611132581", "+8809611132581"]
    assert number_variants("09611132581, 01712345678")[3:] == ["01712345678", "8801712345678", "+8801712345678"]
    assert number_variants("") == []


def test_trunk_is_loopback_only():
    t = build_trunk(["09611132581"]).trunk
    assert t.name == TRUNK_NAME and list(t.allowed_addresses) == ["127.0.0.1"] and list(t.numbers) == ["09611132581"]


def test_dispatch_rule_makes_individual_rooms_and_dispatches_the_agent():
    r = build_rule("ST_abc", "receptionist").dispatch_rule
    assert r.name == RULE_NAME and list(r.trunk_ids) == ["ST_abc"]
    assert r.rule.dispatch_rule_individual.room_prefix == "call-"
    assert [a.agent_name for a in r.room_config.agents] == ["receptionist"]
