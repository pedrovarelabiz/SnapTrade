import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Sentry from '@sentry/node';
import { initSentry } from '../sentry';

describe('Sentry Initialization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules and environment before each test
    vi.resetModules();
    process.env = { ...originalEnv };

    // Mock console.warn and console.log
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should initialize Sentry with test DSN and return initialized client', () => {
    // Spy on console.log for this specific test
    const logSpy = vi.spyOn(console, 'log');

    // Mock environment variables
    process.env.SENTRY_DSN = 'https://test@sentry.io/123456';
    process.env.NODE_ENV = 'test';
    process.env.npm_package_version = '1.0.0';

    // Call initSentry
    initSentry();

    // Verify Sentry client is initialized
    const client = Sentry.getCurrentHub().getClient();
    expect(client).toBeDefined();
    expect(client).not.toBeNull();

    // Verify console.log was called with initialization message
    expect(logSpy).toHaveBeenCalledWith('Sentry initialized for environment: test');
  });

  it('should skip initialization when SENTRY_DSN is not set', () => {
    // Remove SENTRY_DSN
    delete process.env.SENTRY_DSN;
    process.env.NODE_ENV = 'test';

    // Call initSentry
    initSentry();

    // Verify warning was logged
    expect(console.warn).toHaveBeenCalledWith('SENTRY_DSN not configured, skipping Sentry initialization');
  });

  it('should initialize with development environment when NODE_ENV is not set', () => {
    // Spy on console.log for this specific test
    const logSpy = vi.spyOn(console, 'log');

    process.env.SENTRY_DSN = 'https://test@sentry.io/123456';
    delete process.env.NODE_ENV;

    // Call initSentry
    initSentry();

    // Verify client is initialized
    const client = Sentry.getCurrentHub().getClient();
    expect(client).toBeDefined();

    // Verify console.log was called with development environment
    expect(logSpy).toHaveBeenCalledWith('Sentry initialized for environment: development');
  });
});
