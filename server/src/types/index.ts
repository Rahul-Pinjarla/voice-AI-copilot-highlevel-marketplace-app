import type { Request } from "express";

export interface Installation {
  location_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scopes: string;
  installed_at: number;
  status: "active" | "expired" | "uninstalled";
}

export interface Agent {
  id: string;
  location_id: string;
  ghl_agent_id: string | null;
  name: string;
  system_prompt: string | null;
  configured: number;
  created_at: number;
  active: boolean;
  mode: "manual" | "auto";
  success_criteria: string | null;
  kpi_suggestions_json: string | null;
}

export interface KpiConfigVersion {
  id: string;
  agent_id: string;
  version: number;
  created_at: number;
}

export interface KpiConfig {
  id: string;
  version_id: string;
  kpi_name: string;
  definition: string;
  type: "binary" | "score";
  threshold: number;
}

export interface Call {
  id: string;
  agent_id: string;
  location_id: string;
  ghl_call_id: string;
  transcript: string | null;
  metadata: string;
  ingested_at: number;
  source: "webhook" | "backfill" | "seed";
  analysis_status: "pending" | "running" | "done" | "failed" | "skipped";
}

export interface Analysis {
  id: string;
  call_id: string;
  kpi_config_version_id: string | null;
  kpi_scores_json: string;
  overall_score: number | null;
  error: string | null;
  created_at: number;
  combined_prompt: string | null;
  ai_summary: string | null;
}

export interface Recommendation {
  id: string;
  analysis_id: string;
  target_kpi_name: string;
  action: string;
  suggested_change: string | null;
  target_type: "prompt" | "script_step" | "agent_config";
  priority: "high" | "medium" | "low";
  status: "pending" | "applied" | "dismissed";
  auto_applied: boolean;
  applied_at: number | null;
  transcript_timestamp: string | null;
  agent_field: string | null;
  current_value: string | null;
  suggested_value: string | null;
  updated_prompt: string | null;
  base_prompt: string | null;
}

export interface UseAction {
  id: string;
  analysis_id: string;
  reason: string;
  what_to_change: string | null;
  why: string | null;
  transcript_timestamp: string | null;
  action_required: "human_followup" | "script_retraining";
  status: "pending" | "handled" | "dismissed";
  handled_at: number | null;
}

export interface KpiScore {
  kpi: string;
  passed: boolean;
  score?: number;
  confidence: number;
  evidence: string;
}

// GHL agent fields that matter for analysis and recommendations
export interface AgentSettings {
  agentPrompt: string;
  welcomeMessage: string;
  maxCallDuration: number;
  responsiveness: number;
  sendUserIdleReminders: boolean;
  reminderAfterIdleTimeSeconds: number;
  actions: Array<{
    id: string;
    actionType: string;
    name: string;
    actionParameters: { triggerPrompt?: string; messageBody?: string; [key: string]: unknown };
  }>;
  translation: { enabled: boolean };
  toolCallStrictMode: boolean;
}

export interface CallAgentSnapshot {
  id: string;
  call_id: string;
  snapshot_json: string;
  captured_at: number;
}

export interface LLMRecommendation {
  priority: "high" | "medium" | "low";
  target_kpi_name: string;
  target_type: "prompt" | "agent_config";
  action: string;
  suggested_change: string;
  transcript_timestamp: string;
  agent_field?: string;
  current_value?: string;
  suggested_value?: string;
  updated_prompt?: string;
}

export interface LLMUseAction {
  what_to_change: string;
  why: string;
  transcript_timestamp: string;
  action_required: "human_followup" | "script_retraining";
}

export interface AnalysisResult {
  ai_summary: string | null;
  kpi_scores: KpiScore[];
  overall_score: number;
  recommendations: LLMRecommendation[];
  combined_prompt: string | null;
  use_actions: LLMUseAction[];
}

export type VersionChange =
  | { type: "kpi_added"; kpi_name: string; kpi_type: "binary" | "score"; threshold: number }
  | { type: "kpi_removed"; kpi_name: string }
  | { type: "kpi_modified"; kpi_name: string; fields: string[] }
  | { type: "setting_changed"; field: string; from: string; to: string };

export interface AgentVersion {
  id: string;
  agent_id: string;
  version: number;
  fingerprint: string;
  kpi_snapshot_json: string;
  settings_snapshot_json: string | null;
  changes_json: string;
  created_at: number;
  call_count?: number;
}

export interface KpiSuggestion {
  kpi_name: string;
  definition: string;
  rationale: string;
  type: "binary" | "score";
  threshold: number;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

declare module "express-session" {
  interface SessionData {
    locationId?: string;
    userId?: string;
    role?: string;
  }
}

export type AuthedRequest = Request & {
  session: Request["session"] & {
    locationId: string;
    userId: string;
    role: string;
  };
};
