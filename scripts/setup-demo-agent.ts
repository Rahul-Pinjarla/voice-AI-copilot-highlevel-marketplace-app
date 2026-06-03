/**
 * Live Demo Setup — Agent Config Observability
 *
 * What this script does (automatically):
 *   1. Registers the Watt assisstant agent in our DB
 *   2. Saves 5 KPIs that map directly to the 4 misconfigured fields
 *   3. Sets the agent to AUTO mode so fixes apply the moment a call is analyzed
 *
 * What you do in GHL UI (4 fields, ~2 minutes):
 *   The script prints exact values to enter — see output below.
 *
 * Run:
 *   npx tsx scripts/setup-demo-agent.ts
 */

import "dotenv/config";
import path from "path";
process.env.DB_PATH = path.resolve("data/app.db");
import { getDb } from "../server/src/db/init";
import { saveKpiConfigs, upsertAgent } from "../server/src/db/queries";

const GHL_AGENT_ID   = "6a12264050a34a1af2160eee"; // Watt assisstant
const GHL_AGENT_NAME = "Watt assisstant";

// KPIs — each one maps directly to one misconfigured field
const KPIS = [
  {
    kpi_name: "greeting_identifies_business",
    definition:
      "The agent's opening line clearly states the business name so the caller immediately knows they reached the right place. A greeting that omits the business name fails this check.",
    type: "binary" as const,
    threshold: 1,
  },
  {
    kpi_name: "response_latency_natural",
    definition:
      "The conversation flows without noticeable pauses after the caller finishes speaking. If the caller comments on lag, delay, or asks 'are you there?' due to slow response timing, this fails.",
    type: "binary" as const,
    threshold: 1,
  },
  {
    kpi_name: "idle_recovery_prompt",
    definition:
      "When the caller falls silent for more than 4 seconds, the agent sends a check-in within 5 seconds. Extended dead air (10+ seconds) with no agent response is a direct failure.",
    type: "binary" as const,
    threshold: 1,
  },
  {
    kpi_name: "call_completed_before_cutoff",
    definition:
      "The call reached a natural conclusion without being hard-disconnected by a duration limit mid-sentence. A call cut off before the caller finishes speaking fails.",
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

const B  = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R  = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y  = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C  = (s: string) => `\x1b[36m${s}\x1b[0m`;
const D  = (s: string) => `\x1b[2m${s}\x1b[0m`;
const hr = (c = "─", w = 68) => c.repeat(w);

async function main() {
  const db = getDb();

  const inst = db
    .prepare("SELECT location_id FROM installations WHERE status = 'active' LIMIT 1")
    .get() as { location_id: string } | undefined;

  if (!inst) {
    console.error(R("\n  ✗ No active installation. Start the server and complete OAuth first.\n"));
    process.exit(1);
  }

  console.log("\n" + hr("═"));
  console.log(B("  Live Demo Setup — Agent Config Observability"));
  console.log(hr("═"));

  // ── DB side: register agent + KPIs + auto mode ─────────────────────────────
  const agent = upsertAgent(db, {
    location_id: inst.location_id,
    ghl_agent_id: GHL_AGENT_ID,
    name: GHL_AGENT_NAME,
  });
  db.prepare("UPDATE agents SET mode = 'auto', configured = 1 WHERE id = ?").run(agent.id);

  const kpiVersion = saveKpiConfigs(db, agent.id, KPIS);

  console.log(`\n  ${G("✓")} Agent registered in DB: ${B(GHL_AGENT_NAME)}`);
  console.log(`  ${G("✓")} ${KPIS.length} KPIs saved (v${kpiVersion.version})`);
  console.log(`  ${G("✓")} Mode set to ${B("AUTO")} — fixes apply automatically after each call\n`);

  // ── GHL UI instructions ─────────────────────────────────────────────────────
  console.log(hr());
  console.log(B("  STEP 1 — Set bad settings in GHL UI  (~2 min)"));
  console.log(hr());
  console.log(`\n  Go to: ${C("GoHighLevel → Voice AI → Watt assisstant")}\n`);

  console.log(`  ${B("Agent Details tab:")}`);
  console.log(`    ${R("Welcome Message")}  →  set to:  ${Y('"Hey, can I help you?"')}`);
  console.log(`    ${D("(clear whatever is there now and type exactly this)")}\n`);

  console.log(`  ${B("Advanced Settings tab → Call Settings:")}`);
  console.log(`    ${R("Responsiveness")}          →  drag to ${Y("maximum")} (or type ${Y("1800")} ms)`);
  console.log(`    ${R("Max Call Duration")}       →  set to  ${Y("90")} seconds`);
  console.log(`    ${R("User Idle Reminders")}     →  toggle  ${Y("OFF")}`);
  console.log(`    ${D("(if it was on, the reminder timer value doesn't matter — just turn it off)")}\n`);

  console.log(`  Hit ${B("Save")}. That's it for the GHL UI.\n`);

  // ── Caller script: failing call ─────────────────────────────────────────────
  console.log(hr("═"));
  console.log(R(B("  STEP 2 — FAILING CALL  (make this call now)")));
  console.log(hr("═"));
  console.log(D("  Call the number assigned to Watt assisstant in GHL."));
  console.log(D("  Follow this script exactly. Each line is one thing you say.\n"));

  console.log(`  ${D("[Agent answers — generic greeting, doesn't say the business name]")}\n`);

  console.log(`  ${Y("YOU ▶")}  "Hi — what business is this? I'm looking to book an appointment."\n`);

  console.log(`  ${D("[Agent tells you the business name and asks how it can help]")}`);
  console.log(`  ${D("[Notice the pause before it speaks — that's the 1800ms lag]")}\n`);

  console.log(`  ${Y("YOU ▶")}  "Sorry, there was a long delay before you responded."`);
  console.log(`         "I'd like to book an appointment. My name is Sarah Mitchell."\n`);

  console.log(`  ${D("[Agent asks for more info — date of birth or similar]")}\n`);

  console.log(`  ${Y("YOU ▶")}  "March 15th, 1988."\n`);

  console.log("  " + R(B("★ NOW STAY SILENT FOR 12 SECONDS — don't say anything ★")));
  console.log("  " + D("  Count in your head. The agent will NOT prompt you — idle reminders are off.\n"));

  console.log(`  ${Y("YOU ▶")}  "Hello? Are you still there?"\n`);

  console.log(`  ${D("[Agent responds]")}\n`);

  console.log(`  ${Y("YOU ▶")}  "I'd like to book for Wednesday or Thursday afternoon — either works,"`);
  console.log(`         "or even Friday if you have something open in the—"\n`);

  console.log("  " + R(B("★ CALL DISCONNECTS here (~1:30) — max duration hit mid-sentence ★\n")));

  console.log(hr());
  console.log(B("  After Call 1 — what happens automatically:"));
  console.log(hr());
  console.log(`  ${G("1.")} Webhook fires → transcript ingested`);
  console.log(`  ${G("2.")} Analysis runs → all 5 KPIs fail`);
  console.log(`  ${G("3.")} Recommendations generated:`);
  const fixes = [
    ["welcomeMessage",              '"Hey, can I help you?"',  "→  proper business greeting"],
    ["responsiveness",              "1800 ms",                 "→  400–600 ms"],
    ["maxCallDuration",             "90 s",                    "→  300 s"],
    ["sendUserIdleReminders",       "false",                   "→  true"],
    ["reminderAfterIdleTimeSeconds","15 s",                    "→  5 s"],
  ];
  for (const [field, bad, fix] of fixes) {
    console.log(`     ${C(field.padEnd(32))} ${R(bad.padEnd(22))} ${G(fix)}`);
  }
  console.log(`  ${G("4.")} AUTO MODE: all 5 pushed to GHL API → agent is now fixed`);
  console.log(`\n  ${B("Check the dashboard")} to see the analysis before making Call 2.\n`);

  // ── Caller script: positive call ────────────────────────────────────────────
  console.log(hr("═"));
  console.log(G(B("  STEP 3 — POSITIVE CALL  (after dashboard shows analysis complete)")));
  console.log(hr("═"));
  console.log(D("  Same number. Agent is now auto-corrected. Shorter script this time.\n"));

  console.log(`  ${D("[Agent answers immediately with the business name in the greeting]")}\n`);

  console.log(`  ${G("YOU ▶")}  "Hi, I'd like to book a new patient appointment."\n`);

  console.log(`  ${D("[Agent responds quickly — no noticeable delay]")}\n`);

  console.log(`  ${G("YOU ▶")}  "My name is Alex Thompson. Date of birth June 22nd, 1990."\n`);

  console.log("  " + G(B("★ PAUSE FOR 6 SECONDS — stay silent ★")));
  console.log("  " + D("  Agent will say 'Are you still there?' within 5 seconds — idle reminder is now on.\n"));

  console.log(`  ${G("YOU ▶")}  "Sorry, still here! I have Aetna dental insurance. Member ID AE-7892."\n`);

  console.log(`  ${D("[Agent asks for preferred days/times]")}\n`);

  console.log(`  ${G("YOU ▶")}  "Tuesday or Wednesday morning works for me."\n`);

  console.log(`  ${D("[Agent offers a specific slot]")}\n`);

  console.log(`  ${G("YOU ▶")}  "Tuesday at 10am is perfect."\n`);

  console.log(`  ${D("[Agent confirms: appointment booked, gives date and time back]")}\n`);

  console.log(`  ${G("YOU ▶")}  "Great, thank you!"\n`);

  console.log("  " + G(B("★ CALL ENDS NATURALLY — appointment booked ★\n")));

  console.log(hr());
  console.log(B("  After Call 2 — expected result:"));
  console.log(hr());
  console.log(`  ${G("✓")} All 5 KPIs pass`);
  console.log(`  ${G("✓")} Overall score ~85–95%`);
  console.log(`  ${G("✓")} Zero action items — no human follow-up needed`);
  console.log(`  ${G("✓")} Flywheel complete: bad call → auto-fix → good call\n`);

  console.log(hr("═"));
  console.log(B("  DB setup done. Now do the 4 GHL UI changes, then make the calls."));
  console.log(hr("═") + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
