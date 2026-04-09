import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { verifyPayPalWebhook } from '../verifyPayPalWebhook.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import * as Sentry from '@sentry/node';

// Mock crypto module
const mockCrypto = vi.hoisted(() => ({
  createPublicKey: vi.fn(),
  createVerify: vi.fn(),
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mocked-hash'),
  })),
}));

vi.mock('crypto', () => ({
  default: mockCrypto,
  ...mockCrypto,
}));

// Mock dependencies
vi.mock('../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@sentry/node', () => ({
  captureMessage: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    webhookEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('verifyPayPalWebhook middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup response mocks
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      headers: {
        'paypal-transmission-id': 'test-transmission-id',
        'paypal-transmission-time': new Date().toISOString(),
        'paypal-transmission-sig': 'test-signature',
        'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/test-cert',
        'paypal-auth-algo': 'SHA256withRSA',
        'x-forwarded-for': '127.0.0.1',
      },
      body: {
        id: 'test-event-id',
        event_type: 'PAYMENT.SALE.COMPLETED',
        resource: {
          id: 'test-payment-id',
        },
      },
      ip: '127.0.0.1',
      socket: {
        remoteAddress: '127.0.0.1',
      } as any,
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
    } as any;

    mockNext = vi.fn();

    // Mock environment variable
    process.env.PAYPAL_WEBHOOK_ID = 'test-webhook-id';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('verified request proceeds to handler', () => {
    it('should call next() when webhook is successfully verified', async () => {
      // Mock successful signature verification
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `-----BEGIN CERTIFICATE-----
MIICXQIBAAKBgQDKr3Z0qL7VZ0yL0bJz0E7XqH9wH3C3vYvGdJzKxQ8dZL5J5h3p
-----END CERTIFICATE-----`,
      } as any);

      // Mock crypto to return true for verification
      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      // Mock database - no duplicate event
      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.webhookEvent.create).mockResolvedValue({
        id: 'webhook-event-db-id',
        eventId: 'test-event-id',
        eventType: 'PAYMENT.SALE.COMPLETED',
        payload: mockReq.body,
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
      expect(statusMock).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'test-event-id',
          eventType: 'PAYMENT.SALE.COMPLETED',
          webhookEventId: 'webhook-event-db-id',
        }),
        'PayPal webhook verification successful'
      );
    });
  });

  describe('unverified request returns 401', () => {
    it('should return 401 when required headers are missing', async () => {
      mockReq.headers = {};

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Missing required PayPal webhook headers',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Missing required PayPal webhook headers',
        }),
        'PayPal webhook verification failed: missing headers'
      );
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'PayPal webhook verification failed: missing headers',
        expect.objectContaining({
          level: 'warning',
        })
      );
    });

    it('should return 401 when timestamp is invalid', async () => {
      // Set timestamp to 10 minutes ago (exceeds 5 minute limit)
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      mockReq.headers!['paypal-transmission-time'] = oldTimestamp;

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Webhook timestamp is invalid or expired',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Webhook timestamp is invalid or expired',
        }),
        'PayPal webhook verification failed: invalid timestamp'
      );
      expect(Sentry.captureMessage).toHaveBeenCalled();
    });

    it('should return 401 when signature verification fails', async () => {
      // Mock failed signature verification
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `-----BEGIN CERTIFICATE-----
MIICXQIBAAKBgQDKr3Z0qL7VZ0yL0bJz0E7XqH9wH3C3vYvGdJzKxQ8dZL5J5h3p
-----END CERTIFICATE-----`,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(false),
      } as any);

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Invalid webhook signature',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Invalid webhook signature',
        }),
        'PayPal webhook verification failed: invalid signature'
      );
      expect(Sentry.captureMessage).toHaveBeenCalled();
    });

    it('should return 401 when certificate fetch fails', async () => {
      // Mock failed certificate fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
      } as any);

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Invalid webhook signature',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
      expect(Sentry.captureMessage).toHaveBeenCalled();
    });

    it('should return 401 when exception occurs during verification', async () => {
      // Mock database to throw an error
      vi.mocked(prisma.webhookEvent.findUnique).mockRejectedValue(
        new Error('Database connection failed')
      );

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `-----BEGIN CERTIFICATE-----
MIICXQIBAAKBgQDKr3Z0qL7VZ0yL0bJz0E7XqH9wH3C3vYvGdJzKxQ8dZL5J5h3p
-----END CERTIFICATE-----`,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Database connection failed',
        }),
        'PayPal webhook verification failed: exception'
      );
      expect(Sentry.captureMessage).toHaveBeenCalled();
    });
  });

  describe('duplicate event returns 409', () => {
    it('should return 409 when event has already been processed', async () => {
      // Mock successful signature verification
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `-----BEGIN CERTIFICATE-----
MIICXQIBAAKBgQDKr3Z0qL7VZ0yL0bJz0E7XqH9wH3C3vYvGdJzKxQ8dZL5J5h3p
-----END CERTIFICATE-----`,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      // Mock database - event already exists (duplicate)
      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue({
        id: 'existing-webhook-event-id',
        eventId: 'test-event-id',
        eventType: 'PAYMENT.SALE.COMPLETED',
        payload: mockReq.body,
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Event already processed',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Event already processed',
          eventId: 'test-event-id',
        }),
        'PayPal webhook verification failed: duplicate event'
      );
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'PayPal webhook verification failed: duplicate event',
        expect.objectContaining({
          level: 'warning',
        })
      );
    });

    it('should reject duplicate event when same webhook is sent twice (idempotency check)', async () => {
      // Mock successful signature verification
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `-----BEGIN CERTIFICATE-----
MIICXQIBAAKBgQDKr3Z0qL7VZ0yL0bJz0E7XqH9wH3C3vYvGdJzKxQ8dZL5J5h3p
-----END CERTIFICATE-----`,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      // First request: no existing event, should create one
      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValueOnce(null);
      const createdWebhookEvent = {
        id: 'first-webhook-event-id',
        eventId: 'test-event-id',
        eventType: 'PAYMENT.SALE.COMPLETED',
        payload: mockReq.body,
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.webhookEvent.create).mockResolvedValueOnce(createdWebhookEvent);

      // Send first request
      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      // Verify first request succeeded
      expect(mockNext).toHaveBeenCalledOnce();
      expect(prisma.webhookEvent.create).toHaveBeenCalledOnce();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'test-event-id',
          webhookEventId: 'first-webhook-event-id',
        }),
        'PayPal webhook verification successful'
      );

      // Reset mocks for second request
      vi.clearAllMocks();
      jsonMock = vi.fn();
      statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      mockRes = { status: statusMock, json: jsonMock } as any;
      mockNext = vi.fn();

      // Second request: event already exists (duplicate)
      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValueOnce(createdWebhookEvent);

      // Send second request with same event
      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      // Verify second request is rejected with 409
      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Event already processed',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Event already processed',
          eventId: 'test-event-id',
        }),
        'PayPal webhook verification failed: duplicate event'
      );
    });
  });

  describe('error handling', () => {
    it('should return 503 when PayPal API is down', async () => {
      // Mock fetch to throw network error (PayPal API down)
      global.fetch = vi.fn().mockRejectedValue(new Error('PayPal API unavailable'));

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'PayPal service temporarily unavailable',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: expect.stringContaining('PayPal API'),
        }),
        'PayPal webhook verification failed: exception'
      );
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'PayPal webhook verification failed: exception',
        expect.objectContaining({
          level: 'warning',
        })
      );
    });

    it('should return 500 when database error occurs', async () => {
      // Mock successful signature verification
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `-----BEGIN CERTIFICATE-----
MIICXQIBAAKBgQDKr3Z0qL7VZ0yL0bJz0E7XqH9wH3C3vYvGdJzKxQ8dZL5J5h3p
-----END CERTIFICATE-----`,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      // Mock database error
      vi.mocked(prisma.webhookEvent.findUnique).mockRejectedValue(
        new Error('Database connection failed')
      );

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Database connection failed',
          error: expect.any(Error),
        }),
        'PayPal webhook verification failed: exception'
      );
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'PayPal webhook verification failed: exception',
        expect.objectContaining({
          level: 'warning',
        })
      );
    });

    it('should return 500 when PAYPAL_WEBHOOK_ID env var is missing', async () => {
      // Remove environment variable
      const originalWebhookId = process.env.PAYPAL_WEBHOOK_ID;
      delete process.env.PAYPAL_WEBHOOK_ID;

      // Mock successful certificate fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `-----BEGIN CERTIFICATE-----
MIICXQIBAAKBgQDKr3Z0qL7VZ0yL0bJz0E7XqH9wH3C3vYvGdJzKxQ8dZL5J5h3p
-----END CERTIFICATE-----`,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Server configuration error',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: expect.stringContaining('PAYPAL_WEBHOOK_ID'),
        }),
        'PayPal webhook verification failed: exception'
      );
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'PayPal webhook verification failed: exception',
        expect.objectContaining({
          level: 'warning',
        })
      );

      // Restore environment variable
      if (originalWebhookId) {
        process.env.PAYPAL_WEBHOOK_ID = originalWebhookId;
      }
    });
  });

  describe('failure logging', () => {
    it('should log all verification failures with proper context', async () => {
      // Test missing headers logging
      mockReq.headers = {};
      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: expect.any(String),
          timestamp: expect.any(String),
          ipAddress: expect.any(String),
          reason: 'Missing required PayPal webhook headers',
          eventType: 'PAYMENT.SALE.COMPLETED',
        }),
        'PayPal webhook verification failed: missing headers'
      );

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'PayPal webhook verification failed: missing headers',
        expect.objectContaining({
          level: 'warning',
          extra: expect.objectContaining({
            reason: 'Missing required PayPal webhook headers',
          }),
        })
      );
    });

    it('should log timestamp validation failures', async () => {
      const futureTimestamp = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      mockReq.headers!['paypal-transmission-time'] = futureTimestamp;

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Webhook timestamp is invalid or expired',
          transmissionTime: futureTimestamp,
        }),
        'PayPal webhook verification failed: invalid timestamp'
      );

      expect(Sentry.captureMessage).toHaveBeenCalled();
    });

    it('should log signature verification failures', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----`,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(false),
      } as any);

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Invalid webhook signature',
          headers: expect.objectContaining({
            transmissionId: 'test-transmission-id',
          }),
        }),
        'PayPal webhook verification failed: invalid signature'
      );

      expect(Sentry.captureMessage).toHaveBeenCalled();
    });

    it('should log duplicate event attempts', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----`,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue({
        id: 'existing-id',
        eventId: 'test-event-id',
        eventType: 'PAYMENT.SALE.COMPLETED',
        payload: {},
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Event already processed',
          eventId: 'test-event-id',
        }),
        'PayPal webhook verification failed: duplicate event'
      );

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'PayPal webhook verification failed: duplicate event',
        expect.objectContaining({
          level: 'warning',
        })
      );
    });

    it('should log exceptions with full context', async () => {
      const testError = new Error('Unexpected error');
      vi.mocked(prisma.webhookEvent.findUnique).mockRejectedValue(testError);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----`,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Unexpected error',
          eventId: 'test-event-id',
          error: testError,
        }),
        'PayPal webhook verification failed: exception'
      );

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'PayPal webhook verification failed: exception',
        expect.objectContaining({
          level: 'warning',
          extra: expect.objectContaining({
            reason: 'Unexpected error',
          }),
        })
      );
    });
  });
});
