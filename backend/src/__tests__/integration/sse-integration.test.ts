import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import signalRoutes from '../../routes/signals.js';
import { prisma } from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/node';

// Check if database is available - will be determined in beforeAll
let dbAvailable = false;

async function checkDbAvailability() {
  try {
    await prisma.$connect();
    await prisma.$disconnect();
    return true;
  } catch (e) {
    console.warn('Database not available, skipping integration tests');
    return false;
  }
}

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/signals', signalRoutes);

// Mock prisma
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    user: {
      create: vi.fn().mockResolvedValue({
        id: 'mock-sse-user-id',
        email: 'sse-test@example.com',
        passwordHash: 'test-hash',
        name: 'SSE Test User',
        role: 'user',
        emailVerified: true,
      }),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

// Mock Sentry methods
vi.mock('@sentry/node', async () => {
  const actual = await vi.importActual('@sentry/node');
  return {
    ...actual,
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    setContext: vi.fn(),
    setUser: vi.fn(),
    setTag: vi.fn(),
  };
});

// Mock logger
vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock rate limiter
vi.mock('../../middleware/rateLimiter.js', () => ({
  apiLimiter: (req: any, res: any, next: any) => next(),
}));

// Mock metrics
vi.mock('../../lib/metrics.js', () => ({
  sseActiveConnections: {
    inc: vi.fn(),
    dec: vi.fn(),
    set: vi.fn(),
  },
  sseConnectionAgeSeconds: {
    observe: vi.fn(),
    set: vi.fn(),
  },
  sseDisconnectsTotal: {
    inc: vi.fn(),
  },
  sseRejectedConnectionsTotal: {
    inc: vi.fn(),
  },
}));

// Mock SSE module so connections close immediately after sending headers
vi.mock('../../lib/sse.js', () => ({
  addClient: vi.fn((client: any, endpoint: string) => {
    // Send SSE headers and initial connected event, then close
    client.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    client.res.write(`data: ${JSON.stringify({ event: 'connected', clientId: client.id })}\n\n`);
    client.res.end();
    return true;
  }),
  broadcast: vi.fn(),
  removeClient: vi.fn(),
  startHeartbeat: vi.fn(),
  stopHeartbeat: vi.fn(),
  startCleanup: vi.fn(),
  stopCleanup: vi.fn(),
}));

describe('SSE Integration Tests', () => {
  const testUserId = 'sse-test-user';
  const testEmail = 'sse-test@example.com';
  let authToken: string;

  beforeAll(async () => {
    // Check database availability
    dbAvailable = await checkDbAvailability();
    if (!dbAvailable) {
      return; // Skip test setup if DB not available
    }

    // Create test user
    await prisma.user.create({
      data: {
        id: testUserId,
        email: testEmail,
        passwordHash: 'test-hash-sse',
        name: 'SSE Test User',
        role: 'premium',
        emailVerified: true,
      },
    });

    // Generate JWT token
    authToken = jwt.sign(
      { userId: testUserId, email: testEmail, role: 'premium' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return; // Skip cleanup if DB not available
    }
    // Cleanup test user
    try {
      await prisma.user.delete({
        where: { id: testUserId },
      });
    } catch (e) {
      // User may not exist if beforeAll failed
      console.warn('Failed to cleanup test user:', e);
    }
  });

  beforeEach(() => {
    if (!dbAvailable) {
      // Skip test if database is not available
      return;
    }
    vi.clearAllMocks();
  });

  it('should connect to SSE stream with valid JWT token in Authorization header', async () => {
    const response = await request(app)
      .get('/api/signals/stream')
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(1000);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['connection']).toBe('keep-alive');
  });

  it('should connect to SSE stream with valid JWT token in query parameter', async () => {
    const response = await request(app)
      .get(`/api/signals/stream?token=${authToken}`)
      .timeout(1000);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['connection']).toBe('keep-alive');
  });

  it('should receive connected event on successful SSE connection', async () => {
    const response = await request(app)
      .get('/api/signals/stream')
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(1000);

    expect(response.status).toBe(200);

    // Check that the initial connection event is sent
    const responseText = response.text;
    expect(responseText).toContain('data:');
    expect(responseText).toContain('connected');
    expect(responseText).toContain('clientId');
  });

  it('GET /api/signals/stream requires authentication', async () => {
    const response = await request(app)
      .get('/api/signals/stream')
      .timeout(1000);

    expect(response.status).toBe(401);
  });

  it('should reject SSE connection without authentication token', async () => {
    const response = await request(app)
      .get('/api/signals/stream')
      .timeout(1000);

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Authentication required');
  });

  it('should reject SSE connection with invalid JWT token', async () => {
    const response = await request(app)
      .get('/api/signals/stream')
      .set('Authorization', 'Bearer invalid-token-123')
      .timeout(1000);

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Invalid or expired token');
  });

  it('should reject SSE connection with expired JWT token', async () => {
    const expiredToken = jwt.sign(
      { userId: testUserId, email: testEmail, role: 'premium' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '-1h' } // Token expired 1 hour ago
    );

    const response = await request(app)
      .get('/api/signals/stream')
      .set('Authorization', `Bearer ${expiredToken}`)
      .timeout(1000);

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Invalid or expired token');
  });

  it('should set correct SSE headers for event-stream', async () => {
    const response = await request(app)
      .get('/api/signals/stream')
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(1000);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['connection']).toBe('keep-alive');
    expect(response.headers['x-accel-buffering']).toBe('no');
  });
});
