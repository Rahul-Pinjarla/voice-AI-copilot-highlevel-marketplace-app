import { Router } from "express";
import { getDb } from "../db/init";
import {
  getAnalysisForCall,
  getCall,
  getCallAgentSnapshot,
  getCallsByAgent,
  getRecommendationsForAnalysis,
  getUseActionsForAnalysis,
} from "../db/queries";
import { analyzeCall } from "../lib/analysis";
import { requireSession } from "../middleware/requireSession";
import { ApiError } from "../types";

const router = Router();
router.use(requireSession);

// List calls for an agent
router.get("/:agentId/calls", (req, res, next) => {
  try {
    const db = getDb();
    const locationId = req.session.locationId!;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const versionId = typeof req.query.version === "string" ? req.query.version : undefined;
    const calls = getCallsByAgent(db, req.params.agentId, locationId, versionId, limit);
    res.json(calls);
  } catch (err) {
    next(err);
  }
});

// Get single call with full analysis
router.get("/:id", (req, res, next) => {
  try {
    const db = getDb();
    const locationId = req.session.locationId!;
    const call = getCall(db, req.params.id, locationId);
    if (!call) throw new ApiError("NOT_FOUND", "Call not found", 404);

    const analysis = getAnalysisForCall(db, call.id);
    const recommendations = analysis ? getRecommendationsForAnalysis(db, analysis.id) : [];
    const use_actions = analysis ? getUseActionsForAnalysis(db, analysis.id) : [];
    const snapshot = getCallAgentSnapshot(db, call.id);

    const kpiScores = analysis ? (JSON.parse(analysis.kpi_scores_json) as unknown[]) : [];

    res.json({
      ...call,
      agent_snapshot: snapshot ? JSON.parse(snapshot.snapshot_json) : null,
      analysis: analysis
        ? {
            id: analysis.id,
            overall_score: analysis.overall_score,
            kpi_scores: kpiScores,
            error: analysis.error,
            created_at: analysis.created_at,
            combined_prompt: analysis.combined_prompt ?? null,
          }
        : null,
      recommendations,
      use_actions,
    });
  } catch (err) {
    next(err);
  }
});

// Manually re-analyze a call
router.post("/:id/analyze", async (req, res, next) => {
  try {
    const db = getDb();
    const locationId = req.session.locationId!;
    const call = getCall(db, req.params.id, locationId);
    if (!call) throw new ApiError("NOT_FOUND", "Call not found", 404);

    res.json({ ok: true });
    await analyzeCall(db, call.id);
  } catch (err) {
    next(err);
  }
});

export default router;
