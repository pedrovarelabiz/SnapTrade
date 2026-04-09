import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SubscriptionService } from '../subscriptionService.js';
import { prisma } from '../../lib/prisma.js';
import * as Sentry from '@sentry/node';

// In-memory store for prisma mock
const paymentStore: Record<string, any> = {};
const subscriptionStore: Record<string, any> = {};

// Mock prisma
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    payment: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const record = { ...data, createdAt: new Date(), updatedAt: new Date() };
        paymentStore[record.id] = record;
        return record;
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        return paymentStore[where.id] || null;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        if (paymentStore[where.id]) {
          paymentStore[where.id] = { ...paymentStore[where.id], ...data };
          return paymentStore[where.id];
        }
        return {};
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    subscription: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const record = { id: 'sub-' + data.userId, ...data, createdAt: new Date(), updatedAt: new Date() };
        subscriptionStore[data.userId] = record;
        return record;
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        return subscriptionStore[where.userId] || null;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        if (subscriptionStore[where.userId]) {
          subscriptionStore[where.userId] = { ...subscriptionStore[where.userId], ...data };
          return subscriptionStore[where.userId];
        }
        return {};
      }),
      upsert: vi.fn().mockImplementation(async ({ where, update: updateData, create: createData }: any) => {
        const existing = subscriptionStore[where.userId];
        if (existing) {
          subscriptionStore[where.userId] = { ...existing, ...updateData, updatedAt: new Date() };
          return subscriptionStore[where.userId];
        } else {
          const record = { id: 'sub-' + where.userId, ...createData, createdAt: new Date(), updatedAt: new Date() };
          subscriptionStore[where.userId] = record;
          return record;
        }
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        return Object.values(subscriptionStore).filter((s: any) => {
          if (where?.userId) return s.userId === where.userId;
          return true;
        });
      }),
      deleteMany: vi.fn().mockImplementation(async () => {
        // Clear subscriptions for test users
        Object.keys(subscriptionStore).forEach(k => { if (k.startsWith('test-user-')) delete subscriptionStore[k]; });
        return { count: 1 };
      }),
    },
  },
}));

// Mock Sentry methods
vi.mock('@sentry/node', async () => {
  const actual = await vi.importActual('@sentry/node');
  return {
    ...actual,
    captureException: vi.fn(),
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

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    service = new SubscriptionService();
    vi.clearAllMocks();
    // Clear in-memory stores between tests
    Object.keys(paymentStore).forEach(k => delete paymentStore[k]);
    Object.keys(subscriptionStore).forEach(k => delete subscriptionStore[k]);
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.subscription.deleteMany({
      where: {
        userId: {
          startsWith: 'test-user-',
        },
      },
    });
    await prisma.payment.deleteMany({
      where: {
        id: {
          startsWith: 'test-payment-',
        },
      },
    });
  });

  describe('activateSubscriptionFromWebhook', () => {
    it('should create subscription with valid payment', async () => {
      // Create a valid payment record first
      const payment = await prisma.payment.create({
        data: {
          id: 'test-payment-001',
          userId: 'test-user-001',
          amount: 999,
          currency: 'USD',
          status: 'completed',
          method: 'paypal',
          plan: 'premium',
          durationDays: 30,
        },
      });

      const webhookData = {
        userId: 'test-user-001',
        plan: 'premium',
        paymentId: payment.id,
        durationDays: 30,
      };

      const result = await service.activateSubscriptionFromWebhook(webhookData);

      expect(result.success).toBe(true);
      expect(result.subscription).toBeDefined();
      expect(result.subscription?.userId).toBe(webhookData.userId);
      expect(result.subscription?.plan).toBe(webhookData.plan);
      expect(result.subscription?.status).toBe('active');

      // Verify subscription was created in database
      const subscription = await prisma.subscription.findUnique({
        where: { userId: webhookData.userId },
      });
      expect(subscription).toBeDefined();
      expect(subscription?.status).toBe('active');
    });

    it('should reject activation without valid payment', async () => {
      const webhookData = {
        userId: 'test-user-002',
        plan: 'premium',
        paymentId: 'test-payment-nonexistent',
        durationDays: 30,
      };

      const result = await service.activateSubscriptionFromWebhook(webhookData);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Payment record not found');

      // Verify subscription was NOT created
      const subscription = await prisma.subscription.findUnique({
        where: { userId: webhookData.userId },
      });
      expect(subscription).toBeNull();
    });

    it('should reject activation with invalid payment status', async () => {
      // Create a payment with invalid status
      const payment = await prisma.payment.create({
        data: {
          id: 'test-payment-002',
          userId: 'test-user-003',
          amount: 999,
          currency: 'USD',
          status: 'failed',
          method: 'paypal',
          plan: 'premium',
          durationDays: 30,
        },
      });

      const webhookData = {
        userId: 'test-user-003',
        plan: 'premium',
        paymentId: payment.id,
        durationDays: 30,
      };

      const result = await service.activateSubscriptionFromWebhook(webhookData);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Payment verification failed');
      expect(result.error).toContain('failed');

      // Verify subscription was NOT created
      const subscription = await prisma.subscription.findUnique({
        where: { userId: webhookData.userId },
      });
      expect(subscription).toBeNull();
    });

    it('should prevent duplicate activation for same plan', async () => {
      // Create a valid payment record
      const payment = await prisma.payment.create({
        data: {
          id: 'test-payment-003',
          userId: 'test-user-004',
          amount: 999,
          currency: 'USD',
          status: 'completed',
          method: 'paypal',
          plan: 'premium',
          durationDays: 30,
        },
      });

      // Create an existing active subscription with the same plan
      const existingSubscription = await prisma.subscription.create({
        data: {
          userId: 'test-user-004',
          plan: 'premium',
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const webhookData = {
        userId: 'test-user-004',
        plan: 'premium',
        paymentId: payment.id,
        durationDays: 30,
      };

      const result = await service.activateSubscriptionFromWebhook(webhookData);

      // Should return success with existing subscription
      expect(result.success).toBe(true);
      expect(result.subscription).toBeDefined();
      expect(result.subscription?.id).toBe(existingSubscription.id);
      expect(result.subscription?.plan).toBe('premium');

      // Verify only one subscription exists
      const subscriptions = await prisma.subscription.findMany({
        where: { userId: webhookData.userId },
      });
      expect(subscriptions).toHaveLength(1);
    });

    it('should set correct dates for subscription', async () => {
      // Create a valid payment record
      const payment = await prisma.payment.create({
        data: {
          id: 'test-payment-004',
          userId: 'test-user-005',
          amount: 999,
          currency: 'USD',
          status: 'completed',
          method: 'paypal',
          plan: 'premium',
          durationDays: 30,
        },
      });

      const durationDays = 30;
      const beforeActivation = new Date();

      const webhookData = {
        userId: 'test-user-005',
        plan: 'premium',
        paymentId: payment.id,
        durationDays,
      };

      const result = await service.activateSubscriptionFromWebhook(webhookData);

      const afterActivation = new Date();

      expect(result.success).toBe(true);
      expect(result.subscription).toBeDefined();

      // Check that createdAt is within the activation window
      const createdAt = result.subscription!.createdAt;
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeActivation.getTime());
      expect(createdAt.getTime()).toBeLessThanOrEqual(afterActivation.getTime());

      // Check that expiresAt is approximately durationDays in the future
      const expiresAt = result.subscription!.expiresAt!;
      const expectedExpiry = new Date(beforeActivation);
      expectedExpiry.setDate(expectedExpiry.getDate() + durationDays);

      // Allow 1 second tolerance for timing differences
      const timeDiff = Math.abs(expiresAt.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });

    it('should accept payment with pending status', async () => {
      // Create a payment with pending status
      const payment = await prisma.payment.create({
        data: {
          id: 'test-payment-005',
          userId: 'test-user-006',
          amount: 999,
          currency: 'USD',
          status: 'pending',
          method: 'paypal',
          plan: 'premium',
          durationDays: 30,
        },
      });

      const webhookData = {
        userId: 'test-user-006',
        plan: 'premium',
        paymentId: payment.id,
        durationDays: 30,
      };

      const result = await service.activateSubscriptionFromWebhook(webhookData);

      expect(result.success).toBe(true);
      expect(result.subscription).toBeDefined();
      expect(result.subscription?.status).toBe('active');
    });

    it('should link subscription activation to payment record', async () => {
      // Create a valid payment record
      const payment = await prisma.payment.create({
        data: {
          id: 'test-payment-006',
          userId: 'test-user-007',
          amount: 999,
          currency: 'USD',
          status: 'completed',
          method: 'paypal',
          plan: 'premium',
          durationDays: 30,
        },
      });

      const webhookData = {
        userId: 'test-user-007',
        plan: 'premium',
        paymentId: payment.id,
        durationDays: 30,
      };

      const result = await service.activateSubscriptionFromWebhook(webhookData);

      expect(result.success).toBe(true);

      // Verify the payment record exists and matches
      const verifiedPayment = await prisma.payment.findUnique({
        where: { id: webhookData.paymentId },
      });

      expect(verifiedPayment).toBeDefined();
      expect(verifiedPayment?.userId).toBe(webhookData.userId);
      expect(verifiedPayment?.status).toBe('completed');
    });

    it('should update existing inactive subscription to active', async () => {
      // Create a valid payment record
      const payment = await prisma.payment.create({
        data: {
          id: 'test-payment-007',
          userId: 'test-user-008',
          amount: 999,
          currency: 'USD',
          status: 'completed',
          method: 'paypal',
          plan: 'premium',
          durationDays: 30,
        },
      });

      // Create an existing expired subscription
      await prisma.subscription.create({
        data: {
          userId: 'test-user-008',
          plan: 'basic',
          status: 'expired',
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });

      const webhookData = {
        userId: 'test-user-008',
        plan: 'premium',
        paymentId: payment.id,
        durationDays: 30,
      };

      const result = await service.activateSubscriptionFromWebhook(webhookData);

      expect(result.success).toBe(true);
      expect(result.subscription).toBeDefined();
      expect(result.subscription?.status).toBe('active');
      expect(result.subscription?.plan).toBe('premium');

      // Verify only one subscription exists
      const subscriptions = await prisma.subscription.findMany({
        where: { userId: webhookData.userId },
      });
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].status).toBe('active');
    });
  });
});
