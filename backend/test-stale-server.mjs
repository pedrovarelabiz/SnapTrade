#!/usr/bin/env node

/**
 * Standalone SSE server with stale connection cleanup
 * Implements the same timeout logic as the production SSE module
 */

import express from 'express';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = 3002;
const JWT_SECRET = 'test-jwt-secret-for-backup-health-testing';

// SSE Configuration (matches production)
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const HEARTBEAT_TIMEOUT_MS = 30_000; // 30 seconds idle before cleanup
const CLEANUP_INTERVAL_MS = 10_000; // Check every 10 seconds

// Track connections and metrics
const clients = new Map();
let clientCounter = 0;
let timeoutDisconnects = 0;
let heartbeatTimer = null;
let cleanupTimer = null;

// Start heartbeat broadcast
function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const heartbeatPayload = `event: heartbeat\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`;

    for (const [clientId, client] of clients.entries()) {
      try {
        client.res.write(heartbeatPayload);
        console.log(`[HEARTBEAT] Sent to ${clientId}`);
      } catch (err) {
        console.log(`[HEARTBEAT] Failed to send to ${clientId}, removing`);
        clients.delete(clientId);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  console.log(`[SERVER] Heartbeat timer started (${HEARTBEAT_INTERVAL_MS}ms interval)`);
}

// Start stale connection cleanup
function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    console.log(`[CLEANUP] Running cleanup check (${clients.size} active connections)`);

    for (const [clientId, client] of clients.entries()) {
      const idleTime = now - client.lastHeartbeat;
      console.log(`[CLEANUP] Client ${clientId} idle for ${(idleTime / 1000).toFixed(1)}s`);

      if (idleTime > HEARTBEAT_TIMEOUT_MS) {
        console.log(`[CLEANUP] Removing stale client ${clientId} (idle ${(idleTime / 1000).toFixed(1)}s > ${HEARTBEAT_TIMEOUT_MS / 1000}s)`);

        // Close the connection
        try {
          client.res.end();
        } catch (err) {
          console.log(`[CLEANUP] Error closing connection for ${clientId}:`, err.message);
        }

        clients.delete(clientId);
        timeoutDisconnects++;
        console.log(`[METRICS] timeout disconnects: ${timeoutDisconnects}`);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  console.log(`[SERVER] Cleanup timer started (${CLEANUP_INTERVAL_MS}ms interval)`);
}

// Middleware to verify JWT
const verifyAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// SSE endpoint
app.get('/api/signals/stream', verifyAuth, (req, res) => {
  const clientId = `client-${++clientCounter}`;
  const now = Date.now();

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Track client
  const client = {
    id: clientId,
    res,
    lastHeartbeat: now,
    connectionTime: now,
    userId: req.user.userId,
  };

  clients.set(clientId, client);
  console.log(`[SSE] Client connected: ${clientId} (Active: ${clients.size})`);

  // Send connected event
  res.write(`data: ${JSON.stringify({ event: 'connected', clientId })}\n\n`);

  // NOTE: We do NOT update lastHeartbeat after initial connection.
  // This matches production behavior where clients are disconnected after
  // HEARTBEAT_TIMEOUT_MS regardless of server writes succeeding.
  // In a real implementation, you'd want to track client ACKs or detect
  // TCP backpressure to properly identify stalled connections.

  // Handle client disconnect
  res.on('close', () => {
    const wasTimeout = clients.has(clientId);
    clients.delete(clientId);
    const duration = ((Date.now() - client.connectionTime) / 1000).toFixed(2);
    console.log(`[SSE] Client disconnected: ${clientId} (Duration: ${duration}s, Active: ${clients.size})`);
  });
});

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
  const metrics = `# HELP sse_active_connections Number of active SSE connections
# TYPE sse_active_connections gauge
sse_active_connections{endpoint="signals"} ${clients.size}

# HELP sse_disconnects_total Total number of SSE disconnections
# TYPE sse_disconnects_total counter
sse_disconnects_total{reason="timeout"} ${timeoutDisconnects}
`;

  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics);
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeConnections: clients.size,
    timeoutDisconnects,
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n=== SSE Test Server Started ===`);
  console.log(`Listening on: http://localhost:${PORT}`);
  console.log(`\nConfiguration:`);
  console.log(`  Heartbeat interval: ${HEARTBEAT_INTERVAL_MS / 1000}s`);
  console.log(`  Timeout threshold: ${HEARTBEAT_TIMEOUT_MS / 1000}s`);
  console.log(`  Cleanup interval: ${CLEANUP_INTERVAL_MS / 1000}s`);
  console.log(`\nEndpoints:`);
  console.log(`  SSE: http://localhost:${PORT}/api/signals/stream`);
  console.log(`  Metrics: http://localhost:${PORT}/api/metrics`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`\n===============================\n`);

  // Start timers
  startHeartbeat();
  startCleanup();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down server...');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n\nShutting down server...');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
