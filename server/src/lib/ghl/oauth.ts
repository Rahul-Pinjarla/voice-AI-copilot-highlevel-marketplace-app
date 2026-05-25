import { env } from "../env";

export const GHL_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";
export const GHL_AUTH_URL = "https://marketplace.gohighlevel.com/oauth/chooselocation";

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  locationId?: string;
  userId?: string;
  companyId?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: env.GHL_CLIENT_ID,
    client_secret: env.GHL_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.GHL_REDIRECT_URI,
  });

  const res = await fetch(GHL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL token exchange failed: ${res.status} ${body}`);
  }

  const data = await res.json() as Record<string, unknown>;
  return data as unknown as TokenResponse;
}

export async function refreshToken(refresh_token: string): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: env.GHL_CLIENT_ID,
    client_secret: env.GHL_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token,
  });

  const res = await fetch(GHL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL token refresh failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<TokenResponse>;
}

export function buildAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    redirect_uri: env.GHL_REDIRECT_URI,
    client_id: env.GHL_CLIENT_ID,
    scope: "locations.readonly calls.readonly calls/transcript.readonly",
  });
  if (state) params.set("state", state);
  return `${GHL_AUTH_URL}?${params.toString()}`;
}

export function expiresAt(expires_in: number): number {
  return Math.floor(Date.now() / 1000) + expires_in;
}

export async function getLocationToken(companyAccessToken: string, companyId: string, locationId: string): Promise<TokenResponse> {
  const params = new URLSearchParams({ companyId, locationId });
  const res = await fetch("https://services.leadconnectorhq.com/oauth/locationToken", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${companyAccessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Version: "2021-07-28",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Location token exchange failed: ${res.status} ${body}`);
  }
  const data = await res.json() as Record<string, unknown>;
  return data as unknown as TokenResponse;
}
