import { Router } from "express";
import { getDb } from "../db/init";
import { upsertInstallation } from "../db/queries";
import { buildAuthUrl, exchangeCode, expiresAt } from "../lib/ghl/oauth";

const router = Router();

router.get("/authorize", (_req, res) => {
  res.redirect(buildAuthUrl());
});

router.get("/callback", async (req, res, next) => {
  try {
    console.log("[oauth] callback query:", JSON.stringify(req.query));
    console.log("[oauth] callback body:", JSON.stringify(req.body));
    const { code, error } = req.query;

    if (error) {
      res.status(400).send(`OAuth error: ${error}`);
      return;
    }

    if (!code || typeof code !== "string") {
      res.status(400).send(`Missing authorization code. Received query: ${JSON.stringify(req.query)}`);
      return;
    }

    const tokens = await exchangeCode(code);

    const raw = tokens as unknown as Record<string, unknown>;
    const locationId = raw.locationId as string | undefined;
    const companyId = raw.companyId as string | undefined;

    // Company-level (bulk) install: no locationId yet.
    // Store against companyId so SSO can bind it to the specific location later.
    const installKey = locationId ?? companyId;
    if (!installKey) {
      res.status(400).send(`No locationId or companyId in token response. Keys: ${Object.keys(raw).join(", ")}`);
      return;
    }

    const db = getDb();
    upsertInstallation(db, {
      location_id: installKey,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt(tokens.expires_in),
      scopes: tokens.scope ?? "",
    });

    // Also store the companyId→tokens mapping so SSO can copy it per location
    if (!locationId && companyId) {
      console.log(`[oauth] Bulk install saved for company: ${companyId}`);
    } else {
      console.log(`[oauth] Installation saved for location: ${locationId}`);
    }

    // Redirect to app root (served as Custom Page inside GHL)
    res.redirect("/?installed=true");
  } catch (err) {
    next(err);
  }
});

export default router;
