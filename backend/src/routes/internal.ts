import { Router, Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { logger } from "../lib/logger.js";
import { apiKeyMiddleware } from "../middleware/apiKey.js";
import { internalLimiter } from "../middleware/rateLimiter.js";
import {
  createSignal,
  resolveSignal,
  updateSignalStatus,
  getFreeCountToday,
  getActiveSignals,
  activateSignal,
  createResolvedSignal,
  getSignalById,
  getSignalsByExpirationRange,
} from "../services/signalService.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.use(apiKeyMiddleware);
router.use(internalLimiter);

// GET /api/internal/metrics — lightweight health/metrics snapshot for internal consumers
router.get("/metrics", async (_req: Request, res: Response) => {
  try {
    const [signalCount, channelCount] = await Promise.all([
      prisma.signal.count(),
      prisma.channel.count({ where: { isActive: true } }),
    ]);
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      signals: { total: signalCount },
      channels: { active: channelCount },
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error({ err }, "Error fetching internal metrics");
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

// GET /api/internal/channels — list all active channels
router.get("/channels", async (_req: Request, res: Response) => {
  try {
    const channels = await prisma.channel.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    res.json(channels);
  } catch (err) {
    Sentry.setTag('source', 'telegram-listener');
    Sentry.captureException(err);
    logger.error({ err }, "Error listing channels");
    res.status(500).json({ error: "Failed to list channels" });
  }
});

// PATCH /api/internal/channels/:id — update channel counters
router.patch("/channels/:id", async (req: Request, res: Response) => {
  try {
    const channel = await prisma.channel.update({
      where: { id: req.params.id as string },
      data: req.body,
    });
    res.json(channel);
  } catch (err: any) {
    if (err?.code === "P2025") {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    Sentry.setTag('source', 'telegram-listener');
    Sentry.captureException(err);
    logger.error({ err }, "Error updating channel");
    res.status(500).json({ error: "Failed to update channel" });
  }
});

// POST /api/internal/signals — create a new signal from listener
router.post("/signals", async (req: Request, res: Response) => {
  try {
    // If status is "resolved", create with result already set (inline formats)
    if (req.body.status === "resolved" && req.body.result) {
      const signal = await createResolvedSignal(req.body);
      if (req.body.expirationTime) {
        logger.info({
          signalId: signal.id,
          asset: signal.asset,
          entryTimeUtc: signal.entryTimeUtc,
          expirationTime: req.body.expirationTime
        }, "Signal created with expirationTime");
      }
      res.status(201).json(signal);
    } else {
      const signal = await createSignal(req.body);
      if (req.body.expirationTime) {
        logger.info({
          signalId: signal.id,
          asset: signal.asset,
          entryTimeUtc: signal.entryTimeUtc,
          expirationTime: req.body.expirationTime
        }, "Signal created with expirationTime");
      }
      res.status(201).json(signal);
    }
  } catch (err) {
    Sentry.setTag('source', 'telegram-listener');
    Sentry.captureException(err);
    logger.error({ err }, "Error creating signal");
    res.status(500).json({ error: "Failed to create signal" });
  }
});

// POST /api/internal/signals/:id/activate — activate a pending signal
router.post("/signals/:id/activate", async (req: Request, res: Response) => {
  try {
    const signal = await activateSignal(req.params.id as string);
    res.json(signal);
  } catch (err: any) {
    if (err?.code === "P2025") {
      res.status(404).json({ error: "Signal not found" });
      return;
    }
    Sentry.setTag('source', 'telegram-listener');
    Sentry.captureException(err);
    logger.error({ err }, "Error activating signal");
    res.status(500).json({ error: "Failed to activate signal" });
  }
});

// PATCH /api/internal/signals/:id/result — resolve with result
router.patch(
  "/signals/:id/result",
  async (req: Request, res: Response) => {
    try {
      // Validate match_tier if provided
      const { match_tier, match_confidence } = req.body;
      if (match_tier !== undefined && ![1, 2, 3].includes(match_tier)) {
        res.status(400).json({ error: "match_tier must be 1, 2, or 3" });
        return;
      }

      const signal = await resolveSignal(req.params.id as string, req.body);
      res.json(signal);
    } catch (err: any) {
      if (err?.code === "P2025") {
        res.status(404).json({ error: "Signal not found" });
        return;
      }
      Sentry.setTag('source', 'telegram-listener');
      Sentry.captureException(err);
      logger.error({ err }, "Error resolving signal");
      res.status(500).json({ error: "Failed to resolve signal" });
    }
  },
);

// PATCH /api/internal/signals/:id/status — update status
router.patch(
  "/signals/:id/status",
  async (req: Request, res: Response) => {
    try {
      const signal = await updateSignalStatus(
        req.params.id as string,
        req.body.status,
      );
      res.json(signal);
    } catch (err: any) {
      if (err?.code === "P2025") {
        res.status(404).json({ error: "Signal not found" });
        return;
      }
      Sentry.setTag('source', 'telegram-listener');
      Sentry.captureException(err);
      logger.error({ err }, "Error updating signal status");
      res.status(500).json({ error: "Failed to update signal status" });
    }
  },
);

// GET /api/internal/signals/free-count-today
router.get(
  "/signals/free-count-today",
  async (_req: Request, res: Response) => {
    try {
      const count = await getFreeCountToday();
      res.json({ count });
    } catch (err) {
      Sentry.setTag('source', 'telegram-listener');
      Sentry.captureException(err);
      logger.error({ err }, "Error getting free count");
      res.status(500).json({ error: "Failed to get free count" });
    }
  },
);

// GET /api/internal/signals/active — for listener recovery
router.get("/signals/active", async (_req: Request, res: Response) => {
  try {
    const signals = await getActiveSignals();
    res.json(signals);
  } catch (err) {
    Sentry.setTag('source', 'telegram-listener');
    Sentry.captureException(err);
    logger.error({ err }, "Error getting active signals");
    res.status(500).json({ error: "Failed to get active signals" });
  }
});

// GET /api/internal/signals/expiring — get signals by expiration time range
router.get("/signals/expiring", async (req: Request, res: Response) => {
  try {
    const { asset, startTime, endTime } = req.query;
    const signals = await getSignalsByExpirationRange({
      asset: asset as string,
      expirationTimeStart: startTime as string,
      expirationTimeEnd: endTime as string,
    });
    res.json(signals);
  } catch (err) {
    Sentry.setTag('source', 'telegram-listener');
    Sentry.captureException(err);
    logger.error({ err }, "Error getting signals by expiration range");
    res.status(500).json({ error: "Failed to get signals by expiration range" });
  }
});

// GET /api/internal/signals/:id — get signal by ID
router.get("/signals/:id", async (req: Request, res: Response) => {
  try {
    const signal = await getSignalById(req.params.id as string);
    if (!signal) {
      res.status(404).json({ error: "Signal not found" });
      return;
    }
    res.json(signal);
  } catch (err: any) {
    Sentry.setTag('source', 'telegram-listener');
    Sentry.captureException(err);
    logger.error({ err }, "Error getting signal by ID");
    res.status(500).json({ error: "Failed to get signal" });
  }
});

export default router;
