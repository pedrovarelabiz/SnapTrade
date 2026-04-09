import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebhookEventService } from '../webhookEventService.js';
import { prisma } from '../../lib/prisma.js';
import * as Sentry from '@sentry/node';

// In-memory store for webhook events
const webhookEventStore: Record<string, any> = {};

// Mock prisma
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    webhookEvent: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const record = { id: 'whe-' + data.eventId, ...data, processedAt: null, createdAt: new Date() };
        webhookEventStore[data.eventId] = record;
        return record;
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where.eventId) return webhookEventStore[where.eventId] || null;
        // find by internal id
        const found = Object.values(webhookEventStore).find((e: any) => e.id === where.id);
        return found || null;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const key = where.eventId || Object.keys(webhookEventStore).find(k => webhookEventStore[k].id === where.id);
        if (key && webhookEventStore[key]) {
          webhookEventStore[key] = { ...webhookEventStore[key], ...data };
          return webhookEventStore[key];
        }
        return {};
      }),
      count: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where?.eventId) {
          return webhookEventStore[where.eventId] ? 1 : 0;
        }
        return Object.keys(webhookEventStore).length;
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        return Object.values(webhookEventStore).filter((e: any) => {
          if (where?.eventId?.in) return where.eventId.in.includes(e.eventId);
          return true;
        });
      }),
      deleteMany: vi.fn().mockImplementation(async ({ where }: any) => {
        const keys = Object.keys(webhookEventStore).filter(k => {
          if (where?.eventId?.startsWith) return k.startsWith(where.eventId.startsWith);
          return k.startsWith('test-');
        });
        keys.forEach(k => delete webhookEventStore[k]);
        return { count: keys.length };
      }),
    },
    $transaction: vi.fn().mockImplementation(async (callback: any) => {
      // Create a transaction proxy that uses the same in-memory store
      const tx = {
        webhookEvent: {
          findUnique: async ({ where }: any) => {
            if (where.eventId) return webhookEventStore[where.eventId] || null;
            const found = Object.values(webhookEventStore).find((e: any) => e.id === where.id);
            return found || null;
          },
          create: async ({ data }: any) => {
            const record = { id: 'whe-' + data.eventId, ...data, processedAt: null, createdAt: new Date() };
            webhookEventStore[data.eventId] = record;
            return record;
          },
          update: async ({ where, data }: any) => {
            const key = where.eventId || Object.keys(webhookEventStore).find(k => webhookEventStore[k].id === where.id);
            if (key && webhookEventStore[key]) {
              webhookEventStore[key] = { ...webhookEventStore[key], ...data };
              return webhookEventStore[key];
            }
            return {};
          },
          findMany: async ({ where }: any) => {
            return Object.values(webhookEventStore).filter((e: any) => {
              if (where?.eventId?.in) return where.eventId.in.includes(e.eventId);
              return true;
            });
          },
        },
      };
      return callback(tx);
    }),
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

describe('WebhookEventService', () => {
  let service: WebhookEventService;

  beforeEach(() => {
    service = new WebhookEventService();
    vi.clearAllMocks();
    // Clear in-memory store between tests
    Object.keys(webhookEventStore).forEach(k => delete webhookEventStore[k]);
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.webhookEvent.deleteMany({
      where: {
        eventId: {
          startsWith: 'test-',
        },
      },
    });
  });

  describe('storeWebhookEvent', () => {
    it('should create a new webhook event record', async () => {
      const eventData = {
        eventId: 'test-event-001',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 100, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      const result = await service.storeWebhookEvent(eventData);

      expect(result).toBeDefined();
      expect(result.eventId).toBe(eventData.eventId);
      expect(result.eventType).toBe(eventData.eventType);
      expect(result.payload).toEqual(eventData.payload);
      expect(result.verified).toBe(true);
      expect(result.source).toBe('paypal');
      expect(result.processedAt).toBeNull();
      expect(result.createdAt).toBeInstanceOf(Date);

      // Verify it was actually stored
      const stored = await prisma.webhookEvent.findUnique({
        where: { eventId: eventData.eventId },
      });
      expect(stored).toBeDefined();
      expect(stored?.eventId).toBe(eventData.eventId);
    });

    it('should return existing event when duplicate eventId is provided', async () => {
      const eventData = {
        eventId: 'test-event-002',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 100, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      // Store first time
      const first = await service.storeWebhookEvent(eventData);
      const firstId = first.id;

      // Store again with same eventId
      const second = await service.storeWebhookEvent(eventData);

      // Should return the same event
      expect(second.id).toBe(firstId);
      expect(second.eventId).toBe(eventData.eventId);

      // Verify only one record exists
      const count = await prisma.webhookEvent.count({
        where: { eventId: eventData.eventId },
      });
      expect(count).toBe(1);
    });

    it('should handle errors and log to Sentry', async () => {
      // Mock prisma to throw an error
      const originalTransaction = prisma.$transaction;
      prisma.$transaction = vi.fn().mockRejectedValue(new Error('Database error'));

      const eventData = {
        eventId: 'test-event-003',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 100, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      await expect(service.storeWebhookEvent(eventData)).rejects.toThrow('Database error');
      expect(Sentry.captureException).toHaveBeenCalled();

      // Restore original function
      prisma.$transaction = originalTransaction;
    });
  });

  describe('checkEventExists', () => {
    it('should return true when event exists', async () => {
      const eventData = {
        eventId: 'test-event-004',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 100, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      // Store the event first
      await service.storeWebhookEvent(eventData);

      // Check existence
      const exists = await service.checkEventExists(eventData.eventId);
      expect(exists).toBe(true);
    });

    it('should return false when event does not exist', async () => {
      const exists = await service.checkEventExists('test-nonexistent-event');
      expect(exists).toBe(false);
    });

    it('should handle errors and log to Sentry', async () => {
      // Mock prisma to throw an error
      const originalFindUnique = prisma.webhookEvent.findUnique;
      prisma.webhookEvent.findUnique = vi.fn().mockRejectedValue(new Error('Database error'));

      await expect(service.checkEventExists('test-event')).rejects.toThrow('Database error');
      expect(Sentry.captureException).toHaveBeenCalled();

      // Restore original function
      prisma.webhookEvent.findUnique = originalFindUnique;
    });
  });

  describe('isEventProcessed', () => {
    it('should return true when event is verified and processed', async () => {
      const eventData = {
        eventId: 'test-event-005',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 100, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      // Store and process the event
      await service.storeWebhookEvent(eventData);
      await service.markEventProcessed(eventData.eventId);

      // Check if processed
      const isProcessed = await service.isEventProcessed(eventData.eventId);
      expect(isProcessed).toBe(true);
    });

    it('should return false when event exists but not processed', async () => {
      const eventData = {
        eventId: 'test-event-006',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 100, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      // Store but don't process the event
      await service.storeWebhookEvent(eventData);

      // Check if processed
      const isProcessed = await service.isEventProcessed(eventData.eventId);
      expect(isProcessed).toBe(false);
    });

    it('should return false when event is not verified', async () => {
      const eventData = {
        eventId: 'test-event-007',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 100, currency: 'USD' },
        verified: false,
        source: 'paypal',
      };

      // Store unverified event
      await service.storeWebhookEvent(eventData);
      await service.markEventProcessed(eventData.eventId);

      // Check if processed - should be false because not verified
      const isProcessed = await service.isEventProcessed(eventData.eventId);
      expect(isProcessed).toBe(false);
    });

    it('should return false when event does not exist', async () => {
      const isProcessed = await service.isEventProcessed('test-nonexistent-event');
      expect(isProcessed).toBe(false);
    });

    it('should handle errors and log to Sentry', async () => {
      // Mock prisma to throw an error
      const originalFindUnique = prisma.webhookEvent.findUnique;
      prisma.webhookEvent.findUnique = vi.fn().mockRejectedValue(new Error('Database error'));

      await expect(service.isEventProcessed('test-event')).rejects.toThrow('Database error');
      expect(Sentry.captureException).toHaveBeenCalled();

      // Restore original function
      prisma.webhookEvent.findUnique = originalFindUnique;
    });
  });

  describe('concurrent event storage', () => {
    it('should handle concurrent storage of the same event correctly', async () => {
      const eventData = {
        eventId: 'test-event-008',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 100, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      // Attempt to store the same event concurrently
      const promises = [
        service.storeWebhookEvent(eventData),
        service.storeWebhookEvent(eventData),
        service.storeWebhookEvent(eventData),
      ];

      const results = await Promise.all(promises);

      // All should succeed
      expect(results).toHaveLength(3);

      // All should have the same ID (same event)
      const firstId = results[0].id;
      results.forEach((result) => {
        expect(result.id).toBe(firstId);
        expect(result.eventId).toBe(eventData.eventId);
      });

      // Verify only one record exists in database
      const count = await prisma.webhookEvent.count({
        where: { eventId: eventData.eventId },
      });
      expect(count).toBe(1);
    });

    it('should handle concurrent storage of different events correctly', async () => {
      const eventData1 = {
        eventId: 'test-event-009',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 100, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      const eventData2 = {
        eventId: 'test-event-010',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 200, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      const eventData3 = {
        eventId: 'test-event-011',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 300, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      // Store different events concurrently
      const promises = [
        service.storeWebhookEvent(eventData1),
        service.storeWebhookEvent(eventData2),
        service.storeWebhookEvent(eventData3),
      ];

      const results = await Promise.all(promises);

      // All should succeed
      expect(results).toHaveLength(3);

      // Each should have unique IDs
      const ids = results.map((r) => r.id);
      expect(new Set(ids).size).toBe(3);

      // Verify all three records exist
      const events = await prisma.webhookEvent.findMany({
        where: {
          eventId: {
            in: [eventData1.eventId, eventData2.eventId, eventData3.eventId],
          },
        },
      });
      expect(events).toHaveLength(3);
    });
  });

  describe('markEventProcessed', () => {
    it('should mark an event as processed', async () => {
      const eventData = {
        eventId: 'test-event-012',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 100, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      // Store the event
      await service.storeWebhookEvent(eventData);

      // Mark as processed
      const result = await service.markEventProcessed(eventData.eventId);

      expect(result.processedAt).toBeDefined();
      expect(result.processedAt).toBeInstanceOf(Date);

      // Verify it was marked as processed
      const isProcessed = await service.isEventProcessed(eventData.eventId);
      expect(isProcessed).toBe(true);
    });
  });

  describe('getEventByEventId', () => {
    it('should retrieve event by eventId', async () => {
      const eventData = {
        eventId: 'test-event-013',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 100, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      // Store the event
      const stored = await service.storeWebhookEvent(eventData);

      // Retrieve by eventId
      const retrieved = await service.getEventByEventId(eventData.eventId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(stored.id);
      expect(retrieved?.eventId).toBe(eventData.eventId);
    });

    it('should return null for non-existent eventId', async () => {
      const retrieved = await service.getEventByEventId('test-nonexistent-event');
      expect(retrieved).toBeNull();
    });
  });

  describe('getEventById', () => {
    it('should retrieve event by internal ID', async () => {
      const eventData = {
        eventId: 'test-event-014',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { amount: 100, currency: 'USD' },
        verified: true,
        source: 'paypal',
      };

      // Store the event
      const stored = await service.storeWebhookEvent(eventData);

      // Retrieve by internal ID
      const retrieved = await service.getEventById(stored.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(stored.id);
      expect(retrieved?.eventId).toBe(eventData.eventId);
    });

    it('should return null for non-existent ID', async () => {
      const retrieved = await service.getEventById('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });
});
