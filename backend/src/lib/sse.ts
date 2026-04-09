/**
 * SSE (Server-Sent Events) Module
 *
 * ARCHITECTURE NOTE (A9):
 * SSE is actively used by:
 * - Web dashboard: GET /api/signals/stream
 * - Extension endpoint exists: GET /api/extension/signals/live
 *
 * However, the Chrome extension (v2.1.5+) uses POLLING instead of SSE
 * because MV3 service workers cannot maintain persistent SSE connections.
 * The extension SSE endpoint remains available for future web-based clients.
 *
 * Decision: Keep SSE for web clients. Extension uses polling (service-worker.ts pollSignals).
 */

import { Response } from "express";
import { SSEClient } from "../types/index.js";
import { config } from "../config.js";
import { logger } from './logger.js';
import { sseActiveConnections, sseConnectionAgeSeconds, sseDisconnectsTotal, sseRejectedConnectionsTotal } from "./metrics.js";

const clients = new Map<string, SSEClient>();
const MAX_CLIENTS = 1000;
const HEARTBEAT_INTERVAL_MS = 30_000;
// Clients idle for 30s will be disconnected
const HEARTBEAT_TIMEOUT_MS = 30_000;
// Stale connections are checked every 10 seconds
const CLEANUP_INTERVAL_MS = 10_000;
// Log warnings when connection count reaches 90% of MAX_CLIENTS (900/1000)
const BACKPRESSURE_THRESHOLD = 0.9;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const client of clients.values()) {
      client.lastHeartbeat = now;
    }
    broadcast("heartbeat", { time: new Date().toISOString() });
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();

    // Find oldest connection age
    let oldestAge = 0;
    for (const client of clients.values()) {
      const age = (now - client.connectionTime) / 1000;
      if (age > oldestAge) {
        oldestAge = age;
      }
    }
    sseConnectionAgeSeconds.set(oldestAge);

    // Remove stale clients
    const staleClients: string[] = [];
    for (const [clientId, client] of clients.entries()) {
      if (now - client.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        logger.info({ clientId }, 'Removing stale SSE client');
        staleClients.push(clientId);
      }
    }

    staleClients.forEach(clientId => {
      removeClient(clientId);
      sseDisconnectsTotal.inc({ reason: 'timeout' });
    });
  }, CLEANUP_INTERVAL_MS);
}

export function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

export function addClient(client: SSEClient, endpoint: string = 'unknown'): boolean {
  if (clients.size >= MAX_CLIENTS) {
    sseRejectedConnectionsTotal.inc();
    return false;
  }

  if (clients.size > MAX_CLIENTS * BACKPRESSURE_THRESHOLD) {
    logger.warn(`SSE backpressure warning: ${clients.size} clients exceeds threshold of ${MAX_CLIENTS * BACKPRESSURE_THRESHOLD}`);
  }

  client.lastHeartbeat = Date.now();
  client.connectionTime = Date.now();
  client.endpoint = endpoint;
  clients.set(client.id, client);
  sseActiveConnections.inc({ endpoint });

  client.res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  client.res.write(`data: ${JSON.stringify({ event: "connected", clientId: client.id })}\n\n`);

  client.res.on("close", () => {
    const c = clients.get(client.id);
    if (c) {
      sseActiveConnections.dec({ endpoint: c.endpoint || 'unknown' });
      clients.delete(client.id);
      sseDisconnectsTotal.inc({ reason: 'client_close' });
    }
  });

  return true;
}

export function removeClient(clientId: string): void {
  const client = clients.get(clientId);
  if (client) {
    try {
      const disconnectPayload = `event: disconnect\ndata: ${JSON.stringify({ reason: 'removed', clientId })}\n\n`;
      client.res.write(disconnectPayload);
      client.res.end();
    } catch {
      // Connection already closed, ignore
    }
    sseActiveConnections.dec({ endpoint: client.endpoint || 'unknown' });
    clients.delete(clientId);
  }
}

export function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const failedClients: string[] = [];

  for (const client of clients.values()) {
    try {
      client.res.write(payload);
    } catch {
      failedClients.push(client.id);
    }
  }

  failedClients.forEach(id => {
    removeClient(id);
    sseDisconnectsTotal.inc({ reason: 'write_error' });
  });
}

export function sendToRole(
  event: string,
  data: unknown,
  role: string,
): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const failedClients: string[] = [];

  for (const client of clients.values()) {
    if (client.role === role || client.role === "admin") {
      try {
        client.res.write(payload);
      } catch {
        failedClients.push(client.id);
      }
    }
  }

  failedClients.forEach(id => {
    removeClient(id);
    sseDisconnectsTotal.inc({ reason: 'write_error' });
  });
}

export function sendSignalEvent(
  event: string,
  data: unknown,
  visibility: "free" | "premium",
): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const failedClients: string[] = [];

  for (const client of clients.values()) {
    const isPremium =
      client.role === "premium" || client.role === "admin";

    if (visibility === "premium" && !isPremium) {
      // Free users get delayed signal via setTimeout
      if (event === "signal:new" || event === "signal:active") {
        const clientId = client.id;
        setTimeout(() => {
          try {
            const c = clients.get(clientId);
            if (!c) return;
            const delayedPayload = `event: ${event}\ndata: ${JSON.stringify({ ...data as Record<string, unknown>, delayed: true })}\n\n`;
            c.res.write(delayedPayload);
          } catch {
            removeClient(clientId);
            sseDisconnectsTotal.inc({ reason: 'write_error' });
          }
        }, config.freeSignalDelayMin * 60 * 1000);
      }
      continue;
    }

    try {
      client.res.write(payload);
    } catch {
      failedClients.push(client.id);
    }
  }

  failedClients.forEach(id => {
    removeClient(id);
    sseDisconnectsTotal.inc({ reason: 'write_error' });
  });
}

export function getClientCount(): number {
  return clients.size;
}

export function clearAllClients(): void {
  for (const client of clients.values()) {
    try {
      client.res.end();
    } catch {
      // Ignore errors on close
    }
  }
  clients.clear();
  sseActiveConnections.reset();
}
