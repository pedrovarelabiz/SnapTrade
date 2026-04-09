import { Router, Response } from "express";
import * as Sentry from "@sentry/node";
import { logger } from "../lib/logger.js";
import { authMiddleware, optionalAuth } from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { AuthRequest, PaginationQuery } from "../types/index.js";
import {
  getSignalsPaginated,
  getSignalById,
  getYesterdaySummary,
  createSignal,
  updateSignalStatus,
  resolveSignal,
} from "../services/signalService.js";
import { addClient } from "../lib/sse.js";
import { randomUUID } from "crypto";

const router = Router();

// GET /api/signals — paginated list
router.get(
  "/",
  optionalAuth,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const query = req.query as PaginationQuery;
      const page = Math.max(1, parseInt(query.page || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(query.limit || "20", 10)));

      Sentry.setContext("signals_query", {
        page,
        limit,
        asset: query.asset,
        status: query.status,
        channel: query.channel,
        from: query.from,
        to: query.to,
      });

      const result = await getSignalsPaginated({
        page,
        limit,
        asset: query.asset,
        status: query.status,
        channel: query.channel,
        from: query.from,
        to: query.to,
        userRole: req.user?.role,
      });

      res.setHeader("X-Subscription-Tier", req.user?.role || "free");
      res.json(result);
    } catch (err) {
      Sentry.captureException(err);
      logger.error({ err }, "Signals list error");
      res.status(500).json({ error: "Failed to get signals" });
    }
  },
);

// GET /api/signals/stream — SSE stream
router.get(
  "/stream",
  // Also check query param token for SSE
  authMiddleware,
  (req: AuthRequest, res: Response) => {
    const clientId = randomUUID();
    const added = addClient({
      id: clientId,
      res,
      userId: req.user!.userId,
      role: req.user!.role,
      lastHeartbeat: Date.now(),
      connectionTime: Date.now(),
    }, 'signals');

    if (!added) {
      res.status(503).json({ error: "Too many connections" });
      return;
    }

    req.on("close", () => {
      // cleanup handled in addClient
    });
  },
);

// GET /api/signals/yesterday-summary — public
router.get(
  "/yesterday-summary",
  apiLimiter,
  async (_req: AuthRequest, res: Response) => {
    try {
      const summary = await getYesterdaySummary();
      res.json(summary);
    } catch (err) {
      logger.error({ err }, "Yesterday summary error");
      res.status(500).json({ error: "Failed to get summary" });
    }
  },
);

// GET /api/signals/:id
router.get(
  "/:id",
  optionalAuth,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const signalId = req.params.id as string;
      Sentry.setContext("signal_query", { signalId });

      const signal = await getSignalById(signalId);
      if (!signal) {
        res.status(404).json({ error: "Signal not found" });
        return;
      }

      // Check visibility: free users cannot see premium signals
      if (
        signal.visibility === "premium" &&
        req.user?.role !== "premium" &&
        req.user?.role !== "admin"
      ) {
        res.status(403).json({
          error: "Insufficient permissions to view this premium signal",
        });
        return;
      }

      res.setHeader("X-Subscription-Tier", req.user?.role || "free");
      res.json(signal);
    } catch (err) {
      Sentry.captureException(err);
      logger.error({ err }, "Signal detail error");
      res.status(500).json({ error: "Failed to get signal" });
    }
  },
);

// POST /api/signals — create new signal
router.post(
  "/",
  authMiddleware,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const { channel, type } = req.body;
      Sentry.setContext("signal_creation", { channel, type });

      const signal = await createSignal(req.body);
      res.status(201).json(signal);
    } catch (err) {
      Sentry.captureException(err);
      logger.error({ err }, "Signal creation error");
      res.status(500).json({ error: "Failed to create signal" });
    }
  },
);

// PUT/PATCH /api/signals/:id — update signal
router.put(
  "/:id",
  authMiddleware,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    const signalId = req.params.id as string;
    try {
      const { status } = req.body;

      Sentry.setContext("signal_update", {
        signalId,
        updateFields: req.body,
      });

      const signal = await updateSignalStatus(signalId, status);
      res.json(signal);
    } catch (err) {
      Sentry.captureException(err, {
        contexts: {
          signal_update: {
            signalId,
            updateFields: req.body,
          },
        },
      });
      logger.error({ err, signalId: req.params.id }, "Signal update error");
      res.status(500).json({ error: "Failed to update signal" });
    }
  },
);

router.patch(
  "/:id",
  authMiddleware,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    const signalId = req.params.id as string;
    try {
      const { status } = req.body;

      Sentry.setContext("signal_update", {
        signalId,
        updateFields: req.body,
      });

      const signal = await updateSignalStatus(signalId, status);
      res.json(signal);
    } catch (err) {
      Sentry.captureException(err, {
        contexts: {
          signal_update: {
            signalId,
            updateFields: req.body,
          },
        },
      });
      logger.error({ err, signalId: req.params.id }, "Signal update error");
      res.status(500).json({ error: "Failed to update signal" });
    }
  },
);

// POST /api/signals/:id/result — submit match result with metadata
router.post(
  "/:id/result",
  authMiddleware,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    const signalId = req.params.id as string;
    try {
      const { result, galeLevel, resultMsgId, resultIteration, match_tier, match_confidence } = req.body;

      // Validate match_tier if provided
      if (match_tier !== undefined && ![1, 2, 3].includes(match_tier)) {
        res.status(400).json({ error: "match_tier must be 1, 2, or 3" });
        return;
      }

      Sentry.setContext("signal_result", {
        signalId,
        result,
        match_tier,
        match_confidence,
      });

      const signal = await resolveSignal(signalId, {
        result,
        galeLevel,
        resultMsgId,
        resultIteration,
        match_tier,
        match_confidence,
      });
      res.json(signal);
    } catch (err) {
      Sentry.captureException(err, {
        contexts: {
          signal_result: {
            signalId,
            body: req.body,
          },
        },
      });
      logger.error({ err, signalId }, "Signal result error");
      res.status(500).json({ error: "Failed to submit result" });
    }
  },
);

export default router;
