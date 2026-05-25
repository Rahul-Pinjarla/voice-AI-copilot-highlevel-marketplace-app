import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../routes/sso";
import type { AuthedRequest } from "../types";

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.locationId) {
    next();
    return;
  }

  // Fallback: Accept HMAC-signed token in Authorization header (iframe cookie workaround)
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const payload = verifyToken(auth.slice(7));
    if (payload) {
      req.session.locationId = payload.locationId;
      req.session.userId = payload.userId;
      req.session.role = payload.role;
      next();
      return;
    }
  }

  res.status(401).json({ error: { code: "UNAUTHORIZED", message: "No active session" } });
}

export function authed(req: Request): AuthedRequest {
  return req as AuthedRequest;
}
