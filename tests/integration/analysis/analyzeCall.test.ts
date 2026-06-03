import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    "agentWorkingHours",
    "timezone",
    "isAgentAsBackupDisabled",
  ]),
  updateGhlAgent: vi.fn().mockResolvedValue({ ok: true }),
  fetchAgentById: vi.fn().mockResolvedValue(null),
  fetchVoiceAiAgents: vi.fn().mockResolvedValue([]),
}));

import { getDb } from "../../../server/src/db/init";
import { getLLMClient } from "../../../server/src/lib/llm/index";
import { updateGhlAgent } from "../../../server/src/lib/ghl/api";
import { analyzeCall } from "../../../server/src/lib/analysis";
import { createTestDb } from "../../helpers/db";
import { mockAnalysisResult, mockCleanAnalysisResult } from "../../fixtures/analysis";

const LONG_TRANSCRIPT =
  "Agent: Hello, Bright Smile Dental. How can I help you today?\nCaller: Hi, I would like to book a new patient appointment please.\nAgent: Of course! May I have your name?\nCaller: Sarah Mitchell.\nAgent: Thank you Sarah, and your date of birth?\nCaller: March 15, 1988.";

function seedAgent(
  db: Database.Database,
  opts: {
    locationId: string;
    mode?: "manual" | "auto";
    active?: boolean;
    ghlAgentId?: string | null;
  },
): string {
  const agentId = randomUUID();
  db.prepare(`
    INSERT INTO agents (id, location_id, ghl_agent_id, name, system_prompt, configured, active, mode)
    VALUES (?, ?, ?, 'Test Agent', 'You are a test agent.', 1, ?, ?)
  `).run(
    agentId,
    opts.locationId,
    opts.ghlAgentId !== undefined ? opts.ghlAgentId : randomUUID(),
    opts.active !== false ? 1 : 0,
    opts.mode ?? "manual",
  );
  return agentId;
}

function seedCall(
  db: Database.Database,
  agentId: string,
  locationId: string,
  transcript: string | null,
): string {
  const callId = randomUUID();
  db.prepare(`
    INSERT INTO calls (id, agent_id, location_id, ghl_call_id, transcript, metadata, source, analysis_status)
    VALUES (?, ?, ?, ?, ?, '{}', 'seed', 'pending')
  `).run(callId, agentId, locationId, randomUUID(), transcript);
  return callId;
}

describe("analyzeCall", () => {
  const locationId = "loc-analysis-test";
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(getLLMClient).mockReturnValue({
      analyzeTranscript: vi.fn().mockResolvedValue(mockAnalysisResult),
    } as any);
    vi.mocked(updateGhlAgent).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  describe("status transitions", () => {
    it("marks call as done after successful analysis", async () => {
      const agentId = seedAgent(db, { locationId });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      const row = db.prepare("SELECT analysis_status FROM calls WHERE id = ?").get(callId) as {
        analysis_status: string;
      };
      expect(row.analysis_status).toBe("done");
    });

    it("marks call as skipped when transcript is too short", async () => {
      const agentId = seedAgent(db, { locationId });
      const callId = seedCall(db, agentId, locationId, "hi");

      await analyzeCall(db, callId);

      const row = db.prepare("SELECT analysis_status FROM calls WHERE id = ?").get(callId) as {
        analysis_status: string;
      };
      expect(row.analysis_status).toBe("skipped");
    });

    it("marks call as skipped when transcript is null", async () => {
      const agentId = seedAgent(db, { locationId });
      const callId = seedCall(db, agentId, locationId, null);

      await analyzeCall(db, callId);

      const row = db.prepare("SELECT analysis_status FROM calls WHERE id = ?").get(callId) as {
        analysis_status: string;
      };
      expect(row.analysis_status).toBe("skipped");
    });

    it("marks call as failed and records error when LLM throws", async () => {
      vi.mocked(getLLMClient).mockReturnValue({
        analyzeTranscript: vi.fn().mockRejectedValue(new Error("LLM API timeout")),
      } as any);

      const agentId = seedAgent(db, { locationId });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      const row = db.prepare("SELECT analysis_status FROM calls WHERE id = ?").get(callId) as {
        analysis_status: string;
      };
      expect(row.analysis_status).toBe("failed");

      const analysis = db
        .prepare("SELECT error FROM analyses WHERE call_id = ?")
        .get(callId) as { error: string };
      expect(analysis.error).toContain("LLM API timeout");
    });
  });

  describe("analysis persistence", () => {
    it("inserts analysis with kpi_scores and overall_score", async () => {
      const agentId = seedAgent(db, { locationId });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      const analysis = db.prepare("SELECT * FROM analyses WHERE call_id = ?").get(callId) as any;
      expect(analysis).toBeDefined();
      expect(analysis.overall_score).toBeCloseTo(0.45, 2);

      const scores = JSON.parse(analysis.kpi_scores_json) as Array<{ kpi: string; passed: boolean }>;
      expect(scores).toHaveLength(2);
      expect(scores.find((s) => s.kpi === "greeting_check")?.passed).toBe(true);
      expect(scores.find((s) => s.kpi === "appointment_confirmed")?.passed).toBe(false);
    });

    it("clamps overall_score to [0, 1]", async () => {
      vi.mocked(getLLMClient).mockReturnValue({
        analyzeTranscript: vi.fn().mockResolvedValue({ ...mockCleanAnalysisResult, overall_score: 1.5 }),
      } as any);

      const agentId = seedAgent(db, { locationId });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      const analysis = db.prepare("SELECT overall_score FROM analyses WHERE call_id = ?").get(callId) as {
        overall_score: number;
      };
      expect(analysis.overall_score).toBe(1);
    });
  });

  describe("recommendations", () => {
    it("inserts recommendations from LLM response", async () => {
      const agentId = seedAgent(db, { locationId });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      const analysis = db.prepare("SELECT id FROM analyses WHERE call_id = ?").get(callId) as {
        id: string;
      };
      const recs = db
        .prepare("SELECT * FROM recommendations WHERE analysis_id = ?")
        .all(analysis.id) as any[];
      expect(recs).toHaveLength(1);
      expect(recs[0].target_kpi_name).toBe("appointment_confirmed");
      expect(recs[0].priority).toBe("high");
      expect(recs[0].target_type).toBe("prompt");
      expect(recs[0].status).toBe("pending");
    });

    it("inserts no recommendations when LLM returns none", async () => {
      vi.mocked(getLLMClient).mockReturnValue({
        analyzeTranscript: vi.fn().mockResolvedValue(mockCleanAnalysisResult),
      } as any);

      const agentId = seedAgent(db, { locationId });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      const analysis = db.prepare("SELECT id FROM analyses WHERE call_id = ?").get(callId) as {
        id: string;
      };
      const recs = db
        .prepare("SELECT * FROM recommendations WHERE analysis_id = ?")
        .all(analysis.id);
      expect(recs).toHaveLength(0);
    });
  });

  describe("use_actions", () => {
    it("inserts use_actions from LLM response", async () => {
      const agentId = seedAgent(db, { locationId });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      const analysis = db.prepare("SELECT id FROM analyses WHERE call_id = ?").get(callId) as {
        id: string;
      };
      const actions = db
        .prepare("SELECT * FROM use_actions WHERE analysis_id = ?")
        .all(analysis.id) as any[];
      const llmAction = actions.find((a) => a.action_required === "human_followup");
      expect(llmAction).toBeDefined();
      expect(llmAction.what_to_change).toContain("Follow up");
    });

    it("generates a system use_action for a failed KPI with no recommendation", async () => {
      vi.mocked(getLLMClient).mockReturnValue({
        analyzeTranscript: vi.fn().mockResolvedValue({
          ...mockCleanAnalysisResult,
          kpi_scores: [
            { kpi: "orphan_kpi", passed: false, score: null, confidence: 0.9, evidence: "Failed." },
          ],
          recommendations: [],
          use_actions: [],
          overall_score: 0,
        }),
      } as any);

      const agentId = seedAgent(db, { locationId });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      const analysis = db.prepare("SELECT id FROM analyses WHERE call_id = ?").get(callId) as {
        id: string;
      };
      const actions = db
        .prepare("SELECT * FROM use_actions WHERE analysis_id = ?")
        .all(analysis.id) as any[];
      expect(actions).toHaveLength(1);
      expect(actions[0].action_required).toBe("human_followup");
    });

    it("does not generate system use_actions when all KPIs pass", async () => {
      vi.mocked(getLLMClient).mockReturnValue({
        analyzeTranscript: vi.fn().mockResolvedValue(mockCleanAnalysisResult),
      } as any);

      const agentId = seedAgent(db, { locationId });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      const analysis = db.prepare("SELECT id FROM analyses WHERE call_id = ?").get(callId) as {
        id: string;
      };
      const actions = db
        .prepare("SELECT * FROM use_actions WHERE analysis_id = ?")
        .all(analysis.id);
      expect(actions).toHaveLength(0);
    });
  });

  describe("auto-apply mode", () => {
    it("calls GHL API with updated prompt when agent mode is auto", async () => {
      const agentId = seedAgent(db, { locationId, mode: "auto", ghlAgentId: "ghl-agent-001" });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      expect(vi.mocked(updateGhlAgent)).toHaveBeenCalledWith(
        db,
        locationId,
        "ghl-agent-001",
        expect.objectContaining({ agentPrompt: expect.any(String) }),
      );
    });

    it("marks recommendation as auto_applied after GHL write succeeds", async () => {
      const agentId = seedAgent(db, { locationId, mode: "auto", ghlAgentId: "ghl-agent-001" });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      const analysis = db.prepare("SELECT id FROM analyses WHERE call_id = ?").get(callId) as {
        id: string;
      };
      const recs = db
        .prepare("SELECT status, auto_applied FROM recommendations WHERE analysis_id = ?")
        .all(analysis.id) as any[];
      expect(recs[0].status).toBe("applied");
      expect(recs[0].auto_applied).toBe(1);
    });

    it("does not call GHL API when agent mode is manual", async () => {
      const agentId = seedAgent(db, { locationId, mode: "manual", ghlAgentId: "ghl-agent-001" });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      expect(vi.mocked(updateGhlAgent)).not.toHaveBeenCalled();
    });

    it("does not call GHL API when agent has no ghl_agent_id", async () => {
      const agentId = seedAgent(db, { locationId, mode: "auto", ghlAgentId: null });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      expect(vi.mocked(updateGhlAgent)).not.toHaveBeenCalled();
    });

    it("leaves recommendation pending when GHL write fails", async () => {
      vi.mocked(updateGhlAgent).mockResolvedValue({ ok: false });

      const agentId = seedAgent(db, { locationId, mode: "auto", ghlAgentId: "ghl-agent-001" });
      const callId = seedCall(db, agentId, locationId, LONG_TRANSCRIPT);

      await analyzeCall(db, callId);

      const analysis = db.prepare("SELECT id FROM analyses WHERE call_id = ?").get(callId) as {
        id: string;
      };
      const recs = db
        .prepare("SELECT status, auto_applied FROM recommendations WHERE analysis_id = ?")
        .all(analysis.id) as any[];
      expect(recs[0].status).toBe("pending");
      expect(recs[0].auto_applied).toBe(0);
    });
  });
});
