import type Database from "better-sqlite3";
import { getInstallation, markInstallationExpired, updateTokens } from "../../db/queries";
import { ApiError } from "../../types";
import { expiresAt, refreshToken } from "./oauth";

const GHL_API_BASE = "https://services.leadconnectorhq.com";

async function ghlFetch(
  db: Database.Database,
  locationId: string,
  path: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<Response> {
  const installation = getInstallation(db, locationId);
  if (!installation || installation.status !== "active") {
    throw new ApiError("NOT_INSTALLED", "No active installation for this location", 401);
  }

  // Proactive refresh if token expires within 5 minutes
  const nowSecs = Math.floor(Date.now() / 1000);
  if (!isRetry && installation.expires_at - nowSecs < 300) {
    await doRefresh(db, locationId, installation.refresh_token);
    return ghlFetch(db, locationId, path, options, true);
  }

  const inst = getInstallation(db, locationId)!;
  const res = await fetch(`${GHL_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${inst.access_token}`,
      Version: "2021-07-28",
      ...options.headers,
    },
  });

  if (res.status === 401 && !isRetry) {
    await doRefresh(db, locationId, inst.refresh_token);
    return ghlFetch(db, locationId, path, options, true);
  }

  return res;
}

async function doRefresh(
  db: Database.Database,
  locationId: string,
  token: string,
): Promise<void> {
  try {
    const tokens = await refreshToken(token);
    updateTokens(db, locationId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt(tokens.expires_in),
    });
  } catch {
    markInstallationExpired(db, locationId);
    throw new ApiError(
      "TOKEN_EXPIRED",
      "GHL access token could not be refreshed. Please reinstall the app.",
      401,
    );
  }
}

export async function fetchAgentById(
  db: Database.Database,
  locationId: string,
  ghlAgentId: string,
): Promise<GhlAgent | null> {
  const res = await ghlFetch(db, locationId, `/voice-ai/agents/${ghlAgentId}?locationId=${locationId}`);
  if (!res.ok) return null;
  return res.json() as Promise<GhlAgent>;
}

export interface GhlAgent {
  id: string;
  locationId: string;
  agentName: string;
  businessName?: string;
  agentPrompt?: string;
  [key: string]: unknown;
}

export interface GhlCall {
  id: string;
  agentId?: string;
  agentName?: string;
  transcript?: string;
  summary?: string;
  duration?: number;
  createdAt?: string;
  [key: string]: unknown;
}

export async function fetchVoiceAiAgents(
  db: Database.Database,
  locationId: string,
): Promise<GhlAgent[]> {
  const res = await ghlFetch(db, locationId, `/voice-ai/agents?locationId=${locationId}`);
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError("GHL_API_ERROR", `Failed to fetch Voice AI agents: ${res.status} ${body}`, 502);
  }
  const data = (await res.json()) as { agents?: GhlAgent[] };
  return data.agents ?? [];
}

export async function fetchCallLogs(
  db: Database.Database,
  locationId: string,
  page = 1,
  pageSize = 20,
): Promise<{ calls: GhlCall[]; total: number; hasMore: boolean }> {
  const res = await ghlFetch(
    db,
    locationId,
    `/voice-ai/dashboard/call-logs?locationId=${locationId}&page=${page}&pageSize=${pageSize}`,
    { headers: { Version: "2023-02-21" } },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError("GHL_API_ERROR", `Failed to fetch call logs: ${res.status} ${body}`, 502);
  }

  const data = (await res.json()) as {
    callLogs?: GhlCall[];
    total?: number;
    page?: number;
    pageSize?: number;
  };

  const calls = data.callLogs ?? [];
  const total = data.total ?? calls.length;
  return { calls, total, hasMore: page * pageSize < total };
}
