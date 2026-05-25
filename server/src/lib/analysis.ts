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
  updateCallStatus,
} from "../db/queries";
import type { AgentSettings } from "../types";
import { getLLMClient } from "./llm";

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

    // Load agent settings snapshot captured at call time
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
      overall_score: result.overall_score,
      error: null,
      combined_prompt: result.combined_prompt ?? null,
    });

    if (result.recommendations.length > 0) {
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
          transcript_timestamp: r.transcript_timestamp,
          agent_field: r.agent_field ?? null,
          current_value: r.current_value ?? null,
          suggested_value: r.suggested_value ?? null,
          updated_prompt: r.updated_prompt ?? null,
        })),
      );
    }

    if (result.use_actions.length > 0) {
      insertUseActions(
        db,
        result.use_actions.map((ua) => ({
          id: randomUUID(),
          analysis_id: analysisId,
          reason: ua.reason,
          transcript_timestamp: ua.transcript_timestamp,
          action_required: ua.action_required,
        })),
      );
    }

    updateCallStatus(db, callId, "done");
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
    });
    updateCallStatus(db, callId, "failed");
  }
}
