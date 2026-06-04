# Loom Demo Recording Guide

Target length: **3-4 minutes** (assignment allows 2-5).

This is the only doc you need open while recording. Pre-recording checklist + setup + full script with timing + closing checklist.

---

## Pre-recording checklist (10 minutes before)

**Environment**
- [ ] Close Slack / iMessage / mail clients (notifications kill momentum)
- [ ] Set system to Do Not Disturb
- [ ] Close all browser tabs except the two you need (GHL sandbox + the codebase)
- [ ] Clear Downloads notification badge / dock badges
- [ ] Pick a quiet room; close window if there's traffic noise
- [ ] Water nearby (avoid coffee — caffeine jitters show in voice)

**App state**
- [ ] `ngrok http 3000` running, `https://` URL noted
- [ ] `.env` `GHL_REDIRECT_URI` matches the ngrok URL
- [ ] Marketplace app's OAuth redirect URL + Custom Menu Link URL match ngrok URL
- [ ] `npm run build` completed (Vue SPA in `client/dist`)
- [ ] `npm run dev:server` running, tail log visible in a small terminal window
- [ ] Marketplace app installed in your GHL sandbox (OAuth completed)
- [ ] `npx tsx scripts/setup-demo-agent.ts` ran (Watt assistant + 5 KPIs configured)
- [ ] `npm run seed -- --simulated-time` ran (gives you backdated calls + flywheel data)
- [ ] Open the app inside GHL sidebar — confirm SSO works, dashboard loads with data

**Recording setup**
- [ ] Loom set to record **Screen + Camera** (small cam circle, bottom-right) OR **Screen only** if you'd rather just narrate
- [ ] Browser zoom at **110%** (text readable on playback)
- [ ] Browser window in 16:9 ratio (resize Chrome to ~1600x900) — Loom crops cleanly
- [ ] Mic test: record 10s of "hello hello", play back, check for echo/clipping
- [ ] DevTools closed (clutter)
- [ ] Bookmarks bar hidden (Cmd+Shift+B)
- [ ] Disable browser autofill popups for the recording session
- [ ] One blank tab ready as a "blank canvas" to switch to if something goes wrong

**Mental prep**
- [ ] Read the full script below once, out loud
- [ ] Do a full dry-run with the screen recording OFF (catch the dead air spots)
- [ ] If a section feels stiff after the dry-run, rewrite it in your own words — read-aloud cadence beats verbatim

---

## Demo environment, in order

Run these in three terminal panes so you can see logs streaming during the demo.

```bash
# Pane 1 — tunnel
ngrok http 3000

# Pane 2 — server (after .env is set to the ngrok URL)
npm run build
npm run dev:server

# Pane 3 — seeding (once the app is installed in the sandbox)
npx tsx scripts/setup-demo-agent.ts
npm run seed -- --simulated-time
```

Open your GHL sandbox in Chrome, navigate to the Marketplace app sidebar entry. The app should auto-load the dashboard with Watt assistant + seeded calls.

---

## The script (3:45 target)

Numbers in `[brackets]` are running time markers. Aim to hit each one ±5s.

### `[0:00 — 0:20]` — Hook

> "Hi, I'm Rahul. This is the Voice AI Observability Copilot I built for the HighLevel FSB assignment. It's a Marketplace app that closes the Monitor and Analyze loop for Voice AI agents — every call that comes in is automatically scored against the agent's own KPIs, gets prompt and config recommendations, and surfaces calls that need human follow-up. The assignment called this a Validation Flywheel; that framing drove the entire architecture."

**Screen during this:** Dashboard fully loaded, in the GHL iframe.

**Key beats:**
- Name the assignment back to them (signals you read it carefully).
- Use the phrase "Validation Flywheel" verbatim.
- 20 seconds, no more — the dashboard is on screen, let it do the work.

---

### `[0:20 — 1:00]` — Dashboard tour

> "Landing view. Each agent gets one health score — that's a confidence-weighted average of all the KPI scores from its recent calls. To the right, an action items inbox: calls where the model flagged something only a human can fix — a hot lead that didn't book, a complaint, a knowledge-base gap. Below that, the most recent failures. Everything you see is computed live from the database — no static counts."

**Click path:** Stay on dashboard. Hover over one agent card to show the score is interactive. Hover over an action item to show the tooltip / timestamp.

**Key beats:**
- "Confidence-weighted" — important. It means the model's own uncertainty propagates into the score.
- "Action items inbox" is the *Use Actions* deliverable from the assignment — call it out by both names.
- Do not narrate every UI element; let the user's eyes do the parsing.

---

### `[1:00 — 1:50]` — Agent detail + the auto-applied recommendation

> "Click into Watt assistant. Six tabs: Performance, Calls, KPIs, Recommendations, Action Items, Settings. Performance shows the trend chart — and you can see right here, the score jumps on this date. That's because a recommendation was auto-applied: the agent was configured with a 4-second silence reminder, but transcripts showed callers were hanging up before the reminder fired. The Copilot flagged it, generated a config change to drop it to 2 seconds, applied it via the GHL API, and you can see the version in agent history. Calls after that version are scored under the new config."

**Click path:**
- Dashboard → click "Watt assistant" → Agent Detail loads on Performance tab.
- Point at the score jump on the chart (use cursor as the pointer).
- Click the "KPIs" tab briefly — show the 5 KPIs.
- Click "Recommendations" — show the recommendation that was auto-applied (highlighted differently).

**Key beats:**
- This is the **flywheel in motion** — the most important 50 seconds of the demo.
- Use the words "auto-applied" and "via the GHL API" explicitly. That's the loop closing.
- Mention "KPI versioning" — calls before the change are scored against the old config, calls after against the new. Performance comparisons stay accurate across config changes.

---

### `[1:50 — 2:45]` — Drill into a single call (the Insight deliverable)

> "Let's open one failed call. Transcript on the left, KPI checks on the right, side-by-side. The model passed three KPIs and failed two — and for every score, you can see the exact transcript line it cited as evidence. Down here, the recommendations. This one is a prompt fix — the model rewrote the relevant section of the system prompt; click 'View updated prompt' and you get the full rewrite, not a diff to interpret. This other one is a knowledge base addition — that can't be done by API, so it becomes a script-retraining action item. Every rec is classified by how it can be applied: prompt rewrite, agent config field, or human-only script change. That classification drives the auto-apply path I just showed."

**Click path:**
- Agent Detail → Calls tab → click any call with a low score.
- Show transcript + KPI panel side-by-side.
- Scroll to one failed KPI — point at the evidence quote.
- Scroll to recommendations — click "View updated prompt" on a prompt-type rec.
- Point at a `script_step` rec — note it became a use_action.

**Key beats:**
- "Evidence quote" — emphasize that scores are grounded, not invented.
- The three `target_type`s (`prompt` / `agent_config` / `script_step`) is the architectural insight — say it out loud.
- "View updated prompt" — show that the model generates a coherent rewrite, not a patch list. This is the "immediate recommendations" deliverable.

---

### `[2:45 — 3:15]` — Real-time ingestion (proof, not demo)

> "Everything I just showed runs on real-time ingestion. Voice AI call ends, GHL fires a webhook, the handler upserts the call, snapshots agent settings, queues analysis. The analysis itself is one Claude round-trip — KPI scores, recommendations, use_actions, all in one structured JSON response. Anthropic Haiku 4.5 by default, configurable per agent. The dashboard polls and the new score shows up within a few seconds of the call ending."

**Screen during this:**
- Switch to the **terminal pane** showing server logs for ~5 seconds — point at a real `[webhook]` log line if one is there from your dry run, or just at the running tail.
- Switch back to the dashboard.

**Key beats:**
- Don't *trigger* a fake webhook live — too risky on a recording. Show the log evidence instead.
- "One round-trip" — efficiency signal. They will ask about cost; this pre-empts it.

---

### `[3:15 — 3:45]` — What's mocked, what's next, close

> "Functional vs. mocked: OAuth, SSO, webhook ingestion, KPI versioning, the LLM analysis, the auto-apply back to GHL — all real. The only synthetic piece is the seed transcripts themselves, because a sandbox doesn't produce live calls; the README has the full table. Next two weeks I'd add a Redis-backed queue, an eval harness so every prompt change is regression-tested, and mid-call streaming analysis so the agent gets feedback in-flight, not just post-call. The repo's linked below — README walks through the architecture, the data model, and the Team-of-One ownership breakdown. Thanks for watching."

**Screen during this:**
- Show the README open in another tab (briefly) on the functional-vs-mocked table.
- End on the dashboard view.

**Key beats:**
- **Lead with honesty about what's mocked.** This is the highest-trust move in the demo.
- "Team-of-One" — verbatim assignment language, again.
- End at a clean stopping point — do not trail off with "yeah, that's it."

---

## Important points to emphasize (don't skip any)

These are the lines that move the eval forward — work each one into the demo somewhere.

1. **"Validation Flywheel"** — verbatim from the assignment.
2. **"Team-of-One"** — verbatim from the assignment.
3. **"Confidence-weighted scoring with evidence quotes"** — proves scores are grounded.
4. **"Three target types"** (`prompt` / `agent_config` / `script_step`) — the architectural insight that makes auto-apply work.
5. **"Auto-applied via the GHL API"** — closes the loop on the assignment's "immediate recommendations" deliverable.
6. **"KPI versioning"** — the subtle correctness win a pure-eng pass would miss.
7. **"Real-time webhook ingestion"** — directly addresses the assignment's "real-time transcript ingestion" line.
8. **"What's mocked: only the seed transcripts"** — honesty signal.

---

## What to avoid

- **Don't read the script word-for-word.** Use it as a scaffolding; let your voice deviate naturally.
- **Don't apologize.** Cut "uh, I know this looks a bit rough" / "sorry, one sec". Just keep going.
- **Don't open DevTools.** Even briefly. Looks debugging-mid-demo.
- **Don't switch terminals randomly.** Only when the script calls for it.
- **Don't say "as you can see"** — they can see. Just describe what's happening.
- **Don't trigger a live webhook.** Any failure mid-call wrecks the recording. Use the log evidence and seed data.
- **Don't oversell what's real.** If they catch you stretching on the mocked side, the whole demo loses credibility.
- **Don't go past 5 minutes.** If you're at 4:30 and not at the close yet, cut and re-record.

---

## If something breaks mid-recording

| Symptom | What to do |
|---------|------------|
| Dashboard shows no data | Stop recording. Re-run `npm run seed -- --simulated-time`. Restart. |
| iframe SSO fails | Stop. Reinstall the marketplace app in the sandbox. Restart. |
| Server crashes | Stop. Logs will show why. Fix, restart `npm run dev:server`. |
| Anthropic API rate limit | Stop. Wait 60s. Restart from `[0:00]`. |
| You stumble in the middle | Don't stop — Loom lets you trim. Pause 2s, restart that sentence. |
| You go over 5 min | Stop. Re-record. Length matters to evaluators. |

---

## Post-recording checklist

- [ ] Watch the full recording back at 1.5x — catch dead air, stumbles, and unclear screens
- [ ] Trim opening (before "Hi, I'm Rahul") and closing (after "Thanks for watching") in Loom editor
- [ ] Add a title: **"Voice AI Observability Copilot — HighLevel FSB Assignment Demo"**
- [ ] Add a 1-line description: **"3-min walkthrough: real-time call ingestion → KPI scoring → AI-generated recommendations → auto-apply back to GHL. Built for HighLevel's FSB Q226 assignment."**
- [ ] Set sharing to public or to the email used in the application — verify the link works in an incognito window
- [ ] Copy the link into the assignment submission alongside the GitHub repo URL
- [ ] Send yourself the Loom link and re-watch end-to-end one more time on the phone — catches issues the laptop preview hides

---

## One-line elevator pitch (memorize this)

If anything goes wrong and you have to ad-lib the opening:

> "A HighLevel Marketplace app that automatically scores every Voice AI call against the agent's own KPIs, recommends prompt and config changes, applies them back to the agent — and surfaces the calls that need a human. End-to-end Monitor and Analyze, one engineer."
