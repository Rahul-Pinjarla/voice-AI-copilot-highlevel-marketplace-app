import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";

vi.mock("../../../server/src/db/init", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../server/src/db/init")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("../../../server/src/lib/analysis", () => ({
  analyzeCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../server/src/lib/ghl/api", () => ({
  GHL_AGENT_UPDATABLE_FIELDS: new Set([]),
  fetchAgentById: vi.fn().mockResolvedValue(null),
  fetchVoiceAiAgents: vi.fn().mockResolvedValue([]),
  updateGhlAgent: vi.fn().mockResolvedValue({ ok: true }),
}));

import { getDb } from "../../../server/src/db/init";
import { analyzeCall } from "../../../server/src/lib/analysis";
import { createTestDb } from "../../helpers/db";
import { buildTestApp } from "../../helpers/app";
import { makeAuthHeader, TEST_LOCATION_ID } from "../../helpers/auth";

const app = buildTestApp();

function seedAgent(db: Database.Database): string {
  const agentId = randomUUID();
  db.prepare(`
    INSERT INTO agents (id, location_id, ghl_agent_id, name, configured, active, mode)
    VALUES (?, ?, ?, 'Agent', 1, 1, 'manual')
  `).run(agentId, TEST_LOCATION_ID, randomUUID());
  return agentId;
}

function seedCall(db: Database.Database, agentId: string, locationId = TEST_LOCATION_ID): string {
  const callId = randomUUID();
  db.prepare(`
    INSERT INTO calls (id, agent_id, location_id, ghl_call_id, transcript, metadata, source, analysis_status)
    VALUES (?, ?, ?, ?, 'Hello world transcript text.', '{}', 'seed', 'done')
  `).run(callId, agentId, locationId, randomUUID());
  return callId;
}

// ── GET /api/calls/:id ────────────────────────────────────────────────────────

describe("GET /api/calls/:id", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("returns 404 for a non-existent call", async () => {
    const res = await request(app)
      .get(`/api/calls/${randomUUID()}`)
      .set("Authorization", makeAuthHeader());
    expect(res.status).toBe(404);
  });

  it("returns call details with null analysis when no analysis exists", async () => {
    const agentId = seedAgent(db);
    const callId = seedCall(db, agentId);

    const res = await request(app)
      .get(`/api/calls/${callId}`)
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(callId);
    expect(res.body.analysis).toBeNull();
    expect(res.body.recommendations).toEqual([]);
    expect(res.body.use_actions).toEqual([]);
    expect(res.body.agent_snapshot).toBeNull();
  });

  it("returns call with analysis and kpi_scores when analysis exists", async () => {
    const agentId = seedAgent(db);
    const callId = seedCall(db, agentId);
    const analysisId = randomUUID();
    db.prepare(`
      INSERT INTO analyses (id, call_id, kpi_scores_json, overall_score)
      VALUES (?, ?, '[{"kpi":"greeting","passed":true}]', 0.8)
    `).run(analysisId, callId);

    const res = await request(app)
      .get(`/api/calls/${callId}`)
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.analysis).not.toBeNull();
    expect(res.body.analysis.overall_score).toBeCloseTo(0.8);
    expect(res.body.analysis.kpi_scores).toHaveLength(1);
  });

  it("includes recommendations when analysis has recommendations", async () => {
    const agentId = seedAgent(db);
    const callId = seedCall(db, agentId);
    const analysisId = randomUUID();
    db.prepare(`INSERT INTO analyses (id, call_id, kpi_scores_json, overall_score) VALUES (?, ?, '[]', 0.5)`).run(
      analysisId,
      callId,
    );
    db.prepare(`
      INSERT INTO recommendations (id, analysis_id, target_kpi_name, action, target_type, priority)
      VALUES (?, ?, 'kpi_test', 'Fix it', 'prompt', 'high')
    `).run(randomUUID(), analysisId);

    const res = await request(app)
      .get(`/api/calls/${callId}`)
      .set("Authorization", makeAuthHeader());

    expect(res.body.recommendations).toHaveLength(1);
    expect(res.body.recommendations[0].priority).toBe("high");
  });

  it("returns 404 for a call belonging to a different location", async () => {
    const agentId = randomUUID();
    db.prepare(`
      INSERT INTO agents (id, location_id, ghl_agent_id, name, configured, active, mode)
      VALUES (?, 'other-loc', ?, 'Agent', 1, 1, 'manual')
    `).run(agentId, randomUUID());
    const callId = seedCall(db, agentId, "other-loc");

    const res = await request(app)
      .get(`/api/calls/${callId}`)
      .set("Authorization", makeAuthHeader(TEST_LOCATION_ID));
    expect(res.status).toBe(404);
  });

  it("includes agent_snapshot when one was captured at call time", async () => {
    const agentId = seedAgent(db);
    const callId = seedCall(db, agentId);
    const snapshot = { agentPrompt: "Test prompt", welcomeMessage: "Hello" };
    db.prepare(`
      INSERT INTO call_agent_snapshots (id, call_id, snapshot_json)
      VALUES (?, ?, ?)
    `).run(randomUUID(), callId, JSON.stringify(snapshot));

    const res = await request(app)
      .get(`/api/calls/${callId}`)
      .set("Authorization", makeAuthHeader());

    expect(res.body.agent_snapshot).toMatchObject({ agentPrompt: "Test prompt" });
  });
});

// ── POST /api/calls/:id/analyze ───────────────────────────────────────────────

describe("POST /api/calls/:id/analyze", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(analyzeCall).mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("returns 200 ok and calls analyzeCall with the correct call id", async () => {
    const agentId = seedAgent(db);
    const callId = seedCall(db, agentId);

    const res = await request(app)
      .post(`/api/calls/${callId}/analyze`)
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // analyzeCall runs async after the response; wait one tick
    await new Promise<void>((r) => setImmediate(r));
    expect(vi.mocked(analyzeCall)).toHaveBeenCalledWith(db, callId);
  });

  it("returns 404 for a non-existent call", async () => {
    const res = await request(app)
      .post(`/api/calls/${randomUUID()}/analyze`)
      .set("Authorization", makeAuthHeader());
    expect(res.status).toBe(404);
  });
});
