#!/usr/bin/env node

/**
 * Standalone SSE test server - no database required
 * Used for manual curl testing of SSE endpoints
 */

const express = require('express');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3001;
const JWT_SECRET = 'test-jwt-secret-for-backup-health-testing';

// Track active SSE connections
const activeConnections = new Map();
let connectionCounter = 0;

// Generate a test JWT token
const TEST_TOKEN = jwt.sign(
  { userId: 'test-user-123', email: 'test@example.com', role: 'user' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

// Middleware to verify JWT
const verifyAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const tokenFromQuery = req.query.token;

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : tokenFromQuery;

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
  const clientId = `client-${++connectionCounter}-${Date.now()}`;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Track connection
  const connectionStart = Date.now();
  activeConnections.set(clientId, {
    userId: req.user.userId,
    connectedAt: connectionStart,
    res
  });

  console.log(`[SSE] Client connected: ${clientId} (Active: ${activeConnections.size})`);

  // Send connected event
  const connectedEvent = JSON.stringify({
    type: 'connected',
    clientId,
    timestamp: new Date().toISOString(),
    message: 'SSE connection established'
  });

  res.write(`event: connected\n`);
  res.write(`data: ${connectedEvent}\n\n`);

  // Send periodic heartbeat
  const heartbeatInterval = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeatInterval);
      return;
    }

    const heartbeat = JSON.stringify({
      type: 'heartbeat',
      timestamp: new Date().toISOString()
    });

    res.write(`: heartbeat\n`);
    res.write(`data: ${heartbeat}\n\n`);
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    activeConnections.delete(clientId);

    const connectionDuration = (Date.now() - connectionStart) / 1000;
    console.log(`[SSE] Client disconnected: ${clientId} (Duration: ${connectionDuration.toFixed(2)}s, Active: ${activeConnections.size})`);
  });
});

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
  const metrics = {
    sse_active_connections: activeConnections.size,
    sse_total_connections: connectionCounter,
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString()
  };

  res.json(metrics);
});

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'sse-test-server',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n=== SSE Test Server Started ===`);
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`\nTest JWT Token:`);
  console.log(TEST_TOKEN);
  console.log(`\nTest command:`);
  console.log(`curl -H "Authorization: Bearer ${TEST_TOKEN}" http://localhost:${PORT}/api/signals/stream`);
  console.log(`\nMetrics endpoint:`);
  console.log(`curl http://localhost:${PORT}/api/metrics`);
  console.log(`\n===============================\n`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down server...');
  process.exit(0);
});
