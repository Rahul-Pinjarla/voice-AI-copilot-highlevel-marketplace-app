import "dotenv/config";
import path from "path";
process.env.DB_PATH = path.resolve("data/app.db");
import { getDb } from "../server/src/db/init";
import { updateTokens } from "../server/src/db/queries";
import { refreshToken, expiresAt } from "../server/src/lib/ghl/oauth";

async function main() {
  const db = getDb();
  const inst = db.prepare("SELECT location_id, access_token, refresh_token, expires_at, scopes FROM installations WHERE status = 'active' LIMIT 1").get() as {
    location_id: string; access_token: string; refresh_token: string; expires_at: number; scopes: string;
  } | undefined;
  if (!inst) { console.error("No active installation"); process.exit(1); }

  const now = Math.floor(Date.now() / 1000);
  console.log("location_id:", inst.location_id);
  console.log("scopes:     ", inst.scopes);
  console.log("expires_at: ", new Date(inst.expires_at * 1000).toISOString(), inst.expires_at < now ? "(EXPIRED)" : "(valid)");

  console.log("\nRefreshing token...");
  const tokens = await refreshToken(inst.refresh_token);
  updateTokens(db, inst.location_id, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt(tokens.expires_in),
  });
  console.log("Token refreshed.\n");

  const fresh = db.prepare("SELECT access_token FROM installations WHERE location_id = ?").get(inst.location_id) as { access_token: string };

  // Try listing agents
  const r = await fetch(`https://services.leadconnectorhq.com/voice-ai/agents?locationId=${inst.location_id}`, {
    headers: { Authorization: `Bearer ${fresh.access_token}`, Version: "2021-07-28" },
  });
  const text = await r.text();
  console.log("GET /voice-ai/agents →", r.status);
  try {
    const data = JSON.parse(text) as { agents?: Array<{ id: string; agentName: string }> };
    const agents = data.agents ?? [];
    if (agents.length) {
      console.log(`\nFound ${agents.length} agent(s):`);
      for (const a of agents) console.log(`  ${a.id}  →  ${a.agentName}`);
    } else {
      console.log("Response:", text.slice(0, 600));
    }
  } catch {
    console.log("Raw response:", text.slice(0, 600));
  }
}
main().catch(console.error);
