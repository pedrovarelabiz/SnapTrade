/**
 * WebSocket Relay Server Module
 *
 * Manages authenticated WebSocket connections from client extensions.
 * Receives published signals from the server extension and fans them out
 * to all connected clients filtered by tier/role.
 *
 * Phase 0: Core infrastructure (auth, heartbeat, fan-out, state tracking)
 * Phase 4: Tier enforcement, multi-device dedup, PO user ID binding
 */

import { WebSocketServer, WebSocket, RawData } from "ws";
import { IncomingMessage } from "http";
import { Server as HttpServer } from "http";
import { URL } from "url";
import { logger } from "./logger.js";
import { getUserTier, shouldSendSignal, canUserTrade, recordTrade, recordBlockedTrade } from "../services/tierService.js";
import { prisma } from "./prisma.js";
import type {
  RelayClient,
  ServerToClientMessage,
  ClientToServerMessage,
  RelayPublishPayload,
  RelayStatus,
  RelayStateSync,
  RelaySignalApproved,
  RelayTradeResult,
} from "../types/relay.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_CLIENTS = 500;
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;
const CLEANUP_INTERVAL_MS = 15_000;
const MAX_MESSAGE_SIZE = 64 * 1024; // 64 KB
const MAX_RECENT_SIGNALS = 20;
const MAX_RECENT_RESULTS = 20;
const PRIMARY_FAILOVER_GRACE_MS = 30_000;

// ─── State ──────────────────────────────────────────────────────────────────

// client.id → { client metadata }
const clients = new Map<string, RelayClient>();
// client.id → WebSocket instance (separate to keep RelayClient serializable)
const sockets = new Map<string, WebSocket>();
// userId → Set<clientId> (for multi-device tracking)
const userClients = new Map<string, Set<string>>();
// Counters
let messagesPublished = 0;
const startedAt = Date.now();

// Tier cache (populated on connection, refreshed periodically)
const clientTierCache = new Map<string, { tierName: string; canAutoTrade: boolean; canManualTrade: boolean; allowedPairs: string[]; maxDailyTrades: number }>();


function getUserTierCached_sync(userId: string) {
  return clientTierCache.get(userId) || { tierName: "demo", canAutoTrade: false, canManualTrade: false, allowedPairs: [] as string[], maxDailyTrades: 5 };
}

async function getUserTierCached(userId: string) {
  const cached = clientTierCache.get(userId);
  if (cached) return cached;
  try {
    const tier = await getUserTier(userId);
    const entry = { tierName: tier.tierName, canAutoTrade: tier.canAutoTrade, canManualTrade: tier.canManualTrade, allowedPairs: [...tier.allowedPairs], maxDailyTrades: tier.maxDailyTrades };
    clientTierCache.set(userId, entry);
    return entry;
  } catch { return null; }
}


// Server state cache (updated by server extension via publish)
let cachedState: RelayStateSync | null = null;
const recentSignals: RelaySignalApproved[] = [];
const recentResults: RelayTradeResult[] = [];

// Timers
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

// ─── WSS Setup ──────────────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;

export function initRelay(server: HttpServer): void {
  if (wss) {
    logger.warn("[relay] Already initialized");
    return;
  }

  wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_SIZE,
  });

  // Handle upgrade requests for /ws/signals
  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;

    if (pathname === "/ws/signals") {
      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit("connection", ws, request);
      });
    } else {
      // Not our path — destroy
      socket.destroy();
    }
  });

  wss.on("connection", handleConnection);

  startHeartbeatTimer();
  startCleanupTimer();

  logger.info("[relay] WebSocket relay server initialized on /ws/signals");
}

export function shutdownRelay(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  for (const [id, ws] of sockets.entries()) {
    try {
      ws.close(1001, "Server shutting down");
    } catch { /* ignore */ }
    sockets.delete(id);
  }
  clients.clear();
  userClients.clear();

  if (wss) {
    wss.close();
    wss = null;
  }

  logger.info("[relay] Relay server shut down");
}

// ─── Connection Handler ─────────────────────────────────────────────────────

function handleConnection(ws: WebSocket, request: IncomingMessage): void {
  // Extract token from query string
  const url = new URL(request.url || "/", "http://localhost");
  const token = url.searchParams.get("token");

  if (!token) {
    sendToSocket(ws, { type: "ERROR", code: "AUTH_REQUIRED", message: "Token required in query string" });
    ws.close(4001, "Token required");
    return;
  }

  // Authenticate asynchronously
  authenticateAndRegister(ws, token, request).catch((err) => {
    logger.error({ err: err.message }, "[relay] Auth error");
    sendToSocket(ws, { type: "ERROR", code: "AUTH_FAILED", message: "Authentication failed" });
    ws.close(4002, "Auth failed");
  });
}

async function authenticateAndRegister(
  ws: WebSocket,
  token: string,
  _request: IncomingMessage,
): Promise<void> {
  // Validate token against DB
  const user = await prisma.user.findUnique({
    where: { extensionToken: token },
    select: {
      id: true,
      email: true,
      role: true,
      subscription: { select: { status: true } },
    },
  });

  if (!user) {
    sendToSocket(ws, { type: "ERROR", code: "INVALID_TOKEN", message: "Invalid extension token" });
    ws.close(4003, "Invalid token");
    return;
  }

  // Check subscription
  const sub = user.subscription as any;
  if (sub?.status === "expired" || sub?.status === "cancelled") {
    sendToSocket(ws, { type: "ERROR", code: "SUBSCRIPTION_EXPIRED", message: "Subscription expired" });
    ws.close(4004, "Subscription expired");
    return;
  }

  if (clients.size >= MAX_CLIENTS) {
    sendToSocket(ws, { type: "ERROR", code: "SERVER_FULL", message: "Too many connections" });
    ws.close(4005, "Server full");
    return;
  }

  // Generate client ID
  const clientId = `relay_${user.id}_${Date.now().toString(36)}`;

  // Check max devices per user (Phase 4 will enforce strictly)
  const existingClients = userClients.get(user.id);
  const existingCount = existingClients?.size ?? 0;

  // Determine primary status
  const isPrimary = existingCount === 0;

  const client: RelayClient = {
    id: clientId,
    userId: user.id,
    email: user.email,
    role: user.role,
    machineId: clientId, // Will be updated by AUTH message from client
    isPrimary,
    connectedAt: Date.now(),
    lastHeartbeat: Date.now(),
    lastMessageAt: Date.now(),
    preferences: {},
  };

  // Register
  clients.set(clientId, client);
  sockets.set(clientId, ws);

  if (!userClients.has(user.id)) {
    userClients.set(user.id, new Set());
  }
  userClients.get(user.id)!.add(clientId);

  logger.info({
    clientId,
    userId: user.id,
    isPrimary,
    totalClients: clients.size,
  }, "[relay] Client connected");

  // Pre-populate tier cache
  getUserTierCached(user.id).catch(() => {});

  // Setup message handler
  ws.on("message", (data: RawData) => {
    handleClientMessage(clientId, data);
  });

  ws.on("close", () => {
    handleDisconnect(clientId);
  });

  ws.on("error", (err) => {
    logger.warn({ clientId, err: err.message }, "[relay] WS error");
    handleDisconnect(clientId);
  });

  // Send initial state
  sendToSocket(ws, {
    type: "DEVICE_STATUS",
    isPrimary,
    otherDevices: getOtherDevices(user.id, clientId),
  });

  // Send cached state if available
  if (cachedState) {
    sendToSocket(ws, {
      ...cachedState,
      recentSignals,
      recentResults,
    });
  }

  // Send heartbeat
  sendToSocket(ws, {
    type: "HEARTBEAT",
    ts: Date.now(),
    connectedClients: clients.size,
  });
}

// ─── Client Message Handling ────────────────────────────────────────────────

function handleClientMessage(clientId: string, data: RawData): void {
  const client = clients.get(clientId);
  if (!client) return;

  // Update activity
  client.lastMessageAt = Date.now();
  client.lastHeartbeat = Date.now();

  let msg: ClientToServerMessage;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    logger.warn({ clientId }, "[relay] Invalid JSON from client");
    return;
  }

  switch (msg.type) {
    case "HEARTBEAT":
      // Already updated lastHeartbeat above
      break;

    case "AUTH":
      // Client sends additional info (poUserId, machineId)
      // Update client record (use Object.assign to update readonly fields in controlled way)
      Object.assign(client, {
        machineId: msg.machineId || client.machineId,
        poUserId: msg.poUserId || client.poUserId,
      });
      logger.info({ clientId, machineId: msg.machineId, poUserId: msg.poUserId }, "[relay] Client auth details updated");
      break;

    case "PREFERENCES":
      Object.assign(client, {
        preferences: {
          pairs: msg.pairs,
          minConfidence: msg.minConfidence,
          notifications: msg.notifications,
        },
      });
      break;

    case "TRADE_CLAIM":
      // Phase 4: implement trade claim dedup
      logger.info({ clientId, signalId: msg.signalId }, "[relay] Trade claim (Phase 4)");
      break;

    case "TRADE_CONFIRMED":
      logger.info({ clientId, signalId: msg.signalId, success: msg.success }, "[relay] Trade confirmed by client");
      break;

    case "TRADE_RESULT_LOCAL":
      logger.info({
        clientId,
        signalId: msg.signalId,
        result: msg.result,
        pnl: msg.pnl,
      }, "[relay] Client trade result");
      break;

    case "MANUAL_TRADE_REQUEST":
      // Phase 5: implement manual trade execution
      logger.info({ clientId, signalId: msg.signalId, symbol: msg.symbol }, "[relay] Manual trade request (Phase 5)");
      break;

    default:
      logger.warn({ clientId, type: (msg as any).type }, "[relay] Unknown message type");
  }
}

// ─── Disconnect Handling ────────────────────────────────────────────────────

function handleDisconnect(clientId: string): void {
  const client = clients.get(clientId);
  if (!client) return;

  const ws = sockets.get(clientId);
  if (ws) {
    try { ws.close(); } catch { /* ignore */ }
    sockets.delete(clientId);
  }

  clients.delete(clientId);

  // Remove from user tracking
  const userSet = userClients.get(client.userId);
  if (userSet) {
    userSet.delete(clientId);

    // If primary disconnected, promote another device after grace period
    if (client.isPrimary && userSet.size > 0) {
      const remainingId = userSet.values().next().value;
      if (remainingId) {
        setTimeout(() => {
          const remaining = clients.get(remainingId);
          if (remaining && !remaining.isPrimary) {
            Object.assign(remaining, { isPrimary: true });
            const remainingWs = sockets.get(remainingId);
            if (remainingWs) {
              sendToSocket(remainingWs, {
                type: "DEVICE_STATUS",
                isPrimary: true,
                otherDevices: [],
              });
            }
            logger.info({ clientId: remainingId, userId: client.userId }, "[relay] Device promoted to primary");
          }
        }, PRIMARY_FAILOVER_GRACE_MS);
      }
    }

    if (userSet.size === 0) {
      userClients.delete(client.userId);
    }
  }

  logger.info({
    clientId,
    userId: client.userId,
    totalClients: clients.size,
  }, "[relay] Client disconnected");
}

// ─── Publish (Server Extension → Relay → Clients) ──────────────────────────

export function relayPublish(payload: RelayPublishPayload): void {
  const { message, filter } = payload;
  messagesPublished++;

  // Cache state updates
  if (message.type === "STATE_SYNC") {
    cachedState = message;
  }

  if (message.type === "SIGNAL_APPROVED") {
    recentSignals.push(message);
    if (recentSignals.length > MAX_RECENT_SIGNALS) {
      recentSignals.shift();
    }
  }

  if (message.type === "TRADE_RESULT") {
    recentResults.push(message);
    if (recentResults.length > MAX_RECENT_RESULTS) {
      recentResults.shift();
    }
  }

  // Fan-out to connected clients
  const payload_str = JSON.stringify(message);
  const failedClients: string[] = [];

  for (const [clientId, client] of clients.entries()) {
    // Apply filter
    if (filter?.userId && client.userId !== filter.userId) continue;

    // Phase 4: Tier filtering
    // Cache tier lookup per publish call (same user may have multiple devices)
    
    const clientTier = getUserTierCached_sync(client.userId);
    
    if (!shouldSendSignal(clientTier, message.type as string, (message as any).symbol)) continue;

    const ws = sockets.get(clientId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      failedClients.push(clientId);
      continue;
    }

    try {
      ws.send(payload_str);
    } catch {
      failedClients.push(clientId);
    }
  }

  // Cleanup failed clients
  for (const id of failedClients) {
    handleDisconnect(id);
  }

  if (clients.size > 0) {
    logger.debug({
      type: message.type,
      recipients: clients.size - failedClients.length,
      failed: failedClients.length,
    }, "[relay] Message published");
  }
}

// ─── Timers ─────────────────────────────────────────────────────────────────

function startHeartbeatTimer(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const hb: ServerToClientMessage = {
      type: "HEARTBEAT",
      ts: Date.now(),
      connectedClients: clients.size,
    };
    const payload = JSON.stringify(hb);

    for (const [clientId, ws] of sockets.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
        } catch {
          handleDisconnect(clientId);
        }
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function startCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const stale: string[] = [];

    for (const [clientId, client] of clients.entries()) {
      if (now - client.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        stale.push(clientId);
      }
    }

    for (const id of stale) {
      logger.info({ clientId: id }, "[relay] Removing stale client");
      handleDisconnect(id);
    }
  }, CLEANUP_INTERVAL_MS);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sendToSocket(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Will be cleaned up by error/close handler
    }
  }
}

function getOtherDevices(userId: string, excludeClientId: string): { id: string; lastSeen: number }[] {
  const userSet = userClients.get(userId);
  if (!userSet) return [];

  const devices: { id: string; lastSeen: number }[] = [];
  for (const cid of userSet) {
    if (cid === excludeClientId) continue;
    const c = clients.get(cid);
    if (c) {
      devices.push({ id: c.machineId, lastSeen: c.lastHeartbeat });
    }
  }
  return devices;
}

// ─── Status ─────────────────────────────────────────────────────────────────

export function getRelayStatus(): RelayStatus {
  const clientsByRole: Record<string, number> = {};
  for (const client of clients.values()) {
    clientsByRole[client.role] = (clientsByRole[client.role] || 0) + 1;
  }

  return {
    connectedClients: clients.size,
    clientsByRole,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    messagesPublished,
    startedAt,
  };
}

export function getRelayClientCount(): number {
  return clients.size;
}
