import { randomUUID } from "crypto";
import { Router } from "express";
import { getDb } from "../db/init";
import { getInstallation, getKpiConfigsForVersion, getLatestKpiVersion, getOrCreateAgentVersion, insertCallIfNew, upsertAgent } from "../db/queries";
import { analyzeCall } from "../lib/analysis";
import { fetchCallLogs, fetchVoiceAiAgents } from "../lib/ghl/api";
import { requireSession } from "../middleware/requireSession";
import { ApiError } from "../types";

const router = Router();
router.use(requireSession);

// Track in-progress backfills per location so client can poll
const backfillInProgress = new Set<string>();

router.get("/status", (req, res) => {
  const locationId = req.session.locationId!;
  res.json({ running: backfillInProgress.has(locationId) });
});

router.get("/check", async (req, res, next) => {
  try {
    const db = getDb();
    const locationId = req.session.locationId!;
    const installation = getInstallation(db, locationId);
    if (!installation) throw new ApiError("NOT_INSTALLED", "No installation for this location", 400);

    // Fetch only first page (1 call) to get the latest GHL call ID
    const { calls } = await fetchCallLogs(db, locationId, 1, 1);
    const latestGhlId = calls[0]?.id ?? null;

    const latestDbRow = db
      .prepare("SELECT ghl_call_id FROM calls WHERE location_id = ? ORDER BY ingested_at DESC LIMIT 1")
      .get(locationId) as { ghl_call_id: string } | undefined;
    const latestDbId = latestDbRow?.ghl_call_id ?? null;

    const needsBackfill = latestGhlId !== null && latestGhlId !== latestDbId;
    res.json({ needsBackfill, latestGhlId, latestDbId, running: backfillInProgress.has(locationId) });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const db = getDb();
    const locationId = req.session.locationId!;
    const installation = getInstallation(db, locationId);
    if (!installation) throw new ApiError("NOT_INSTALLED", "No installation for this location", 400);

    if (backfillInProgress.has(locationId)) {
      res.json({ ok: true, message: "Backfill already running" });
      return;
    }

    res.json({ ok: true, message: "Backfill started" });

    backfillInProgress.add(locationId);
    runBackfill(db, locationId)
      .catch((err) => console.error("[backfill] Error:", err))
      .finally(() => backfillInProgress.delete(locationId));
  } catch (err) {
    next(err);
  }
});

async function runBackfill(
  db: ReturnType<typeof getDb>,
  locationId: string,
): Promise<void> {
  let page = 1;
  let hasMore = true;
  let totalInserted = 0;

  console.log(`[backfill] Starting for location: ${locationId}`);

  // Build agentId → agent name map from GHL so call logs can be linked
  const ghlAgents = await fetchVoiceAiAgents(db, locationId);
  const agentNameMap = new Map(ghlAgents.map((a) => [a.id, a.agentName]));
  for (const a of ghlAgents) {
    upsertAgent(db, {
      location_id: locationId,
      ghl_agent_id: a.id,
      name: a.agentName,
      system_prompt: (a.agentPrompt as string | undefined) ?? undefined,
    });
  }
  console.log(`[backfill] Synced ${ghlAgents.length} agent(s)`);

  while (hasMore) {
    const { calls, hasMore: more } = await fetchCallLogs(db, locationId, page);
    hasMore = more;
    page++;

    for (const call of calls) {
      const ghlAgentId = call.agentId as string | undefined;
      const agentName = (ghlAgentId ? agentNameMap.get(ghlAgentId) : undefined) ?? "Unknown Agent";

      const agent = upsertAgent(db, {
        location_id: locationId,
        ghl_agent_id: ghlAgentId ?? `unknown-${call.id}`,
        name: agentName,
      });

      const kpiVersion = getLatestKpiVersion(db, agent.id);
      const kpis = kpiVersion ? getKpiConfigsForVersion(db, kpiVersion.id) : [];
      const agentVer = getOrCreateAgentVersion(db, agent.id, kpis, null);

      const { inserted } = insertCallIfNew(db, {
        id: randomUUID(),
        agent_id: agent.id,
        location_id: locationId,
        ghl_call_id: call.id,
        transcript: (call.transcript as string | undefined) ?? null,
        metadata: JSON.stringify(call),
        source: "backfill",
        agent_version_id: agentVer.id,
      });

      if (inserted) {
        totalInserted++;
        const row = db
          .prepare("SELECT id FROM calls WHERE location_id = ? AND ghl_call_id = ?")
          .get(locationId, call.id) as { id: string } | undefined;
        if (row) {
          await analyzeCall(db, row.id);
        }
      }
    }

    console.log(`[backfill] Page ${page - 1}: ${calls.length} calls, ${totalInserted} inserted`);
    if (calls.length === 0) break;
  }

  console.log(`[backfill] Done. Total inserted: ${totalInserted}`);
}

export { runBackfill };
export default router;
