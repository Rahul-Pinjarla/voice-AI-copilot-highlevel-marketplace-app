import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import type {
  Agent,
  AgentSettings,
  AgentVersion,
  Analysis,
  Call,
  Installation,
  KpiConfig,
  KpiConfigVersion,
  Recommendation,
  UseAction,
  VersionChange,
} from "../types";

// ── Installations ─────────────────────────────────────────────────────────────

export function upsertInstallation(
  db: Database.Database,
  data: Omit<Installation, "installed_at" | "status">,
): void {
  db.prepare(`
    INSERT INTO installations (location_id, access_token, refresh_token, expires_at, scopes, status)
    VALUES (@location_id, @access_token, @refresh_token, @expires_at, @scopes, 'active')
    ON CONFLICT(location_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      scopes = excluded.scopes,
      status = 'active'
  `).run(data);
}

export function getInstallation(
  db: Database.Database,
  locationId: string,
): Installation | null {
  return (
    (db
      .prepare("SELECT * FROM installations WHERE location_id = ?")
      .get(locationId) as Installation | undefined) ?? null
  );
}

export function updateTokens(
  db: Database.Database,
  locationId: string,
  tokens: { access_token: string; refresh_token: string; expires_at: number },
): void {
  db.prepare(`
    UPDATE installations SET access_token = ?, refresh_token = ?, expires_at = ? WHERE location_id = ?
  `).run(tokens.access_token, tokens.refresh_token, tokens.expires_at, locationId);
}

export function markInstallationExpired(db: Database.Database, locationId: string): void {
  db.prepare("UPDATE installations SET status = 'expired' WHERE location_id = ?").run(locationId);
}

export function softDeleteInstallation(db: Database.Database, locationId: string): void {
  db.prepare("UPDATE installations SET status = 'uninstalled' WHERE location_id = ?").run(
    locationId,
  );
}

// ── Agents ─────────────────────────────────────────────────────────────────────

type AgentRow = Omit<Agent, "active"> & { active: number };

function coerceAgent(row: AgentRow): Agent {
  return { ...row, active: Boolean(row.active) };
}

export function upsertAgent(
  db: Database.Database,
  data: {
    location_id: string;
    ghl_agent_id: string;
    name?: string;
    system_prompt?: string;
  },
): Agent {
  const existing = db
    .prepare("SELECT * FROM agents WHERE location_id = ? AND ghl_agent_id = ?")
    .get(data.location_id, data.ghl_agent_id) as Agent | undefined;

  if (existing) {
    const newName = data.name ?? existing.name;
    if (newName !== existing.name || (data.system_prompt !== undefined && data.system_prompt !== existing.system_prompt)) {
      db.prepare("UPDATE agents SET name = ?, system_prompt = COALESCE(?, system_prompt) WHERE id = ?")
        .run(newName, data.system_prompt ?? null, existing.id);
    }
    return coerceAgent(db.prepare("SELECT * FROM agents WHERE id = ?").get(existing.id) as AgentRow);
  }

  const id = randomUUID();
  db.prepare(`
    INSERT OR IGNORE INTO agents (id, location_id, ghl_agent_id, name, system_prompt, active)
    VALUES (@id, @location_id, @ghl_agent_id, @name, @system_prompt, 0)
  `).run({ id, ...data, name: data.name ?? "Unknown Agent", system_prompt: data.system_prompt ?? null });

  return coerceAgent(db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow);
}

export function getAgentsByLocation(db: Database.Database, locationId: string): Agent[] {
  return (db
    .prepare("SELECT * FROM agents WHERE location_id = ? ORDER BY created_at DESC")
    .all(locationId) as Array<AgentRow>).map(coerceAgent);
}

export function getAgent(
  db: Database.Database,
  agentId: string,
  locationId: string,
): Agent | null {
  const row = db
    .prepare("SELECT * FROM agents WHERE id = ? AND location_id = ?")
    .get(agentId, locationId) as (AgentRow) | undefined;
  return row ? coerceAgent(row) : null;
}

export function updateAgent(
  db: Database.Database,
  agentId: string,
  locationId: string,
  data: Partial<Pick<Agent, "name" | "system_prompt" | "configured">>,
): void {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  if (data.name !== undefined) { setClauses.push("name = ?"); values.push(data.name); }
  if (data.system_prompt !== undefined) { setClauses.push("system_prompt = ?"); values.push(data.system_prompt); }
  if (data.configured !== undefined) { setClauses.push("configured = ?"); values.push(data.configured ? 1 : 0); }
  if (setClauses.length === 0) return;
  db.prepare(`UPDATE agents SET ${setClauses.join(", ")} WHERE id = ? AND location_id = ?`)
    .run(...values, agentId, locationId);
}

// ── KPI configs ───────────────────────────────────────────────────────────────

export function getLatestKpiVersion(
  db: Database.Database,
  agentId: string,
): KpiConfigVersion | null {
  return (
    (db
      .prepare(
        "SELECT * FROM kpi_config_versions WHERE agent_id = ? ORDER BY version DESC LIMIT 1",
      )
      .get(agentId) as KpiConfigVersion | undefined) ?? null
  );
}

export function getKpiConfigsForVersion(
  db: Database.Database,
  versionId: string,
): KpiConfig[] {
  return db
    .prepare("SELECT * FROM kpi_configs WHERE version_id = ?")
    .all(versionId) as KpiConfig[];
}

export function saveKpiConfigs(
  db: Database.Database,
  agentId: string,
  kpis: Array<{ kpi_name: string; definition: string; type?: "binary" | "score"; threshold?: number }>,
): KpiConfigVersion {
  const latest = getLatestKpiVersion(db, agentId);
  const nextVersion = (latest?.version ?? 0) + 1;
  const versionId = randomUUID();

  const insertVersion = db.prepare(
    "INSERT INTO kpi_config_versions (id, agent_id, version) VALUES (?, ?, ?)",
  );
  const insertKpi = db.prepare(
    "INSERT INTO kpi_configs (id, version_id, kpi_name, definition, type, threshold) VALUES (?, ?, ?, ?, ?, ?)",
  );

  db.transaction(() => {
    insertVersion.run(versionId, agentId, nextVersion);
    for (const kpi of kpis) {
      insertKpi.run(randomUUID(), versionId, kpi.kpi_name, kpi.definition, kpi.type ?? "binary", kpi.threshold ?? 1);
    }
    db.prepare("UPDATE agents SET configured = 1 WHERE id = ?").run(agentId);
  })();

  return { id: versionId, agent_id: agentId, version: nextVersion, created_at: Date.now() / 1000 };
}

// ── Calls ─────────────────────────────────────────────────────────────────────

export function insertCallIfNew(
  db: Database.Database,
  data: {
    id: string;
    agent_id: string;
    location_id: string;
    ghl_call_id: string;
    transcript: string | null;
    metadata: string;
    source: Call["source"];
    agent_version_id?: string | null;
  },
): { inserted: boolean } {
  const result = db.prepare(`
    INSERT OR IGNORE INTO calls (id, agent_id, location_id, ghl_call_id, transcript, metadata, source, agent_version_id)
    VALUES (@id, @agent_id, @location_id, @ghl_call_id, @transcript, @metadata, @source, @agent_version_id)
  `).run({ ...data, agent_version_id: data.agent_version_id ?? null });
  return { inserted: result.changes > 0 };
}

export function getCallsByAgent(
  db: Database.Database,
  agentId: string,
  locationId: string,
  versionId?: string | null,
  limit = 50,
): Array<Call & {
  overall_score: number | null;
  analysis_id: string | null;
  kpi_scores_json: string | null;
  summary: string | null;
  duration: number | null;
  caller_number: string | null;
}> {
  const versionFilter = versionId != null
    ? "AND c.agent_version_id = ?"
    : "";
  const params: unknown[] = versionId != null
    ? [agentId, locationId, versionId, limit]
    : [agentId, locationId, limit];

  return db.prepare(`
    SELECT
      c.*,
      CASE WHEN a.overall_score IS NOT NULL THEN MIN(1.0, MAX(0.0, a.overall_score)) END AS overall_score,
      a.id          AS analysis_id,
      a.kpi_scores_json,
      json_extract(c.metadata, '$.summary')      AS summary,
      json_extract(c.metadata, '$.duration')     AS duration,
      json_extract(c.metadata, '$.callerNumber') AS caller_number
    FROM calls c
    LEFT JOIN analyses a ON a.call_id = c.id
      AND a.id = (SELECT id FROM analyses WHERE call_id = c.id ORDER BY created_at DESC LIMIT 1)
    WHERE c.agent_id = ? AND c.location_id = ? ${versionFilter}
    ORDER BY c.ingested_at DESC
    LIMIT ?
  `).all(...params) as Array<Call & {
    overall_score: number | null;
    analysis_id: string | null;
    kpi_scores_json: string | null;
    summary: string | null;
    duration: number | null;
    caller_number: string | null;
  }>;
}

export function getCall(
  db: Database.Database,
  callId: string,
  locationId: string,
): Call | null {
  return (
    (db
      .prepare("SELECT * FROM calls WHERE id = ? AND location_id = ?")
      .get(callId, locationId) as Call | undefined) ?? null
  );
}

export function updateCallStatus(
  db: Database.Database,
  callId: string,
  status: Call["analysis_status"],
): void {
  db.prepare("UPDATE calls SET analysis_status = ? WHERE id = ?").run(status, callId);
}

export function getPendingCalls(db: Database.Database, locationId: string): Call[] {
  return db
    .prepare(
      "SELECT * FROM calls WHERE location_id = ? AND analysis_status = 'pending' LIMIT 10",
    )
    .all(locationId) as Call[];
}

// ── Analyses ──────────────────────────────────────────────────────────────────

export function insertAnalysis(
  db: Database.Database,
  data: Omit<Analysis, "created_at">,
): void {
  db.prepare(`
    INSERT INTO analyses (id, call_id, kpi_config_version_id, kpi_scores_json, overall_score, error, combined_prompt, ai_summary)
    VALUES (@id, @call_id, @kpi_config_version_id, @kpi_scores_json, @overall_score, @error, @combined_prompt, @ai_summary)
  `).run(data);
}

export function getAnalysisForCall(
  db: Database.Database,
  callId: string,
): Analysis | null {
  return (
    (db
      .prepare("SELECT * FROM analyses WHERE call_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(callId) as Analysis | undefined) ?? null
  );
}

// ── Recommendations ───────────────────────────────────────────────────────────

export function insertRecommendations(
  db: Database.Database,
  recs: Omit<Recommendation, "status" | "applied_at">[],
): void {
  const stmt = db.prepare(`
    INSERT INTO recommendations (id, analysis_id, target_kpi_name, action, suggested_change, target_type, priority, transcript_timestamp, agent_field, current_value, suggested_value, updated_prompt)
    VALUES (@id, @analysis_id, @target_kpi_name, @action, @suggested_change, @target_type, @priority, @transcript_timestamp, @agent_field, @current_value, @suggested_value, @updated_prompt)
  `);
  db.transaction(() => {
    for (const rec of recs) {
      const row = rec as typeof rec & { agent_field?: string | null; current_value?: string | null; suggested_value?: string | null; updated_prompt?: string | null };
      stmt.run({
        ...row,
        agent_field: row.agent_field ?? null,
        current_value: row.current_value ?? null,
        suggested_value: row.suggested_value ?? null,
        updated_prompt: row.updated_prompt ?? null,
      });
    }
  })();
}

// ── Call Agent Snapshots ──────────────────────────────────────────────────────

export function upsertCallAgentSnapshot(
  db: Database.Database,
  snapshot: { call_id: string; snapshot_json: string },
): void {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO call_agent_snapshots (id, call_id, snapshot_json)
    VALUES (?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(id, snapshot.call_id, snapshot.snapshot_json);
}

export function getCallAgentSnapshot(
  db: Database.Database,
  callId: string,
): { snapshot_json: string } | null {
  return (
    (db
      .prepare("SELECT snapshot_json FROM call_agent_snapshots WHERE call_id = ?")
      .get(callId) as { snapshot_json: string } | undefined) ?? null
  );
}

export function getRecommendationsForAnalysis(
  db: Database.Database,
  analysisId: string,
): Recommendation[] {
  return db
    .prepare("SELECT * FROM recommendations WHERE analysis_id = ?")
    .all(analysisId) as Recommendation[];
}

export function updateRecommendationStatus(
  db: Database.Database,
  recId: string,
  status: "applied" | "dismissed",
): void {
  const appliedAt = status === "applied" ? Math.floor(Date.now() / 1000) : null;
  db.prepare("UPDATE recommendations SET status = ?, applied_at = ? WHERE id = ?").run(
    status,
    appliedAt,
    recId,
  );
}

// ── Use Actions ───────────────────────────────────────────────────────────────

export function insertUseActions(
  db: Database.Database,
  actions: Omit<UseAction, "status" | "handled_at">[],
): void {
  const stmt = db.prepare(`
    INSERT INTO use_actions (id, analysis_id, reason, what_to_change, why, transcript_timestamp, action_required)
    VALUES (@id, @analysis_id, @reason, @what_to_change, @why, @transcript_timestamp, @action_required)
  `);
  db.transaction(() => {
    for (const action of actions) stmt.run(action);
  })();
}

export function getUseActionsForAnalysis(
  db: Database.Database,
  analysisId: string,
): UseAction[] {
  return db
    .prepare("SELECT * FROM use_actions WHERE analysis_id = ?")
    .all(analysisId) as UseAction[];
}

export function handleUseAction(db: Database.Database, actionId: string): void {
  db.prepare(
    "UPDATE use_actions SET status = 'handled', handled_at = unixepoch() WHERE id = ?",
  ).run(actionId);
}

export function getPendingUseActionsForLocation(
  db: Database.Database,
  locationId: string,
  limit = 20,
): Array<UseAction & { call_id: string; agent_id: string; agent_name: string; agent_version: number | null; version_created_at: number | null }> {
  return db.prepare(`
    SELECT ua.*, c.id as call_id, ag.id as agent_id, ag.name as agent_name,
           av.version as agent_version, av.created_at as version_created_at
    FROM use_actions ua
    JOIN analyses an ON an.id = ua.analysis_id
    JOIN calls c ON c.id = an.call_id
    JOIN agents ag ON ag.id = c.agent_id
    LEFT JOIN agent_versions av ON av.id = c.agent_version_id
    WHERE c.location_id = ? AND ua.status = 'pending'
    ORDER BY ua.rowid DESC
    LIMIT ?
  `).all(locationId, limit) as Array<UseAction & { call_id: string; agent_id: string; agent_name: string; agent_version: number | null; version_created_at: number | null }>;
}

export function getPendingRecommendationsForLocation(
  db: Database.Database,
  locationId: string,
  limit = 20,
): Array<{
  id: string; target_kpi_name: string; action: string; suggested_change: string | null;
  target_type: string; priority: string; auto_applied: boolean;
  call_id: string; agent_id: string; agent_name: string;
  agent_version: number | null; version_created_at: number | null;
}> {
  return db.prepare(`
    SELECT r.id, r.target_kpi_name, r.action, r.suggested_change, r.target_type,
           r.priority, r.auto_applied,
           c.id as call_id, ag.id as agent_id, ag.name as agent_name,
           av.version as agent_version, av.created_at as version_created_at
    FROM recommendations r
    JOIN analyses an ON an.id = r.analysis_id
    JOIN calls c ON c.id = an.call_id
    JOIN agents ag ON ag.id = c.agent_id
    LEFT JOIN agent_versions av ON av.id = c.agent_version_id
    WHERE ag.location_id = ? AND r.status = 'pending'
    ORDER BY COALESCE(av.version, 0) DESC,
             CASE r.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
             r.rowid DESC
    LIMIT ?
  `).all(locationId, limit) as Array<{
    id: string; target_kpi_name: string; action: string; suggested_change: string | null;
    target_type: string; priority: string; auto_applied: boolean;
    call_id: string; agent_id: string; agent_name: string;
    agent_version: number | null; version_created_at: number | null;
  }>;
}

// ── Dashboard aggregate ───────────────────────────────────────────────────────

export interface DashboardAgent {
  id: string;
  name: string;
  configured: number;
  active: boolean;
  calls_today: number;
  pass_rate: number | null;
  last_call_score: number | null;
  top_failing_kpi: string | null;
  active_recs: number;
}

export function getDashboardData(
  db: Database.Database,
  locationId: string,
): DashboardAgent[] {
  const todayStart = Math.floor(Date.now() / 1000) - 86400;

  return db.prepare(`
    SELECT
      ag.id,
      ag.name,
      ag.configured,
      ag.active,
      COUNT(DISTINCT CASE WHEN c.ingested_at >= @todayStart THEN c.id END) as calls_today,
      AVG(CASE WHEN an.overall_score IS NOT NULL THEN MIN(1.0, MAX(0.0, an.overall_score)) END) as pass_rate,
      (
        SELECT MIN(1.0, MAX(0.0, a2.overall_score))
        FROM calls c2
        JOIN analyses a2 ON a2.call_id = c2.id
        WHERE c2.agent_id = ag.id AND a2.overall_score IS NOT NULL
        ORDER BY c2.ingested_at DESC
        LIMIT 1
      ) as last_call_score,
      (
        SELECT r2.target_kpi_name
        FROM recommendations r2
        JOIN analyses a2 ON a2.id = r2.analysis_id
        JOIN calls c2 ON c2.id = a2.call_id
        WHERE c2.agent_id = ag.id AND r2.status = 'pending'
        GROUP BY r2.target_kpi_name
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) as top_failing_kpi,
      COUNT(DISTINCT CASE WHEN r.status = 'pending' THEN r.id END) as active_recs
    FROM agents ag
    LEFT JOIN calls c ON c.agent_id = ag.id AND c.location_id = @locationId
    LEFT JOIN analyses an ON an.call_id = c.id
      AND an.id = (SELECT id FROM analyses WHERE call_id = c.id ORDER BY created_at DESC LIMIT 1)
    LEFT JOIN recommendations r ON r.analysis_id = an.id
    WHERE ag.location_id = @locationId
    GROUP BY ag.id
    ORDER BY ag.created_at DESC
  `).all({ locationId, todayStart }) as DashboardAgent[];
}

// ── Agent versions ────────────────────────────────────────────────────────────

type KpiSnapshot = Pick<KpiConfig, "kpi_name" | "definition" | "type" | "threshold">;

function computeFingerprint(kpis: KpiSnapshot[], settings: AgentSettings | null): string {
  const kpiNorm = [...kpis]
    .sort((a, b) => a.kpi_name.localeCompare(b.kpi_name))
    .map((k) => ({ n: k.kpi_name, d: k.definition, t: k.type, th: k.threshold }));
  const settingsNorm = settings
    ? {
        prompt: settings.agentPrompt,
        welcome: settings.welcomeMessage,
        maxDur: settings.maxCallDuration,
        resp: settings.responsiveness,
        idle: settings.sendUserIdleReminders,
        idleT: settings.reminderAfterIdleTimeSeconds,
        strict: settings.toolCallStrictMode,
        xlat: settings.translation.enabled,
      }
    : null;
  return JSON.stringify({ kpis: kpiNorm, settings: settingsNorm });
}

function computeChanges(
  prevKpis: KpiSnapshot[],
  prevSettings: AgentSettings | null,
  newKpis: KpiSnapshot[],
  newSettings: AgentSettings | null,
): VersionChange[] {
  const changes: VersionChange[] = [];
  const prevMap = new Map(prevKpis.map((k) => [k.kpi_name, k]));
  const newMap = new Map(newKpis.map((k) => [k.kpi_name, k]));

  for (const [name, k] of newMap) {
    if (!prevMap.has(name)) changes.push({ type: "kpi_added", kpi_name: name, kpi_type: k.type, threshold: k.threshold });
  }
  for (const [name] of prevMap) {
    if (!newMap.has(name)) changes.push({ type: "kpi_removed", kpi_name: name });
  }
  for (const [name, nk] of newMap) {
    const pk = prevMap.get(name);
    if (!pk) continue;
    const fields: string[] = [];
    if (pk.definition !== nk.definition) fields.push("definition");
    if (pk.type !== nk.type) fields.push("type");
    if (pk.threshold !== nk.threshold) fields.push("threshold");
    if (fields.length) changes.push({ type: "kpi_modified", kpi_name: name, fields });
  }

  if (prevSettings && newSettings) {
    const checks: Array<[keyof AgentSettings, string]> = [
      ["agentPrompt", "Agent Prompt"],
      ["welcomeMessage", "Welcome Message"],
      ["maxCallDuration", "Max Call Duration"],
      ["responsiveness", "Responsiveness"],
      ["sendUserIdleReminders", "Idle Reminders"],
      ["reminderAfterIdleTimeSeconds", "Idle Reminder Delay"],
      ["toolCallStrictMode", "Strict Mode"],
    ];
    for (const [field, label] of checks) {
      const from = String(prevSettings[field] ?? "");
      const to = String(newSettings[field] ?? "");
      if (from !== to) changes.push({ type: "setting_changed", field: label, from, to });
    }
  }
  return changes;
}

export function getOrCreateAgentVersion(
  db: Database.Database,
  agentId: string,
  kpis: KpiSnapshot[],
  settings: AgentSettings | null,
): AgentVersion {
  const fingerprint = computeFingerprint(kpis, settings);

  const latest = db
    .prepare("SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version DESC LIMIT 1")
    .get(agentId) as AgentVersion | undefined;

  if (latest && latest.fingerprint === fingerprint) return latest;

  const prevKpis: KpiSnapshot[] = latest ? (JSON.parse(latest.kpi_snapshot_json) as KpiSnapshot[]) : [];
  const prevSettings: AgentSettings | null = latest?.settings_snapshot_json
    ? (JSON.parse(latest.settings_snapshot_json) as AgentSettings)
    : null;

  // For the very first version, list all KPIs as "added"
  const changes = prevKpis.length === 0 && !latest
    ? kpis.map((k): VersionChange => ({ type: "kpi_added", kpi_name: k.kpi_name, kpi_type: k.type, threshold: k.threshold }))
    : computeChanges(prevKpis, prevSettings, kpis, settings);

  const nextVersion = (latest?.version ?? 0) + 1;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO agent_versions (id, agent_id, version, fingerprint, kpi_snapshot_json, settings_snapshot_json, changes_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, agentId, nextVersion, fingerprint, JSON.stringify(kpis), settings ? JSON.stringify(settings) : null, JSON.stringify(changes));

  return { id, agent_id: agentId, version: nextVersion, fingerprint, kpi_snapshot_json: JSON.stringify(kpis), settings_snapshot_json: settings ? JSON.stringify(settings) : null, changes_json: JSON.stringify(changes), created_at: Math.floor(Date.now() / 1000) };
}

export function getAgentVersions(
  db: Database.Database,
  agentId: string,
): AgentVersion[] {
  return db.prepare(`
    SELECT av.*, COUNT(c.id) AS call_count
    FROM agent_versions av
    LEFT JOIN calls c ON c.agent_version_id = av.id
    WHERE av.agent_id = ?
    GROUP BY av.id
    ORDER BY av.version DESC
  `).all(agentId) as AgentVersion[];
}

export function getLatestAgentVersion(
  db: Database.Database,
  agentId: string,
): AgentVersion | null {
  return (db
    .prepare("SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version DESC LIMIT 1")
    .get(agentId) as AgentVersion | undefined) ?? null;
}

// ── Agent mutations ───────────────────────────────────────────────────────────

export function updateAgentMode(
  db: Database.Database,
  agentId: string,
  locationId: string,
  mode: "manual" | "auto",
): void {
  db.prepare("UPDATE agents SET mode = ? WHERE id = ? AND location_id = ?").run(mode, agentId, locationId);
}

export function updateAgentActive(
  db: Database.Database,
  agentId: string,
  locationId: string,
  active: boolean,
): void {
  db.prepare("UPDATE agents SET active = ? WHERE id = ? AND location_id = ?").run(active ? 1 : 0, agentId, locationId);
}

export function updateAgentSuccessCriteria(
  db: Database.Database,
  agentId: string,
  locationId: string,
  criteria: string,
): void {
  db.prepare("UPDATE agents SET success_criteria = ? WHERE id = ? AND location_id = ?").run(criteria, agentId, locationId);
}

export function updateAgentKpiSuggestions(
  db: Database.Database,
  agentId: string,
  locationId: string,
  json: string,
): void {
  db.prepare("UPDATE agents SET kpi_suggestions_json = ? WHERE id = ? AND location_id = ?").run(json, agentId, locationId);
}

export function updateAgentSystemPrompt(
  db: Database.Database,
  agentId: string,
  prompt: string,
): void {
  db.prepare("UPDATE agents SET system_prompt = ? WHERE id = ?").run(prompt, agentId);
}

// ── Call mutations ────────────────────────────────────────────────────────────

export function getDoneCallIdsAndResetAll(
  db: Database.Database,
  agentId: string,
): string[] {
  const calls = db
    .prepare("SELECT id FROM calls WHERE agent_id = ? AND analysis_status = 'done'")
    .all(agentId) as Array<{ id: string }>;
  db.prepare("UPDATE calls SET analysis_status = 'pending' WHERE agent_id = ?").run(agentId);
  return calls.map((c) => c.id);
}

// ── Use action mutations ──────────────────────────────────────────────────────

export function dismissUseAction(db: Database.Database, actionId: string): void {
  db.prepare("UPDATE use_actions SET status = 'dismissed' WHERE id = ?").run(actionId);
}

// ── Recommendation queries ────────────────────────────────────────────────────

export interface RecommendationWithContext {
  id: string;
  target_type: string;
  agent_field: string | null;
  suggested_value: string | null;
  updated_prompt: string | null;
  action: string;
  suggested_change: string | null;
  analysis_id: string;
  location_id: string;
  ghl_agent_id: string | null;
  agent_id: string;
}

export function getRecommendationWithContext(
  db: Database.Database,
  recId: string,
  locationId: string,
): RecommendationWithContext | null {
  return (db.prepare(`
    SELECT r.id, r.target_type, r.agent_field, r.suggested_value, r.updated_prompt,
           r.action, r.suggested_change, r.analysis_id,
           c.location_id, ag.ghl_agent_id, ag.id as agent_id
    FROM recommendations r
    JOIN analyses an ON an.id = r.analysis_id
    JOIN calls c ON c.id = an.call_id
    JOIN agents ag ON ag.id = c.agent_id
    WHERE r.id = ? AND c.location_id = ?
  `).get(recId, locationId) as RecommendationWithContext | undefined) ?? null;
}

export interface RecommendationForAgent {
  id: string;
  target_type: string;
  agent_field: string | null;
  suggested_value: string | null;
  updated_prompt: string | null;
  action: string;
  suggested_change: string | null;
  analysis_id: string;
}

export function getRecommendationForAgent(
  db: Database.Database,
  recId: string,
  agentId: string,
  locationId: string,
): RecommendationForAgent | null {
  return (db.prepare(`
    SELECT r.id, r.target_type, r.agent_field, r.suggested_value, r.updated_prompt,
           r.action, r.suggested_change, r.analysis_id
    FROM recommendations r
    JOIN analyses an ON an.id = r.analysis_id
    JOIN calls c ON c.id = an.call_id
    WHERE r.id = ? AND c.agent_id = ? AND c.location_id = ?
  `).get(recId, agentId, locationId) as RecommendationForAgent | undefined) ?? null;
}

export function markRecommendationAutoApplied(db: Database.Database, recId: string): void {
  db.prepare(
    "UPDATE recommendations SET status = 'applied', auto_applied = 1, applied_at = unixepoch() WHERE id = ?",
  ).run(recId);
}

// ── Use action queries ────────────────────────────────────────────────────────

export function getUseActionForLocation(
  db: Database.Database,
  actionId: string,
  locationId: string,
): { id: string } | null {
  return (db.prepare(`
    SELECT ua.id FROM use_actions ua
    JOIN analyses an ON an.id = ua.analysis_id
    JOIN calls c ON c.id = an.call_id
    WHERE ua.id = ? AND c.location_id = ?
  `).get(actionId, locationId) as { id: string } | undefined) ?? null;
}
