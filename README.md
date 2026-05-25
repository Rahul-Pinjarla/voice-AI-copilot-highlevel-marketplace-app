# Voice AI Observability Copilot

A HighLevel Marketplace app that automates the Monitor and Analyze phases for Voice AI agents. It ingests call transcripts via webhook, evaluates them against per-agent KPIs using Claude, and surfaces a unified dashboard of failures, AI-generated recommendations, and action items.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  HighLevel (GHL)                                                  │
│  ┌──────────────┐   OAuth 2.0 + SSO   ┌──────────────────────┐  │
│  │ Marketplace  │ ──────────────────► │                      │  │
│  │  App iframe  │                     │   Express Server     │  │
│  └──────────────┘                     │   (Node.js / TSX)    │  │
│  ┌──────────────┐   Webhook events    │                      │  │
│  │ Voice AI     │ ──────────────────► │  ┌────────────────┐  │  │
│  │ call ends    │                     │  │  SQLite (WAL)  │  │  │
│  └──────────────┘                     │  └────────────────┘  │  │
└──────────────────────────────────────┘         │             │  │
                                                  │ analyzeCall │  │
                                          ┌───────▼──────────┐ │  │
                                          │  Anthropic API   │ │  │
                                          │  (Claude Haiku)  │ │  │
                                          └──────────────────┘ │  │
                                                  │             │  │
                                          ┌───────▼──────────┐ │  │
                                          │  Vue 3 SPA       │ │  │
                                          │  (served from    │ │  │
                                          │   /client/dist)  │ │  │
                                          └──────────────────┘    │
```

### Key flows

**Install** — GHL triggers OAuth; server stores `access_token` / `refresh_token` per `location_id`. Token refresh is handled proactively (5-minute lookahead) and on 401.

**Real-time ingestion** — GHL posts `VoiceAiCallEnd` (and several variant event names) to `POST /api/webhooks/ghl`. The handler upserts the agent, snapshots current GHL agent settings, inserts the call, and immediately queues `analyzeCall` via `setImmediate`.

**Backfill** — `POST /api/backfill` pages through GHL's call logs, inserting any calls not already in the DB, then analyzes each one.

**Analysis** — `analyzeCall` pulls the transcript, the current KPI config, and the agent settings snapshot, then sends a single prompt to Claude. The response is parsed into `kpi_scores`, `recommendations` (with per-recommendation `updated_prompt` and a `combined_prompt` for all changes at once), and `use_actions`.

**KPI versioning** — Every time the KPI config or agent settings change, a new `agent_version` is created. Calls are tagged with the version active at ingestion time, so performance data stays accurate across config changes.

**Frontend** — Vue 3 SPA embedded in the GHL iframe via SSO. Three main views: Dashboard (snapshot metrics + action items inbox), Agent Detail (Performance chart, Calls, KPIs, Recommendations, Action Items, Settings tabs), and Call Detail (transcript with failure highlights + side-by-side KPI checks).

### Stack

| Layer | Choice |
|-------|--------|
| Backend | Node.js + Express + TypeScript (tsx watch) |
| Frontend | Vue 3 + TypeScript + Vite (built to `client/dist`, served by Express) |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| LLM | Anthropic Claude (`claude-haiku-4-5-20251001` default, configurable via `LLM_MODEL`) |
| Auth | GHL OAuth 2.0 + SSO (AES-256-CBC iframe token) |
| Linting | Biome |

---

## Setup inside a HighLevel sandbox

### Prerequisites

- Node.js 20+
- A HighLevel sandbox account with a published Marketplace app
- An Anthropic API key
- `ngrok` (or any HTTPS tunnel) to expose your local server

### 1. Clone and install

```bash
git clone <repo-url>
cd voice-ai-observability-copilot
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to find it |
|----------|-----------------|
| `GHL_CLIENT_ID` | Marketplace app → App Details |
| `GHL_CLIENT_SECRET` | Marketplace app → App Details |
| `GHL_SSO_KEY` | Marketplace app → SSO → Signing Key (hex) |
| `GHL_REDIRECT_URI` | Your ngrok URL + `/oauth/callback` |
| `GHL_WEBHOOK_SECRET` | Marketplace app → Webhooks → Signing Secret (leave empty if not set) |
| `SESSION_SECRET` | Any long random string |
| `HTTPS_ENABLED` | `true` when behind ngrok |
| `ANTHROPIC_API_KEY` | console.anthropic.com |

### 3. Start a tunnel

```bash
ngrok http 3000
```

Copy the `https://` URL and set it as `GHL_REDIRECT_URI` in `.env` and in the Marketplace app's OAuth redirect URL.

### 4. Configure the Marketplace app

In your GHL sandbox Marketplace app:

- **OAuth redirect URL** → `https://<ngrok-url>/oauth/callback`
- **Custom Menu Link URL** → `https://<ngrok-url>/` (renders the iframe)
- **Webhooks** → Subscribe to `VoiceAiCallEnd` (or `CallCompleted`), pointing to `https://<ngrok-url>/api/webhooks/ghl`
- **Scopes** → `locations.readonly`, `calls.readonly`, `calls/transcript.readonly`

### 5. Build and run

```bash
npm run build   # compiles Vue SPA into client/dist
npm run dev:server   # starts Express with tsx watch
```

Open the app from inside your GHL sandbox account's sidebar menu. The OAuth flow runs automatically on first load.

### 6. Seed demo data (optional)

After the app is installed in your sandbox location:

```bash
npm run seed
```

Inserts 3 synthetic calls with pre-computed analyses so the dashboard has data immediately.

---

## Functional vs. mocked

| Feature | Status |
|---------|--------|
| GHL OAuth 2.0 (install, token refresh, uninstall) | **Real** |
| GHL SSO (iframe session) | **Real** |
| Webhook ingestion (`VoiceAiCallEnd` and variants) | **Real** |
| Backfill from GHL call log API | **Real** |
| Agent settings live fetch + snapshot at call time | **Real** |
| KPI versioning across config changes | **Real** |
| LLM analysis (KPI scores, recommendations, use actions) | **Real** (Claude via Anthropic API) |
| LLM KPI suggestion from agent system prompt | **Real** |
| Per-recommendation updated prompt text | **Real** |
| Combined prompt with all changes integrated | **Real** |
| Performance bar chart | **Real** (computed from DB) |
| Seed transcripts (`npm run seed`) | **Synthetic** — representative sales call transcripts, not from real GHL calls |

---

## Team of One ownership

**Product** — Scoped the two observability loops (Monitor, Analyze) directly to the assignment. Prioritized the "Validation Flywheel" framing: every call that comes in automatically produces scores, recommendations, and action items without manual review. Added the KPI versioning system so performance comparisons stay meaningful when configs change — an edge case a pure engineering pass would miss.

**Design** — Kept the UI inside GHL's visual language (neutral surface palette, tight type scale, monospace accents for timestamps/code). Built for scanability: dashboard shows one number per agent (health score), agent detail uses tabs to avoid information overload, call detail puts transcript and KPI checks side-by-side. All SVG icons are inline — no icon library dependency.

**Engineering** — Single-process architecture (Express serves both the API and the built SPA) keeps deployment simple for a sandbox. SQLite with WAL mode handles concurrent reads during analysis without locking the HTTP layer. Alter-table migrations run at startup so the DB upgrades itself. Token refresh is proactive (5-minute lookahead) and reactive (on 401) so sessions stay alive across long demo sessions.

**QA** — Webhook handler covers 6 GHL event name variants to survive API naming changes. `resetStuckAnalyses` on startup clears any calls left in `running` state from a crash. `DummyAdapter` was available during development for offline testing but has been removed for submission — the real Anthropic adapter is required.
