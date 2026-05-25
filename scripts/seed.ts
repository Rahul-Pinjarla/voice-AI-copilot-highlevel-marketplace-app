/**
 * Seed script: inserts synthetic calls + analyses into the currently-installed location.
 *
 * Usage:
 *   npm run seed                  — inserts 3 seed calls with pre-computed analyses
 *   npm run seed -- --simulated-time  — also adds flywheel demo data (applied rec + backdated calls)
 *
 * Requires: the marketplace app must be installed (valid entry in installations table).
 * Run from repo root.
 */

import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load env without the full server env validation
dotenv.config();
const DB_PATH = process.env.DB_PATH ?? "./data/app.db";

if (!fs.existsSync(DB_PATH)) {
  console.error("❌ No database found. Start the server first to create the DB, then run seed.");
  process.exit(1);
}

const db = new Database(path.resolve(DB_PATH));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const simulatedTime = process.argv.includes("--simulated-time");

// Find the first active installation
const installation = db
  .prepare("SELECT location_id FROM installations WHERE status = 'active' LIMIT 1")
  .get() as { location_id: string } | undefined;

if (!installation) {
  console.error("❌ No active installation found. Install the marketplace app first.");
  process.exit(1);
}

const locationId = installation.location_id;
console.log(`\n🌱 Seeding location: ${locationId}`);

// Ensure we have an agent to attach calls to
let agent = db
  .prepare("SELECT * FROM agents WHERE location_id = ? AND ghl_agent_id = 'seed-agent-1'")
  .get(locationId) as { id: string; name: string } | undefined;

if (!agent) {
  const agentId = randomUUID();
  db.prepare(
    "INSERT OR IGNORE INTO agents (id, location_id, ghl_agent_id, name, system_prompt, configured) VALUES (?, ?, ?, ?, ?, 1)",
  ).run(
    agentId,
    locationId,
    "seed-agent-1",
    "Demo: Appointment Setter",
    "You are an appointment-setting assistant. Your goal is to book appointments for our sales team. Always try to close with a specific date and time. Qualify prospects on budget, timeline, and decision-making authority before booking.",
  );
  agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as { id: string; name: string };
  console.log(`  ✓ Created agent: ${agent.name}`);
}

// Create a KPI config version for the agent if none exists
const existingVersion = db
  .prepare("SELECT id FROM kpi_config_versions WHERE agent_id = ? LIMIT 1")
  .get(agent.id) as { id: string } | undefined;

let kpiVersionId = existingVersion?.id;
if (!kpiVersionId) {
  kpiVersionId = randomUUID();
  db.prepare("INSERT INTO kpi_config_versions (id, agent_id, version) VALUES (?, ?, 1)").run(
    kpiVersionId,
    agent.id,
  );
  const kpis = [
    { name: "appointment_booked", def: "Did the agent successfully book an appointment?" },
    { name: "objection_handled", def: "Did the agent handle price or timing objections?" },
    { name: "qualification_completed", def: "Were budget, timeline, and decision authority confirmed?" },
    { name: "follow_up_scheduled", def: "Was a clear next step scheduled?" },
    { name: "urgency_created", def: "Did the agent create a reason to act now?" },
  ];
  for (const kpi of kpis) {
    db.prepare("INSERT INTO kpi_configs (id, version_id, kpi_name, definition) VALUES (?, ?, ?, ?)").run(
      randomUUID(),
      kpiVersionId,
      kpi.name,
      kpi.def,
    );
  }
  db.prepare("UPDATE agents SET configured = 1 WHERE id = ?").run(agent.id);
  console.log(`  ✓ Created KPI config (5 KPIs)`);
}

// Load pre-computed analyses
const fixturesPath = path.resolve("fixtures/seed-analyses.json");
const seedAnalyses = JSON.parse(fs.readFileSync(fixturesPath, "utf8")) as Record<
  string,
  { kpi_scores: unknown[]; overall_score: number; recommendations: unknown[]; use_actions: unknown[] }
>;

const seedCalls = [
  { id: "seed-call-001", label: "Full pass — all KPIs met" },
  { id: "seed-call-002", label: "Partial fail — missed booking + qualification" },
  { id: "seed-call-003", label: "Near miss — objection not handled" },
];

const transcripts: Record<string, string> = {
  "seed-call-001": `Agent: Hi, this is Alex calling on behalf of Apex Solutions. Is this a good time?
Prospect: Sure, go ahead.
Agent: Great. I wanted to reach out because many businesses in your space are struggling with lead conversion. Does that resonate with you?
Prospect: Actually, yes. We're converting about 12% of our inbound leads which feels low.
Agent: That's below average for your industry — we typically see clients in your space at 25-35%. How much are you currently budgeting for sales tools per month?
Prospect: We're probably in the $2,000-$5,000 range and looking to expand in Q3.
Agent: Perfect. And are you the main decision maker for this type of investment?
Prospect: Yes, I handle all the sales tech decisions.
Agent: That's helpful context. We've helped similar companies double their conversion rates in 90 days. The investment pays for itself quickly. I do want to mention we're only taking on 3 new clients in Q3 and two slots are already spoken for.
Prospect: I'd like to know more. What would the next steps look like?
Agent: I'd love to set up a 30-minute strategy call with our lead specialist. They'll walk through exactly how we'd approach your situation. I have Tuesday at 2pm or Thursday at 10am available — which works better?
Prospect: Tuesday at 2pm works.
Agent: Perfect, I have you down for Tuesday at 2pm. You'll receive a confirmation email with the calendar invite. Looking forward to speaking with you then!`,
  "seed-call-002": `Agent: Hi there, this is Jordan from Peak Performance Solutions. Am I speaking with the owner?
Prospect: Yes, that's me.
Agent: Great! I'm reaching out because we help businesses like yours improve their sales conversion. Do you have a few minutes?
Prospect: Sure, what's this about?
Agent: We provide AI-powered sales coaching that typically increases close rates by 30%. A lot of businesses in your area are seeing really strong results.
Prospect: That does sound interesting actually. I'm definitely interested in hearing more.
Agent: That's great to hear! Our solution works by analyzing your sales conversations and giving real-time coaching suggestions.
Prospect: How does pricing work?
Agent: We have different tiers starting from $1,500 per month. It really depends on your team size and usage.
Prospect: That seems reasonable, I guess. When would be a good time to get more details?
Agent: I'll send you some information via email. What's the best address?
Prospect: It's john@example.com
Agent: Perfect, I'll send that over. You can reply with any questions!
Prospect: Sounds good, thanks.`,
  "seed-call-003": `Agent: Good afternoon, this is Sam from Growth Systems. Is this a good time to talk?
Prospect: I have about 10 minutes.
Agent: Perfect, I'll be brief. We help companies like yours accelerate their sales cycle. Are you currently looking to improve your conversion rates?
Prospect: We always are. We tried something similar before and it didn't really work out.
Agent: I understand. Our platform has some really unique features that set us apart.
Prospect: What's the budget range typically?
Agent: Most clients invest between $3,000 and $8,000 monthly depending on scale. Who else would be involved in a decision like this?
Prospect: Just me, I'm the CEO.
Agent: Great. And are you looking to implement something this quarter?
Prospect: Ideally yes, next quarter at the latest.
Agent: That's a great timeline. Our onboarding process takes about 3 weeks and we'd have you fully up and running within a month.
Prospect: What does the next step look like?
Agent: We'd set up a demo call where our specialist walks you through the platform. I'll follow up with some scheduling options.
Prospect: Okay, sounds good.
Agent: Great talking to you. Have a good rest of your day!`,
};

let insertedCount = 0;
let appliedRecId: string | undefined;

for (const seedCall of seedCalls) {
  const callId = randomUUID();
  const insertResult = db.prepare(`
    INSERT OR IGNORE INTO calls (id, agent_id, location_id, ghl_call_id, transcript, metadata, source, analysis_status)
    VALUES (?, ?, ?, ?, ?, '{}', 'seed', 'done')
  `).run(callId, agent.id, locationId, seedCall.id, transcripts[seedCall.id] ?? null);

  if (insertResult.changes === 0) {
    console.log(`  ↳ ${seedCall.label} — already exists, skipping`);
    continue;
  }

  const analysis = seedAnalyses[seedCall.id];
  if (!analysis) continue;

  const analysisId = randomUUID();
  db.prepare(`
    INSERT INTO analyses (id, call_id, kpi_config_version_id, kpi_scores_json, overall_score)
    VALUES (?, ?, ?, ?, ?)
  `).run(analysisId, callId, kpiVersionId, JSON.stringify(analysis.kpi_scores), analysis.overall_score);

  for (const rec of analysis.recommendations as Array<{
    priority: string;
    target_kpi_name: string;
    target_type: string;
    action: string;
    suggested_change: string;
    transcript_timestamp: string;
  }>) {
    const recId = randomUUID();
    db.prepare(`
      INSERT INTO recommendations (id, analysis_id, target_kpi_name, action, suggested_change, target_type, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(recId, analysisId, rec.target_kpi_name, rec.action, rec.suggested_change, rec.target_type, rec.priority);

    // Save the first rec ID from the partial-fail call for flywheel demo
    if (seedCall.id === "seed-call-002" && !appliedRecId) {
      appliedRecId = recId;
    }
  }

  for (const ua of analysis.use_actions as Array<{
    reason: string;
    transcript_timestamp: string;
    action_required: string;
  }>) {
    db.prepare(`
      INSERT INTO use_actions (id, analysis_id, reason, transcript_timestamp, action_required)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), analysisId, ua.reason, ua.transcript_timestamp, ua.action_required);
  }

  insertedCount++;
  console.log(
    `  ✓ ${seedCall.label} (score: ${Math.round(analysis.overall_score * 100)}%, ${analysis.recommendations.length} recs)`,
  );
}

// ── Simulated-time: flywheel demo data ─────────────────────────────────────────

if (simulatedTime && appliedRecId) {
  console.log("\n⏱  --simulated-time: building flywheel demo data...");

  const nowSecs = Math.floor(Date.now() / 1000);
  const appliedAt = nowSecs - 3 * 24 * 60 * 60; // applied 3 days ago

  // Mark the recommendation as applied with backdated timestamp
  db.prepare("UPDATE recommendations SET status = 'applied', applied_at = ? WHERE id = ?").run(
    appliedAt,
    appliedRecId,
  );
  console.log("  ✓ Marked recommendation as applied (3 days ago)");

  // Insert 5 "before" calls (8 days ago) with low appointment_booked rate
  for (let i = 0; i < 5; i++) {
    const beforeCallId = randomUUID();
    const beforeTime = appliedAt - (8 - i) * 24 * 60 * 60;
    db.prepare(`
      INSERT OR IGNORE INTO calls (id, agent_id, location_id, ghl_call_id, transcript, metadata, source, analysis_status, ingested_at)
      VALUES (?, ?, ?, ?, ?, '{}', 'seed', 'done', ?)
    `).run(beforeCallId, agent.id, locationId, `seed-before-${i}`, transcripts["seed-call-002"], beforeTime);

    const beforeAnalysisId = randomUUID();
    const beforeScore = i < 3 ? 0.28 : 0.35; // low pass rate in before-window
    const beforeKpiScores = [
      { kpi: "appointment_booked", passed: false, confidence: 0.9, evidence: "No booking close detected" },
      { kpi: "objection_handled", passed: i % 2 === 0, confidence: 0.7, evidence: "" },
    ];
    db.prepare(`
      INSERT INTO analyses (id, call_id, kpi_config_version_id, kpi_scores_json, overall_score)
      VALUES (?, ?, ?, ?, ?)
    `).run(beforeAnalysisId, beforeCallId, kpiVersionId, JSON.stringify(beforeKpiScores), beforeScore);
  }
  console.log("  ✓ Inserted 5 before-window calls (low appointment_booked rate)");

  // Insert 5 "after" calls (last 3 days) with improved appointment_booked rate
  for (let i = 0; i < 5; i++) {
    const afterCallId = randomUUID();
    const afterTime = appliedAt + (i + 1) * 14 * 60 * 60; // spread over 3 days after
    db.prepare(`
      INSERT OR IGNORE INTO calls (id, agent_id, location_id, ghl_call_id, transcript, metadata, source, analysis_status, ingested_at)
      VALUES (?, ?, ?, ?, ?, '{}', 'seed', 'done', ?)
    `).run(afterCallId, agent.id, locationId, `seed-after-${i}`, transcripts["seed-call-001"], afterTime);

    const afterAnalysisId = randomUUID();
    const afterScore = 0.7 + i * 0.04; // improving trend
    const afterKpiScores = [
      { kpi: "appointment_booked", passed: true, confidence: 0.92, evidence: "Booking confirmed" },
      { kpi: "objection_handled", passed: true, confidence: 0.8, evidence: "Objection handled well" },
    ];
    db.prepare(`
      INSERT INTO analyses (id, call_id, kpi_config_version_id, kpi_scores_json, overall_score)
      VALUES (?, ?, ?, ?, ?)
    `).run(afterAnalysisId, afterCallId, kpiVersionId, JSON.stringify(afterKpiScores), afterScore);
  }
  console.log("  ✓ Inserted 5 after-window calls (improved appointment_booked rate)");
  console.log("  → Flywheel tab will show: appointment_booked 0% → 100% (+100%)");
}

console.log(`\n✅ Seed complete. Inserted ${insertedCount} new calls.`);
if (!simulatedTime) {
  console.log("   Tip: run with --simulated-time to also generate flywheel demo data.\n");
}
