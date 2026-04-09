import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Sentry from '@sentry/node';
import { initSentry } from '../sentry';

describe('Sentry Error Filtering', () => {
  const originalEnv = process.env;
  let beforeSendCallback: any;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.SENTRY_DSN = 'https://test@sentry.io/123456';
    process.env.NODE_ENV = 'test';

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Spy on Sentry.init to capture beforeSend
    const initSpy = vi.spyOn(Sentry, 'init');
    initSentry();

    const initOptions = initSpy.mock.calls[0]?.[0];
    beforeSendCallback = initOptions!.beforeSend;
  });

  describe('404 Error Filtering', () => {
    it('should filter out 404 errors from response status code', () => {
      const event = {
        contexts: {
          response: {
            status_code: 404,
          },
        },
      };

      const result = beforeSendCallback(event, {});
      expect(result).toBeNull();
    });

    it('should filter out 404 errors from extra statusCode', () => {
      const event = {
        extra: {
          statusCode: 404,
        },
      };

      const result = beforeSendCallback(event, {});
      expect(result).toBeNull();
    });
  });

  describe('401 Authentication Error Filtering', () => {
    it('should filter out "Unauthorized" errors', () => {
      const event = {};
      const hint = {
        originalException: new Error('Unauthorized'),
      };

      const result = beforeSendCallback(event, hint);
      expect(result).toBeNull();
    });

    it('should filter out "Authentication failed" errors', () => {
      const event = {};
      const hint = {
        originalException: new Error('Authentication failed'),
      };

      const result = beforeSendCallback(event, hint);
      expect(result).toBeNull();
    });

    it('should filter out "Invalid token" errors', () => {
      const event = {};
      const hint = {
        originalException: new Error('Invalid token'),
      };

      const result = beforeSendCallback(event, hint);
      expect(result).toBeNull();
    });

    it('should filter errors with partial matches for auth failures', () => {
      const event = {};
      const hint = {
        originalException: new Error('User is Unauthorized to access this resource'),
      };

      const result = beforeSendCallback(event, hint);
      expect(result).toBeNull();
    });
  });

  describe('Non-Filtered Errors', () => {
    it('should NOT filter 500 errors', () => {
      const event = {
        contexts: {
          response: {
            status_code: 500,
          },
        },
        message: 'Internal server error',
      };

      const result = beforeSendCallback(event, {});
      expect(result).not.toBeNull();
      expect(result).toBeDefined();
    });

    it('should NOT filter validation errors', () => {
      const event = {};
      const hint = {
        originalException: new Error('Validation failed'),
      };

      const result = beforeSendCallback(event, hint);
      expect(result).not.toBeNull();
      expect(result).toBeDefined();
    });

    it('should NOT filter database errors', () => {
      const event = {};
      const hint = {
        originalException: new Error('Database connection failed'),
      };

      const result = beforeSendCallback(event, hint);
      expect(result).not.toBeNull();
      expect(result).toBeDefined();
    });
  });

  describe('Bulk Filtering Test', () => {
    it('should filter 10 consecutive 404 errors', () => {
      const filtered404s = [];

      for (let i = 0; i < 10; i++) {
        const event = {
          contexts: {
            response: {
              status_code: 404,
            },
          },
          message: `Not found: /api/nonexistent/${i}`,
        };

        const result = beforeSendCallback(event, {});
        filtered404s.push(result);
      }

      // All 404s should be filtered (null)
      expect(filtered404s.every((r) => r === null)).toBe(true);
      expect(filtered404s.length).toBe(10);
    });

    it('should filter 10 consecutive 401 auth errors', () => {
      const filtered401s = [];

      for (let i = 0; i < 10; i++) {
        const event = {};
        const hint = {
          originalException: new Error(`Unauthorized: Invalid token ${i}`),
        };

        const result = beforeSendCallback(event, hint);
        filtered401s.push(result);
      }

      // All 401s should be filtered (null)
      expect(filtered401s.every((r) => r === null)).toBe(true);
      expect(filtered401s.length).toBe(10);
    });
  });
});
