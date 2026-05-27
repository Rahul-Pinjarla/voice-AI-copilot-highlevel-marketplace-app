import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { insertUseActions, updateAgentSystemPrompt } from "../db/queries";
import { GHL_AGENT_UPDATABLE_FIELDS, updateGhlAgent } from "./ghl/api";

export interface RecordToApply {
  id: string;
  target_type: string;
  agent_field: string | null;
  suggested_value: string | null;
  updated_prompt: string | null;
  action: string;
  suggested_change: string | null;
  analysis_id: string;
}

export interface ApplyOutcome {
  appliedToGhl: boolean;
  actionItemCreated: boolean;
}

function coerceFieldValue(field: string, rawValue: string): unknown {
  if (["maxCallDuration", "responsiveness", "reminderAfterIdleTimeSeconds"].includes(field)) {
    return Number(rawValue);
  }
  if (field === "sendUserIdleReminders") return rawValue === "true";
  return rawValue;
}

export async function applyRecommendation(
  db: Database.Database,
  rec: RecordToApply,
  locationId: string,
  ghlAgentId: string | null,
  agentId: string,
): Promise<ApplyOutcome> {
  let appliedToGhl = false;
  let actionItemCreated = false;

  if (rec.target_type === "agent_config" && rec.agent_field && rec.suggested_value && ghlAgentId) {
    const field = rec.agent_field;
    if (!GHL_AGENT_UPDATABLE_FIELDS.has(field)) {
      insertUseActions(db, [{
        id: randomUUID(),
        analysis_id: rec.analysis_id,
        reason: `Update "${field}" manually in GHL agent settings to: ${rec.suggested_value}`,
        what_to_change: `Update "${field}" manually in GHL agent settings to: ${rec.suggested_value}`,
        why: `The field "${field}" cannot be auto-applied via the GHL API and requires manual configuration.`,
        transcript_timestamp: "",
        action_required: "human_followup",
      }]);
      actionItemCreated = true;
    } else {
      const { ok } = await updateGhlAgent(db, locationId, ghlAgentId, {
        [field]: coerceFieldValue(field, rec.suggested_value),
      });
      appliedToGhl = ok;
    }
  } else if (rec.target_type === "prompt" && ghlAgentId) {
    if (rec.updated_prompt) {
      const { ok } = await updateGhlAgent(db, locationId, ghlAgentId, { agentPrompt: rec.updated_prompt });
      if (ok) {
        updateAgentSystemPrompt(db, agentId, rec.updated_prompt);
        appliedToGhl = true;
      }
    } else {
      const whatMsg = `${rec.action}${rec.suggested_change ? ` — ${rec.suggested_change}` : ""}`;
      insertUseActions(db, [{
        id: randomUUID(),
        analysis_id: rec.analysis_id,
        reason: whatMsg,
        what_to_change: whatMsg,
        why: "A full updated prompt was not generated. Apply this change manually in the GHL agent settings.",
        transcript_timestamp: "",
        action_required: "human_followup",
      }]);
      actionItemCreated = true;
    }
  } else if (rec.target_type === "script_step") {
    const whatMsg = `${rec.action}${rec.suggested_change ? ` — ${rec.suggested_change}` : ""}`;
    insertUseActions(db, [{
      id: randomUUID(),
      analysis_id: rec.analysis_id,
      reason: whatMsg,
      what_to_change: whatMsg,
      why: "This improvement requires manual configuration in the GHL UI and cannot be auto-applied.",
      transcript_timestamp: "",
      action_required: "human_followup",
    }]);
    actionItemCreated = true;
  }

  return { appliedToGhl, actionItemCreated };
}
