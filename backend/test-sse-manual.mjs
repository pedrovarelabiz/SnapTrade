import express from 'express';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = 3001;
const JWT_SECRET = 'test-jwt-secret-for-backup-health-testing';

// Mock SSE manager
const clients = new Map();
let clientCounter = 0;

// Middleware to verify JWT
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// SSE endpoint
app.get('/api/signals/stream', verifyJWT, (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const clientId = `client-${++clientCounter}`;
  clients.set(clientId, res);

  console.log(`[SSE] Client connected: ${clientId} (Total: ${clients.size})`);

  // Send connected event
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`);

  // Handle client disconnect
  req.on('close', () => {
    clients.delete(clientId);
    console.log(`[SSE] Client disconnected: ${clientId} (Remaining: ${clients.size})`);
  });
});

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(`# HELP sse_active_connections Number of active SSE connections
# TYPE sse_active_connections gauge
sse_active_connections ${clients.size}
`);
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', activeConnections: clients.size });
});

const server = app.listen(PORT, () => {
  console.log(`Test SSE server running on http://localhost:${PORT}`);
  console.log(`Use: curl -H "Authorization: Bearer TOKEN" http://localhost:${PORT}/api/signals/stream`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
