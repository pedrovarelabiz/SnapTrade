import { Router, Response } from "express";
import * as Sentry from "@sentry/node";
import { logger } from "../lib/logger.js";
import { authMiddleware } from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { roleGuard } from "../middleware/roleGuard.js";
import { AuthRequest } from "../types/index.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

// GET /api/analytics/match-tier-distribution — admin only
router.get(
  "/match-tier-distribution",
  authMiddleware,
  roleGuard("admin"),
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const dateParam = req.query.date as string | undefined;
      const date = dateParam ? new Date(dateParam) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      Sentry.addBreadcrumb({
        category: "analytics",
        message: "Fetching match tier distribution",
        level: "info",
        data: { date: date.toISOString() },
      });

      const results = await prisma.$queryRaw<Array<{
        match_tier: string;
        count: bigint;
        avg_confidence: number;
      }>>`
        SELECT
          match_tier,
          COUNT(*) as count,
          AVG(match_confidence) as avg_confidence
        FROM Signal
        WHERE matched_at > ${date}
        GROUP BY match_tier
        ORDER BY match_tier
      `;

      const tierDistribution = results.map(row => ({
        matchTier: row.match_tier,
        count: Number(row.count),
        avgConfidence: row.avg_confidence ? Math.round(row.avg_confidence * 100) / 100 : 0,
      }));

      res.json({
        date: date.toISOString(),
        tiers: tierDistribution,
      });
    } catch (err) {
      logger.error({ err }, "Match tier distribution error");
      Sentry.captureException(err);
      res.status(500).json({ error: "Failed to get tier distribution" });
    }
  },
);

export default router;
