import "dotenv/config";
import path from "path";
process.env.DB_PATH = path.resolve("data/app.db");
import { getDb } from "../server/src/db/init";

async function main() {
  const db = getDb();
  const inst = db.prepare("SELECT location_id, access_token FROM installations WHERE status = 'active' LIMIT 1").get() as { location_id: string; access_token: string };
  const ghlId = "6a12264050a34a1af2160eee";

  for (const ver of ["2021-07-28", "2021-04-15"]) {
    const url = `https://services.leadconnectorhq.com/voice-ai/agents/${ghlId}?locationId=${inst.location_id}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${inst.access_token}`, Version: ver } });
    const text = await r.text();
    console.log(`Version ${ver} → ${r.status}: ${text.slice(0, 300)}`);
  }
}
main().catch(console.error);
