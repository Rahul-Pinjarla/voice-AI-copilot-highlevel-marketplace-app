import { randomUUID } from "crypto";
import { Router } from "express";
import { getDb } from "../db/init";
import { webhookHandlers } from "../handlers/webhooks";

const router = Router();

router.post("/ghl", async (req, res) => {
  const db = getDb();
  const payload = req.body as Record<string, unknown>;
  const eventType = (payload.type ?? payload.event ?? payload.eventType) as string | undefined;

  if (!eventType) {
    console.warn("[webhook] No event type in payload:", JSON.stringify(payload).slice(0, 200));
    res.status(200).json({ ok: true });
    return;
  }

  const handler = webhookHandlers[eventType];
  if (!handler) {
    console.log(`[webhook] Unknown event type ignored: ${eventType}`);
    res.status(200).json({ ok: true });
    return;
  }

  // ACK immediately — analysis runs in background
  res.status(200).json({ ok: true });

  try {
    await handler(payload, db);
  } catch (err) {
    console.error(`[webhook] Handler error for ${eventType}:`, err);
    db.prepare("INSERT INTO webhook_errors (id, raw_payload, error) VALUES (?, ?, ?)").run(
      randomUUID(),
      JSON.stringify(payload),
      String(err),
    );
  }
});

export default router;
