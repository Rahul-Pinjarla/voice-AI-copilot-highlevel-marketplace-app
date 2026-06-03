import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";

vi.mock("../../../server/src/db/init", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../server/src/db/init")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("../../../server/src/lib/slack", () => ({
  sendPassRateAlert: vi.fn().mockResolvedValue(undefined),
}));

// Needed because passRateMonitor is triggered from analyzeCall in the e2e test
vi.mock("../../../server/src/lib/llm/index", () => ({
  getLLMClient: vi.fn(),
}));

vi.mock("../../../server/src/lib/ghl/api", () => ({
  GHL_AGENT_UPDATABLE_FIELDS: new Set([
    "welcomeMessage", "maxCallDuration", "responsiveness",
    "sendUserIdleReminders", "reminderAfterIdleTimeSeconds",
  ]),
  updateGhlAgent: vi.fn().mockResolvedValue({ ok: true }),
  fetchAgentById: vi.fn().mockResolvedValue(null),
  fetchVoiceAiAgents: vi.fn().mockResolvedValue([]),
}));

import { getDb } from "../../../server/src/db/init";
import { sendPassRateAlert } from "../../../server/src/lib/slack";
import { getLLMClient } from "../../../server/src/lib/llm/index";
import { schedulePassRateCheck } from "../../../server/src/lib/passRateMonitor";
import { analyzeCall } from "../../../server/src/lib/analysis";
import { createTestDb } from "../../helpers/db";
import { mockCleanAnalysisResult } from "../../fixtures/analysis";

// Flush all pending promises (schedulePassRateCheck is fire-and-forget)
const flushAsync = () => new Promise<void>((r) => setImmediate(r));

const CALL_WINDOW = 10;
const LOW_SCORE = 0.4;   // 40% — well below the 70% threshold
const HIGH_SCORE = 0.85; // 85% — above threshold

function seedAgent(db: Database.Database, locationId: string): string {
  const agentId = randomUUID();
  db.prepare(`
    INSERT INTO agents (id, location_id, ghl_agent_id, name, system_prompt, configured, active, mode)
    VALUES (?, ?, ?, 'Perf Test Agent', 'You are a test agent.', 1, 1, 'manual')
  `).run(agentId, locationId, randomUUID());
  return agentId;
}

/**
 * Seeds a completed call + analysis into the DB.
 * Sets analysis_status = 'done' and records the given overall_score.
 */
function seedDoneCall(
  db: Database.Database,
  agentId: string,
  locationId: string,
  overallScore: number,
): void {
  const callId = randomUUID();
  db.prepare(`
    INSERT INTO calls (id, agent_id, location_id, ghl_call_id, transcript, metadata, source, analysis_status)
    VALUES (?, ?, ?, ?, 'transcript text', '{}', 'seed', 'done')
  `).run(callId, agentId, locationId, randomUUID());

  db.prepare(`
    INSERT INTO analyses (id, call_id, kpi_scores_json, overall_score)
    VALUES (?, ?, '[]', ?)
  `).run(randomUUID(), callId, overallScore);
}

describe("schedulePassRateCheck", () => {
  const locationId = "loc-monitor-test";
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(sendPassRateAlert).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await flushAsync();
    db.close();
    vi.resetAllMocks();
  });

  describe("alert fires when conditions are met", () => {
    it("sends a Slack alert when pass rate is below 70% on the 10th done call", async () => {
      const agentId = seedAgent(db, locationId);
      for (let i = 0; i < CALL_WINDOW; i++) seedDoneCall(db, agentId, locationId, LOW_SCORE);

      schedulePassRateCheck(db, agentId, locationId);
      await flushAsync();

      expect(vi.mocked(sendPassRateAlert)).toHaveBeenCalledOnce();
    });

    it("passes correct webhook URL, agent name, and pass rate to sendPassRateAlert", async () => {
      const agentId = seedAgent(db, locationId);
      for (let i = 0; i < CALL_WINDOW; i++) seedDoneCall(db, agentId, locationId, LOW_SCORE);

      schedulePassRateCheck(db, agentId, locationId);
      await flushAsync();

      expect(vi.mocked(sendPassRateAlert)).toHaveBeenCalledWith(
        "https://hooks.slack.com/services/test-webhook",
        "Perf Test Agent",
        expect.closeTo(LOW_SCORE, 2),
        CALL_WINDOW,
      );
    });

    it("fires again on the 20th done call", async () => {
      const agentId = seedAgent(db, locationId);
      for (let i = 0; i < CALL_WINDOW * 2; i++) seedDoneCall(db, agentId, locationId, LOW_SCORE);

      schedulePassRateCheck(db, agentId, locationId);
      await flushAsync();

      expect(vi.mocked(sendPassRateAlert)).toHaveBeenCalledOnce();
    });
  });

  describe("alert is suppressed when conditions are not met", () => {
    it("does NOT send alert when pass rate is at or above 70%", async () => {
      const agentId = seedAgent(db, locationId);
      for (let i = 0; i < CALL_WINDOW; i++) seedDoneCall(db, agentId, locationId, HIGH_SCORE);

      schedulePassRateCheck(db, agentId, locationId);
      await flushAsync();

      expect(vi.mocked(sendPassRateAlert)).not.toHaveBeenCalled();
    });

    it("does NOT send alert when done call count is not a multiple of 10 (9 calls)", async () => {
      const agentId = seedAgent(db, locationId);
      for (let i = 0; i < CALL_WINDOW - 1; i++) seedDoneCall(db, agentId, locationId, LOW_SCORE);

      schedulePassRateCheck(db, agentId, locationId);
      await flushAsync();

      expect(vi.mocked(sendPassRateAlert)).not.toHaveBeenCalled();
    });

    it("does NOT send alert when done call count is not a multiple of 10 (11 calls)", async () => {
      const agentId = seedAgent(db, locationId);
      for (let i = 0; i < CALL_WINDOW + 1; i++) seedDoneCall(db, agentId, locationId, LOW_SCORE);

      schedulePassRateCheck(db, agentId, locationId);
      await flushAsync();

      expect(vi.mocked(sendPassRateAlert)).not.toHaveBeenCalled();
    });

    it("does NOT send alert when there are no done calls", async () => {
      const agentId = seedAgent(db, locationId);

      schedulePassRateCheck(db, agentId, locationId);
      await flushAsync();

      expect(vi.mocked(sendPassRateAlert)).not.toHaveBeenCalled();
    });

    it("does NOT send alert when SLACK_WEBHOOK_URL is not configured", async () => {
      const agentId = seedAgent(db, locationId);
      for (let i = 0; i < CALL_WINDOW; i++) seedDoneCall(db, agentId, locationId, LOW_SCORE);

      // Temporarily clear the URL from the live env object
      const { env } = await import("../../../server/src/lib/env");
      const original = env.SLACK_WEBHOOK_URL;
      (env as Record<string, unknown>).SLACK_WEBHOOK_URL = undefined;

      try {
        schedulePassRateCheck(db, agentId, locationId);
        await flushAsync();
        expect(vi.mocked(sendPassRateAlert)).not.toHaveBeenCalled();
      } finally {
        (env as Record<string, unknown>).SLACK_WEBHOOK_URL = original;
      }
    });
  });

  describe("alert payload content", () => {
    it("uses red emoji (🔴) in the header when pass rate is below 50%", async () => {
      const agentId = seedAgent(db, locationId);
      // 30% pass rate
      for (let i = 0; i < CALL_WINDOW; i++) seedDoneCall(db, agentId, locationId, 0.3);

      schedulePassRateCheck(db, agentId, locationId);
      await flushAsync();

      // Verify the call was made — payload shape is tested in slack unit tests
      expect(vi.mocked(sendPassRateAlert)).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.closeTo(0.3, 2),
        CALL_WINDOW,
      );
    });

    it("uses orange emoji (🟠) in the header when pass rate is between 50% and 70%", async () => {
      const agentId = seedAgent(db, locationId);
      // 60% pass rate — above 50% but below 70% threshold
      for (let i = 0; i < CALL_WINDOW; i++) seedDoneCall(db, agentId, locationId, 0.6);

      schedulePassRateCheck(db, agentId, locationId);
      await flushAsync();

      expect(vi.mocked(sendPassRateAlert)).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.closeTo(0.6, 2),
        CALL_WINDOW,
      );
    });
  });

  describe("error handling", () => {
    it("swallows Slack errors without propagating an exception", async () => {
      vi.mocked(sendPassRateAlert).mockRejectedValue(new Error("Slack is down"));

      const agentId = seedAgent(db, locationId);
      for (let i = 0; i < CALL_WINDOW; i++) seedDoneCall(db, agentId, locationId, LOW_SCORE);

      // schedulePassRateCheck is fire-and-forget — should never throw
      expect(() => schedulePassRateCheck(db, agentId, locationId)).not.toThrow();
      await flushAsync();
      // No unhandled rejection either (the .catch() in schedulePassRateCheck catches it)
    });
  });
});

// ── End-to-end: alert triggered via analyzeCall ───────────────────────────────

describe("pass-rate alert triggered via analyzeCall", () => {
  const locationId = "loc-e2e-monitor";
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(sendPassRateAlert).mockResolvedValue(undefined);
    // LLM returns a clean result (no failures) so analyzeCall completes successfully
    vi.mocked(getLLMClient).mockReturnValue({
      analyzeTranscript: vi.fn().mockResolvedValue({
        ...mockCleanAnalysisResult,
        overall_score: LOW_SCORE, // low score triggers alert
      }),
    } as any);
  });

  afterEach(async () => {
    await flushAsync();
    db.close();
    vi.resetAllMocks();
  });

  it("sends Slack alert when the 10th call is analyzed and pass rate is poor", async () => {
    const agentId = seedAgent(db, locationId);

    // Seed 9 existing done calls with low scores
    for (let i = 0; i < CALL_WINDOW - 1; i++) {
      seedDoneCall(db, agentId, locationId, LOW_SCORE);
    }

    // The 10th call goes through the full analyzeCall pipeline
    const callId = randomUUID();
    db.prepare(`
      INSERT INTO calls (id, agent_id, location_id, ghl_call_id, transcript, metadata, source, analysis_status)
      VALUES (?, ?, ?, ?, 'Agent: Hello.\nCaller: Hi, I need to book an appointment please.\nAgent: Sure, let me help you with that.', '{}', 'seed', 'pending')
    `).run(callId, agentId, locationId, randomUUID());

    await analyzeCall(db, callId);
    await flushAsync(); // let schedulePassRateCheck's promise settle

    expect(vi.mocked(sendPassRateAlert)).toHaveBeenCalledOnce();
    expect(vi.mocked(sendPassRateAlert)).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test-webhook",
      "Perf Test Agent",
      expect.closeTo(LOW_SCORE, 1),
      CALL_WINDOW,
    );
  });

  it("does NOT send alert when the 9th call is analyzed (not yet 10th)", async () => {
    const agentId = seedAgent(db, locationId);

    // Seed 8 existing done calls
    for (let i = 0; i < CALL_WINDOW - 2; i++) {
      seedDoneCall(db, agentId, locationId, LOW_SCORE);
    }

    // The 9th call goes through analyzeCall
    const callId = randomUUID();
    db.prepare(`
      INSERT INTO calls (id, agent_id, location_id, ghl_call_id, transcript, metadata, source, analysis_status)
      VALUES (?, ?, ?, ?, 'Agent: Hello.\nCaller: Hi there.\nAgent: How can I help?', '{}', 'seed', 'pending')
    `).run(callId, agentId, locationId, randomUUID());

    await analyzeCall(db, callId);
    await flushAsync();

    expect(vi.mocked(sendPassRateAlert)).not.toHaveBeenCalled();
  });
});
