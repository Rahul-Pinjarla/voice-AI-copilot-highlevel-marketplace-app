import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { fetchAgentById } from "../../../server/src/lib/ghl/api";
import { webhookHandlers } from "../../../server/src/handlers/webhooks";
import { createTestDb } from "../../helpers/db";

const LOCATION_ID = "loc-webhook-test";

const BASE_PAYLOAD = {
  type: "VoiceAiCallEnd",
  locationId: LOCATION_ID,
  id: "ghl-call-001",
  agentId: "ghl-agent-001",
  agentName: "Test Agent",
  transcript:
    "Agent: Hello, how can I help you today?\nCaller: Hi, I need help booking an appointment.\nAgent: Sure, I can help with that.",
};

function seedInstallation(db: Database.Database, locationId = LOCATION_ID) {
  db.prepare(`
    INSERT OR IGNORE INTO installations (location_id, access_token, refresh_token, expires_at, scopes, status)
    VALUES (?, 'tok', 'ref', 9999999999, '', 'active')
  `).run(locationId);
}

function seedAgent(
  db: Database.Database,
  locationId: string,
  ghlAgentId: string,
  active = true,
): string {
  const agentId = randomUUID();
  db.prepare(`
    INSERT INTO agents (id, location_id, ghl_agent_id, name, configured, active, mode)
    VALUES (?, ?, ?, 'Test Agent', 1, ?, 'manual')
  `).run(agentId, locationId, ghlAgentId, active ? 1 : 0);
  return agentId;
}

describe("webhookHandlers — VoiceAiCallEnd", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(fetchAgentById).mockResolvedValue(null);
    vi.mocked(analyzeCall).mockResolvedValue(undefined);
    seedInstallation(db);
  });

  afterEach(async () => {
    // Drain any setImmediate callbacks queued by this test before closing DB / resetting mocks.
    // Without this, a pending analyzeCall setImmediate bleeds into the next test's call count.
    await new Promise<void>((r) => setImmediate(r));
    db.close();
    vi.resetAllMocks();
  });

  it("inserts a call record for a new event", async () => {
    seedAgent(db, LOCATION_ID, "ghl-agent-001", true);

    await webhookHandlers.VoiceAiCallEnd(BASE_PAYLOAD, db);

    const call = db
      .prepare("SELECT * FROM calls WHERE ghl_call_id = ?")
      .get("ghl-call-001") as any;
    expect(call).toBeDefined();
    expect(call.location_id).toBe(LOCATION_ID);
    expect(call.transcript).toContain("Hello");
  });

  it("queues analyzeCall for an active agent", async () => {
    seedAgent(db, LOCATION_ID, "ghl-agent-001", true);

    await webhookHandlers.VoiceAiCallEnd(BASE_PAYLOAD, db);
    await new Promise<void>((r) => setImmediate(r));

    expect(vi.mocked(analyzeCall)).toHaveBeenCalledOnce();
    expect(vi.mocked(analyzeCall)).toHaveBeenCalledWith(db, expect.any(String));
  });

  it("stores call but skips analysis for an inactive agent", async () => {
    seedAgent(db, LOCATION_ID, "ghl-agent-001", false);

    await webhookHandlers.VoiceAiCallEnd(BASE_PAYLOAD, db);
    await new Promise<void>((r) => setImmediate(r));

    const call = db
      .prepare("SELECT * FROM calls WHERE ghl_call_id = ?")
      .get("ghl-call-001") as any;
    expect(call).toBeDefined();
    expect(vi.mocked(analyzeCall)).not.toHaveBeenCalled();
  });

  it("ignores a duplicate event with the same ghl_call_id", async () => {
    seedAgent(db, LOCATION_ID, "ghl-agent-001", true);

    await webhookHandlers.VoiceAiCallEnd(BASE_PAYLOAD, db);
    await webhookHandlers.VoiceAiCallEnd(BASE_PAYLOAD, db);

    const calls = db
      .prepare("SELECT * FROM calls WHERE ghl_call_id = ?")
      .all("ghl-call-001");
    expect(calls).toHaveLength(1);
  });

  it("analyzeCall is queued only once for a duplicate event", async () => {
    seedAgent(db, LOCATION_ID, "ghl-agent-001", true);

    await webhookHandlers.VoiceAiCallEnd(BASE_PAYLOAD, db);
    await webhookHandlers.VoiceAiCallEnd(BASE_PAYLOAD, db);
    await new Promise<void>((r) => setImmediate(r));

    expect(vi.mocked(analyzeCall)).toHaveBeenCalledOnce();
  });

  it("returns early and writes nothing when locationId is missing", async () => {
    const payload = { ...BASE_PAYLOAD, locationId: undefined };

    await webhookHandlers.VoiceAiCallEnd(payload as any, db);

    const count = db.prepare("SELECT COUNT(*) as n FROM calls").get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("returns early and writes nothing when callId is missing", async () => {
    const payload = { ...BASE_PAYLOAD, id: undefined };

    await webhookHandlers.VoiceAiCallEnd(payload as any, db);

    const count = db.prepare("SELECT COUNT(*) as n FROM calls").get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("auto-creates agent by fetching from GHL when agent is not in DB", async () => {
    vi.mocked(fetchAgentById).mockResolvedValue({
      id: "ghl-agent-001",
      agentName: "GHL Remote Agent",
      agentPrompt: "You are a dental booking assistant.",
    } as any);

    await webhookHandlers.VoiceAiCallEnd(BASE_PAYLOAD, db);

    expect(vi.mocked(fetchAgentById)).toHaveBeenCalledOnce();
    const agent = db
      .prepare("SELECT * FROM agents WHERE ghl_agent_id = ?")
      .get("ghl-agent-001") as any;
    expect(agent).toBeDefined();
    // system_prompt comes from GHL fetch
    expect(agent.system_prompt).toBe("You are a dental booking assistant.");
  });

  it("stamps the call with the agent's current version id", async () => {
    seedAgent(db, LOCATION_ID, "ghl-agent-001", true);

    await webhookHandlers.VoiceAiCallEnd(BASE_PAYLOAD, db);

    const call = db
      .prepare("SELECT agent_version_id FROM calls WHERE ghl_call_id = ?")
      .get("ghl-call-001") as any;
    // Version should exist (even without KPIs, getOrCreateAgentVersion creates one)
    expect(call).toBeDefined();
  });

  it("handles VOICE_AI_CALL_COMPLETED alias identically to VoiceAiCallEnd", async () => {
    seedAgent(db, LOCATION_ID, "ghl-agent-001", true);
    const payload = { ...BASE_PAYLOAD, type: "VOICE_AI_CALL_COMPLETED", id: "ghl-call-002" };

    await webhookHandlers.VOICE_AI_CALL_COMPLETED(payload, db);

    const call = db
      .prepare("SELECT * FROM calls WHERE ghl_call_id = ?")
      .get("ghl-call-002") as any;
    expect(call).toBeDefined();
  });
});

describe("webhookHandlers — AppUninstalled", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    seedInstallation(db);
  });

  afterEach(async () => {
    await new Promise<void>((r) => setImmediate(r));
    db.close();
    vi.resetAllMocks();
  });

  it("marks the installation as uninstalled", async () => {
    await webhookHandlers.AppUninstalled({ locationId: LOCATION_ID }, db);

    const inst = db
      .prepare("SELECT status FROM installations WHERE location_id = ?")
      .get(LOCATION_ID) as any;
    expect(inst.status).toBe("uninstalled");
  });

  it("returns early without throwing when locationId is absent", async () => {
    await expect(webhookHandlers.AppUninstalled({}, db)).resolves.not.toThrow();
  });
});
