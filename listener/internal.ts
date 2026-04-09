import { Router, Request, Response } from "express";
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
} from "../services/signalService.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.use(apiKeyMiddleware);
router.use(internalLimiter);

// GET /api/internal/channels — list all active channels
router.get("/channels", async (_req: Request, res: Response) => {
  try {
    const channels = await prisma.channel.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    res.json(channels);
  } catch (err) {
    console.error("Error listing channels:", err);
    res.status(500).json({ error: "Failed to list channels" });
  }
});

// PATCH /api/internal/channels/:id — update channel counters
router.patch("/channels/:id", async (req: Request, res: Response) => {
  try {
    const channel = await prisma.channel.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(channel);
  } catch (err) {
    console.error("Error updating channel:", err);
    res.status(500).json({ error: "Failed to update channel" });
  }
});

// POST /api/internal/signals — create a new signal from listener
router.post("/signals", async (req: Request, res: Response) => {
  try {
    // If status is "resolved", create with result already set (inline formats)
    if (req.body.status === "resolved" && req.body.result) {
      const signal = await createResolvedSignal(req.body);
      res.status(201).json(signal);
    } else {
      const signal = await createSignal(req.body);
      res.status(201).json(signal);
    }
  } catch (err) {
    console.error("Error creating signal:", err);
    res.status(500).json({ error: "Failed to create signal" });
  }
});

// POST /api/internal/signals/:id/activate — activate a pending signal
router.post("/signals/:id/activate", async (req: Request, res: Response) => {
  try {
    const signal = await activateSignal(req.params.id);
    res.json(signal);
  } catch (err) {
    console.error("Error activating signal:", err);
    res.status(500).json({ error: "Failed to activate signal" });
  }
});

// PATCH /api/internal/signals/:id/result — resolve with result
router.patch(
  "/signals/:id/result",
  async (req: Request, res: Response) => {
    try {
      const signal = await resolveSignal(req.params.id, req.body);
      res.json(signal);
    } catch (err) {
      console.error("Error resolving signal:", err);
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
        req.params.id,
        req.body.status,
      );
      res.json(signal);
    } catch (err) {
      console.error("Error updating signal status:", err);
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
      console.error("Error getting free count:", err);
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
    console.error("Error getting active signals:", err);
    res.status(500).json({ error: "Failed to get active signals" });
  }
});

export default router;
