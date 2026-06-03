import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";

vi.mock("../../../server/src/db/init", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../server/src/db/init")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("../../../server/src/lib/llm/index", () => ({
  getLLMClient: vi.fn(),
}));

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
import { getLLMClient } from "../../../server/src/lib/llm/index";
import { createTestDb } from "../../helpers/db";
import { buildTestApp } from "../../helpers/app";
import { makeAuthHeader, TEST_LOCATION_ID } from "../../helpers/auth";

const app = buildTestApp();

function seedAgent(
  db: Database.Database,
  opts: { locationId?: string; mode?: string; active?: boolean; ghlAgentId?: string } = {},
): string {
  const agentId = randomUUID();
  db.prepare(`
    INSERT INTO agents (id, location_id, ghl_agent_id, name, system_prompt, configured, active, mode)
    VALUES (?, ?, ?, 'Test Agent', 'You are a helpful agent.', 1, ?, ?)
  `).run(
    agentId,
    opts.locationId ?? TEST_LOCATION_ID,
    opts.ghlAgentId ?? randomUUID(),
    opts.active !== false ? 1 : 0,
    opts.mode ?? "manual",
  );
  return agentId;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

describe("auth enforcement", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("GET /api/agents/dashboard returns 401 without auth", async () => {
    const res = await request(app).get("/api/agents/dashboard");
    expect(res.status).toBe(401);
  });

  it("GET /api/agents/ returns 401 without auth", async () => {
    const res = await request(app).get("/api/agents/");
    expect(res.status).toBe(401);
  });
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

describe("GET /api/agents/dashboard", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("returns the expected shape", async () => {
    const res = await request(app)
      .get("/api/agents/dashboard")
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      agents: expect.any(Array),
      use_actions: expect.any(Array),
      pending_recs: expect.any(Array),
    });
  });

  it("includes only agents for the authenticated location", async () => {
    seedAgent(db);
    seedAgent(db);
    seedAgent(db, { locationId: "other-loc" });

    const res = await request(app)
      .get("/api/agents/dashboard")
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(2);
  });

  it("returns empty arrays when no agents exist", async () => {
    const res = await request(app)
      .get("/api/agents/dashboard")
      .set("Authorization", makeAuthHeader());

    expect(res.body.agents).toHaveLength(0);
    expect(res.body.use_actions).toHaveLength(0);
    expect(res.body.pending_recs).toHaveLength(0);
  });
});

// ── List agents ───────────────────────────────────────────────────────────────

describe("GET /api/agents/", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("lists agents for the authenticated location", async () => {
    seedAgent(db);
    seedAgent(db);

    const res = await request(app)
      .get("/api/agents/")
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("does not return agents from other locations", async () => {
    seedAgent(db, { locationId: "other-loc" });

    const res = await request(app)
      .get("/api/agents/")
      .set("Authorization", makeAuthHeader());

    expect(res.body).toHaveLength(0);
  });
});

// ── Get single agent ──────────────────────────────────────────────────────────

describe("GET /api/agents/:id", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("returns 404 for a non-existent agent", async () => {
    const res = await request(app)
      .get(`/api/agents/${randomUUID()}`)
      .set("Authorization", makeAuthHeader());
    expect(res.status).toBe(404);
  });

  it("returns agent details with kpis, mode, and kpi_version fields", async () => {
    const agentId = seedAgent(db, { mode: "auto" });

    const res = await request(app)
      .get(`/api/agents/${agentId}`)
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: agentId,
      mode: "auto",
      kpis: expect.any(Array),
      kpi_version: expect.any(Number),
      kpi_suggestions: expect.any(Array),
    });
  });

  it("returns 404 when agent belongs to a different location", async () => {
    const agentId = seedAgent(db, { locationId: "other-loc" });

    const res = await request(app)
      .get(`/api/agents/${agentId}`)
      .set("Authorization", makeAuthHeader());
    expect(res.status).toBe(404);
  });
});

// ── KPI config ────────────────────────────────────────────────────────────────

describe("POST /api/agents/:id/kpis", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("saves KPIs and returns version 1 on first save", async () => {
    const agentId = seedAgent(db);

    const res = await request(app)
      .post(`/api/agents/${agentId}/kpis`)
      .set("Authorization", makeAuthHeader())
      .send({ kpis: [{ kpi_name: "greeting_check", definition: "Agent greeted the caller." }] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, version: 1 });
  });

  it("increments the version on each subsequent save", async () => {
    const agentId = seedAgent(db);

    await request(app)
      .post(`/api/agents/${agentId}/kpis`)
      .set("Authorization", makeAuthHeader())
      .send({ kpis: [{ kpi_name: "kpi_one", definition: "First." }] });

    const res = await request(app)
      .post(`/api/agents/${agentId}/kpis`)
      .set("Authorization", makeAuthHeader())
      .send({ kpis: [{ kpi_name: "kpi_two", definition: "Second." }] });

    expect(res.body.version).toBe(2);
  });

  it("returns 400 when kpis array is empty", async () => {
    const agentId = seedAgent(db);

    const res = await request(app)
      .post(`/api/agents/${agentId}/kpis`)
      .set("Authorization", makeAuthHeader())
      .send({ kpis: [] });

    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown agent", async () => {
    const res = await request(app)
      .post(`/api/agents/${randomUUID()}/kpis`)
      .set("Authorization", makeAuthHeader())
      .send({ kpis: [{ kpi_name: "test", definition: "test" }] });

    expect(res.status).toBe(404);
  });
});

// ── Mode toggle ───────────────────────────────────────────────────────────────

describe("PATCH /api/agents/:id/mode", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("switches agent mode to auto", async () => {
    const agentId = seedAgent(db, { mode: "manual" });

    const res = await request(app)
      .patch(`/api/agents/${agentId}/mode`)
      .set("Authorization", makeAuthHeader())
      .send({ mode: "auto" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, mode: "auto" });
    const row = db.prepare("SELECT mode FROM agents WHERE id = ?").get(agentId) as any;
    expect(row.mode).toBe("auto");
  });

  it("switches agent mode back to manual", async () => {
    const agentId = seedAgent(db, { mode: "auto" });

    const res = await request(app)
      .patch(`/api/agents/${agentId}/mode`)
      .set("Authorization", makeAuthHeader())
      .send({ mode: "manual" });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("manual");
  });

  it("returns 400 for an invalid mode value", async () => {
    const agentId = seedAgent(db);

    const res = await request(app)
      .patch(`/api/agents/${agentId}/mode`)
      .set("Authorization", makeAuthHeader())
      .send({ mode: "turbo" });

    expect(res.status).toBe(400);
  });
});

// ── Active toggle ─────────────────────────────────────────────────────────────

describe("PATCH /api/agents/:id/active", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("activates an inactive agent", async () => {
    const agentId = seedAgent(db, { active: false });

    const res = await request(app)
      .patch(`/api/agents/${agentId}/active`)
      .set("Authorization", makeAuthHeader())
      .send({ active: true });

    expect(res.status).toBe(200);
    const row = db.prepare("SELECT active FROM agents WHERE id = ?").get(agentId) as any;
    expect(row.active).toBe(1);
  });

  it("deactivates an active agent", async () => {
    const agentId = seedAgent(db, { active: true });

    await request(app)
      .patch(`/api/agents/${agentId}/active`)
      .set("Authorization", makeAuthHeader())
      .send({ active: false });

    const row = db.prepare("SELECT active FROM agents WHERE id = ?").get(agentId) as any;
    expect(row.active).toBe(0);
  });
});

// ── Calls list ────────────────────────────────────────────────────────────────

describe("GET /api/agents/:id/calls", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("returns an empty array when agent has no calls", async () => {
    const agentId = seedAgent(db);

    const res = await request(app)
      .get(`/api/agents/${agentId}/calls`)
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns calls belonging to the agent", async () => {
    const agentId = seedAgent(db);
    db.prepare(`
      INSERT INTO calls (id, agent_id, location_id, ghl_call_id, transcript, metadata, source)
      VALUES (?, ?, ?, ?, 'Hello world transcript', '{}', 'seed')
    `).run(randomUUID(), agentId, TEST_LOCATION_ID, "ghl-call-x");

    const res = await request(app)
      .get(`/api/agents/${agentId}/calls`)
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

// ── KPI suggestions ───────────────────────────────────────────────────────────

describe("POST /api/agents/:id/suggest-kpis", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(getLLMClient).mockReturnValue({
      suggestKPIs: vi.fn().mockResolvedValue([
        {
          kpi_name: "greeting_check",
          definition: "Agent greeted the caller.",
          rationale: "Sets the tone.",
          type: "binary",
          threshold: 1,
        },
      ]),
    } as any);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("returns KPI suggestions from the LLM", async () => {
    const agentId = seedAgent(db);

    const res = await request(app)
      .post(`/api/agents/${agentId}/suggest-kpis`)
      .set("Authorization", makeAuthHeader())
      .send({ system_prompt: "You are a dental booking agent." });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].kpi_name).toBe("greeting_check");
  });
});

// ── Success criteria ──────────────────────────────────────────────────────────

describe("PATCH /api/agents/:id/success-criteria", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it("saves success criteria and GET returns it", async () => {
    const agentId = seedAgent(db);
    const criteria = "Book at least one appointment per call.";

    await request(app)
      .patch(`/api/agents/${agentId}/success-criteria`)
      .set("Authorization", makeAuthHeader())
      .send({ success_criteria: criteria });

    const res = await request(app)
      .get(`/api/agents/${agentId}/success-criteria`)
      .set("Authorization", makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.success_criteria).toBe(criteria);
  });
});
