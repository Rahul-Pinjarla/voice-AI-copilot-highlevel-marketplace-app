export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

function authHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("sso_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders(), ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { code: "UNKNOWN", message: res.statusText } })) as { error: ApiError };
    const err = new Error(body.error?.message ?? "Request failed") as Error & { code: string; statusCode: number };
    err.code = body.error?.code ?? "UNKNOWN";
    err.statusCode = res.status;
    throw err;
  }

  return res.json() as Promise<T>;
}

// SSO
export const api = {
  sso: {
    verify: (encrypted: string) =>
      request<{ ok: boolean; locationId: string; token?: string }>("/api/sso/verify", {
        method: "POST",
        body: JSON.stringify({ encrypted }),
      }),
    context: () =>
      request<{ locationId: string; userId: string; role: string }>("/api/sso/context"),
  },

  dashboard: {
    get: () =>
      request<{ agents: DashboardAgent[]; use_actions: UseActionWithContext[] }>("/api/agents/dashboard"),
  },

  agents: {
    sync: () => request<{ synced: number }>("/api/agents/sync", { method: "POST" }),
    list: () => request<Agent[]>("/api/agents"),
    get: (id: string) => request<AgentWithKpis>(`/api/agents/${id}`),
    updateKpis: (id: string, kpis: KpiInput[]) =>
      request<{ ok: boolean; version: number }>(`/api/agents/${id}/kpis`, {
        method: "POST",
        body: JSON.stringify({ kpis }),
      }),
    suggestKpis: (id: string, systemPrompt: string) =>
      request<KpiSuggestion[]>(`/api/agents/${id}/suggest-kpis`, {
        method: "POST",
        body: JSON.stringify({ system_prompt: systemPrompt }),
      }),
    update: (id: string, data: { name?: string; system_prompt?: string }) =>
      request<{ ok: boolean }>(`/api/agents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    kpiStats: (id: string) => request<KpiStat[]>(`/api/agents/${id}/kpi-stats`),
    versions: (id: string) => request<AgentVersion[]>(`/api/agents/${id}/versions`),
    settings: (id: string) => request<GhlAgentSettings>(`/api/agents/${id}/settings`),
    analyzeAll: (id: string) =>
      request<{ ok: boolean; queued: number }>(`/api/agents/${id}/analyze-all`, { method: "POST" }),
    recommendations: (id: string, versionId?: string) =>
      request<AgentRecommendation[]>(`/api/agents/${id}/recommendations${versionId ? `?version=${versionId}` : ""}`),
    useActions: (id: string) => request<AgentUseAction[]>(`/api/agents/${id}/use-actions`),
  },

  calls: {
    listForAgent: (agentId: string, versionId?: string) =>
      request<CallWithScore[]>(`/api/agents/${agentId}/calls${versionId ? `?version=${versionId}` : ""}`),
    get: (id: string) => request<CallDetail>(`/api/calls/${id}`),
    analyze: (id: string) =>
      request<{ ok: boolean }>(`/api/calls/${id}/analyze`, { method: "POST" }),
  },

  recommendations: {
    apply: (id: string) =>
      request<{ ok: boolean }>(`/api/recommendations/${id}/apply`, { method: "POST" }),
    dismiss: (id: string) =>
      request<{ ok: boolean }>(`/api/recommendations/${id}/dismiss`, { method: "POST" }),
    handleUseAction: (id: string) =>
      request<{ ok: boolean }>(`/api/recommendations/use-actions/${id}/handle`, { method: "POST" }),
    dismissUseAction: (id: string) =>
      request<{ ok: boolean }>(`/api/recommendations/use-actions/${id}/dismiss`, { method: "POST" }),
  },

  backfill: {
    check: () =>
      request<{ needsBackfill: boolean; latestGhlId: string | null; latestDbId: string | null; running: boolean }>("/api/backfill/check"),
    start: () => request<{ ok: boolean }>("/api/backfill", { method: "POST" }),
    status: () => request<{ running: boolean }>("/api/backfill/status"),
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DashboardAgent {
  id: string;
  name: string;
  configured: number;
  calls_today: number;
  pass_rate: number | null;
  top_failing_kpi: string | null;
  active_recs: number;
}

export interface UseActionWithContext {
  id: string;
  reason: string;
  transcript_timestamp: string | null;
  action_required: string;
  status: string;
  call_id: string;
  agent_id: string;
  agent_name: string;
}

export interface Agent {
  id: string;
  name: string;
  configured: number;
  ghl_agent_id: string | null;
  system_prompt: string | null;
}

export interface KpiInput {
  kpi_name: string;
  definition: string;
  type: "binary" | "score";
  threshold: number;
}

export interface KpiConfig extends KpiInput {
  id: string;
  version_id: string;
}

export interface KpiSuggestion {
  kpi_name: string;
  definition: string;
  rationale: string;
  type: "binary" | "score";
  threshold: number;
}

export interface AgentWithKpis extends Agent {
  kpis: KpiConfig[];
  kpi_version: number;
}

export interface CallWithScore {
  id: string;
  ghl_call_id: string;
  transcript: string | null;
  ingested_at: number;
  source: string;
  analysis_status: string;
  overall_score: number | null;
  analysis_id: string | null;
  kpi_scores_json: string | null;
  summary: string | null;
  duration: number | null;
  caller_number: string | null;
  agent_version_id: string | null;
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
  kpi_snapshot_json: string;
  settings_snapshot_json: string | null;
  changes_json: string;
  created_at: number;
  call_count: number;
}

export interface KpiStat {
  kpi_name: string;
  total: number;
  passed: number;
  warn: number;
}

export interface KpiScore {
  kpi: string;
  passed: boolean;
  score?: number;
  confidence: number;
  evidence: string;
}

export interface Recommendation {
  id: string;
  analysis_id: string;
  target_kpi_name: string;
  action: string;
  suggested_change: string | null;
  target_type: string;
  priority: string;
  status: string;
  applied_at: number | null;
  transcript_timestamp: string | null;
  agent_field: string | null;
  current_value: string | null;
  suggested_value: string | null;
  updated_prompt: string | null;
}

export interface UseAction {
  id: string;
  reason: string;
  transcript_timestamp: string | null;
  action_required: string;
  status: string;
}

export interface GhlAgentSettings {
  id: string;
  agentName: string;
  businessName?: string;
  welcomeMessage: string;
  agentPrompt: string;
  voiceId: string;
  responsiveness: number;
  maxCallDuration: number;
  sendUserIdleReminders: boolean;
  reminderAfterIdleTimeSeconds: number;
  timezone: string;
  toolCallStrictMode: boolean;
  translation: { enabled: boolean };
  inboundNumbers: string[];
  callEndWorkflowIds: string[];
  actions: Array<{
    id: string;
    actionType: string;
    name: string;
    actionParameters: { triggerPrompt?: string; messageBody?: string; [key: string]: unknown };
  }>;
}

export interface AgentSnapshot {
  agentPrompt: string;
  welcomeMessage: string;
  maxCallDuration: number;
  responsiveness: number;
  sendUserIdleReminders: boolean;
  reminderAfterIdleTimeSeconds: number;
  actions: Array<{ id: string; actionType: string; name: string; actionParameters: Record<string, unknown> }>;
  translation: { enabled: boolean };
  toolCallStrictMode: boolean;
}

export interface AgentUseAction {
  id: string;
  reason: string;
  transcript_timestamp: string | null;
  action_required: string;
  status: string;
  call_id: string;
  agent_version_id: string | null;
  agent_version: number | null;
  version_created_at: number | null;
}

export interface AgentRecommendation {
  id: string;
  target_kpi_name: string;
  action: string;
  suggested_change: string | null;
  target_type: string;
  priority: string;
  status: string;
  agent_field: string | null;
  current_value: string | null;
  suggested_value: string | null;
  transcript_timestamp: string | null;
  call_id: string;
  updated_prompt: string | null;
  combined_prompt: string | null;
}

export interface CallDetail extends CallWithScore {
  agent_snapshot: AgentSnapshot | null;
  analysis: {
    id: string;
    overall_score: number | null;
    kpi_scores: KpiScore[];
    error: string | null;
    created_at: number;
    combined_prompt: string | null;
  } | null;
  recommendations: Recommendation[];
  use_actions: UseAction[];
}

