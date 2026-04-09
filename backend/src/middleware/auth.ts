import { Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt.js";
import { AuthRequest } from "../types/index.js";
import { prisma } from "../lib/prisma.js";
import * as Sentry from "@sentry/node";

function extractToken(req: AuthRequest): string | undefined {
  // 1. httpOnly cookie
  let token = req.cookies?.token;

  // 2. Authorization: Bearer header
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  // 3. Query param (for SSE)
  if (!token && typeof req.query.token === "string") {
    token = req.query.token;
  }

  return token;
}

async function resolveExtensionToken(
  token: string,
): Promise<{ userId: string; email: string; role: string; subscription?: any } | null> {
  if (!token.startsWith("ext_") && !token.startsWith("st_ext_")) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { extensionToken: token },
    select: {
      id: true,
      email: true,
      role: true,
      subscription: { select: { status: true, expiresAt: true } },
    },
  });
  if (!user) {
    return null;
  }

  const subscription = user.subscription as any;
  if (subscription?.status === "expired" || subscription?.status === "cancelled") {
    return null;
  }

  return { userId: user.id, email: user.email, role: user.role, subscription: user.subscription };
}

async function resolveCurrentRole(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role ?? "user";
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Try JWT first
  try {
    const payload = verifyToken(token);
    req.user = payload;

    try {
      const currentRole = await resolveCurrentRole(payload.userId);
      req.user = { ...payload, role: currentRole };
    } catch (error) {
      Sentry.captureException(error);
      req.user = { ...payload, role: payload.role };
    }

    Sentry.setUser({ id: req.user.userId, email: req.user.email, role: req.user.role });
    next();
    return;
  } catch {
    // Not a valid JWT — try extension token
  }

  // Try extension token (async)
  try {
    const payload = await resolveExtensionToken(token);
    if (payload) {
      req.user = payload;
      Sentry.setUser({ id: req.user.userId, email: req.user.email, role: req.user.role });
      next();
    } else {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    next();
    return;
  }

  // Try JWT first
  try {
    const payload = verifyToken(token);

    // TODO: Check tokenBlocklist in DB once implemented
    // const isBlocked = await prisma.tokenBlocklist.findUnique({ where: { jti: payload.jti } });
    // if (isBlocked) throw new Error("Token is revoked");

    // Re-verify user role from DB to handle downgrades/revocations
    try {
      const currentRole = await resolveCurrentRole(payload.userId);
      req.user = { ...payload, role: currentRole };
    } catch (error) {
      Sentry.captureException(error);
      req.user = { ...payload, role: payload.role };
    }

    Sentry.setUser({ id: req.user.userId, email: req.user.email, role: req.user.role });
    next();
    return;
  } catch {
    // Not a valid JWT — try extension token
  }

  // Try extension token (async)
  try {
    const payload = await resolveExtensionToken(token);
    if (payload) {
      req.user = payload;
      Sentry.setUser({ id: req.user.userId, email: req.user.email, role: req.user.role });
    }
    next();
  } catch {
    next();
  }
}
