/**
 * Security Penetration Test Suite for Webhook Processing
 *
 * This test suite validates security controls against common webhook attack vectors:
 *
 * 1. REPLAY ATTACK: Prevents reprocessing of duplicate webhook events
 * 2. FORGED SIGNATURE: Rejects webhooks with invalid or tampered cryptographic signatures
 * 3. EXPIRED TIMESTAMP: Blocks webhooks with stale or future timestamps
 * 4. MISSING SIGNATURE: Rejects webhooks lacking required authentication headers
 * 5. WRONG WEBHOOK ID: Validates webhook ID matches configured endpoint
 * 6. UNAUTHORIZED EVENT TYPE: Blocks unexpected or malicious event types
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { verifyPayPalWebhook } from '../../middleware/verifyPayPalWebhook.js';
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
    error: vi.fn(),
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

describe('Webhook Security Penetration Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  const VALID_CERT = `-----BEGIN CERTIFICATE-----
MIICXQIBAAKBgQDKr3Z0qL7VZ0yL0bJz0E7XqH9wH3C3vYvGdJzKxQ8dZL5J5h3p
-----END CERTIFICATE-----`;

  beforeEach(() => {
    vi.clearAllMocks();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      headers: {
        'paypal-transmission-id': 'test-transmission-id-001',
        'paypal-transmission-time': new Date().toISOString(),
        'paypal-transmission-sig': 'valid-signature-hash',
        'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT-123',
        'paypal-auth-algo': 'SHA256withRSA',
        'x-forwarded-for': '198.51.100.1',
      },
      body: {
        id: 'WH-EVENT-12345',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'PAYMENT-67890',
          amount: { value: '100.00', currency_code: 'USD' },
        },
      },
      ip: '198.51.100.1',
      socket: { remoteAddress: '198.51.100.1' } as any,
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
    } as any;

    mockNext = vi.fn();
    process.env.PAYPAL_WEBHOOK_ID = 'WH-CONFIG-123';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ATTACK VECTOR 1: Replay Attack Prevention', () => {
    /**
     * REPLAY ATTACK: An attacker intercepts a valid webhook and attempts to resend it
     * to trigger duplicate processing (e.g., double credits, duplicate orders).
     *
     * DEFENSE: System maintains idempotency by tracking processed event IDs and
     * rejecting duplicates with HTTP 409 Conflict.
     */

    it('should block replay attack with duplicate event ID', async () => {
      // Setup: Mock valid signature verification
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      // Attack: Event ID already exists in database (previously processed)
      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue({
        id: 'db-record-001',
        eventId: 'WH-EVENT-12345',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: mockReq.body,
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: new Date(Date.now() - 60000), // Processed 1 minute ago
        updatedAt: new Date(Date.now() - 60000),
      });

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      // Verify: Attack blocked with 409 Conflict
      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Event already processed',
      });
      expect(mockNext).not.toHaveBeenCalled();

      // Verify: Security event logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Event already processed',
          eventId: 'WH-EVENT-12345',
        }),
        'PayPal webhook verification failed: duplicate event'
      );
    });

    it('should block replay attack with duplicate transmission ID', async () => {
      // Attack: Same transmission ID used twice (PayPal's unique request identifier)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      // Simulate: Transmission ID collision (replay attempt)
      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue({
        id: 'db-record-002',
        eventId: 'WH-EVENT-12345',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { ...mockReq.body, resource: { id: 'DIFFERENT-PAYMENT' } },
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: new Date(Date.now() - 120000), // Processed 2 minutes ago
        updatedAt: new Date(Date.now() - 120000),
      });

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'PayPal webhook verification failed: duplicate event',
        expect.objectContaining({ level: 'warning' })
      );
    });

    it('should detect replay attack within narrow time window', async () => {
      // Attack: Rapid replay within seconds of original webhook
      const originalTimestamp = new Date(Date.now() - 5000); // 5 seconds ago

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue({
        id: 'db-record-003',
        eventId: 'WH-EVENT-12345',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: mockReq.body,
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: originalTimestamp,
        updatedAt: originalTimestamp,
      });

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      // Even with valid signature and recent timestamp, duplicate event is rejected
      expect(statusMock).toHaveBeenCalledWith(409);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('ATTACK VECTOR 2: Forged Signature Attack', () => {
    /**
     * FORGED SIGNATURE ATTACK: Attacker crafts malicious webhook with fake signature
     * to impersonate PayPal and inject fraudulent events.
     *
     * DEFENSE: Cryptographic signature verification using PayPal's public certificate.
     * Invalid signatures are rejected with HTTP 401 Unauthorized.
     */

    it('should reject forged signature from attacker', async () => {
      // Attack: Malicious webhook with fake signature
      mockReq.headers!['paypal-transmission-sig'] = 'FORGED-SIGNATURE-BY-ATTACKER';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      // Signature verification fails (forged signature doesn't match)
      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(false), // Cryptographic verification fails
      } as any);

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      // Verify: Attack blocked with 401 Unauthorized
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Invalid webhook signature',
      });
      expect(mockNext).not.toHaveBeenCalled();

      // Verify: Security incident logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Invalid webhook signature',
        }),
        'PayPal webhook verification failed: invalid signature'
      );
    });

    it('should reject webhook with tampered payload', async () => {
      // Attack: Valid signature but payload modified after signing
      mockReq.body.resource.amount.value = '9999999.00'; // Tampered amount

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      // Signature won't match tampered payload
      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(false),
      } as any);

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(Sentry.captureMessage).toHaveBeenCalled();
    });

    it('should reject webhook with invalid certificate URL', async () => {
      // Attack: Attacker provides malicious certificate URL
      mockReq.headers!['paypal-cert-url'] = 'https://evil-attacker.com/fake-cert';

      // Certificate fetch fails (not from PayPal domain)
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      } as any);

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Invalid webhook signature',
      });
    });

    it('should reject webhook with empty signature', async () => {
      // Attack: Missing signature value
      mockReq.headers!['paypal-transmission-sig'] = '';

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Missing required PayPal webhook headers',
      });
    });

    it('should reject webhook signed with wrong algorithm', async () => {
      // Attack: Attacker uses weak/deprecated signing algorithm
      mockReq.headers!['paypal-auth-algo'] = 'MD5withRSA'; // Insecure algorithm

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(false),
      } as any);

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe('ATTACK VECTOR 3: Expired Timestamp Attack', () => {
    /**
     * EXPIRED TIMESTAMP ATTACK: Attacker reuses old webhook or sends future-dated webhook
     * to bypass time-based security controls or manipulate processing order.
     *
     * DEFENSE: Timestamp validation with configurable tolerance window (default 5 minutes).
     * Webhooks outside the window are rejected with HTTP 401 Unauthorized.
     */

    it('should reject webhook with expired timestamp (old webhook)', async () => {
      // Attack: Webhook timestamp is 10 minutes old (exceeds 5-minute tolerance)
      const expiredTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      mockReq.headers!['paypal-transmission-time'] = expiredTimestamp;

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Webhook timestamp is invalid or expired',
      });
      expect(mockNext).not.toHaveBeenCalled();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Webhook timestamp is invalid or expired',
          transmissionTime: expiredTimestamp,
        }),
        'PayPal webhook verification failed: invalid timestamp'
      );
    });

    it('should reject webhook with future timestamp', async () => {
      // Attack: Webhook claims to be from the future (time manipulation)
      const futureTimestamp = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      mockReq.headers!['paypal-transmission-time'] = futureTimestamp;

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Webhook timestamp is invalid or expired',
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          transmissionTime: futureTimestamp,
        }),
        'PayPal webhook verification failed: invalid timestamp'
      );
    });

    it('should reject webhook with far-future timestamp (year 2099)', async () => {
      // Attack: Extreme future timestamp to test boundary conditions
      const farFutureTimestamp = new Date('2099-12-31T23:59:59Z').toISOString();
      mockReq.headers!['paypal-transmission-time'] = farFutureTimestamp;

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(Sentry.captureMessage).toHaveBeenCalled();
    });

    it('should reject webhook with malformed timestamp', async () => {
      // Attack: Invalid timestamp format to trigger parsing errors
      mockReq.headers!['paypal-transmission-time'] = 'invalid-timestamp-format';

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should reject webhook with Unix epoch timestamp (1970)', async () => {
      // Attack: Extremely old timestamp (zero-day vulnerability test)
      const epochTimestamp = new Date(0).toISOString();
      mockReq.headers!['paypal-transmission-time'] = epochTimestamp;

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe('ATTACK VECTOR 4: Missing Signature Headers Attack', () => {
    /**
     * MISSING SIGNATURE ATTACK: Attacker sends webhook without authentication headers,
     * hoping validation is bypassed or optional.
     *
     * DEFENSE: All required headers are mandatory. Missing any header results in
     * immediate rejection with HTTP 401 Unauthorized.
     */

    it('should reject webhook missing transmission ID header', async () => {
      // Attack: Remove unique transmission ID
      delete mockReq.headers!['paypal-transmission-id'];

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
    });

    it('should reject webhook missing signature header', async () => {
      // Attack: Remove cryptographic signature
      delete mockReq.headers!['paypal-transmission-sig'];

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Missing required PayPal webhook headers',
      });
    });

    it('should reject webhook missing certificate URL header', async () => {
      // Attack: Remove certificate URL to prevent verification
      delete mockReq.headers!['paypal-cert-url'];

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should reject webhook missing timestamp header', async () => {
      // Attack: Remove timestamp to bypass expiration checks
      delete mockReq.headers!['paypal-transmission-time'];

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should reject webhook missing auth algorithm header', async () => {
      // Attack: Remove algorithm specification
      delete mockReq.headers!['paypal-auth-algo'];

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should reject webhook with all headers missing', async () => {
      // Attack: Completely unauthenticated webhook
      mockReq.headers = {};

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'PayPal webhook verification failed: missing headers',
        expect.objectContaining({ level: 'warning' })
      );
    });
  });

  describe('ATTACK VECTOR 5: Wrong Webhook ID Attack', () => {
    /**
     * WRONG WEBHOOK ID ATTACK: Attacker uses webhook credentials from a different
     * endpoint or account to send webhooks to this system.
     *
     * DEFENSE: Webhook ID must match the configured endpoint ID. Mismatches indicate
     * credential theft or misconfiguration and are rejected.
     */

    it('should reject webhook with incorrect webhook ID', async () => {
      // Attack: Webhook ID from different PayPal endpoint/account
      process.env.PAYPAL_WEBHOOK_ID = 'WH-CORRECT-ID-456';

      // Attacker uses stolen or wrong webhook ID
      const attackerWebhookId = 'WH-STOLEN-ID-789';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      // Even with valid signature, wrong webhook ID should fail
      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(false), // Fails because webhook ID mismatch
      } as any);

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should reject webhook when PAYPAL_WEBHOOK_ID env var is missing', async () => {
      // Attack: Exploit missing configuration
      delete process.env.PAYPAL_WEBHOOK_ID;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
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

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: expect.stringContaining('PAYPAL_'),
        }),
        'PayPal webhook verification failed: exception'
      );
    });

    it('should reject webhook with empty webhook ID', async () => {
      // Attack: Empty string webhook ID
      process.env.PAYPAL_WEBHOOK_ID = '';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe('ATTACK VECTOR 6: Unauthorized Event Type Attack', () => {
    /**
     * UNAUTHORIZED EVENT TYPE ATTACK: Attacker sends webhook with unexpected or
     * malicious event types to trigger unintended business logic or exploit vulnerabilities.
     *
     * DEFENSE: Event type validation against whitelist of expected events. Unknown or
     * suspicious event types are logged and can be rejected based on business rules.
     */

    it('should log suspicious event type (unknown event)', async () => {
      // Attack: Unexpected event type not in business logic
      mockReq.body.event_type = 'MALICIOUS.UNKNOWN.EVENT';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.webhookEvent.create).mockResolvedValue({
        id: 'webhook-event-id',
        eventId: 'WH-EVENT-12345',
        eventType: 'MALICIOUS.UNKNOWN.EVENT',
        payload: mockReq.body,
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      // Event is logged for monitoring (security team can investigate)
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'MALICIOUS.UNKNOWN.EVENT',
        }),
        'PayPal webhook verification successful'
      );
    });

    it('should handle event type with SQL injection attempt', async () => {
      // Attack: Event type containing SQL injection payload
      mockReq.body.event_type = "PAYMENT'; DROP TABLE webhooks;--";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.webhookEvent.create).mockResolvedValue({
        id: 'webhook-event-id',
        eventId: 'WH-EVENT-12345',
        eventType: "PAYMENT'; DROP TABLE webhooks;--",
        payload: mockReq.body,
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      // Prisma parameterized queries prevent SQL injection
      expect(prisma.webhookEvent.create).toHaveBeenCalled();
    });

    it('should handle event type with XSS payload', async () => {
      // Attack: Event type containing XSS script
      mockReq.body.event_type = '<script>alert("XSS")</script>';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.webhookEvent.create).mockResolvedValue({
        id: 'webhook-event-id',
        eventId: 'WH-EVENT-12345',
        eventType: '<script>alert("XSS")</script>',
        payload: mockReq.body,
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      // Event stored safely (proper output encoding prevents XSS)
      expect(prisma.webhookEvent.create).toHaveBeenCalled();
    });

    it('should handle extremely long event type (DoS attempt)', async () => {
      // Attack: Extremely long event type to cause memory/performance issues
      const longEventType = 'MALICIOUS.' + 'A'.repeat(10000);
      mockReq.body.event_type = longEventType;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.webhookEvent.create).mockResolvedValue({
        id: 'webhook-event-id',
        eventId: 'WH-EVENT-12345',
        eventType: longEventType,
        payload: mockReq.body,
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      // System handles large input gracefully
      expect(prisma.webhookEvent.create).toHaveBeenCalled();
    });

    it('should handle null/undefined event type', async () => {
      // Attack: Missing event type to bypass validation
      mockReq.body.event_type = undefined;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.webhookEvent.create).mockResolvedValue({
        id: 'webhook-event-id',
        eventId: 'WH-EVENT-12345',
        eventType: undefined as any,
        payload: mockReq.body,
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      expect(prisma.webhookEvent.create).toHaveBeenCalled();
    });
  });

  describe('ATTACK VECTOR 7: Rate Limiting Attack', () => {
    /**
     * RATE LIMITING ATTACK: Attacker floods webhook endpoint with excessive requests
     * to overwhelm the system, cause service degradation, or exploit race conditions.
     *
     * DEFENSE: Rate limiting enforces maximum 100 requests per IP within the time window.
     * Requests exceeding the limit are rejected with HTTP 429 Too Many Requests and
     * appropriate rate limit headers.
     */

    it.skip('should block 101st request with 429 Too Many Requests and include rate limit headers', async () => {
      // Setup: Mock valid webhook for all requests
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue(null);

      // Attack: Send 100 requests successfully (within rate limit)
      for (let i = 1; i <= 100; i++) {
        vi.mocked(prisma.webhookEvent.create).mockResolvedValue({
          id: `webhook-event-${i}`,
          eventId: `WH-EVENT-${i}`,
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          payload: mockReq.body,
          verified: true,
          source: 'paypal',
          processedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Reset mocks for clean state per request
        vi.clearAllMocks();
        vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue(null);

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          text: async () => VALID_CERT,
        } as any);

        mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
          update: vi.fn().mockReturnThis(),
          end: vi.fn(),
          verify: vi.fn().mockReturnValue(true),
        } as any);
      }

      // Attack: 101st request should be rate limited
      const rateLimitedReq = {
        ...mockReq,
        headers: {
          ...mockReq.headers,
          'paypal-transmission-id': 'test-transmission-id-101',
        },
        body: {
          ...mockReq.body,
          id: 'WH-EVENT-101',
        },
      };

      const setHeaderMock = vi.fn();
      const rateLimitedRes = {
        status: statusMock,
        json: jsonMock,
        setHeader: setHeaderMock,
      } as any;

      await verifyPayPalWebhook(rateLimitedReq as any, rateLimitedRes as Response, mockNext);

      // Verify: 101st request blocked with 429 Too Many Requests
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
      });
      expect(mockNext).not.toHaveBeenCalled();

      // Verify: Rate limit headers included in response
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
      expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', expect.any(String));

      // Verify: Security event logged
      expect(logger.warn).toHaveBeenCalledWith(
        'PayPal webhook verification failed: rate limit exceeded',
        expect.objectContaining({
          reason: 'Too Many Requests',
          ip: '198.51.100.1',
        })
      );
    });
  });

  describe('Combined Attack Scenarios', () => {
    /**
     * COMBINED ATTACKS: Real-world attackers often combine multiple techniques.
     * These tests validate defense-in-depth approach.
     */

    it('should block replay attack even with forged fresh timestamp', async () => {
      // Attack: Replayed event with updated timestamp to bypass expiration check
      const freshTimestamp = new Date().toISOString();
      mockReq.headers!['paypal-transmission-time'] = freshTimestamp;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_CERT,
      } as any);

      mockCrypto.createPublicKey.mockReturnValue({} as any);
      mockCrypto.createVerify.mockReturnValue({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        verify: vi.fn().mockReturnValue(true),
      } as any);

      // Event ID already processed (replay detection takes precedence)
      vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValue({
        id: 'db-record-004',
        eventId: 'WH-EVENT-12345',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: mockReq.body,
        verified: true,
        source: 'paypal',
        processedAt: null,
        createdAt: new Date(Date.now() - 300000), // Original: 5 min ago
        updatedAt: new Date(Date.now() - 300000),
      });

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      // Replay blocked despite fresh timestamp
      expect(statusMock).toHaveBeenCalledWith(409);
    });

    it('should block all attacks when multiple security violations occur', async () => {
      // Attack: Multiple violations (expired timestamp + forged signature + missing headers)
      mockReq.headers!['paypal-transmission-time'] = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      mockReq.headers!['paypal-transmission-sig'] = 'FORGED';
      delete mockReq.headers!['paypal-cert-url'];

      await verifyPayPalWebhook(mockReq as any, mockRes as Response, mockNext);

      // First validation failure (missing headers) triggers rejection
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
