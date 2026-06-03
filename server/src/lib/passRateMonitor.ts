import type Database from "better-sqlite3";
import { getAgent } from "../db/queries";
import { getAnalyzedCallCount, getLastNCallScores } from "../db/queries";
import { env } from "./env";
import { sendPassRateAlert } from "./slack";

const CALL_WINDOW = 10;
const PASS_RATE_THRESHOLD = 0.70;

async function runCheck(db: Database.Database, agentId: string, locationId: string): Promise<void> {
  const totalDone = getAnalyzedCallCount(db, agentId);

  // Only fire on every 10th completed analysis
  if (totalDone === 0 || totalDone % CALL_WINDOW !== 0) return;

  const scores = getLastNCallScores(db, agentId, CALL_WINDOW);
  if (scores.length < CALL_WINDOW) return; // not enough data yet

  const passRate = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (passRate >= PASS_RATE_THRESHOLD) return;

  const agent = getAgent(db, agentId, locationId);
  const agentName = agent?.name ?? agentId;
  const pct = Math.round(passRate * 100);

  console.warn(
    `[monitor] ⚠️  Agent "${agentName}" pass rate: ${pct}% over last ${CALL_WINDOW} calls (threshold: ${Math.round(PASS_RATE_THRESHOLD * 100)}%)`,
  );

  if (!env.SLACK_WEBHOOK_URL) {
    console.warn("[monitor] No SLACK_WEBHOOK_URL configured — skipping Slack alert.");
    return;
  }

  await sendPassRateAlert(env.SLACK_WEBHOOK_URL, agentName, passRate, CALL_WINDOW);
  console.log(`[monitor] Slack alert sent for agent "${agentName}" (${pct}%)`);
}

/**
 * Fire-and-forget pass-rate check. Safe to call after every completed analysis —
 * internally skips unless the agent has just hit a multiple of 10 analyzed calls.
 */
export function schedulePassRateCheck(
  db: Database.Database,
  agentId: string,
  locationId: string,
): void {
  runCheck(db, agentId, locationId).catch((err) => {
    console.error(`[monitor] Pass-rate check failed for agent ${agentId}:`, err);
  });
}
