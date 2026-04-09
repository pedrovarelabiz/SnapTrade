import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initSentry, Sentry } from '../config/sentry';

describe('Sentry Initialization', () => {
  const TEST_DSN = 'https://test@o123456.ingest.sentry.io/123456';

  beforeEach(() => {
    // Reset environment variables before each test
    vi.stubEnv('SENTRY_DSN', TEST_DSN);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('npm_package_version', '1.0.0');

    // Close any existing Sentry client
    const client = Sentry.getCurrentHub().getClient();
    if (client) {
      client.close();
    }
  });

  it('should initialize Sentry client when DSN is provided', () => {
    // Call initSentry without an Express app
    initSentry();

    // Verify that Sentry client is initialized
    const client = Sentry.getCurrentHub().getClient();
    expect(client).toBeDefined();
    expect(client).not.toBeNull();
  });

  it('should not initialize Sentry when DSN is missing', () => {
    // Remove DSN from environment
    vi.stubEnv('SENTRY_DSN', '');

    // Spy on console.warn
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Call initSentry
    initSentry();

    // Verify warning was logged
    expect(warnSpy).toHaveBeenCalledWith('SENTRY_DSN not configured, skipping Sentry initialization');

    warnSpy.mockRestore();
  });

  it('should use correct environment from NODE_ENV', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    initSentry();

    expect(logSpy).toHaveBeenCalledWith('Sentry initialized for environment: test');

    logSpy.mockRestore();
  });

  it('should initialize Sentry with Express app integration', () => {
    // Create a mock Express app
    const mockApp = {
      use: vi.fn(),
    };

    initSentry(mockApp as any);

    // Verify that Sentry client is initialized
    const client = Sentry.getCurrentHub().getClient();
    expect(client).toBeDefined();
    expect(client).not.toBeNull();

    // Verify Express middleware was registered
    expect(mockApp.use).toHaveBeenCalledTimes(2);
  });
});
