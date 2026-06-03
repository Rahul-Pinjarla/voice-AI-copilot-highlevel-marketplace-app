import "dotenv/config";
import path from "path";
process.env.DB_PATH = path.resolve("data/app.db");
import { getDb } from "../server/src/db/init";
import { fetchVoiceAiAgents } from "../server/src/lib/ghl/api";

async function main() {
  const db = getDb();
  const inst = db.prepare("SELECT location_id FROM installations WHERE status = 'active' LIMIT 1").get() as { location_id: string } | undefined;
  if (!inst) { console.error("No active installation"); process.exit(1); }
  const agents = await fetchVoiceAiAgents(db, inst.location_id);
  console.log(`\nFound ${agents.length} Voice AI agent(s):\n`);
  for (const a of agents) {
    console.log(`  ${a.id}  →  ${a.agentName}`);
  }
  console.log();
}
main().catch(console.error);
