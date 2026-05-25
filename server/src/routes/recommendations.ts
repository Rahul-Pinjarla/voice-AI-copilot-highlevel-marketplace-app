import { Router } from "express";
import { getDb } from "../db/init";
import { handleUseAction, updateRecommendationStatus } from "../db/queries";
import { requireSession } from "../middleware/requireSession";
import { ApiError } from "../types";

const router = Router();
router.use(requireSession);

router.post("/:id/apply", (req, res, next) => {
  try {
    const db = getDb();
    // Verify recommendation belongs to this location via join
    const rec = db.prepare(`
      SELECT r.id FROM recommendations r
      JOIN analyses an ON an.id = r.analysis_id
      JOIN calls c ON c.id = an.call_id
      WHERE r.id = ? AND c.location_id = ?
    `).get(req.params.id, req.session.locationId!) as { id: string } | undefined;

    if (!rec) throw new ApiError("NOT_FOUND", "Recommendation not found", 404);

    updateRecommendationStatus(db, rec.id, "applied");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/dismiss", (req, res, next) => {
  try {
    const db = getDb();
    const rec = db.prepare(`
      SELECT r.id FROM recommendations r
      JOIN analyses an ON an.id = r.analysis_id
      JOIN calls c ON c.id = an.call_id
      WHERE r.id = ? AND c.location_id = ?
    `).get(req.params.id, req.session.locationId!) as { id: string } | undefined;

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
    const action = db.prepare(`
      SELECT ua.id FROM use_actions ua
      JOIN analyses an ON an.id = ua.analysis_id
      JOIN calls c ON c.id = an.call_id
      WHERE ua.id = ? AND c.location_id = ?
    `).get(req.params.id, req.session.locationId!) as { id: string } | undefined;

    if (!action) throw new ApiError("NOT_FOUND", "Use action not found", 404);

    db.prepare("UPDATE use_actions SET status = 'dismissed' WHERE id = ?").run(action.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/use-actions/:id/handle", (req, res, next) => {
  try {
    const db = getDb();
    const action = db.prepare(`
      SELECT ua.id FROM use_actions ua
      JOIN analyses an ON an.id = ua.analysis_id
      JOIN calls c ON c.id = an.call_id
      WHERE ua.id = ? AND c.location_id = ?
    `).get(req.params.id, req.session.locationId!) as { id: string } | undefined;

    if (!action) throw new ApiError("NOT_FOUND", "Use action not found", 404);

    handleUseAction(db, action.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
