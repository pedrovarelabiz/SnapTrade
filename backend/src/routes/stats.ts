import { Router, Response } from "express";
import * as Sentry from "@sentry/node";
import { logger } from "../lib/logger.js";
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
  getPublicSummary,
} from "../services/statsService.js";

const router = Router();

// GET /api/stats/overview — public (optional ?channel=slug)
router.get(
  "/overview",
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const channel = req.query.channel as string | undefined;
      Sentry.addBreadcrumb({
        category: "stats",
        message: "Fetching overview stats",
        level: "info",
        data: { channel },
      });
      const stats = await getOverviewStats(channel);
      res.json(stats);
    } catch (err) {
      logger.error({ err }, "Stats overview error");
      Sentry.captureException(err);
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
      Sentry.addBreadcrumb({
        category: "stats",
        message: "Fetching stats by channel",
        level: "info",
      });
      const stats = await getStatsByChannel();
      res.json(stats);
    } catch (err) {
      logger.error({ err }, "Stats by-channel error");
      Sentry.captureException(err);
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
      Sentry.addBreadcrumb({
        category: "stats",
        message: "Fetching stats by asset",
        level: "info",
        data: { channel },
      });
      const stats = await getStatsByAsset(channel);
      res.json(stats);
    } catch (err) {
      logger.error({ err }, "Stats by-asset error");
      Sentry.captureException(err);
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
      Sentry.addBreadcrumb({
        category: "stats",
        message: "Fetching stats by hour",
        level: "info",
        data: { channel },
      });
      const stats = await getStatsByHour(channel);
      res.json(stats);
    } catch (err) {
      logger.error({ err }, "Stats by-hour error");
      Sentry.captureException(err);
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
      Sentry.addBreadcrumb({
        category: "stats",
        message: "Fetching stats by day",
        level: "info",
        data: { channel },
      });
      const stats = await getStatsByDay(channel);
      res.json(stats);
    } catch (err) {
      logger.error({ err }, "Stats by-day error");
      Sentry.captureException(err);
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
      Sentry.addBreadcrumb({
        category: "stats",
        message: "Fetching PnL curve",
        level: "info",
        data: { channel },
      });
      const curve = await getPnlCurve(channel);
      res.json(curve);
    } catch (err) {
      logger.error({ err }, "PnL curve error");
      Sentry.captureException(err);
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
      Sentry.addBreadcrumb({
        category: "stats",
        message: "Fetching win rate history",
        level: "info",
        data: { channel },
      });
      const history = await getWinRateHistory(channel);
      res.json(history);
    } catch (err) {
      logger.error({ err }, "Win rate history error");
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to get win rate history" });
    }
  },
);

// GET /api/stats/public-summary — no auth required
router.get(
  "/public-summary",
  apiLimiter,
  async (_req: AuthRequest, res: Response) => {
    try {
      Sentry.addBreadcrumb({
        category: "stats",
        message: "Fetching public summary",
        level: "info",
      });
      const stats = await getPublicSummary();
      res.json(stats);
    } catch (err) {
      logger.error({ err }, "Public summary error");
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to get summary" });
    }
  },
);

export default router;
