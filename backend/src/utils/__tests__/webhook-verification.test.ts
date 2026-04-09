import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  verifyPayPalWebhookSignature,
  validateWebhookHeaders,
  validateWebhookTimestamp,
  WebhookHeaders,
  WebhookVerificationResult,
} from '../webhook-verification';
import * as paypal from '@paypal/checkout-server-sdk';

// Mock the PayPal SDK
vi.mock('@paypal/checkout-server-sdk', () => {
  const MockPayPalHttpClient = vi.fn(function(this: any) {
    this.execute = vi.fn();
  });
  const MockSandboxEnvironment = vi.fn(function(this: any) {});
  const MockLiveEnvironment = vi.fn(function(this: any) {});
  return {
    core: {
      PayPalHttpClient: MockPayPalHttpClient,
      SandboxEnvironment: MockSandboxEnvironment,
      LiveEnvironment: MockLiveEnvironment,
    },
  };
});

describe('verifyPayPalWebhookSignature', () => {
  const validHeaders: WebhookHeaders = {
    'paypal-transmission-id': 'test-transmission-id',
    'paypal-transmission-time': '2026-03-23T10:00:00Z',
    'paypal-transmission-sig': 'test-signature',
    'paypal-cert-url': 'https://api.paypal.com/cert',
    'paypal-auth-algo': 'SHA256withRSA',
  };

  const validBody = {
    id: 'WH-123',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: { id: 'test-resource' },
  };

  const webhookId = 'test-webhook-id';

  let mockExecute: ReturnType<typeof vi.fn>;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock execute function
    mockExecute = vi.fn();
    mockClient = { execute: mockExecute };

    // Override PayPalHttpClient to return our mockClient
    vi.mocked(paypal.core.PayPalHttpClient).mockImplementation(function(this: any) {
      this.execute = mockExecute;
      return this;
    } as any);

    // Set default environment variables
    process.env.PAYPAL_MODE = 'sandbox';
    process.env.PAYPAL_CLIENT_ID = 'test-client-id';
    process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PAYPAL_MODE;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
  });

  describe('valid signature', () => {
    it('should pass verification when signature is valid', async () => {
      // Mock successful PayPal API response
      mockExecute.mockResolvedValue({
        statusCode: 200,
        result: {
          verification_status: 'SUCCESS',
        },
      });

      const result = await verifyPayPalWebhookSignature(validHeaders, validBody, webhookId);

      expect(result.verified).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/notifications/verify-webhook-signature',
          verb: 'POST',
          body: expect.objectContaining({
            webhook_id: webhookId,
            transmission_id: validHeaders['paypal-transmission-id'],
            transmission_sig: validHeaders['paypal-transmission-sig'],
          }),
        })
      );
    });

    it('should handle string body correctly', async () => {
      mockExecute.mockResolvedValue({
        statusCode: 200,
        result: {
          verification_status: 'SUCCESS',
        },
      });

      const stringBody = JSON.stringify(validBody);
      const result = await verifyPayPalWebhookSignature(validHeaders, stringBody, webhookId);

      expect(result.verified).toBe(true);
      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe('invalid signature', () => {
    it('should not verify when PayPal returns non-SUCCESS status', async () => {
      mockExecute.mockResolvedValue({
        statusCode: 200,
        result: {
          verification_status: 'FAILURE',
        },
      });

      const result = await verifyPayPalWebhookSignature(validHeaders, validBody, webhookId);

      expect(result.verified).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('VERIFICATION_FAILED');
      expect(result.error?.message).toContain('FAILURE');
    });

    it('should fail when PayPal API returns non-200 status', async () => {
      mockExecute.mockResolvedValue({
        statusCode: 400,
        result: {
          error: 'Invalid request',
        },
      });

      const result = await verifyPayPalWebhookSignature(validHeaders, validBody, webhookId);

      expect(result.verified).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('UNEXPECTED_RESPONSE');
      expect(result.error?.message).toContain('400');
    });

    it('should handle PayPal API errors', async () => {
      const apiError = {
        statusCode: 401,
        message: 'Authentication failed',
        details: { error: 'invalid_client' },
      };

      mockExecute.mockRejectedValue(apiError);

      const result = await verifyPayPalWebhookSignature(validHeaders, validBody, webhookId);

      expect(result.verified).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('PAYPAL_API_ERROR');
      expect(result.error?.message).toContain('Authentication failed');
    });

    it('should handle network errors', async () => {
      mockExecute.mockRejectedValue(new Error('Network timeout'));

      const result = await verifyPayPalWebhookSignature(validHeaders, validBody, webhookId);

      expect(result.verified).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('VERIFICATION_ERROR');
      expect(result.error?.message).toContain('Network timeout');
    });

    it('should handle JSON parsing errors for invalid body strings', async () => {
      const invalidJsonString = 'not-valid-json{';

      const result = await verifyPayPalWebhookSignature(validHeaders, invalidJsonString, webhookId);

      expect(result.verified).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_JSON');
    });
  });

  describe('missing headers', () => {
    it('should fail when paypal-transmission-id is missing', async () => {
      const headersWithoutTransmissionId = {
        ...validHeaders,
        'paypal-transmission-id': '',
      } as WebhookHeaders;

      const result = await verifyPayPalWebhookSignature(
        headersWithoutTransmissionId,
        validBody,
        webhookId
      );

      expect(result.verified).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('MISSING_HEADER');
      expect(result.error?.message).toContain('paypal-transmission-id');
    });

    it('should fail when paypal-transmission-time is missing', async () => {
      const headersWithoutTime = {
        ...validHeaders,
        'paypal-transmission-time': '',
      } as WebhookHeaders;

      const result = await verifyPayPalWebhookSignature(
        headersWithoutTime,
        validBody,
        webhookId
      );

      expect(result.verified).toBe(false);
      expect(result.error?.code).toBe('MISSING_HEADER');
      expect(result.error?.message).toContain('paypal-transmission-time');
    });

    it('should fail when paypal-transmission-sig is missing', async () => {
      const headersWithoutSig = {
        ...validHeaders,
        'paypal-transmission-sig': '',
      } as WebhookHeaders;

      const result = await verifyPayPalWebhookSignature(
        headersWithoutSig,
        validBody,
        webhookId
      );

      expect(result.verified).toBe(false);
      expect(result.error?.code).toBe('MISSING_HEADER');
      expect(result.error?.message).toContain('paypal-transmission-sig');
    });

    it('should fail when paypal-cert-url is missing', async () => {
      const headersWithoutCertUrl = {
        ...validHeaders,
        'paypal-cert-url': '',
      } as WebhookHeaders;

      const result = await verifyPayPalWebhookSignature(
        headersWithoutCertUrl,
        validBody,
        webhookId
      );

      expect(result.verified).toBe(false);
      expect(result.error?.code).toBe('MISSING_HEADER');
      expect(result.error?.message).toContain('paypal-cert-url');
    });

    it('should fail when paypal-auth-algo is missing', async () => {
      const headersWithoutAuthAlgo = {
        ...validHeaders,
        'paypal-auth-algo': '',
      } as WebhookHeaders;

      const result = await verifyPayPalWebhookSignature(
        headersWithoutAuthAlgo,
        validBody,
        webhookId
      );

      expect(result.verified).toBe(false);
      expect(result.error?.code).toBe('MISSING_HEADER');
      expect(result.error?.message).toContain('paypal-auth-algo');
    });

    it('should fail when headers parameter is null', async () => {
      const result = await verifyPayPalWebhookSignature(
        null as any,
        validBody,
        webhookId
      );

      expect(result.verified).toBe(false);
      expect(result.error?.code).toBe('INVALID_PARAMETERS');
      expect(result.error?.message).toContain('headers and webhookId are required');
    });

    it('should fail when webhookId is missing', async () => {
      const result = await verifyPayPalWebhookSignature(
        validHeaders,
        validBody,
        ''
      );

      expect(result.verified).toBe(false);
      expect(result.error?.code).toBe('INVALID_PARAMETERS');
    });
  });

  describe('expired timestamp', () => {
    it('should fail when timestamp is too old', async () => {
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
      const headersWithOldTimestamp = {
        ...validHeaders,
        'paypal-transmission-time': oldTimestamp,
      };

      // Even if we call verifyPayPalWebhookSignature, it doesn't validate timestamp by default
      // So we'll test validateWebhookTimestamp separately
      const timestampResult = validateWebhookTimestamp(oldTimestamp, 5 * 60 * 1000); // 5 min tolerance

      expect(timestampResult.isValid).toBe(false);
      expect(timestampResult.error).toContain('too old');
    });

    it('should fail when timestamp is from the future', async () => {
      const futureTimestamp = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes in future

      const timestampResult = validateWebhookTimestamp(futureTimestamp);

      expect(timestampResult.isValid).toBe(false);
      expect(timestampResult.error).toContain('future');
    });

    it('should pass when timestamp is within tolerance', async () => {
      const recentTimestamp = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 minutes ago

      const timestampResult = validateWebhookTimestamp(recentTimestamp, 5 * 60 * 1000);

      expect(timestampResult.isValid).toBe(true);
      expect(timestampResult.error).toBeUndefined();
    });

    it('should fail when timestamp format is invalid', async () => {
      const invalidTimestamp = 'not-a-valid-timestamp';

      const timestampResult = validateWebhookTimestamp(invalidTimestamp);

      expect(timestampResult.isValid).toBe(false);
      expect(timestampResult.error).toContain('Invalid timestamp format');
    });
  });

  describe('validateWebhookHeaders', () => {
    it('should return empty array for valid headers', () => {
      const headers = {
        'PAYPAL-TRANSMISSION-ID': 'test-id',
        'PAYPAL-TRANSMISSION-TIME': '2026-03-23T10:00:00Z',
        'PAYPAL-TRANSMISSION-SIG': 'test-sig',
        'PAYPAL-CERT-URL': 'https://api.paypal.com/cert',
        'PAYPAL-AUTH-ALGO': 'SHA256withRSA',
      };

      const errors = validateWebhookHeaders(headers);

      expect(errors).toHaveLength(0);
    });

    it('should handle lowercase headers', () => {
      const headers = {
        'paypal-transmission-id': 'test-id',
        'paypal-transmission-time': '2026-03-23T10:00:00Z',
        'paypal-transmission-sig': 'test-sig',
        'paypal-cert-url': 'https://api.paypal.com/cert',
        'paypal-auth-algo': 'SHA256withRSA',
      };

      const errors = validateWebhookHeaders(headers);

      expect(errors).toHaveLength(0);
    });

    it('should return errors for missing headers', () => {
      const headers = {
        'PAYPAL-TRANSMISSION-ID': 'test-id',
      };

      const errors = validateWebhookHeaders(headers);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('PAYPAL-TRANSMISSION-TIME'))).toBe(true);
      expect(errors.some(e => e.includes('PAYPAL-TRANSMISSION-SIG'))).toBe(true);
    });

    it('should return error when paypal-transmission-id is missing', () => {
      const headers = {
        'paypal-transmission-time': '2026-03-23T10:00:00Z',
        'paypal-transmission-sig': 'test-sig',
        'paypal-cert-url': 'https://api.paypal.com/cert',
        'paypal-auth-algo': 'SHA256withRSA',
      };

      const errors = validateWebhookHeaders(headers);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.toLowerCase().includes('paypal-transmission-id'))).toBe(true);
    });

    it('should return error when paypal-transmission-time is missing', () => {
      const headers = {
        'paypal-transmission-id': 'test-id',
        'paypal-transmission-sig': 'test-sig',
        'paypal-cert-url': 'https://api.paypal.com/cert',
        'paypal-auth-algo': 'SHA256withRSA',
      };

      const errors = validateWebhookHeaders(headers);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.toLowerCase().includes('paypal-transmission-time'))).toBe(true);
    });

    it('should return error when paypal-transmission-sig is missing', () => {
      const headers = {
        'paypal-transmission-id': 'test-id',
        'paypal-transmission-time': '2026-03-23T10:00:00Z',
        'paypal-cert-url': 'https://api.paypal.com/cert',
        'paypal-auth-algo': 'SHA256withRSA',
      };

      const errors = validateWebhookHeaders(headers);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.toLowerCase().includes('paypal-transmission-sig'))).toBe(true);
    });

    it('should return error when paypal-cert-url is missing', () => {
      const headers = {
        'paypal-transmission-id': 'test-id',
        'paypal-transmission-time': '2026-03-23T10:00:00Z',
        'paypal-transmission-sig': 'test-sig',
        'paypal-auth-algo': 'SHA256withRSA',
      };

      const errors = validateWebhookHeaders(headers);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.toLowerCase().includes('paypal-cert-url'))).toBe(true);
    });

    it('should return error when paypal-auth-algo is missing', () => {
      const headers = {
        'paypal-transmission-id': 'test-id',
        'paypal-transmission-time': '2026-03-23T10:00:00Z',
        'paypal-transmission-sig': 'test-sig',
        'paypal-cert-url': 'https://api.paypal.com/cert',
      };

      const errors = validateWebhookHeaders(headers);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.toLowerCase().includes('paypal-auth-algo'))).toBe(true);
    });

    it('should return error when header value is empty string', () => {
      const headers = {
        'paypal-transmission-id': '',
        'paypal-transmission-time': '2026-03-23T10:00:00Z',
        'paypal-transmission-sig': 'test-sig',
        'paypal-cert-url': 'https://api.paypal.com/cert',
        'paypal-auth-algo': 'SHA256withRSA',
      };

      const errors = validateWebhookHeaders(headers);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.toLowerCase().includes('paypal-transmission-id'))).toBe(true);
    });

    it('should return multiple errors when multiple headers are missing', () => {
      const headers = {
        'paypal-transmission-id': 'test-id',
      };

      const errors = validateWebhookHeaders(headers);

      expect(errors.length).toBe(4); // 4 missing headers
      expect(errors.some(e => e.toLowerCase().includes('paypal-transmission-time'))).toBe(true);
      expect(errors.some(e => e.toLowerCase().includes('paypal-transmission-sig'))).toBe(true);
      expect(errors.some(e => e.toLowerCase().includes('paypal-cert-url'))).toBe(true);
      expect(errors.some(e => e.toLowerCase().includes('paypal-auth-algo'))).toBe(true);
    });

    it('should handle array header values correctly', () => {
      const headers = {
        'paypal-transmission-id': ['test-id'],
        'paypal-transmission-time': ['2026-03-23T10:00:00Z'],
        'paypal-transmission-sig': ['test-sig'],
        'paypal-cert-url': ['https://api.paypal.com/cert'],
        'paypal-auth-algo': ['SHA256withRSA'],
      };

      const errors = validateWebhookHeaders(headers);

      expect(errors).toHaveLength(0);
    });

    it('should return error when header value is explicitly undefined', () => {
      const headers = {
        'paypal-transmission-id': 'test-id',
        'paypal-transmission-time': undefined,
        'paypal-transmission-sig': 'test-sig',
        'paypal-cert-url': 'https://api.paypal.com/cert',
        'paypal-auth-algo': 'SHA256withRSA',
      };

      const errors = validateWebhookHeaders(headers);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.toLowerCase().includes('paypal-transmission-time'))).toBe(true);
    });

    it('should validate all 5 required PayPal headers are present', () => {
      const completeHeaders = {
        'PAYPAL-TRANSMISSION-ID': 'valid-id',
        'PAYPAL-TRANSMISSION-TIME': '2026-03-23T10:00:00Z',
        'PAYPAL-TRANSMISSION-SIG': 'valid-signature',
        'PAYPAL-CERT-URL': 'https://api.paypal.com/cert',
        'PAYPAL-AUTH-ALGO': 'SHA256withRSA',
      };

      const errors = validateWebhookHeaders(completeHeaders);

      // All 5 headers present should return no errors
      expect(errors).toHaveLength(0);
    });

    it('should return all 5 errors when no headers are provided', () => {
      const headers = {};

      const errors = validateWebhookHeaders(headers);

      // All 5 required headers are missing
      expect(errors).toHaveLength(5);
      expect(errors.some(e => e.includes('PAYPAL-TRANSMISSION-ID'))).toBe(true);
      expect(errors.some(e => e.includes('PAYPAL-TRANSMISSION-TIME'))).toBe(true);
      expect(errors.some(e => e.includes('PAYPAL-TRANSMISSION-SIG'))).toBe(true);
      expect(errors.some(e => e.includes('PAYPAL-CERT-URL'))).toBe(true);
      expect(errors.some(e => e.includes('PAYPAL-AUTH-ALGO'))).toBe(true);
    });
  });

  describe('environment configuration', () => {
    it('should use sandbox environment when PAYPAL_MODE is sandbox', async () => {
      process.env.PAYPAL_MODE = 'sandbox';

      mockExecute.mockResolvedValue({
        statusCode: 200,
        result: { verification_status: 'SUCCESS' },
      });

      await verifyPayPalWebhookSignature(validHeaders, validBody, webhookId);

      expect(paypal.core.SandboxEnvironment).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret'
      );
      expect(paypal.core.LiveEnvironment).not.toHaveBeenCalled();
    });

    it('should use live environment when PAYPAL_MODE is live', async () => {
      process.env.PAYPAL_MODE = 'live';

      mockExecute.mockResolvedValue({
        statusCode: 200,
        result: { verification_status: 'SUCCESS' },
      });

      await verifyPayPalWebhookSignature(validHeaders, validBody, webhookId);

      expect(paypal.core.LiveEnvironment).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret'
      );
      expect(paypal.core.SandboxEnvironment).not.toHaveBeenCalled();
    });
  });
});

describe('validateWebhookTimestamp', () => {
  const MOCK_NOW = new Date('2026-03-23T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should pass when timestamp is within the default 5-minute window', () => {
    // 2 minutes ago
    const timestamp = new Date(MOCK_NOW - 2 * 60 * 1000).toISOString();

    const result = validateWebhookTimestamp(timestamp);

    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should pass when timestamp is at the edge of custom tolerance window', () => {
    // Exactly 10 minutes ago with 10-minute tolerance
    const timestamp = new Date(MOCK_NOW - 10 * 60 * 1000).toISOString();
    const tolerance = 10 * 60 * 1000; // 10 minutes

    const result = validateWebhookTimestamp(timestamp, tolerance);

    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should fail when timestamp is too old beyond tolerance window', () => {
    // 10 minutes ago with default 5-minute tolerance
    const timestamp = new Date(MOCK_NOW - 10 * 60 * 1000).toISOString();

    const result = validateWebhookTimestamp(timestamp);

    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('too old');
  });

  it('should fail when timestamp is from the future', () => {
    // 5 minutes in the future
    const timestamp = new Date(MOCK_NOW + 5 * 60 * 1000).toISOString();

    const result = validateWebhookTimestamp(timestamp);

    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('future');
  });

  it('should fail when timestamp is slightly in the future', () => {
    // 30 seconds in the future
    const timestamp = new Date(MOCK_NOW + 30 * 1000).toISOString();

    const result = validateWebhookTimestamp(timestamp);

    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('future');
  });

  it('should fail when timestamp format is invalid', () => {
    const invalidTimestamp = 'not-a-valid-timestamp';

    const result = validateWebhookTimestamp(invalidTimestamp);

    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Invalid timestamp format');
  });

  it('should fail when timestamp is a number string instead of ISO format', () => {
    const invalidTimestamp = '1234567890';

    const result = validateWebhookTimestamp(invalidTimestamp);

    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Invalid timestamp format');
  });

  it('should fail when timestamp is an empty string', () => {
    const invalidTimestamp = '';

    const result = validateWebhookTimestamp(invalidTimestamp);

    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Invalid timestamp format');
  });

  it('should pass when timestamp is exactly now', () => {
    const timestamp = new Date(MOCK_NOW).toISOString();

    const result = validateWebhookTimestamp(timestamp);

    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
