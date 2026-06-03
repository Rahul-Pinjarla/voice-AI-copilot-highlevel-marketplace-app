/**
 * Manual test scenario: Non-Prompt Agent Config Auto-Apply
 *
 * Goal: prove the app can auto-apply GHL Voice AI agent config fields that are
 * NOT the system prompt — things the user cannot simply "edit in the prompt box."
 *
 * Scenario: A dental appointment booking agent with four deliberately wrong
 * config settings. The transcript shows real symptoms of each misconfiguration.
 * Analysis must generate agent_config recommendations (not prompt changes) and,
 * in --auto mode, push them directly to the GHL API.
 *
 * Bad settings injected:
 *   welcomeMessage           "Hey, can I help you?"   → too generic; caller unsure who they reached
 *   responsiveness           1800 ms                  → 1.8 s lag; caller notices and comments
 *   maxCallDuration          90 s                     → call hard-cuts before booking completes
 *   sendUserIdleReminders    false                    → 12 s dead air; no agent prompt fires
 *   reminderAfterIdleTimeSeconds  15                  → even if enabled, fires too late
 *
 * Run:
 *   npx tsx scripts/test-config-scenario.ts           # manual mode — prints recs, no GHL writes
 *   npx tsx scripts/test-config-scenario.ts --auto    # auto mode  — applies recs via GHL API
 *                                                       requires GHL_TEST_AGENT_ID in .env
 */

import "dotenv/config";
import { randomUUID } from "crypto";
import path from "path";
import { getDb } from "../server/src/db/init";
import { saveKpiConfigs, upsertCallAgentSnapshot } from "../server/src/db/queries";
import { analyzeCall } from "../server/src/lib/analysis";
import type { AgentSettings } from "../server/src/types";

process.env.DB_PATH = path.resolve("data/app.db");

const AUTO_MODE = process.argv.includes("--auto");
const GHL_TEST_AGENT_ID = process.env.GHL_TEST_AGENT_ID ?? null;

// ── Bad agent settings — the misconfiguration we want the system to catch ─────

const BAD_SETTINGS: AgentSettings = {
  agentPrompt: `You are a dental appointment booking assistant for Bright Smile Dental.
Your job is to book new patient consultations and follow-up appointments.
Collect the caller's name, date of birth, insurance provider (carrier name and member ID),
and their preferred appointment day and time.
Always confirm the final appointment date and time before ending the call.
Be friendly and professional throughout.`,

  // BAD #1: generic greeting — caller has to ask if they reached the right place
  welcomeMessage: "Hey, can I help you?",

  // BAD #2: 1.8-second response delay — callers notice the lag mid-conversation
  responsiveness: 1800,

  // BAD #3: 90-second hard cap — not nearly enough to complete a dental booking
  maxCallDuration: 90,

  // BAD #4 + #5: idle reminders off, and threshold is 15 s even if it were on
  sendUserIdleReminders: false,
  reminderAfterIdleTimeSeconds: 15,

  actions: [],
  translation: { enabled: false },
  toolCallStrictMode: false,
};

// ── Transcript — every line serves as evidence for a KPI failure ───────────────
//
// Evidence map:
//   welcomeMessage issue  → caller asks "Is this Bright Smile Dental?"
//   responsiveness issue  → caller says "you seem a bit laggy" / "hello?"
//   idle reminder issue   → 12 s annotated silence, no agent prompt
//   maxCallDuration issue → call disconnects mid-sentence with no booking

const TRANSCRIPT = `
Agent: Hey, can I help you?
Caller: Hi — is this Bright Smile Dental? I was trying to book a new patient appointment.
Agent: Yes, this is the booking line. What is your name?
Caller: Sarah Mitchell. Sorry, there was a really long pause there before you responded.
Agent: Apologies for that! And your date of birth, Sarah?
Caller: March 15th, 1988.
[12 seconds of silence — caller waiting for the agent to continue, no idle reminder fires]
Caller: Hello? Are you still there?
Agent: Yes, still here! Do you have dental insurance?
Caller: Yes, Delta Dental. Member ID is DS-4421. Are you getting that?
Agent: Got it. Which days work best for your consultation?
Caller: I was thinking Wednesday or Thursday afternoon — either of those would work, or even Friday if—
[call disconnects abruptly — maxCallDuration of 90 s reached before booking could be confirmed]
`.trim();

// ── KPIs — each one targets a symptom caused by a config field, not the prompt ─
//
// The definitions are written so the LLM knows which config lever fixes each failure.

const KPIS = [
  {
    kpi_name: "greeting_identifies_business",
    definition:
      "The agent's opening line clearly states the business name so the caller immediately knows they reached the right place. A greeting like 'Hey, can I help you?' that omits the business name fails this check.",
    type: "binary" as const,
    threshold: 1,
  },
  {
    kpi_name: "response_latency_natural",
    definition:
      "The conversation flows without noticeable pauses between the caller finishing and the agent responding. If the caller comments on lag, delay, or asks 'are you there?' due to slow response timing, this fails.",
    type: "binary" as const,
    threshold: 1,
  },
  {
    kpi_name: "idle_recovery_prompt",
    definition:
      "When the caller falls silent for more than 4 seconds mid-conversation, the agent sends an acknowledgment or re-engagement prompt within 5 seconds. Extended dead air (10+ seconds) with no agent response is a direct failure.",
    type: "binary" as const,
    threshold: 1,
  },
  {
    kpi_name: "call_completed_before_cutoff",
    definition:
      "The call reached a natural conclusion — appointment confirmed or caller chose not to book — without being disconnected by a duration limit mid-sentence. A call that hard-disconnects before the caller finishes speaking fails.",
    type: "binary" as const,
    threshold: 1,
  },
  {
    kpi_name: "appointment_confirmed",
    definition:
      "The agent verbally confirmed a specific appointment date and time with the caller before the call ended.",
    type: "binary" as const,
    threshold: 1,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function hr(char = "─", width = 70) { return char.repeat(width); }
function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }
function cyan(s: string) { return `\x1b[36m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + hr("═"));
  console.log(bold("  Agent Config Auto-Apply — Manual Test Scenario"));
  console.log(hr("═"));
  console.log(dim("  Scenario: Dental appointment booking agent with 5 wrong config settings."));
  console.log(dim("  Goal: system detects each problem and recommends agent_config changes — not prompt edits."));
  if (AUTO_MODE) {
    if (!GHL_TEST_AGENT_ID) {
      console.error(red("\n  --auto requires GHL_TEST_AGENT_ID in .env\n"));
      process.exit(1);
    }
    console.log(yellow(`\n  AUTO MODE: recommendations will be pushed to GHL agent ${GHL_TEST_AGENT_ID}`));
  } else {
    console.log(dim("\n  MANUAL MODE: recommendations printed only. Run with --auto to apply to GHL.\n"));
  }

  const db = getDb();

  // Find or create a location to attach the scenario to
  const installation = db
    .prepare("SELECT location_id FROM installations WHERE status = 'active' LIMIT 1")
    .get() as { location_id: string } | undefined;

  if (!installation) {
    console.error(red("\n  No active installation found. Start the server and complete OAuth first.\n"));
    process.exit(1);
  }
  const locationId = installation.location_id;

  // ── Create (or reuse) the scenario agent ──────────────────────────────────
  const GHL_AGENT_ID_FOR_SCENARIO = AUTO_MODE && GHL_TEST_AGENT_ID ? GHL_TEST_AGENT_ID : "config-scenario-agent";

  let agentRow = db
    .prepare("SELECT * FROM agents WHERE location_id = ? AND ghl_agent_id = ?")
    .get(locationId, GHL_AGENT_ID_FOR_SCENARIO) as { id: string; name: string } | undefined;

  if (!agentRow) {
    const agentId = randomUUID();
    db.prepare(`
      INSERT INTO agents (id, location_id, ghl_agent_id, name, system_prompt, configured, mode)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(
      agentId,
      locationId,
      GHL_AGENT_ID_FOR_SCENARIO,
      "Bright Smile Dental — Booking Agent",
      BAD_SETTINGS.agentPrompt,
      AUTO_MODE ? "auto" : "manual",
    );
    agentRow = { id: agentId, name: "Bright Smile Dental — Booking Agent" };
    console.log(`  ${green("✓")} Created agent: ${agentRow.name}`);
  } else {
    // Sync mode flag if re-running
    db.prepare("UPDATE agents SET mode = ? WHERE id = ?").run(AUTO_MODE ? "auto" : "manual", agentRow.id);
    console.log(`  ${cyan("↺")} Reusing existing agent: ${agentRow.name} (mode: ${AUTO_MODE ? "auto" : "manual"})`);
  }
  const agentId = agentRow.id;

  // ── Create KPIs (always replace so the scenario is reproducible) ──────────
  const kpiVersion = saveKpiConfigs(db, agentId, KPIS);
  console.log(`  ${green("✓")} Saved ${KPIS.length} KPIs as v${kpiVersion.version}`);

  // ── Insert the call ────────────────────────────────────────────────────────
  const callId = randomUUID();
  const ghlCallId = `config-scenario-${Date.now()}`;

  db.prepare(`
    INSERT INTO calls (id, agent_id, location_id, ghl_call_id, transcript, metadata, source, analysis_status)
    VALUES (?, ?, ?, ?, ?, '{}', 'seed', 'pending')
  `).run(callId, agentId, locationId, ghlCallId, TRANSCRIPT);
  console.log(`  ${green("✓")} Inserted call ${callId.slice(0, 8)}…`);

  // ── Attach the bad settings snapshot so analyzeCall sees the misconfigured agent ──
  upsertCallAgentSnapshot(db, { call_id: callId, snapshot_json: JSON.stringify(BAD_SETTINGS) });
  console.log(`  ${green("✓")} Attached agent settings snapshot (bad config)\n`);

  // ── Print the bad settings we injected ────────────────────────────────────
  console.log(hr());
  console.log(bold("  Injected (Bad) Agent Settings"));
  console.log(hr());
  const badFields: Array<[string, string | number | boolean, string]> = [
    ["welcomeMessage", BAD_SETTINGS.welcomeMessage, "caller asked 'is this Bright Smile Dental?'"],
    ["responsiveness", BAD_SETTINGS.responsiveness, "caller said 'there was a really long pause'"],
    ["maxCallDuration", BAD_SETTINGS.maxCallDuration, "call disconnects mid-sentence before booking"],
    ["sendUserIdleReminders", BAD_SETTINGS.sendUserIdleReminders, "12-second dead air, no agent prompt"],
    ["reminderAfterIdleTimeSeconds", BAD_SETTINGS.reminderAfterIdleTimeSeconds, "even if enabled, fires too late"],
  ];
  for (const [field, value, symptom] of badFields) {
    console.log(`  ${red("✗")} ${bold(field.padEnd(30))} ${String(value).padEnd(8)} ${dim("→ " + symptom)}`);
  }

  // ── Run the analysis ───────────────────────────────────────────────────────
  console.log(`\n${hr()}`);
  console.log(bold("  Running Analysis…"));
  console.log(hr());
  await analyzeCall(db, callId);

  // ── Pull the results ───────────────────────────────────────────────────────
  const statusRow = db.prepare("SELECT analysis_status FROM calls WHERE id = ?").get(callId) as { analysis_status: string };
  const analysis = db.prepare("SELECT * FROM analyses WHERE call_id = ?").get(callId) as {
    id: string; overall_score: number | null; ai_summary: string | null; error: string | null;
  } | undefined;

  if (!analysis || statusRow.analysis_status !== "done") {
    console.error(red(`\n  Analysis failed: ${analysis?.error ?? "unknown error"}\n`));
    process.exit(1);
  }

  const kpiScores = db.prepare("SELECT kpi_scores_json FROM analyses WHERE id = ?").get(analysis.id) as { kpi_scores_json: string };
  const scores = JSON.parse(kpiScores.kpi_scores_json) as Array<{
    kpi: string; passed: boolean; score: number | null; confidence: number; evidence: string;
  }>;

  const recs = db.prepare(`
    SELECT * FROM recommendations WHERE analysis_id = ? ORDER BY
    CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
  `).all(analysis.id) as Array<{
    id: string; target_kpi_name: string; action: string; suggested_change: string | null;
    target_type: string; priority: string; status: string; agent_field: string | null;
    current_value: string | null; suggested_value: string | null; updated_prompt: string | null;
  }>;

  const useActions = db.prepare("SELECT * FROM use_actions WHERE analysis_id = ?").all(analysis.id) as Array<{
    id: string; what_to_change: string | null; why: string | null; reason: string;
    transcript_timestamp: string | null; action_required: string;
  }>;

  // ── Print AI summary ───────────────────────────────────────────────────────
  if (analysis.ai_summary) {
    console.log(`\n${bold("  AI Summary")}\n`);
    const words = analysis.ai_summary.split(" ");
    let line = "  ";
    for (const w of words) {
      if (line.length + w.length > 72) { console.log(line); line = "  " + w + " "; }
      else line += w + " ";
    }
    if (line.trim()) console.log(line);
  }

  // ── Print KPI scores ───────────────────────────────────────────────────────
  console.log(`\n${hr()}`);
  console.log(bold(`  KPI Results  (overall score: ${analysis.overall_score !== null ? Math.round(analysis.overall_score * 100) + "%" : "n/a"})`));
  console.log(hr());

  for (const s of scores) {
    const icon = s.passed ? green("PASS") : red("FAIL");
    const conf = dim(`(conf ${(s.confidence * 100).toFixed(0)}%)`);
    console.log(`\n  [${icon}] ${bold(s.kpi)} ${conf}`);
    const evidenceLines = s.evidence.match(/.{1,64}(\s|$)/g) ?? [s.evidence];
    for (const l of evidenceLines) console.log(`         ${dim(l.trim())}`);
  }

  // ── Print recommendations ──────────────────────────────────────────────────
  console.log(`\n${hr()}`);
  console.log(bold(`  Recommendations  (${recs.length} total)`));
  console.log(hr());

  const configRecs = recs.filter((r) => r.target_type === "agent_config");
  const promptRecs = recs.filter((r) => r.target_type === "prompt");
  const scriptRecs = recs.filter((r) => r.target_type === "script_step");

  console.log(`\n  ${green("agent_config")} — auto-applicable via GHL API : ${bold(String(configRecs.length))}`);
  console.log(`  ${"prompt"}         — auto-applicable via GHL API : ${bold(String(promptRecs.length))}`);
  console.log(`  ${yellow("script_step")}  — requires human action in UI  : ${bold(String(scriptRecs.length))}`);

  if (configRecs.length > 0) {
    console.log(`\n  ${bold("── agent_config changes (the showcase) ──────────────────────────")}`);
    for (const rec of configRecs) {
      const statusLabel = rec.status === "applied"
        ? green("  [APPLIED to GHL API]")
        : AUTO_MODE
          ? red("  [APPLY FAILED — check GHL API logs]")
          : dim("  [would be applied in --auto mode]");

      console.log(`\n  ${rec.priority.toUpperCase().padEnd(7)} ${bold(rec.target_kpi_name)}`);
      console.log(`  Action:  ${rec.action}`);
      if (rec.agent_field) {
        const from = rec.current_value ?? dim("(not set)");
        const to   = rec.suggested_value ?? dim("(not set)");
        console.log(`  Field:   ${cyan(rec.agent_field)}`);
        console.log(`  Change:  ${red(from)} → ${green(to)}`);
      }
      if (rec.suggested_change) {
        console.log(`  Detail:  ${dim(rec.suggested_change)}`);
      }
      console.log(statusLabel);
    }
  }

  if (promptRecs.length > 0) {
    console.log(`\n  ${bold("── prompt changes ───────────────────────────────────────────────")}`);
    for (const rec of promptRecs) {
      const statusLabel = rec.status === "applied" ? green("  [APPLIED]") : dim("  [pending]");
      console.log(`\n  ${rec.priority.toUpperCase().padEnd(7)} ${bold(rec.target_kpi_name)}`);
      console.log(`  Action:  ${rec.action}`);
      console.log(statusLabel);
    }
  }

  if (scriptRecs.length > 0) {
    console.log(`\n  ${bold("── script_step — human action required ──────────────────────────")}`);
    for (const rec of scriptRecs) {
      console.log(`\n  ${rec.priority.toUpperCase().padEnd(7)} ${bold(rec.target_kpi_name)}`);
      console.log(`  Action:  ${rec.action}`);
      if (rec.suggested_change) console.log(`  Detail:  ${dim(rec.suggested_change)}`);
    }
  }

  // ── Print use actions ──────────────────────────────────────────────────────
  if (useActions.length > 0) {
    console.log(`\n${hr()}`);
    console.log(bold(`  Action Items  (${useActions.length})`));
    console.log(hr());
    for (const ua of useActions) {
      const typeLabel = ua.action_required === "human_followup" ? yellow("FOLLOW-UP") : cyan("RETRAIN");
      const ts = ua.transcript_timestamp ? ` @ ${ua.transcript_timestamp}` : "";
      console.log(`\n  [${typeLabel}]${ts}`);
      console.log(`  What:  ${ua.what_to_change ?? ua.reason}`);
      if (ua.why) console.log(`  Why:   ${dim(ua.why)}`);
    }
  }

  // ── Final summary ──────────────────────────────────────────────────────────
  console.log(`\n${hr("═")}`);
  const appliedCount = recs.filter((r) => r.status === "applied").length;
  const failedKpis = scores.filter((s) => !s.passed).length;

  if (AUTO_MODE) {
    console.log(bold(`  Result: ${failedKpis} KPIs failed → ${recs.length} recommendations → ${appliedCount} applied to GHL API`));
    if (appliedCount === configRecs.length && configRecs.length > 0) {
      console.log(green(`  All ${configRecs.length} agent_config changes were pushed directly to the GHL API.`));
      console.log(green("  These are fields the user could not fix by editing the AI prompt alone."));
    } else if (appliedCount < configRecs.length) {
      console.log(yellow(`  ${configRecs.length - appliedCount} config change(s) failed — check server logs for GHL API errors.`));
    }
  } else {
    console.log(bold(`  Result: ${failedKpis} KPIs failed → ${recs.length} recommendations generated`));
    console.log(cyan(`  ${configRecs.length} are agent_config type — run with --auto to push them to the GHL API automatically.`));
    console.log(dim("  Add GHL_TEST_AGENT_ID=<your-voice-ai-agent-id> to .env before using --auto."));
  }
  console.log(hr("═") + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
