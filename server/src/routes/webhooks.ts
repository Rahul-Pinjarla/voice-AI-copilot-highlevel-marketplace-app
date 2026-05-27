import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { Router } from "express";
import { getDb } from "../db/init";
import { webhookHandlers } from "../handlers/webhooks";
import { env } from "../lib/env";

const router = Router();

function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const sigHex = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  if (sigHex.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sigHex, "hex"), Buffer.from(expected, "hex"));
}

router.post("/ghl", async (req, res) => {
  if (env.GHL_WEBHOOK_SECRET) {
    const sig = (req.headers["x-ghl-signature"] ?? req.headers["x-hub-signature-256"]) as string | undefined;
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!sig || !rawBody || !verifySignature(rawBody, sig, env.GHL_WEBHOOK_SECRET)) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }
  }
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
    console.log(`[webhook] Unknown event type ignored: ${eventType}`, JSON.stringify(payload, null, 2));
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
