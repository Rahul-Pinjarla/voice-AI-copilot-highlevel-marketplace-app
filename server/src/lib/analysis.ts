import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import {
  getAgent,
  getCallAgentSnapshot,
  getKpiConfigsForVersion,
  getLatestKpiVersion,
  insertAnalysis,
  insertRecommendations,
  insertUseActions,
  markRecommendationAutoApplied,
  updateCallStatus,
} from "../db/queries";
import type { AgentSettings } from "../types";
import { getLLMClient } from "./llm";
import { applyRecommendation, type RecordToApply } from "./applyRecommendation";
import { schedulePassRateCheck } from "./passRateMonitor";

export async function analyzeCall(db: Database.Database, callId: string): Promise<void> {
  const call = db
    .prepare("SELECT * FROM calls WHERE id = ?")
    .get(callId) as
    | { id: string; agent_id: string; transcript: string | null; location_id: string }
    | undefined;

  if (!call) {
    console.error(`[analysis] Call not found: ${callId}`);
    return;
  }

  if (!call.transcript || call.transcript.trim().length < 20) {
    updateCallStatus(db, callId, "skipped");
    return;
  }

  updateCallStatus(db, callId, "running");

  try {
    const kpiVersion = getLatestKpiVersion(db, call.agent_id);
    const kpis = kpiVersion ? getKpiConfigsForVersion(db, kpiVersion.id) : [];

    const snapshotRow = getCallAgentSnapshot(db, callId);
    const agentSettings: AgentSettings | null = snapshotRow
      ? (JSON.parse(snapshotRow.snapshot_json) as AgentSettings)
      : null;

    const llm = getLLMClient();
    const result = await llm.analyzeTranscript(
      call.transcript,
      kpis.map((k) => ({ kpi_name: k.kpi_name, definition: k.definition, type: k.type, threshold: k.threshold })),
      agentSettings,
    );

    const analysisId = randomUUID();
    insertAnalysis(db, {
      id: analysisId,
      call_id: callId,
      kpi_config_version_id: kpiVersion?.id ?? null,
      kpi_scores_json: JSON.stringify(result.kpi_scores),
      overall_score: result.overall_score != null ? Math.min(1, Math.max(0, result.overall_score)) : null,
      error: null,
      combined_prompt: result.combined_prompt ?? null,
      ai_summary: result.ai_summary ?? null,
    });

    if (result.recommendations.length > 0) {
      const basePrompt = agentSettings?.agentPrompt ?? null;
      insertRecommendations(
        db,
        result.recommendations.map((r) => ({
          id: randomUUID(),
          analysis_id: analysisId,
          target_kpi_name: r.target_kpi_name,
          action: r.action,
          suggested_change: r.suggested_change,
          target_type: r.target_type,
          priority: r.priority,
          auto_applied: false,
          transcript_timestamp: r.transcript_timestamp,
          agent_field: r.agent_field ?? null,
          current_value: r.current_value ?? null,
          suggested_value: r.suggested_value ?? null,
          updated_prompt: r.updated_prompt ?? null,
          base_prompt: basePrompt,
        })),
      );
    }

    const useActionsToInsert = result.use_actions.map((ua) => ({
      id: randomUUID(),
      analysis_id: analysisId,
      reason: ua.what_to_change,
      what_to_change: ua.what_to_change,
      why: ua.why,
      transcript_timestamp: ua.transcript_timestamp,
      action_required: ua.action_required,
    }));

    // System-generated action items for failed KPIs with no automatable recommendation
    const coveredKpis = new Set(result.recommendations.map((r) => r.target_kpi_name));
    for (const k of result.kpi_scores.filter((k) => !k.passed && !coveredKpis.has(k.kpi))) {
      const kpiDef = kpis.find((c) => c.kpi_name === k.kpi);
      useActionsToInsert.push({
        id: randomUUID(),
        analysis_id: analysisId,
        reason: kpiDef?.definition ?? `Review failed KPI: ${k.kpi}`,
        what_to_change: kpiDef?.definition ?? `Review failed KPI: ${k.kpi}`,
        why: k.evidence,
        transcript_timestamp: "",
        action_required: "human_followup",
      });
    }

    if (useActionsToInsert.length > 0) {
      insertUseActions(db, useActionsToInsert);
    }

    const agent = getAgent(db, call.agent_id, call.location_id);
    if (agent?.mode === "auto" && agent.ghl_agent_id && result.recommendations.length > 0) {
      const recRows = db
        .prepare("SELECT id, target_type, agent_field, suggested_value, updated_prompt, action, suggested_change, analysis_id FROM recommendations WHERE analysis_id = ?")
        .all(analysisId) as RecordToApply[];

      for (const rec of recRows) {
        try {
          const { appliedToGhl } = await applyRecommendation(
            db,
            rec,
            call.location_id,
            agent.ghl_agent_id,
            call.agent_id,
          );
          if (appliedToGhl) {
            markRecommendationAutoApplied(db, rec.id);
          }
        } catch (err) {
          console.error(`[analysis] Auto-apply failed for rec ${rec.id}:`, err);
        }
      }
    }

    updateCallStatus(db, callId, "done");
    schedulePassRateCheck(db, call.agent_id, call.location_id);
  } catch (err) {
    console.error(`[analysis] Failed for call ${callId}:`, err);
    const analysisId = randomUUID();
    insertAnalysis(db, {
      id: analysisId,
      call_id: callId,
      kpi_config_version_id: null,
      kpi_scores_json: "[]",
      overall_score: null,
      error: String(err),
      combined_prompt: null,
      ai_summary: null,
    });
    updateCallStatus(db, callId, "failed");
  }
}
