import { Router } from "express";
import { getDb } from "../db/init";
import {
  getAgent,
  getAgentVersions,
  getAgentsByLocation,
  getCallsByAgent,
  getDashboardData,
  getKpiConfigsForVersion,
  getLatestAgentVersion,
  getLatestKpiVersion,
  getOrCreateAgentVersion,
  getPendingUseActionsForLocation,
  saveKpiConfigs,
  updateAgent,
  upsertAgent,
} from "../db/queries";
import { analyzeCall } from "../lib/analysis";
import { fetchAgentById, fetchVoiceAiAgents } from "../lib/ghl/api";
import { getLLMClient } from "../lib/llm";
import { requireSession } from "../middleware/requireSession";
import { ApiError } from "../types";

const router = Router();
router.use(requireSession);

// Dashboard data
router.get("/dashboard", (req, res, next) => {
  try {
    const db = getDb();
    const locationId = req.session.locationId!;
    const agents = getDashboardData(db, locationId);
    const useActions = getPendingUseActionsForLocation(db, locationId);
    res.json({ agents, use_actions: useActions });
  } catch (err) {
    next(err);
  }
});

// Sync agents from GHL
router.post("/sync", async (req, res, next) => {
  try {
    const db = getDb();
    const locationId = req.session.locationId!;
    const ghlAgents = await fetchVoiceAiAgents(db, locationId);
    for (const a of ghlAgents) {
      upsertAgent(db, {
        location_id: locationId,
        ghl_agent_id: a.id,
        name: a.agentName,
        system_prompt: (a.agentPrompt as string | undefined) ?? undefined,
      });
    }
    res.json({ synced: ghlAgents.length });
  } catch (err) {
    next(err);
  }
});

// List agents
router.get("/", (req, res, next) => {
  try {
    const db = getDb();
    const agents = getAgentsByLocation(db, req.session.locationId!);
    res.json(agents);
  } catch (err) {
    next(err);
  }
});

// Get single agent with KPI config
router.get("/:id", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);

    const kpiVersion = getLatestKpiVersion(db, agent.id);
    const kpis = kpiVersion ? getKpiConfigsForVersion(db, kpiVersion.id) : [];

    res.json({ ...agent, kpis, kpi_version: kpiVersion?.version ?? 0 });
  } catch (err) {
    next(err);
  }
});

// Save KPI config — creates new version snapshot
router.post("/:id/kpis", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);

    const { kpis } = req.body as {
      kpis: Array<{ kpi_name: string; definition: string }>;
    };
    if (!Array.isArray(kpis) || kpis.length === 0) {
      throw new ApiError("INVALID_INPUT", "kpis must be a non-empty array");
    }

    const kpiVersion = saveKpiConfigs(db, agent.id, kpis);
    // Create/match agent version so the calls tab reflects this config change immediately
    const savedKpis = getKpiConfigsForVersion(db, kpiVersion.id);
    getOrCreateAgentVersion(db, agent.id, savedKpis, null);
    res.json({ ok: true, version: kpiVersion.version });
  } catch (err) {
    next(err);
  }
});

// LLM-suggest KPIs from system prompt
router.post("/:id/suggest-kpis", async (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);

    const { system_prompt } = req.body as { system_prompt?: string };
    const prompt = system_prompt ?? agent.system_prompt ?? "";

    const llm = getLLMClient();
    const suggestions = await llm.suggestKPIs(prompt);
    res.json(suggestions);
  } catch (err) {
    next(err);
  }
});

// Update agent (name, system_prompt)
router.patch("/:id", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);

    const { name, system_prompt } = req.body as {
      name?: string;
      system_prompt?: string;
    };
    updateAgent(db, agent.id, req.session.locationId!, { name, system_prompt });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Re-analyze all calls for this agent (after KPI config change)
router.post("/:id/analyze-all", async (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);

    const calls = db
      .prepare("SELECT id FROM calls WHERE agent_id = ? AND analysis_status = 'done'")
      .all(agent.id) as Array<{ id: string }>;

    // Reset to pending then re-analyze in background
    db.prepare(
      "UPDATE calls SET analysis_status = 'pending' WHERE agent_id = ?",
    ).run(agent.id);

    res.json({ ok: true, queued: calls.length });

    for (const call of calls) {
      await analyzeCall(db, call.id);
    }
  } catch (err) {
    next(err);
  }
});

// Current GHL agent settings (live fetch)
router.get("/:id/settings", async (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);
    if (!agent.ghl_agent_id) throw new ApiError("NO_GHL_ID", "Agent has no GHL ID", 400);

    const settings = await fetchAgentById(db, req.session.locationId!, agent.ghl_agent_id);
    if (!settings) throw new ApiError("GHL_API_ERROR", "Could not fetch agent from GHL", 502);

    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// Agent versions list
router.get("/:id/versions", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);
    res.json(getAgentVersions(db, agent.id));
  } catch (err) {
    next(err);
  }
});

// Calls for agent with optional version filter
router.get("/:id/calls", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);

    // ?version=<id> filters to that version; omit or "all" returns all calls
    const versionId = req.query.version && req.query.version !== "all"
      ? (req.query.version as string)
      : undefined;

    const calls = getCallsByAgent(db, agent.id, req.session.locationId!, versionId, 200);
    res.json(calls);
  } catch (err) {
    next(err);
  }
});

// Per-KPI pass/fail stats across all analyzed calls
router.get("/:id/kpi-stats", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);

    const rows = db.prepare(`
      SELECT
        json_extract(je.value, '$.kpi')    AS kpi_name,
        COUNT(*)                           AS total,
        SUM(CASE WHEN json_extract(je.value, '$.passed') = 1 THEN 1 ELSE 0 END) AS passed,
        SUM(CASE
          WHEN json_extract(je.value, '$.passed') = 1
           AND json_extract(je.value, '$.score') IS NOT NULL
           AND kc.threshold IS NOT NULL
           AND CAST(json_extract(je.value, '$.score') AS REAL) <= kc.threshold
          THEN 1 ELSE 0
        END) AS warn
      FROM analyses a
      JOIN calls c ON c.id = a.call_id,
           json_each(a.kpi_scores_json) je
      LEFT JOIN kpi_configs kc
        ON kc.version_id = a.kpi_config_version_id
       AND kc.kpi_name = json_extract(je.value, '$.kpi')
      WHERE c.agent_id = ? AND a.error IS NULL
      GROUP BY kpi_name
    `).all(agent.id) as Array<{ kpi_name: string; total: number; passed: number; warn: number }>;

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// All recommendations for an agent (across calls), optionally filtered by version
router.get("/:id/recommendations", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);

    const versionId = req.query.version && req.query.version !== "all"
      ? (req.query.version as string)
      : undefined;

    const recs = db.prepare(`
      SELECT r.id, r.target_kpi_name, r.action, r.suggested_change,
             r.target_type, r.priority, r.status, r.agent_field,
             r.current_value, r.suggested_value, r.transcript_timestamp,
             r.updated_prompt,
             c.id as call_id,
             an.combined_prompt
      FROM recommendations r
      JOIN analyses an ON an.id = r.analysis_id
      JOIN calls c ON c.id = an.call_id
      WHERE c.agent_id = ? AND c.location_id = ?
        AND (${versionId ? "c.agent_version_id = ?" : "1=1"})
      ORDER BY
        CASE r.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
        r.rowid DESC
    `).all(...[agent.id, req.session.locationId!, ...(versionId ? [versionId] : [])]) as Array<Record<string, unknown>>;

    res.json(recs);
  } catch (err) {
    next(err);
  }
});

// All pending use-actions for an agent, across all versions
router.get("/:id/use-actions", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);

    const rows = db.prepare(`
      SELECT ua.id, ua.reason, ua.transcript_timestamp, ua.action_required, ua.status,
             c.id as call_id,
             av.id as agent_version_id,
             av.version as agent_version,
             av.created_at as version_created_at
      FROM use_actions ua
      JOIN analyses an ON an.id = ua.analysis_id
      JOIN calls c ON c.id = an.call_id
      LEFT JOIN agent_versions av ON av.id = c.agent_version_id
      WHERE c.agent_id = ? AND c.location_id = ? AND ua.status = 'pending'
      ORDER BY COALESCE(av.version, 0) DESC, ua.rowid DESC
    `).all(agent.id, req.session.locationId!) as Array<Record<string, unknown>>;

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
