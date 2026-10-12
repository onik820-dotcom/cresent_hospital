"""Static checks on the deploy templates (no Docker or Asterisk needed)."""
import re
from pathlib import Path

import yaml

DEPLOY = Path(__file__).parent.parent / "deploy"
VARS = ["IPTSP_HOST", "IPTSP_PORT", "IPTSP_USER", "IPTSP_PASSWORD", "IPTSP_ALLOWED_IP", "PUBLIC_IP", "CALLED_NUMBER", "OUTBOUND_PREFIX"]
ENV = dict(IPTSP_HOST="sip.example.bd", IPTSP_PORT="5060", IPTSP_USER="09611132581", IPTSP_PASSWORD="s3cret",
           IPTSP_ALLOWED_IP="203.0.113.5", PUBLIC_IP="198.51.100.9", CALLED_NUMBER="09611132581", OUTBOUND_PREFIX="0")


def render(name: str, env=ENV) -> str:
    """Same behaviour as `envsubst '${A} ${B}...'` in entrypoint.sh: only the listed variables are replaced."""
    text = (DEPLOY / "asterisk" / name).read_text()
    for k in VARS:
        text = text.replace("${" + k + "}", env[k])
    return text


def test_entrypoint_substitutes_exactly_the_variables_the_templates_use():
    used = set()
    for f in ("pjsip.conf.tmpl", "extensions.conf.tmpl"):
        used |= set(re.findall(r"\$\{([A-Z_]+)\}", (DEPLOY / "asterisk" / f).read_text()))
    assert used - set(VARS) == {"EXTEN", "CALLED"}  # Asterisk's own variables must NOT be substituted
    assert set(VARS) <= used | {"IPTSP_PORT"}, set(VARS) - used
    listed = set(re.findall(r"\$\{([A-Z_]+)\}", re.search(r"VARS='([^']*)'", (DEPLOY / "asterisk/entrypoint.sh").read_text()).group(1)))
    assert listed == set(VARS)


def test_pjsip_renders_fully_and_binds_the_right_things():
    out = render("pjsip.conf.tmpl")
    assert not re.findall(r"\$\{[A-Z_]+\}", out)
    assert "server_uri=sip:sip.example.bd:5060" in out and "client_uri=sip:09611132581@sip.example.bd:5060" in out
    assert "match=203.0.113.5" in out and "external_media_address=198.51.100.9" in out
    assert "contact=sip:127.0.0.1:5080" in out           # LiveKit SIP
    assert "allow=alaw" in out and "allow=g729" not in out
    assert out.count("disallow=all") == 2


def test_extensions_keep_asterisk_variables_and_route_both_directions():
    out = render("extensions.conf.tmpl")
    assert not re.findall(r"\$\{(IPTSP|PUBLIC|CALLED_NUMBER|OUTBOUND)[A-Z_]*\}", out)
    for keep in ("${EXTEN}", "${EXTEN:4}", "${CALLERID(num)}", "${CALLED}"):
        assert keep in out, keep
    assert "Dial(PJSIP/${CALLED}@livekit,60)" in out
    assert "Dial(PJSIP/0${EXTEN:4}@iptsp,60)" in out       # +8801308400333 -> 01308400333
    assert "Set(CALLED=09611132581)" in out
    empty = render("extensions.conf.tmpl", {**ENV, "CALLED_NUMBER": "", "OUTBOUND_PREFIX": ""})
    assert "Set(CALLED=)" in empty and "Dial(PJSIP/${EXTEN:4}@iptsp,60)" in empty


def test_asterisk_and_livekit_rtp_ranges_do_not_overlap():
    rtp = dict(l.split("=") for l in (DEPLOY / "asterisk/rtp.conf").read_text().split() if "=" in l)
    ast = (int(rtp["rtpstart"]), int(rtp["rtpend"]))
    sip = tuple(int(x) for x in yaml.safe_load((DEPLOY / "sip.yaml").read_text())["rtp_port"].split("-"))
    lk = yaml.safe_load((DEPLOY / "livekit.yaml").read_text())["rtc"]
    rtc = (lk["port_range_start"], lk["port_range_end"])
    ranges = [ast, sip, rtc]
    for i, a in enumerate(ranges):
        for b in ranges[i + 1:]:
            assert a[1] < b[0] or b[1] < a[0], (a, b)


def test_compose_is_valid_and_uses_host_networking_everywhere():
    d = yaml.safe_load((DEPLOY / "docker-compose.yml").read_text())
    assert set(d["services"]) == {"redis", "livekit-server", "livekit-sip", "asterisk", "caddy", "worker"}
    assert all(s["network_mode"] == "host" for s in d["services"].values())
    for f in ("livekit.yaml", "sip.yaml"):
        yaml.safe_load((DEPLOY / f).read_text())


def test_env_example_has_no_real_secrets_and_lists_every_compose_variable():
    ex = (DEPLOY / ".env.example").read_text()
    compose = (DEPLOY / "docker-compose.yml").read_text()
    needed = set(re.findall(r"\$\{([A-Z_]+)[-:}]", compose))
    defined = set(re.findall(r"^([A-Z_]+)=", ex, re.M))
    assert needed <= defined, needed - defined
    for secret_key in ("LIVEKIT_API_SECRET", "AGENT_API_KEY", "GOOGLE_API_KEY", "IPTSP_PASSWORD"):
        assert re.search(rf"^{secret_key}=$", ex, re.M), f"{secret_key} must be empty in the example"
