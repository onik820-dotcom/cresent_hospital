# Smartkaj Voice: the Bangla AI phone receptionist (Uttara Crescent Hospital)

This repo is the **voice worker and the telephony stack**. The dashboard and the database already live in
Lovable + Supabase (project `cresent`); this code talks to them only through the `agent-tools` HTTP API.

```
Caller -> IPTSP 09xxx number -> Asterisk (VPS) -> LiveKit SIP -> LiveKit server -> voice worker -> Gemini Live
                                                                                        |
                                                                          Supabase agent-tools API -> dashboard
```

| Folder | What it is |
|---|---|
| `worker/` | Python voice agent (LiveKit Agents + Gemini Live), the 11 tools, the Bangla system prompt |
| `deploy/` | Docker Compose for the VPS: Redis, LiveKit server, LiveKit SIP, Asterisk, Caddy (TLS), worker |
| `scripts/` | `setup_sip.py` (creates the LiveKit trunk + dispatch rule), `smoke_test.py` (fake caller) |
| `tests/` | 49 unit tests (`pytest`), no network needed |

## Why "adding a number in the app" did not make the AI answer

The number in **Settings > Phone numbers** only tells the system *which hospital owns that number*
(`tenant_numbers`). It does not connect any phone line. For a real call, all of these must exist:

1. a real IP number (09xxx) from a BTRC-licensed IPTSP, with a SIP login, **and**
2. Asterisk on a server that registers that login and forwards each call to LiveKit, **and**
3. this worker running, to pick up the call and talk, **and**
4. **Agent live** switched on in Settings > Agent. When it is off, a phone call is answered with a short
   apology and transferred to your fallback number instead of reaching the AI.

Before this repo, none of 1-3 existed, so nothing was listening.

## Step 1: run the worker locally (no phone needed)

You need: a **paid** Gemini API key, a free [LiveKit Cloud](https://cloud.livekit.io) project (for development
only), and the `agent-tools` key.

```bash
cd worker
python3 -m venv ../.venv && . ../.venv/bin/activate
pip install -r requirements-dev.txt
cp ../deploy/.env.example .env      # then fill it in (see below). .env is git-ignored.
python agent.py dev
```

In `worker/.env` set at least:

| Variable | Where to get it |
|---|---|
| `LIVEKIT_URL` | LiveKit Cloud project, e.g. `wss://yourproject.livekit.cloud` |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | LiveKit Cloud > Settings > Keys. **Both** are needed; the key alone is not enough |
| `GOOGLE_API_KEY` | Google AI Studio, paid tier |
| `AGENT_API_BASE` | `https://vkhpzupnxwotvwjnznuu.supabase.co/functions/v1` |
| `AGENT_API_KEY` | the same value as the `AGENT_API_KEY` Supabase secret (dashboard: Settings > API Tester) |

Then, in a second terminal, make a fake caller join (needs the hospital's tenant id from the dashboard):

```bash
TENANT_ID=<tenant uuid> python scripts/smoke_test.py     # OK = the agent joined and spoke
```

Watch the worker log: you should see `call_received`, `api_call ... get_agent_config`, and `turn_latency`.
The transcript then appears under **Live Calls / Call History** in the dashboard.

> The dashboard's current Test Call button talks to Gemini directly from the browser (`gemini-token`), so it
> never reaches this worker. It is a useful voice test but it does not test the phone path. To test *this*
> worker from the browser, the dashboard needs a LiveKit token function (build prompt 4, item 6 in the plan).

## Step 2: switch the agent on

Dashboard > Settings > Agent: set **Agent live** on, and check the greeting, voice and transfer number.
(At the time of writing the `cresent` tenant has `is_live = false`.)

## Step 3: deploy on the VPS (Hostinger KVM 2, Ubuntu 24.04)

You need the IPTSP details first. Ask them (plan section 2): can I register this SIP account from a VPS
outside Bangladesh, which codecs (**G.711 a-law**; G.729 only means transcoding), receiving/outbound rates, and
how many simultaneous calls. Test the login in Zoiper on a laptop **before** the server.

```bash
# 1. DNS: an A record  voice.<yourdomain>  ->  the VPS IP
# 2. Firewall (host networking bypasses Docker's rules, so ufw is the real protection)
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow 22/tcp                       # SSH (use keys only; disable password login)
sudo ufw allow 80,443/tcp                   # Caddy / TLS
sudo ufw allow 7881/tcp                     # WebRTC over TCP
sudo ufw allow 50000:60000/udp              # WebRTC media (browser test calls)
sudo ufw allow from <IPTSP_SIP_IP> to any port 5060 proto udp   # SIP from the provider ONLY
sudo ufw allow 10000:20000/udp              # Asterisk RTP (provider media IPs can differ from signalling)
sudo ufw enable
# do NOT open 5080 or 30000:40000: LiveKit SIP is internal only. Install fail2ban for SSH and Asterisk.

# 3. Install Docker, then:
git clone <this repo> && cd cresent_hospital/deploy
cp .env.example .env && chmod 600 .env && nano .env     # fill every value
docker compose up -d --build
docker compose ps

# 4. Create the LiveKit trunk + dispatch rule (safe to re-run)
docker compose run --rm -v "$PWD/../scripts:/app/scripts:ro" worker python /app/scripts/setup_sip.py

# 5. Check Asterisk registered with the IPTSP
docker compose exec asterisk asterisk -rx "pjsip show registrations"     # want: Registered
```

For a self-hosted LiveKit make up the key pair yourself: `LIVEKIT_API_KEY=API$(openssl rand -hex 6)` and
`LIVEKIT_API_SECRET=$(openssl rand -hex 32)`. These are *not* the LiveKit Cloud keys.

**First call:** dial the 09xxx number from your mobile. The agent should answer in under 2 seconds. Say
"মানুষের সাথে কথা বলতে চাই" to test the transfer to the reception number from Settings > Agent.

### If a call does not work

| Symptom | Look at |
|---|---|
| Rings, nobody answers / busy | `pjsip show registrations` is not `Registered`: wrong host/user/password, or the IPTSP blocks foreign IPs (then run only Asterisk on a Bangladeshi VPS and forward over SIP) |
| Registered but calls never arrive | The IPTSP sends the INVITE from an IP other than `IPTSP_ALLOWED_IP`; `docker compose logs asterisk` shows "No matching endpoint" |
| Asterisk connects, the agent never speaks | `docker compose logs worker`. No `call_received` = the dispatch rule is missing (re-run `setup_sip.py`); `phone_call_not_served` with `agent_not_live` = switch **Agent live** on; `unknown_number` = the dialled number is not in Settings > Phone numbers |
| Silence or one-way audio | RTP ports blocked in ufw, or the IPTSP only offers G.729 |
| Transfer fails | Enable call transfer (REFER) on the provider account; set `OUTBOUND_PREFIX` to the dialling format the IPTSP accepts |
| `GEMINI` connection errors | Wrong key or model name (`GEMINI_MODEL`); if the error mentions language, leave `GEMINI_LANGUAGE` empty |

## How the worker behaves

- **Which hospital?** The dialled number (`sip.trunkPhoneNumber`) -> `get_agent_config`. Web tests send `tenant_id` in room metadata.
- **Not served** (unknown number or Agent live off, phone only): Bangla apology, then SIP-transfer to the tenant's transfer number (or `FALLBACK_TRANSFER_NUMBER`).
- **Tools:** `get_hospital_info`, `list_departments`, `find_doctors`, `get_doctor_availability`, `book_appointment`,
  `find_my_appointments`, `cancel_appointment`, `reschedule_appointment`, `create_callback_request`, plus worker-only
  `transfer_to_human` and `end_call`. HTTP timeout 3 s; one retry on network errors only (booking is idempotent per call).
- **Live view:** transcript lines and tool calls are queued and sent every ~300 ms, never blocking audio.
- **Guards:** silent 8 s -> gentle prompt; 20 s -> goodbye and hang up; at 10 minutes -> wrap up (offer callback/transfer).
- **After the call:** Bangla summary + outcome (cheap Gemini text model, heuristic fallback), real token usage and
  `cost_usd` into `usage_ledger`, `call_ended`.

## Settings you must review

- `COST_*_PER_MTOK` in `.env` are **placeholders** derived from the plan's per-minute estimates. Set them from the
  current Gemini pricing page; the plan says to re-price after 50 real calls.
- `GEMINI_MODEL=gemini-3.8-live` and `SUMMARY_MODEL=gemini-3.5-flash-lite` come from the plan; confirm they are
  available on your API key. Native-audio models choose the language themselves, so `GEMINI_LANGUAGE` is empty by
  default; Bangla comes from the prompt and the greeting.
- Use the **paid** Gemini tier for real patient calls (free tier data may be used for training).
- Transfers present the IPTSP account number as caller ID (most BD providers reject a foreign CLI), so reception
  will not see the patient's number on a transferred call.

## Tests

```bash
. .venv/bin/activate && python -m pytest -q      # 49 tests: API client, retries, events, prompt, Bangla helpers,
                                                 # call flow (transfer / end / finalize), SIP setup, deploy templates
```

What is **not** covered by tests, and needs your first real calls: live Gemini audio quality in Bangla, the IPTSP
registration and codecs, SIP transfer through your provider, and one-way-audio/NAT behaviour on your VPS.

## Secrets

Nothing secret is in this repo. `.env` files are git-ignored. Secrets live in `deploy/.env` on the VPS
(`chmod 600`) and in Supabase secrets. Rotate `AGENT_API_KEY` if a laptop with it is lost.
