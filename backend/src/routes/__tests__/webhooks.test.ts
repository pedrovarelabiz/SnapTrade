import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import webhooksRouter from '../webhooks.js';
import { prisma } from '../../lib/prisma.js';
import * as Sentry from '@sentry/node';

const app = express();
app.use(express.json());
app.use('/api/webhooks', webhooksRouter);

// In-memory stores (hoisted so they are available inside vi.mock factory)
const stores = vi.hoisted(() => ({
  users: {} as Record<string, any>,
  payments: {} as Record<string, any>,
  subscriptions: {} as Record<string, any>,
  webhookEvents: {} as Record<string, any>,
}));

// Mock prisma
vi.mock('../../lib/prisma.js', () => {
  const userStore = stores.users;
  const paymentStore = stores.payments;
  const subscriptionStore = stores.subscriptions;
  const webhookEventStore = stores.webhookEvents;

  return {
    prisma: {
      user: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const record = { ...data, createdAt: new Date(), updatedAt: new Date() };
          userStore[record.id] = record;
          return record;
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          if (where.id) return userStore[where.id] || null;
          return null;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          if (userStore[where.id]) {
            userStore[where.id] = { ...userStore[where.id], ...data };
            return userStore[where.id];
          }
          return {};
        }),
        delete: vi.fn().mockImplementation(async ({ where }: any) => {
          const record = userStore[where.id];
          delete userStore[where.id];
          return record || {};
        }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const id = data.id || `payment-${Date.now()}-${Math.random()}`;
          const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
          paymentStore[id] = record;
          // Also index by externalId for findFirst lookups
          if (data.externalId) {
            paymentStore[`ext:${data.externalId}`] = record;
          }
          return record;
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          if (where?.externalId) {
            return paymentStore[`ext:${where.externalId}`] || null;
          }
          if (where?.userId) {
            return Object.values(paymentStore).find((p: any) => p.userId === where.userId && !String(p.id).startsWith('ext:')) || null;
          }
          return null;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          if (paymentStore[where.id]) {
            paymentStore[where.id] = { ...paymentStore[where.id], ...data };
            // Update externalId index too
            const ext = paymentStore[where.id].externalId;
            if (ext) paymentStore[`ext:${ext}`] = paymentStore[where.id];
            return paymentStore[where.id];
          }
          return {};
        }),
        delete: vi.fn().mockImplementation(async ({ where }: any) => {
          const record = paymentStore[where.id];
          if (record?.externalId) delete paymentStore[`ext:${record.externalId}`];
          delete paymentStore[where.id];
          return record || {};
        }),
        deleteMany: vi.fn().mockImplementation(async ({ where }: any) => {
          const keys = Object.keys(paymentStore).filter(k => {
            if (k.startsWith('ext:')) return false;
            const p = paymentStore[k];
            return where?.userId ? p.userId === where.userId : true;
          });
          keys.forEach(k => {
            const p = paymentStore[k];
            if (p?.externalId) delete paymentStore[`ext:${p.externalId}`];
            delete paymentStore[k];
          });
          return { count: keys.length };
        }),
      },
      subscription: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const record = { id: `sub-${data.userId}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          subscriptionStore[data.userId] = record;
          return record;
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          if (where?.userId) return subscriptionStore[where.userId] || null;
          return null;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          if (subscriptionStore[where.userId]) {
            subscriptionStore[where.userId] = { ...subscriptionStore[where.userId], ...data };
            return subscriptionStore[where.userId];
          }
          return {};
        }),
        upsert: vi.fn().mockImplementation(async ({ where, update: updateData, create: createData }: any) => {
          if (subscriptionStore[where.userId]) {
            subscriptionStore[where.userId] = { ...subscriptionStore[where.userId], ...updateData, updatedAt: new Date() };
          } else {
            subscriptionStore[where.userId] = { id: `sub-${where.userId}`, ...createData, createdAt: new Date(), updatedAt: new Date() };
          }
          return subscriptionStore[where.userId];
        }),
        deleteMany: vi.fn().mockImplementation(async ({ where }: any) => {
          const keys = Object.keys(subscriptionStore).filter(k => where?.userId ? k === where.userId : true);
          keys.forEach(k => delete subscriptionStore[k]);
          return { count: keys.length };
        }),
      },
      webhookEvent: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const record = { id: `wh-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          webhookEventStore[data.eventId] = record;
          return record;
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          if (where?.eventId) return webhookEventStore[where.eventId] || null;
          return null;
        }),
        update: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    },
  };
});

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

// Mock webhook middleware
vi.mock('../../middleware/webhookRateLimiter.js', () => ({
  webhookRateLimiter: (req: any, res: any, next: any) => next(),
}));

vi.mock('../../middleware/verifyPayPalWebhook.js', () => ({
  verifyPayPalWebhook: vi.fn((req: any, res: any, next: any) => {
    // Check if this is a test request without verification
    if (!req.headers['x-test-verified']) {
      return res.status(401).json({ error: "Verification failed" });
    }
    // Attach verified payload for verified requests
    req.verifiedPayload = req.body;
    next();
  }),
}));

describe('POST /api/webhooks/paypal', () => {
  const testUserId = 'test-webhook-user-123';

  beforeAll(async () => {
    // Create test user
    await prisma.user.create({
      data: {
        id: testUserId,
        email: 'webhook-test@example.com',
        passwordHash: 'dummy-hash',
        name: 'Webhook Test User',
        role: 'user',
        emailVerified: true,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.payment.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.subscription.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.user.delete({
      where: { id: testUserId },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear in-memory stores but preserve the user
    const user = stores.users[testUserId];
    Object.keys(stores.users).forEach(k => delete stores.users[k]);
    Object.keys(stores.payments).forEach(k => delete stores.payments[k]);
    Object.keys(stores.subscriptions).forEach(k => delete stores.subscriptions[k]);
    Object.keys(stores.webhookEvents).forEach(k => delete stores.webhookEvents[k]);
    if (user) stores.users[testUserId] = user;
  });

  it('should reject unverified request with 401', async () => {
    const response = await request(app)
      .post('/api/webhooks/paypal')
      .send({
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'test-payment-id',
          custom_id: `user_${testUserId}_plan_monthly`,
          amount: { value: '9.99' },
        },
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
  });

  it('security test: subscription NOT created without valid signature and Payment status remains pending', async () => {
    // Create a pending payment
    const orderId = `user_${testUserId}_plan_security_test`;
    await prisma.payment.create({
      data: {
        userId: testUserId,
        externalId: orderId,
        amount: 9.99,
        method: 'paypal',
        status: 'pending',
        plan: 'premium_monthly',
        durationDays: 30,
      },
    });

    // Attempt to send subscription activation webhook WITHOUT valid signature
    const response = await request(app)
      .post('/api/webhooks/paypal')
      .send({
        id: 'evt-malicious-123',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'payment-malicious-456',
          custom_id: orderId,
          amount: { value: '9.99' },
        },
      });

    // Should reject with 401
    expect(response.status).toBe(401);

    // Verify subscription was NOT created
    const subscription = await prisma.subscription.findUnique({
      where: { userId: testUserId },
    });
    expect(subscription).toBeNull();

    // Verify Payment status remains pending (database unchanged)
    const payment = await prisma.payment.findFirst({
      where: {
        userId: testUserId,
        externalId: orderId,
      },
    });
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe('pending');

    // Cleanup
    await prisma.payment.delete({ where: { id: payment!.id } });
  });

  it('should create subscription for verified subscription activation webhook', async () => {
    const orderId = `user_${testUserId}_plan_monthly`;
    const response = await request(app)
      .post('/api/webhooks/paypal')
      .set('x-test-verified', 'true')
      .send({
        id: 'evt-webhook-123',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'payment-456',
          custom_id: orderId,
          amount: { value: '9.99' },
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);

    // Verify subscription was created
    const subscription = await prisma.subscription.findUnique({
      where: { userId: testUserId },
    });
    expect(subscription).not.toBeNull();
    expect(subscription?.plan).toBe('premium_monthly');
    expect(subscription?.status).toBe('active');

    // Verify user role was updated
    const user = await prisma.user.findUnique({
      where: { id: testUserId },
    });
    expect(user?.role).toBe('premium');
  });

  it('should update payment for verified payment webhook', async () => {
    const orderId = `user_${testUserId}_plan_yearly`;
    const response = await request(app)
      .post('/api/webhooks/paypal')
      .set('x-test-verified', 'true')
      .send({
        id: 'evt-webhook-789',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'payment-yearly-123',
          custom_id: orderId,
          amount: { value: '99.99' },
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('processed', true);

    // Verify payment was created
    const payment = await prisma.payment.findFirst({
      where: {
        userId: testUserId,
        externalId: orderId,
      },
    });
    expect(payment).not.toBeNull();
    expect(payment?.amount).toBe(99.99);
    expect(payment?.method).toBe('paypal');
    expect(payment?.status).toBe('confirmed');
    expect(payment?.plan).toBe('premium_yearly');
  });
});
