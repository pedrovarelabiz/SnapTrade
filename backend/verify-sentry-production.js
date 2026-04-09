#!/usr/bin/env node

/**
 * Sentry Production Verification Script
 * Tests Sentry integration by sending a test error
 */

import dotenv from 'dotenv';
dotenv.config();

import * as Sentry from '@sentry/node';

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || 'staging',
  release: 'snaptrade-backend@1.0.0',
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  beforeSend(event) {
    console.log('📤 Sending event to Sentry:', {
      message: event.message || event.exception?.values?.[0]?.value,
      environment: event.environment,
      release: event.release,
      tags: event.tags,
      timestamp: new Date().toISOString()
    });
    return event;
  },
});

console.log('=== Sentry Production Verification ===');
console.log('DSN:', process.env.SENTRY_DSN?.substring(0, 50) + '...');
console.log('Environment:', process.env.SENTRY_ENVIRONMENT || 'staging');
console.log('Release:', 'snaptrade-backend@1.0.0');
console.log('Node Version:', process.version);
console.log('');

// Send test error
console.log('Sending test error to Sentry...');

Sentry.captureException(new Error('Test error from backend staging environment'), {
  tags: {
    test: true,
    source: 'verify-sentry-production',
    verification: 'staging-deployment'
  },
  level: 'error',
  contexts: {
    server: {
      name: 'snaptrade-staging',
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
    }
  }
});

console.log('✅ Test error sent!');
console.log('');
console.log('Next steps:');
console.log('1. Check Sentry dashboard at https://sentry.io');
console.log('2. Look for error: "Test error from backend staging environment"');
console.log('3. Verify tags:');
console.log('   - environment: staging');
console.log('   - test: true');
console.log('   - source: verify-sentry-production');
console.log('4. Verify release: snaptrade-backend@1.0.0');
console.log('5. Verify server context (Node version, platform, etc.)');
console.log('');

// Wait for Sentry to flush before exiting
setTimeout(async () => {
  console.log('Flushing Sentry...');
  await Sentry.close(2000);
  console.log('✅ Done! Check Sentry dashboard within 30 seconds.');
  process.exit(0);
}, 1000);
