/**
 * One-off script: suggest KPIs via Anthropic for each agent, save them,
 * then re-analyze all calls in the DB.
 *
 * Run from repo root:  npx tsx scripts/seed-kpis-and-analyze.ts
 */
import "dotenv/config";
import path from "path";
import { getDb } from "../server/src/db/init";
import { getKpiConfigsForVersion, getLatestKpiVersion, saveKpiConfigs } from "../server/src/db/queries";
import { analyzeCall } from "../server/src/lib/analysis";
import { getLLMClient } from "../server/src/lib/llm";

// Override DB_PATH relative to repo root so the script finds data/app.db
process.env.DB_PATH = path.resolve("data/app.db");

async function main() {
  const db = getDb();
  const llm = getLLMClient();

  const agents = db
    .prepare("SELECT id, name, system_prompt FROM agents")
    .all() as Array<{ id: string; name: string; system_prompt: string | null }>;

  console.log(`\nFound ${agents.length} agent(s)\n`);

  // ── Step 1: suggest & save KPIs for agents that have none ──────────────────
  for (const agent of agents) {
    const existingVersion = getLatestKpiVersion(db, agent.id);
    if (existingVersion) {
      const kpis = getKpiConfigsForVersion(db, existingVersion.id);
      console.log(`[${agent.name}] already has ${kpis.length} KPI(s) (v${existingVersion.version}) — skipping suggest`);
      continue;
    }

    if (!agent.system_prompt) {
      console.log(`[${agent.name}] no system_prompt — skipping KPI suggestion`);
      continue;
    }

    console.log(`[${agent.name}] Asking Anthropic to suggest KPIs…`);
    const suggestions = await llm.suggestKPIs(agent.system_prompt);
    const saved = saveKpiConfigs(db, agent.id, suggestions.map((s) => ({ kpi_name: s.kpi_name, definition: s.definition })));
    console.log(`[${agent.name}] Saved ${suggestions.length} KPI(s) as v${saved.version}:`);
    for (const s of suggestions) {
      console.log(`  • ${s.kpi_name}: ${s.definition}`);
      console.log(`    Rationale: ${s.rationale}`);
    }
    console.log();
  }

  // ── Step 2: analyze all calls ──────────────────────────────────────────────
  const calls = db
    .prepare("SELECT id, agent_id, analysis_status FROM calls")
    .all() as Array<{ id: string; agent_id: string; analysis_status: string }>;

  console.log(`\nAnalyzing ${calls.length} call(s)…\n`);

  for (const call of calls) {
    const agentName = agents.find((a) => a.id === call.agent_id)?.name ?? call.agent_id;
    console.log(`[${agentName}] Call ${call.id} (status: ${call.analysis_status})`);

    // Reset to pending so analyzeCall re-runs it
    db.prepare("UPDATE calls SET analysis_status = 'pending' WHERE id = ?").run(call.id);

    await analyzeCall(db, call.id);

    const result = db
      .prepare("SELECT analysis_status FROM calls WHERE id = ?")
      .get(call.id) as { analysis_status: string };
    console.log(`  → ${result.analysis_status}`);
  }

  // ── Step 3: print summary ──────────────────────────────────────────────────
  console.log("\n── Summary ───────────────────────────────────────────────────");
  for (const agent of agents) {
    const kpiVersion = getLatestKpiVersion(db, agent.id);
    const kpis = kpiVersion ? getKpiConfigsForVersion(db, kpiVersion.id) : [];
    const analyses = db
      .prepare(`
        SELECT a.overall_score, a.error
        FROM analyses a
        JOIN calls c ON c.id = a.call_id
        WHERE c.agent_id = ?
        ORDER BY a.created_at DESC
      `)
      .all(agent.id) as Array<{ overall_score: number | null; error: string | null }>;

    console.log(`\n${agent.name}`);
    console.log(`  KPIs: ${kpis.map((k) => k.kpi_name).join(", ") || "none"}`);
    console.log(`  Analyses: ${analyses.length}`);
    for (const a of analyses) {
      if (a.error) {
        console.log(`    ❌ error: ${a.error}`);
      } else {
        console.log(`    ✓ score: ${a.overall_score !== null ? (a.overall_score * 100).toFixed(0) + "%" : "n/a"}`);
      }
    }
  }

  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
