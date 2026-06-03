import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";

vi.mock("../../../server/src/db/init", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../server/src/db/init")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("../../../server/src/lib/ghl/api", () => ({
  GHL_AGENT_UPDATABLE_FIELDS: new Set([
    "welcomeMessage",
    "maxCallDuration",
    "responsiveness",
    "sendUserIdleReminders",
    "reminderAfterIdleTimeSeconds",
  ]),
  fetchAgentById: vi.fn().mockResolvedValue(null),
  fetchVoiceAiAgents: vi.fn().mockResolvedValue([]),
  updateGhlAgent: vi.fn().mockResolvedValue({ ok: true }),
}));

import { getDb } from "../../../server/src/db/init";
import { updateGhlAgent } from "../../../server/src/lib/ghl/api";
import { createTestDb } from "../../helpers/db";
import { buildTestApp } from "../../helpers/app";
import { makeAuthHeader, TEST_LOCATION_ID } from "../../helpers/auth";

const app = buildTestApp();

interface ScenarioIds {
  agentId: string;
  callId: string;
  analysisId: string;
  promptRecId: string;
  configRecId: string;
  useActionId: string;
}

function seedScenario(db: Database.Database): ScenarioIds {
  const agentId = randomUUID();
  db.prepare(`
    INSERT INTO agents (id, location_id, ghl_agent_id, name, configured, active, mode)
    VALUES (?, ?, 'ghl-agent-001', 'Agent', 1, 1, 'manual')
  `).run(agentId, TEST_LOCATION_ID);

  const callId = randomUUID();
  db.prepare(`
    INSERT INTO calls (id, agent_id, location_id, ghl_call_id, transcript, metadata, source)
    VALUES (?, ?, ?, ?, 'transcript text', '{}', 'seed')
  `).run(callId, agentId, TEST_LOCATION_ID, randomUUID());

  const analysisId = randomUUID();
  db.prepare(`
    INSERT INTO analyses (id, call_id, kpi_scores_json, overall_score)
    VALUES (?, ?, '[]', 0.5)
  `).run(analysisId, callId);

  // Prompt-type recommendation (auto-applicable via updated_prompt)
  const promptRecId = randomUUID();
  db.prepare(`
    INSERT INTO recommendations (id, analysis_id, target_kpi_name, action, target_type, priority, updated_prompt)
    VALUES (?, ?, 'resolution_rate', 'Add resolution steps', 'prompt', 'high', 'Updated agent prompt here.')
  `).run(promptRecId, analysisId);

  // Config-type recommendation (auto-applicable via GHL API field)
  const configRecId = randomUUID();
  db.prepare(`
    INSERT INTO recommendations (id, analysis_id, target_kpi_name, action, target_type, priority, agent_field, current_value, suggested_value)
    VALUES (?, ?, 'response_latency', 'Reduce response delay', 'agent_config', 'medium', 'responsiveness', '1800', '500')
  `).run(configRecId, analysisId);

  const useActionId = randomUUID();
  db.prepare(`
    INSERT INTO use_actions (id, analysis_id, reason, action_required)
    VALUES (?, ?, 'Follow up with caller', 'human_followup')
  `).run(useActionId, analysisId);

  return { agentId, callId, analysisId, promptRecId, configRecId, useActionId };
}

// ── Dismiss recommendation ────────────────────────────────────────────────────

describe("POST /api/recommendations/:id/dismiss", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("marks the recommendation as dismissed", async () => {
    const { promptRecId } = seedScenario(db);

    const res = await request(app)
      .post(`/api/recommendations/${promptRecId}/dismiss`)
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const row = db
      .prepare("SELECT status FROM recommendations WHERE id = ?")
      .get(promptRecId) as any;
    expect(row.status).toBe("dismissed");
  });

  it("returns 404 for a non-existent recommendation", async () => {
    const res = await request(app)
      .post(`/api/recommendations/${randomUUID()}/dismiss`)
      .set("Authorization", makeAuthHeader());
    expect(res.status).toBe(404);
  });

  it("returns 401 without authentication", async () => {
    const { promptRecId } = seedScenario(db);
    const res = await request(app).post(`/api/recommendations/${promptRecId}/dismiss`);
    expect(res.status).toBe(401);
  });
});

// ── Apply recommendation ──────────────────────────────────────────────────────

describe("POST /api/recommendations/:id/apply", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(updateGhlAgent).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("applies an agent_config recommendation via the GHL API", async () => {
    const { configRecId } = seedScenario(db);

    const res = await request(app)
      .post(`/api/recommendations/${configRecId}/apply`)
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.appliedToGhl).toBe(true);
    expect(vi.mocked(updateGhlAgent)).toHaveBeenCalledOnce();
    expect(vi.mocked(updateGhlAgent)).toHaveBeenCalledWith(
      db,
      TEST_LOCATION_ID,
      "ghl-agent-001",
      expect.objectContaining({ responsiveness: 500 }),
    );
  });

  it("marks the recommendation as applied in the DB after a successful GHL write", async () => {
    const { configRecId } = seedScenario(db);

    await request(app)
      .post(`/api/recommendations/${configRecId}/apply`)
      .set("Authorization", makeAuthHeader());

    const row = db
      .prepare("SELECT status FROM recommendations WHERE id = ?")
      .get(configRecId) as any;
    expect(row.status).toBe("applied");
  });

  it("applies a prompt recommendation and updates agent system_prompt in DB", async () => {
    const { promptRecId, agentId } = seedScenario(db);

    const res = await request(app)
      .post(`/api/recommendations/${promptRecId}/apply`)
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.appliedToGhl).toBe(true);

    const agent = db.prepare("SELECT system_prompt FROM agents WHERE id = ?").get(agentId) as any;
    expect(agent.system_prompt).toBe("Updated agent prompt here.");
  });

  it("returns 404 for a non-existent recommendation", async () => {
    const res = await request(app)
      .post(`/api/recommendations/${randomUUID()}/apply`)
      .set("Authorization", makeAuthHeader());
    expect(res.status).toBe(404);
  });
});

// ── Dismiss use action ────────────────────────────────────────────────────────

describe("POST /api/recommendations/use-actions/:id/dismiss", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("dismisses a pending use action", async () => {
    const { useActionId } = seedScenario(db);

    const res = await request(app)
      .post(`/api/recommendations/use-actions/${useActionId}/dismiss`)
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const row = db
      .prepare("SELECT status FROM use_actions WHERE id = ?")
      .get(useActionId) as any;
    expect(row.status).toBe("dismissed");
  });

  it("returns 404 for a non-existent use action", async () => {
    const res = await request(app)
      .post(`/api/recommendations/use-actions/${randomUUID()}/dismiss`)
      .set("Authorization", makeAuthHeader());
    expect(res.status).toBe(404);
  });
});

// ── Handle use action ─────────────────────────────────────────────────────────

describe("POST /api/recommendations/use-actions/:id/handle", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("marks a use action as handled", async () => {
    const { useActionId } = seedScenario(db);

    const res = await request(app)
      .post(`/api/recommendations/use-actions/${useActionId}/handle`)
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const row = db
      .prepare("SELECT status FROM use_actions WHERE id = ?")
      .get(useActionId) as any;
    expect(row.status).toBe("handled");
  });
});
