import { Router, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { signToken, setTokenCookie, clearTokenCookie } from "../lib/jwt.js";
import { config } from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { AuthRequest } from "../types/index.js";
import * as Sentry from "@sentry/node";
import { sendPasswordResetEmail } from "../lib/emailService.js";

const router = Router();

// POST /api/auth/register
router.post("/register", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || null,
        role: "user",
        emailVerified: false,
      },
    });

    // Create free subscription
    await prisma.subscription.create({
      data: {
        userId: user.id,
        plan: "free",
        status: "active",
      },
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    setTokenCookie(res, token);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    Sentry.setContext('registration', { email: req.body.email, role: 'user' });
    Sentry.captureException(err);
    logger.error({ err }, "Register error");
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    setTokenCookie(res, token);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    Sentry.captureException(err);
    Sentry.setUser({ email: req.body.email });
    logger.error({ err }, "Login error");
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/logout
router.post("/logout", (_req: Request, res: Response) => {
  clearTokenCookie(res);
  res.json({ message: "Logged out" });
});

// GET /api/auth/me
router.get(
  "/me",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          emailVerified: true,
          createdAt: true,
          subscription: {
            select: {
              plan: true,
              status: true,
              expiresAt: true,
            },
          },
        },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json(user);
    } catch (err) {
      logger.error({ err }, "Me error");
      res.status(500).json({ error: "Failed to get user" });
    }
  },
);

// M5 FIX: Forgot password — generates a reset token (JWT, 1h expiry)
router.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
      return res.status(400).json({ error: "A valid email address is required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    // Always return 200 to prevent email enumeration
    if (!user) return res.json({ message: "If that email exists, a reset link has been sent." });

    const jwt = await import("jsonwebtoken");
    const resetToken = jwt.default.sign(
      { userId: user.id, purpose: "password-reset" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;
    try {
      await sendPasswordResetEmail(user.email, resetUrl);
      logger.info({ userId: user.id }, "Password reset email dispatched");
    } catch (emailErr) {
      logger.error({ userId: user.id, err: emailErr }, "Failed to send password reset email — user cannot reset");
      Sentry.captureException(emailErr);
    }

    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    Sentry.setTag('feature', 'password-reset');
    Sentry.captureException(err);
    logger.error({ err }, "Forgot password error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// M5 FIX: Reset password — validates token and updates password
router.post("/reset-password", authLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: "Token and newPassword are required" });
    if (newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const jwt = await import("jsonwebtoken");
    let payload: any;
    try {
      payload = jwt.default.verify(token, config.jwtSecret);
    } catch {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    if (payload.purpose !== "password-reset") {
      return res.status(400).json({ error: "Invalid token purpose" });
    }

    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.default.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: payload.userId },
      data: { passwordHash: hash },
    });

    logger.info({ userId: payload.userId }, "Password reset completed");
    res.json({ message: "Password has been reset successfully." });
  } catch (err) {
    Sentry.setTag('feature', 'password-reset');
    Sentry.captureException(err);
    logger.error({ err }, "Reset password error");
    res.status(500).json({ error: "Internal server error" });
  }
});


// GET /api/auth/sse-token — short-lived token for SSE connections
router.get("/sse-token", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const token = signToken({ userId: req.user!.userId, email: req.user!.email ?? "", role: req.user!.role });
    res.json({ token });
  } catch (err) {
    logger.error({ err }, "SSE token error");
    res.status(500).json({ error: "Failed to generate SSE token" });
  }
});
export default router;
