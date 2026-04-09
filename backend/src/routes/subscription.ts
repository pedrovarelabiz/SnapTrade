/**
 * Subscription Routes — Tier management, device registration, usage tracking.
 */

import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { AuthRequest } from "../types/index.js";
import { logger } from "../lib/logger.js";
import {
  getUserTier,
  canUserTrade,
  getUserDevices,
  registerDevice,
  removeDevice,
  bindPoUserId,
} from "../services/tierService.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

// GET /api/subscription/status — current tier, limits, usage
router.get("/status", authMiddleware, apiLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const tier = await getUserTier(req.user!.userId);
    const tradeCheck = await canUserTrade(req.user!.userId);
    const devices = await getUserDevices(req.user!.userId);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { poUserId: true, subscription: { select: { plan: true, status: true, expiresAt: true } } },
    });

    res.json({
      tier,
      subscription: user?.subscription ?? null,
      poUserId: user?.poUserId ?? null,
      usage: {
        tradesUsed: tradeCheck.tradesUsed,
        tradesMax: tradeCheck.tradesMax,
        canTrade: tradeCheck.allowed,
        reason: tradeCheck.reason,
      },
      devices,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "[subscription] Status error");
    res.status(500).json({ error: "Failed to get subscription status" });
  }
});

// GET /api/subscription/tiers — list available tiers
router.get("/tiers", apiLimiter, async (_req, res: Response) => {
  try {
    const tiers = await prisma.subscriptionTier.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
    });
    res.json(tiers);
  } catch (err: any) {
    logger.error({ err: err.message }, "[subscription] Tiers list error");
    res.status(500).json({ error: "Failed to get tiers" });
  }
});

// POST /api/subscription/devices/register — register a device
router.post("/devices/register", authMiddleware, apiLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { machineId } = req.body;
    if (!machineId) {
      res.status(400).json({ error: "machineId required" });
      return;
    }

    const tier = await getUserTier(req.user!.userId);
    const result = await registerDevice(req.user!.userId, machineId, tier);

    if (!result.allowed) {
      res.status(403).json({ error: result.error, devices: result.devices });
      return;
    }

    res.json({
      isPrimary: result.isPrimary,
      devices: result.devices,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "[subscription] Device register error");
    res.status(500).json({ error: "Failed to register device" });
  }
});

// DELETE /api/subscription/devices/:id — remove a device
router.delete("/devices/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const removed = await removeDevice(req.user!.userId, req.params.id);
    if (!removed) {
      res.status(404).json({ error: "Device not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err.message }, "[subscription] Device remove error");
    res.status(500).json({ error: "Failed to remove device" });
  }
});

// GET /api/subscription/devices — list user devices
router.get("/devices", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const devices = await getUserDevices(req.user!.userId);
    res.json(devices);
  } catch (err: any) {
    logger.error({ err: err.message }, "[subscription] Devices list error");
    res.status(500).json({ error: "Failed to list devices" });
  }
});

// POST /api/subscription/bind-po — bind PO user ID
router.post("/bind-po", authMiddleware, apiLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { poUserId } = req.body;
    if (!poUserId || typeof poUserId !== "number") {
      res.status(400).json({ error: "poUserId (number) required" });
      return;
    }

    const result = await bindPoUserId(req.user!.userId, poUserId);
    if (!result.ok) {
      res.status(409).json({ error: result.error });
      return;
    }

    res.json({ ok: true, poUserId });
  } catch (err: any) {
    logger.error({ err: err.message }, "[subscription] Bind PO error");
    res.status(500).json({ error: "Failed to bind PO account" });
  }
});

export default router;
