/**
 * Relay Routes — Internal publishing + status monitoring
 *
 * POST /api/relay/publish — internal endpoint for server extension to push messages
 * GET  /api/relay/status  — monitoring endpoint for relay health
 */

import { Router, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { config } from "../config.js";
import { relayPublish, getRelayStatus } from "../lib/relay.js";
import { prisma } from "../lib/prisma.js";
import type { RelayPublishPayload } from "../types/relay.js";

const router = Router();

/**
 * Validate publish authorization.
 * Accepts: INTERNAL_API_KEY via X-Internal-Key or Bearer header,
 * OR admin extension token via Bearer header.
 */
async function requirePublishAuth(req: Request, res: Response): Promise<boolean> {
  const internalKey = req.headers["x-internal-key"] as string;
  const bearerToken = req.headers.authorization?.replace("Bearer ", "");

  // Check internal API key first (fastest path)
  if (internalKey && internalKey === config.internalApiKey) return true;
  if (bearerToken && bearerToken === config.internalApiKey) return true;

  // Check admin extension token (for server extension on VPS)
  if (bearerToken && bearerToken.startsWith("st_ext_")) {
    try {
      const user = await prisma.user.findUnique({
        where: { extensionToken: bearerToken },
        select: { role: true },
      });
      if (user?.role === "admin") return true;
    } catch {
      // DB error — deny
    }
  }

  res.status(403).json({ error: "Unauthorized" });
  return false;
}

/**
 * POST /api/relay/publish
 *
 * Internal endpoint — called by server extension to push messages to connected clients.
 * Authenticated via INTERNAL_API_KEY or admin extension token.
 *
 * Body: { message: ServerToClientMessage, filter?: { tier?, userId? } }
 */
router.post("/publish", async (req: Request, res: Response) => {
  if (!(await requirePublishAuth(req, res))) return;

  try {
    const { message, filter } = req.body as RelayPublishPayload;

    if (!message || !message.type) {
      res.status(400).json({ error: "message.type required" });
      return;
    }

    const validTypes = [
      "SIGNAL_RAW",
      "SIGNAL_APPROVED",
      "TRADE_EXEC",
      "TRADE_RESULT",
      "INDICATOR_SNAPSHOT",
      "PAIR_SUMMARIES",
      "SHADOW_STATS",
      "STATE_SYNC",
      "TIER_LIMIT",
    ];

    if (!validTypes.includes(message.type)) {
      res.status(400).json({ error: `Unknown message type: ${message.type}` });
      return;
    }

    relayPublish({ message, filter });

    res.json({ ok: true, type: message.type });
  } catch (err: any) {
    logger.error({ err: err.message }, "[relay] Publish error");
    res.status(500).json({ error: "Publish failed" });
  }
});

/**
 * POST /api/relay/publish-batch
 *
 * Publish multiple messages in one call (e.g., indicator snapshots for many pairs).
 * Body: { messages: RelayPublishPayload[] }
 */
router.post("/publish-batch", async (req: Request, res: Response) => {
  if (!(await requirePublishAuth(req, res))) return;

  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array required" });
      return;
    }

    if (messages.length > 200) {
      res.status(400).json({ error: "Max 200 messages per batch" });
      return;
    }

    let published = 0;
    for (const payload of messages) {
      if (payload.message?.type) {
        relayPublish(payload);
        published++;
      }
    }

    res.json({ ok: true, published });
  } catch (err: any) {
    logger.error({ err: err.message }, "[relay] Batch publish error");
    res.status(500).json({ error: "Batch publish failed" });
  }
});

/**
 * GET /api/relay/status
 *
 * Public monitoring endpoint — returns relay health and connection counts.
 */
router.get("/status", (_req: Request, res: Response) => {
  try {
    const status = getRelayStatus();
    res.json(status);
  } catch (err: any) {
    logger.error({ err: err.message }, "[relay] Status error");
    res.status(500).json({ error: "Status failed" });
  }
});

export default router;
