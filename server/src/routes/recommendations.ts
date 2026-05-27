import { Router } from "express";
import { getDb } from "../db/init";
import {
  dismissUseAction,
  getRecommendationWithContext,
  getUseActionForLocation,
  handleUseAction,
  updateRecommendationStatus,
} from "../db/queries";
import { applyRecommendation } from "../lib/applyRecommendation";
import { requireSession } from "../middleware/requireSession";
import { ApiError } from "../types";

const router = Router();
router.use(requireSession);

router.post("/:id/apply", async (req, res, next) => {
  try {
    const db = getDb();
    const rec = getRecommendationWithContext(db, req.params.id, req.session.locationId!);
    if (!rec) throw new ApiError("NOT_FOUND", "Recommendation not found", 404);

    const { appliedToGhl, actionItemCreated } = await applyRecommendation(
      db,
      rec,
      rec.location_id,
      rec.ghl_agent_id,
      rec.agent_id,
    );

    if (appliedToGhl || actionItemCreated) {
      updateRecommendationStatus(db, rec.id, "applied");
    }

    res.json({ ok: true, appliedToGhl, actionItemCreated });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/dismiss", (req, res, next) => {
  try {
    const db = getDb();
    const rec = getRecommendationWithContext(db, req.params.id, req.session.locationId!);
    if (!rec) throw new ApiError("NOT_FOUND", "Recommendation not found", 404);

    updateRecommendationStatus(db, rec.id, "dismissed");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/use-actions/:id/dismiss", (req, res, next) => {
  try {
    const db = getDb();
    const action = getUseActionForLocation(db, req.params.id, req.session.locationId!);
    if (!action) throw new ApiError("NOT_FOUND", "Use action not found", 404);

    dismissUseAction(db, action.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/use-actions/:id/handle", (req, res, next) => {
  try {
    const db = getDb();
    const action = getUseActionForLocation(db, req.params.id, req.session.locationId!);
    if (!action) throw new ApiError("NOT_FOUND", "Use action not found", 404);

    handleUseAction(db, action.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
