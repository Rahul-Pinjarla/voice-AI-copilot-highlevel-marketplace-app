import { Router } from "express";
import { getDb } from "../db/init";
import {
  getAgent,
  getAgentVersions,
  getAgentsByLocation,
  getCallsByAgent,
  getDashboardData,
  getDoneCallIdsAndResetAll,
  getKpiConfigsForVersion,
  getLatestAgentVersion,
  getLatestKpiVersion,
  getOrCreateAgentVersion,
  getPendingRecommendationsForLocation,
  getPendingUseActionsForLocation,
  getRecommendationForAgent,
  saveKpiConfigs,
  updateAgent,
  updateAgentActive,
  updateAgentKpiSuggestions,
  updateAgentMode,
  updateAgentSuccessCriteria,
  updateRecommendationStatus,
  upsertAgent,
} from "../db/queries";
import { analyzeCall } from "../lib/analysis";
import { applyRecommendation } from "../lib/applyRecommendation";
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
    const pendingRecs = getPendingRecommendationsForLocation(db, locationId);
    res.json({ agents, use_actions: useActions, pending_recs: pendingRecs });
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

    const kpiSuggestions = agent.kpi_suggestions_json ? JSON.parse(agent.kpi_suggestions_json as string) : [];
    res.json({ ...agent, kpis, kpi_version: kpiVersion?.version ?? 0, mode: agent.mode ?? "manual", success_criteria: agent.success_criteria ?? "", kpi_suggestions: kpiSuggestions });
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

    const callIds = getDoneCallIdsAndResetAll(db, agent.id);
    res.json({ ok: true, queued: callIds.length });

    for (const id of callIds) {
      await analyzeCall(db, id);
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

// Per-KPI pass/fail stats across all analyzed calls, optionally filtered by version
router.get("/:id/kpi-stats", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);

    const versionId = req.query.version && req.query.version !== "all"
      ? (req.query.version as string)
      : undefined;

    const rows = db.prepare(`
      SELECT
        json_extract(je.value, '$.kpi')    AS kpi_name,
        COUNT(*)                           AS total,
        SUM(CASE
          WHEN json_extract(je.value, '$.passed') = 1
           AND NOT (
             json_extract(je.value, '$.score') IS NOT NULL
             AND kc.threshold IS NOT NULL
             AND CAST(json_extract(je.value, '$.score') AS REAL) <= kc.threshold
           )
          THEN 1 ELSE 0
        END) AS passed,
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
        AND (${versionId ? "c.agent_version_id = ?" : "1=1"})
      GROUP BY kpi_name
    `).all(...[agent.id, ...(versionId ? [versionId] : [])]) as Array<{ kpi_name: string; total: number; passed: number; warn: number }>;

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

    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const recs = db.prepare(`
      SELECT r.id, r.target_kpi_name, r.action, r.suggested_change,
             r.target_type, r.priority, r.status, r.auto_applied, r.agent_field,
             r.current_value, r.suggested_value, r.transcript_timestamp,
             r.updated_prompt, r.base_prompt,
             c.id as call_id,
             an.combined_prompt,
             av.version as agent_version,
             av.created_at as version_created_at
      FROM recommendations r
      JOIN analyses an ON an.id = r.analysis_id
      JOIN calls c ON c.id = an.call_id
      LEFT JOIN agent_versions av ON av.id = c.agent_version_id
      WHERE c.agent_id = ? AND c.location_id = ?
        AND (${versionId ? "c.agent_version_id = ?" : "1=1"})
      ORDER BY
        COALESCE(av.version, 0) DESC,
        CASE r.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
        r.rowid DESC
      LIMIT ?
    `).all(...[agent.id, req.session.locationId!, ...(versionId ? [versionId] : []), limit]) as Array<Record<string, unknown>>;

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

// Get/set agent mode (manual | auto)
router.get("/:id/mode", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);
    res.json({ mode: agent.mode ?? "manual" });
  } catch (err) { next(err); }
});

router.patch("/:id/mode", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);
    const { mode } = req.body as { mode: "manual" | "auto" };
    if (mode !== "manual" && mode !== "auto") throw new ApiError("INVALID_INPUT", "mode must be manual or auto");
    updateAgentMode(db, agent.id, req.session.locationId!, mode);
    res.json({ ok: true, mode });
  } catch (err) { next(err); }
});

// Toggle per-agent analysis on/off
router.patch("/:id/active", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);
    const { active } = req.body as { active: boolean };
    updateAgentActive(db, agent.id, req.session.locationId!, active);
    res.json({ ok: true, active });
  } catch (err) { next(err); }
});

// Get/set success criteria
router.get("/:id/success-criteria", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);
    res.json({ success_criteria: agent.success_criteria ?? "" });
  } catch (err) { next(err); }
});

router.patch("/:id/success-criteria", (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);
    const { success_criteria } = req.body as { success_criteria: string };
    updateAgentSuccessCriteria(db, agent.id, req.session.locationId!, success_criteria ?? "");
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Generate or refine success criteria using LLM
router.post("/:id/generate-criteria", async (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);

    const { source, input } = req.body as { source: "prompt" | "refine"; input?: string };
    const llm = getLLMClient();

    let criteria: string;
    if (source === "prompt") {
      const prompt = agent.system_prompt ?? "";
      if (!prompt.trim()) throw new ApiError("INVALID_INPUT", "Agent has no system prompt to generate from", 400);
      criteria = await llm.generateCriteriaFromPrompt(prompt);
    } else if (source === "refine") {
      if (!input?.trim()) throw new ApiError("INVALID_INPUT", "input is required for refine mode", 400);
      criteria = await llm.refineCriteria(input);
    } else {
      throw new ApiError("INVALID_INPUT", "source must be 'prompt' or 'refine'", 400);
    }

    res.json({ criteria });
  } catch (err) { next(err); }
});

// Suggest KPIs from success criteria
router.post("/:id/suggest-kpis-for-criteria", async (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);
    const { criteria } = req.body as { criteria?: string };
    const text = criteria ?? agent.success_criteria ?? "";
    if (!text.trim()) throw new ApiError("INVALID_INPUT", "criteria is required");
    const llm = getLLMClient();
    const suggestions = await llm.suggestKpisForCriteria(text);
    updateAgentKpiSuggestions(db, agent.id, req.session.locationId!, JSON.stringify(suggestions));
    res.json(suggestions);
  } catch (err) { next(err); }
});

// Apply recommendation directly to GHL agent
router.post("/:id/apply-recommendation/:recId", async (req, res, next) => {
  try {
    const db = getDb();
    const agent = getAgent(db, req.params.id, req.session.locationId!);
    if (!agent) throw new ApiError("NOT_FOUND", "Agent not found", 404);

    const rec = getRecommendationForAgent(db, req.params.recId, agent.id, req.session.locationId!);
    if (!rec) throw new ApiError("NOT_FOUND", "Recommendation not found", 404);

    const { appliedToGhl, actionItemCreated } = await applyRecommendation(
      db,
      rec,
      req.session.locationId!,
      agent.ghl_agent_id,
      agent.id,
    );

    if (appliedToGhl || actionItemCreated) {
      updateRecommendationStatus(db, rec.id, "applied");
    }

    res.json({ ok: true, appliedToGhl, actionItemCreated });
  } catch (err) { next(err); }
});

export default router;
