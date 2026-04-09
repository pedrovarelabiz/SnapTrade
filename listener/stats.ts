import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { roleGuard } from "../middleware/roleGuard.js";
import { AuthRequest } from "../types/index.js";
import {
  getOverviewStats,
  getStatsByAsset,
  getStatsByHour,
  getStatsByDay,
  getPnlCurve,
  getWinRateHistory,
  getStatsByChannel,
} from "../services/statsService.js";

const router = Router();

// GET /api/stats/overview — public (optional ?channel=slug)
router.get(
  "/overview",
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const channel = req.query.channel as string | undefined;
      const stats = await getOverviewStats(channel);
      res.json(stats);
    } catch (err) {
      console.error("Stats overview error:", err);
      res.status(500).json({ error: "Failed to get stats" });
    }
  },
);

// GET /api/stats/by-channel — public
router.get(
  "/by-channel",
  apiLimiter,
  async (_req: AuthRequest, res: Response) => {
    try {
      const stats = await getStatsByChannel();
      res.json(stats);
    } catch (err) {
      console.error("Stats by-channel error:", err);
      res.status(500).json({ error: "Failed to get stats" });
    }
  },
);

// GET /api/stats/by-asset — premium (optional ?channel=slug)
router.get(
  "/by-asset",
  authMiddleware,
  roleGuard("premium", "admin"),
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const channel = req.query.channel as string | undefined;
      const stats = await getStatsByAsset(channel);
      res.json(stats);
    } catch (err) {
      console.error("Stats by-asset error:", err);
      res.status(500).json({ error: "Failed to get stats" });
    }
  },
);

// GET /api/stats/by-hour — premium (optional ?channel=slug)
router.get(
  "/by-hour",
  authMiddleware,
  roleGuard("premium", "admin"),
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const channel = req.query.channel as string | undefined;
      const stats = await getStatsByHour(channel);
      res.json(stats);
    } catch (err) {
      console.error("Stats by-hour error:", err);
      res.status(500).json({ error: "Failed to get stats" });
    }
  },
);

// GET /api/stats/by-day — premium (optional ?channel=slug)
router.get(
  "/by-day",
  authMiddleware,
  roleGuard("premium", "admin"),
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const channel = req.query.channel as string | undefined;
      const stats = await getStatsByDay(channel);
      res.json(stats);
    } catch (err) {
      console.error("Stats by-day error:", err);
      res.status(500).json({ error: "Failed to get stats" });
    }
  },
);

// GET /api/stats/pnl-curve — premium (optional ?channel=slug)
router.get(
  "/pnl-curve",
  authMiddleware,
  roleGuard("premium", "admin"),
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const channel = req.query.channel as string | undefined;
      const curve = await getPnlCurve(channel);
      res.json(curve);
    } catch (err) {
      console.error("PnL curve error:", err);
      res.status(500).json({ error: "Failed to get PnL curve" });
    }
  },
);

// GET /api/stats/win-rate-history — premium (optional ?channel=slug)
router.get(
  "/win-rate-history",
  authMiddleware,
  roleGuard("premium", "admin"),
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const channel = req.query.channel as string | undefined;
      const history = await getWinRateHistory(channel);
      res.json(history);
    } catch (err) {
      console.error("Win rate history error:", err);
      res.status(500).json({ error: "Failed to get win rate history" });
    }
  },
);

export default router;
