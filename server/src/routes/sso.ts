import crypto from "crypto";
import { Router } from "express";
import { getDb } from "../db/init";
import { getInstallation, upsertAgent, upsertInstallation } from "../db/queries";
import { env } from "../lib/env";
import { fetchVoiceAiAgents } from "../lib/ghl/api";
import { expiresAt, getLocationToken } from "../lib/ghl/oauth";

export function signToken(payload: { locationId: string; userId: string; role: string }): string {
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", env.SESSION_SECRET).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, sig })).toString("base64url");
}

export function verifyToken(token: string): { locationId: string; userId: string; role: string } | null {
  try {
    const { data, sig } = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as { data: string; sig: string };
    const expected = crypto.createHmac("sha256", env.SESSION_SECRET).update(data).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
    return JSON.parse(data) as { locationId: string; userId: string; role: string };
  } catch {
    return null;
  }
}

const router = Router();

interface SSOPayload {
  userId?: string;
  activeLocation?: string;
  locationId?: string;
  role?: string;
  type?: string;
  companyId?: string;
  [key: string]: unknown;
}

// GHL uses CryptoJS.AES.encrypt(data, password) which produces OpenSSL "Salted__" format.
// Key+IV are derived from the password using EVP_BytesToKey (MD5-based, OpenSSL default).
function evpBytesToKey(password: Buffer, salt: Buffer): { key: Buffer; iv: Buffer } {
  let prev = Buffer.alloc(0);
  let result = Buffer.alloc(0);
  while (result.length < 48) { // 32 bytes key + 16 bytes IV
    prev = crypto.createHash("md5").update(Buffer.concat([prev, password, salt])).digest();
    result = Buffer.concat([result, prev]);
  }
  return { key: result.subarray(0, 32), iv: result.subarray(32, 48) };
}

function decryptSSOData(encryptedData: string): SSOPayload {
  const data = Buffer.from(encryptedData, "base64");

  // CryptoJS format: "Salted__" (8 bytes) + salt (8 bytes) + ciphertext
  if (data.subarray(0, 8).toString("utf8") === "Salted__") {
    const salt = data.subarray(8, 16);
    const ciphertext = data.subarray(16);
    const { key, iv } = evpBytesToKey(Buffer.from(env.GHL_SSO_KEY, "utf8"), salt);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as SSOPayload;
  }

  // Fallback: raw AES-256-CBC, IV = first 16 bytes
  const keyBuffer = /^[0-9a-fA-F]{64}$/.test(env.GHL_SSO_KEY)
    ? Buffer.from(env.GHL_SSO_KEY, "hex")
    : crypto.createHash("sha256").update(env.GHL_SSO_KEY).digest();
  const iv = data.subarray(0, 16);
  const payload = data.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as SSOPayload;
}

router.post("/verify", async (req, res) => {
  const { encrypted } = req.body as { encrypted?: string };

  if (!encrypted) {
    res.status(400).json({ error: { code: "MISSING_PAYLOAD", message: "No SSO payload" } });
    return;
  }

  try {
    const data = decryptSSOData(encrypted);
    const locationId = data.activeLocation ?? data.locationId;

    if (!locationId) {
      res
        .status(400)
        .json({ error: { code: "NO_LOCATION", message: "SSO payload missing location" } });
      return;
    }

    const db = getDb();

    // If no location-specific installation exists yet, copy from company-level install
    // and immediately exchange for a location-scoped token
    let installation = getInstallation(db, locationId);
    let isNewInstall = false;
    if (!installation) {
      const companyId = data.companyId as string | undefined;
      if (companyId) {
        const companyInstall = getInstallation(db, companyId);
        if (companyInstall) {
          try {
            const locTokens = await getLocationToken(companyInstall.access_token, companyId, locationId);
            upsertInstallation(db, {
              location_id: locationId,
              access_token: locTokens.access_token,
              refresh_token: locTokens.refresh_token,
              expires_at: expiresAt(locTokens.expires_in),
              scopes: locTokens.scope ?? companyInstall.scopes,
            });
            console.log(`[sso] Location token obtained for: ${locationId}`);
          } catch (e) {
            // Fallback: copy company token (will be upgraded on next API call)
            upsertInstallation(db, {
              location_id: locationId,
              access_token: companyInstall.access_token,
              refresh_token: companyInstall.refresh_token,
              expires_at: companyInstall.expires_at,
              scopes: companyInstall.scopes,
            });
            console.warn(`[sso] Location token exchange failed, using company token: ${e}`);
          }
          installation = getInstallation(db, locationId);
          isNewInstall = true;
        }
      }
    }

    if (!installation) {
      res.status(403).json({ error: { code: "NOT_INSTALLED", message: "App not installed for this location. Please install from the marketplace." } });
      return;
    }

    req.session.locationId = locationId;
    req.session.userId = data.userId ?? "";
    req.session.role = data.role ?? "user";

    const token = signToken({ locationId, userId: data.userId ?? "", role: data.role ?? "user" });
    res.json({ ok: true, locationId, token });

    // Sync agents in background on every login (cheap; keeps list fresh)
    syncAgents(db, locationId).catch((e) => console.warn("[sso] Agent sync failed:", e));
  } catch (err) {
    console.error("[sso] Decryption failed:", err);
    res.status(401).json({ error: { code: "SSO_FAILED", message: "Invalid SSO payload" } });
  }
});

async function syncAgents(db: ReturnType<typeof getDb>, locationId: string): Promise<void> {
  const agents = await fetchVoiceAiAgents(db, locationId);
  for (const a of agents) {
    upsertAgent(db, {
      location_id: locationId,
      ghl_agent_id: a.id,
      name: a.agentName,
      system_prompt: (a.agentPrompt as string | undefined) ?? undefined,
    });
  }
  if (agents.length > 0) {
    console.log(`[sso] Synced ${agents.length} agent(s) for location: ${locationId}`);
  }
}

router.get("/context", (req, res) => {
  if (!req.session?.locationId) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "No session" } });
    return;
  }
  res.json({
    locationId: req.session.locationId,
    userId: req.session.userId,
    role: req.session.role,
  });
});

export default router;
