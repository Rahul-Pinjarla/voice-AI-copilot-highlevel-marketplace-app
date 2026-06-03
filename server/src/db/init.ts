import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { env } from "../lib/env";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = path.resolve(env.DB_PATH);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  migrate(_db);
  runAlterMigrations(_db);
  resetStuckAnalyses(_db);

  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS installations (
      location_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      scopes TEXT NOT NULL DEFAULT '',
      installed_at INTEGER NOT NULL DEFAULT (unixepoch()),
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      location_id TEXT NOT NULL,
      ghl_agent_id TEXT,
      name TEXT NOT NULL,
      system_prompt TEXT,
      configured INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(location_id, ghl_agent_id)
    );

    CREATE TABLE IF NOT EXISTS kpi_config_versions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      version INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(agent_id, version)
    );

    CREATE TABLE IF NOT EXISTS kpi_configs (
      id TEXT PRIMARY KEY,
      version_id TEXT NOT NULL REFERENCES kpi_config_versions(id),
      kpi_name TEXT NOT NULL,
      definition TEXT NOT NULL,
      UNIQUE(version_id, kpi_name)
    );

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      location_id TEXT NOT NULL,
      ghl_call_id TEXT NOT NULL,
      transcript TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      ingested_at INTEGER NOT NULL DEFAULT (unixepoch()),
      source TEXT NOT NULL DEFAULT 'webhook',
      analysis_status TEXT NOT NULL DEFAULT 'pending',
      UNIQUE(location_id, ghl_call_id)
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      call_id TEXT NOT NULL REFERENCES calls(id),
      kpi_config_version_id TEXT REFERENCES kpi_config_versions(id),
      kpi_scores_json TEXT NOT NULL DEFAULT '[]',
      overall_score REAL,
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS call_agent_snapshots (
      id TEXT PRIMARY KEY,
      call_id TEXT NOT NULL REFERENCES calls(id),
      snapshot_json TEXT NOT NULL,
      captured_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES analyses(id),
      target_kpi_name TEXT NOT NULL,
      action TEXT NOT NULL,
      suggested_change TEXT,
      target_type TEXT NOT NULL DEFAULT 'prompt',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      applied_at INTEGER,
      transcript_timestamp TEXT,
      agent_field TEXT,
      current_value TEXT,
      suggested_value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_recommendations_analysis
      ON recommendations(analysis_id, target_kpi_name);

    CREATE TABLE IF NOT EXISTS use_actions (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES analyses(id),
      reason TEXT NOT NULL,
      transcript_timestamp TEXT,
      action_required TEXT NOT NULL DEFAULT 'human_followup',
      status TEXT NOT NULL DEFAULT 'pending',
      handled_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS webhook_errors (
      id TEXT PRIMARY KEY,
      raw_payload TEXT NOT NULL,
      error TEXT NOT NULL,
      received_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

function runAlterMigrations(db: Database.Database): void {
  const recCols = (db.prepare("PRAGMA table_info(recommendations)").all() as Array<{ name: string }>).map((c) => c.name);
  if (!recCols.includes("agent_field")) {
    db.exec("ALTER TABLE recommendations ADD COLUMN agent_field TEXT;");
    db.exec("ALTER TABLE recommendations ADD COLUMN current_value TEXT;");
    db.exec("ALTER TABLE recommendations ADD COLUMN suggested_value TEXT;");
  }
  if (!recCols.includes("updated_prompt")) {
    db.exec("ALTER TABLE recommendations ADD COLUMN updated_prompt TEXT;");
  }
  if (!recCols.includes("auto_applied")) {
    db.exec("ALTER TABLE recommendations ADD COLUMN auto_applied INTEGER NOT NULL DEFAULT 0;");
  }
  if (!recCols.includes("base_prompt")) {
    db.exec("ALTER TABLE recommendations ADD COLUMN base_prompt TEXT;");
  }

  const analysisCols = (db.prepare("PRAGMA table_info(analyses)").all() as Array<{ name: string }>).map((c) => c.name);
  if (!analysisCols.includes("combined_prompt")) {
    db.exec("ALTER TABLE analyses ADD COLUMN combined_prompt TEXT;");
  }
  if (!analysisCols.includes("ai_summary")) {
    db.exec("ALTER TABLE analyses ADD COLUMN ai_summary TEXT;");
  }

  const kpiCols = (db.prepare("PRAGMA table_info(kpi_configs)").all() as Array<{ name: string }>).map((c) => c.name);
  if (!kpiCols.includes("type")) {
    db.exec("ALTER TABLE kpi_configs ADD COLUMN type TEXT NOT NULL DEFAULT 'binary';");
    db.exec("ALTER TABLE kpi_configs ADD COLUMN threshold REAL NOT NULL DEFAULT 1;");
  }

  // Agent version table — unified KPI + settings versioning
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_versions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      version INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      kpi_snapshot_json TEXT NOT NULL DEFAULT '[]',
      settings_snapshot_json TEXT,
      changes_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(agent_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_versions_agent ON agent_versions(agent_id, version DESC);
  `);

  const agentCols = (db.prepare("PRAGMA table_info(agents)").all() as Array<{ name: string }>).map((c) => c.name);
  if (!agentCols.includes("active")) {
    db.exec("ALTER TABLE agents ADD COLUMN active INTEGER NOT NULL DEFAULT 0;");
  }
  if (!agentCols.includes("mode")) {
    db.exec("ALTER TABLE agents ADD COLUMN mode TEXT NOT NULL DEFAULT 'manual';");
  }
  if (!agentCols.includes("success_criteria")) {
    db.exec("ALTER TABLE agents ADD COLUMN success_criteria TEXT;");
  }
  if (!agentCols.includes("kpi_suggestions_json")) {
    db.exec("ALTER TABLE agents ADD COLUMN kpi_suggestions_json TEXT;");
  }

  const callCols = (db.prepare("PRAGMA table_info(calls)").all() as Array<{ name: string }>).map((c) => c.name);
  if (!callCols.includes("agent_version_id")) {
    db.exec("ALTER TABLE calls ADD COLUMN agent_version_id TEXT REFERENCES agent_versions(id);");
  }

  const useActionCols = (db.prepare("PRAGMA table_info(use_actions)").all() as Array<{ name: string }>).map((c) => c.name);
  if (!useActionCols.includes("what_to_change")) {
    db.exec("ALTER TABLE use_actions ADD COLUMN what_to_change TEXT;");
    db.exec("ALTER TABLE use_actions ADD COLUMN why TEXT;");
  }

  // Backfill: create v1 agent_versions for agents that have KPI configs but no version yet
  const unversioned = db.prepare(`
    SELECT DISTINCT kcv.agent_id
    FROM kpi_config_versions kcv
    WHERE NOT EXISTS (SELECT 1 FROM agent_versions av WHERE av.agent_id = kcv.agent_id)
  `).all() as Array<{ agent_id: string }>;

  for (const { agent_id } of unversioned) {
    const latestVer = db.prepare(
      "SELECT id FROM kpi_config_versions WHERE agent_id = ? ORDER BY version DESC LIMIT 1"
    ).get(agent_id) as { id: string } | undefined;
    if (!latestVer) continue;
    const kpis = db.prepare("SELECT kpi_name, definition, type, threshold FROM kpi_configs WHERE version_id = ?")
      .all(latestVer.id) as Array<{ kpi_name: string; definition: string; type: string; threshold: number }>;
    const kpiNorm = [...kpis].sort((a, b) => a.kpi_name.localeCompare(b.kpi_name))
      .map((k) => ({ n: k.kpi_name, d: k.definition, t: k.type, th: k.threshold }));
    const fingerprint = JSON.stringify({ kpis: kpiNorm, settings: null });
    const changes = kpis.map((k) => ({ type: "kpi_added", kpi_name: k.kpi_name, kpi_type: k.type, threshold: k.threshold }));
    const id = randomUUID();
    db.prepare(
      `INSERT OR IGNORE INTO agent_versions (id, agent_id, version, fingerprint, kpi_snapshot_json, settings_snapshot_json, changes_json)
       VALUES (?, ?, 1, ?, ?, NULL, ?)`
    ).run(id, agent_id, fingerprint, JSON.stringify(kpis), JSON.stringify(changes));
  }
}

function resetStuckAnalyses(db: Database.Database): void {
  const reset = db.prepare(
    "UPDATE calls SET analysis_status = 'pending' WHERE analysis_status = 'running'",
  );
  const result = reset.run();
  if (result.changes > 0) {
    console.log(`[db] Reset ${result.changes} stuck analyses to pending`);
  }
}

export function createFreshDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  runAlterMigrations(db);
  resetStuckAnalyses(db);
  return db;
}
