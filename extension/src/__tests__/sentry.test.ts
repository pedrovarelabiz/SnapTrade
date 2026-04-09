import * as Sentry from '@sentry/browser';
import { initSentry } from '../config/sentry';

// Mock @sentry/browser
jest.mock('@sentry/browser', () => ({
  init: jest.fn(),
  BrowserTracing: jest.fn(),
  Replay: jest.fn(),
}));

describe('initSentry', () => {
  const originalEnv = process.env;
  const mockGetManifest = jest.fn();
  const mockChromeRuntime = {
    getManifest: mockGetManifest,
    id: 'test-extension-id-12345',
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock chrome.runtime APIs
    (global as any).chrome = {
      runtime: mockChromeRuntime,
    };

    // Mock environment variables
    process.env = {
      ...originalEnv,
      SENTRY_DSN_EXTENSION: 'https://test-dsn@sentry.io/123456',
      NODE_ENV: 'test',
    };

    // Mock chrome.runtime.getManifest return value
    mockGetManifest.mockReturnValue({
      version: '1.2.3',
      name: 'Test Extension',
      manifest_version: 3,
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should initialize Sentry with correct configuration', () => {
    initSentry();

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://test-dsn@sentry.io/123456',
        environment: 'test',
        tracesSampleRate: 0.1,
        release: 'chrome-extension@1.2.3',
      })
    );
  });

  it('should call chrome.runtime.getManifest for version', () => {
    initSentry();

    expect(mockGetManifest).toHaveBeenCalled();
  });

  it('should set extension metadata in initialScope', () => {
    initSentry();

    const initCall = (Sentry.init as jest.Mock).mock.calls[0][0];
    expect(initCall.initialScope).toEqual({
      tags: {
        'extension.id': 'test-extension-id-12345',
        'extension.type': 'chrome-extension',
      },
    });
  });

  it('should include BrowserTracing and Replay integrations', () => {
    initSentry();

    const initCall = (Sentry.init as jest.Mock).mock.calls[0][0];
    expect(initCall.integrations).toHaveLength(2);
    expect(Sentry.BrowserTracing).toHaveBeenCalled();
    expect(Sentry.Replay).toHaveBeenCalled();
  });

  it('should configure replay sample rates', () => {
    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        replaysSessionSampleRate: 0.01,
        replaysOnErrorSampleRate: 0.5,
      })
    );
  });

  it('should have beforeSend hook defined', () => {
    initSentry();

    const initCall = (Sentry.init as jest.Mock).mock.calls[0][0];
    expect(initCall.beforeSend).toBeDefined();
    expect(typeof initCall.beforeSend).toBe('function');
  });

  it('should use empty string for DSN if not provided', () => {
    delete process.env.SENTRY_DSN_EXTENSION;

    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: '',
      })
    );
  });

  it('should default to production environment if NODE_ENV not set', () => {
    delete process.env.NODE_ENV;

    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'production',
      })
    );
  });

  describe('beforeSend filtering', () => {
    let beforeSendHook: (event: any, hint?: any) => any;

    beforeEach(() => {
      initSentry();
      const initCall = (Sentry.init as jest.Mock).mock.calls[0][0];
      beforeSendHook = initCall.beforeSend;
    });

    it('should filter Chrome extension internal errors', () => {
      const event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename: 'chrome-extension://abcd1234/internal.js',
                  },
                ],
              },
            },
          ],
        },
      };

      const result = beforeSendHook(event, {});
      expect(result).toBeNull();
    });

    it('should allow extension errors from src/', () => {
      const event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename: 'chrome-extension://abcd1234/src/app.js',
                  },
                ],
              },
            },
          ],
        },
      };

      const result = beforeSendHook(event, {});
      expect(result).not.toBeNull();
    });

    it('should redact sensitive fields from request data', () => {
      const event = {
        request: {
          data: {
            apiKey: 'secret-key',
            token: 'secret-token',
            balance: 1000,
            normalField: 'allowed',
          },
        },
      };

      const result = beforeSendHook(event, {});
      expect(result.request.data.apiKey).toBe('[REDACTED]');
      expect(result.request.data.token).toBe('[REDACTED]');
      expect(result.request.data.balance).toBe('[REDACTED]');
      expect(result.request.data.normalField).toBe('allowed');
    });

    it('should strip WebSocket message payloads from breadcrumbs', () => {
      const event = {
        breadcrumbs: [
          {
            category: 'websocket',
            data: {
              message: 'sensitive data',
              payload: 'more sensitive data',
              data: 'even more sensitive',
              metadata: 'allowed',
            },
          },
        ],
      };

      const result = beforeSendHook(event, {});
      expect(result.breadcrumbs[0].data.message).toBeUndefined();
      expect(result.breadcrumbs[0].data.payload).toBeUndefined();
      expect(result.breadcrumbs[0].data.data).toBeUndefined();
      expect(result.breadcrumbs[0].data.metadata).toBe('allowed');
    });

    it('should redact sensitive fields from breadcrumbs', () => {
      const event = {
        breadcrumbs: [
          {
            data: {
              apiKey: 'secret',
              balance: 500,
              normalData: 'ok',
            },
          },
        ],
      };

      const result = beforeSendHook(event, {});
      expect(result.breadcrumbs[0].data.apiKey).toBe('[REDACTED]');
      expect(result.breadcrumbs[0].data.balance).toBe('[REDACTED]');
      expect(result.breadcrumbs[0].data.normalData).toBe('ok');
    });

    it('should redact sensitive fields from extra data', () => {
      const event = {
        extra: {
          userApiKey: 'secret',
          accountBalance: 1000,
          debugInfo: 'allowed',
        },
      };

      const result = beforeSendHook(event, {});
      expect(result.extra.userApiKey).toBe('[REDACTED]');
      expect(result.extra.accountBalance).toBe('[REDACTED]');
      expect(result.extra.debugInfo).toBe('allowed');
    });
  });
});
