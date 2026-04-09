import { Router, Response } from "express";
import { logger } from "../lib/logger.js";
import { authMiddleware } from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { AuthRequest } from "../types/index.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

// GET /api/subscriptions/plans — public
router.get("/plans", apiLimiter, (_req: AuthRequest, res: Response) => {
  res.json([
    {
      id: "free",
      name: "Free",
      price: 0,
      currency: "USD",
      features: [
        "3 signals/day",
        "5-minute delay",
        "Basic stats",
      ],
    },
    {
      id: "premium_monthly",
      name: "Premium Monthly",
      price: 29.99,
      currency: "USD",
      durationDays: 30,
      features: [
        "Unlimited signals",
        "Real-time delivery",
        "Advanced stats",
        "Extension support",
        "Daily reports",
      ],
    },
    {
      id: "premium_yearly",
      name: "Premium Yearly",
      price: 249.99,
      currency: "USD",
      durationDays: 365,
      features: [
        "All Premium features",
        "30% savings",
        "Priority support",
      ],
    },
  ]);
});

// GET /api/subscriptions/me
router.get(
  "/me",
  authMiddleware,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const sub = await prisma.subscription.findUnique({
        where: { userId: req.user!.userId },
      });
      res.json(sub || { plan: "free", status: "active" });
    } catch (err) {
      logger.error({ err }, "Subscription error");
      res.status(500).json({ error: "Failed to get subscription" });
    }
  },
);

// GET /api/subscriptions/payment-history
router.get(
  "/payment-history",
  authMiddleware,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const payments = await prisma.payment.findMany({
        where: { userId: req.user!.userId },
        orderBy: { createdAt: "desc" },
      });
      res.json(payments);
    } catch (err) {
      logger.error({ err }, "Payment history error");
      res.status(500).json({ error: "Failed to get payments" });
    }
  },
);

// POST /api/subscriptions/subscribe/crypto (stub)
router.post(
  "/subscribe/crypto",
  authMiddleware,
  async (_req: AuthRequest, res: Response) => {
    res.json({ message: "Crypto payment not yet implemented" });
  },
);

// POST /api/subscriptions/subscribe/paypal (stub)
router.post(
  "/subscribe/paypal",
  authMiddleware,
  async (_req: AuthRequest, res: Response) => {
    res.json({ message: "PayPal payment not yet implemented" });
  },
);

// POST /api/subscriptions/cancel
router.post(
  "/cancel",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const sub = await prisma.subscription.findUnique({
        where: { userId: req.user!.userId },
      });
      if (!sub || sub.plan === "free") {
        res.status(400).json({ error: "No active premium subscription" });
        return;
      }
      await prisma.subscription.update({
        where: { userId: req.user!.userId },
        data: { status: "cancelled" },
      });
      res.json({ message: "Subscription cancelled" });
    } catch (err) {
      logger.error({ err }, "Cancel error");
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  },
);

export default router;
