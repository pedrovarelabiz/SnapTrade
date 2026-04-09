#!/usr/bin/env node

/**
 * Direct User Context Test
 * Simulates auth middleware setting user context and triggering an error
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
    console.log('📤 Sending event to Sentry:');
    console.log('  Message:', event.message || event.exception?.values?.[0]?.value);
    console.log('  User Context:', event.user);
    console.log('  Environment:', event.environment);
    console.log('  Timestamp:', new Date().toISOString());
    return event;
  },
});

console.log('=== User Context Tracking Verification ===\n');

// Simulate authenticated user from JWT token
const testUser = {
  userId: 'cmn2test001',
  email: 'user-context-test@example.com',
  role: 'user'
};

console.log('1. Setting user context (simulating auth middleware):');
console.log(`   User ID: ${testUser.userId}`);
console.log(`   Email: ${testUser.email}`);
console.log(`   Role: ${testUser.role}\n`);

// Set user context as auth middleware does
Sentry.setUser({
  id: testUser.userId,
  email: testUser.email,
  role: testUser.role
});

console.log('2. Triggering error with user context...\n');

// Capture error (simulating an error during request processing)
Sentry.captureException(new Error('Test error with authenticated user context'), {
  tags: {
    test: true,
    source: 'user-context-verification',
    authenticated: true
  },
  level: 'error',
  contexts: {
    request: {
      method: 'GET',
      url: '/api/test/trigger-error',
      headers: {
        'authorization': '[FILTERED]'
      }
    }
  }
});

console.log('✅ Error sent to Sentry with user context\n');

console.log('=== VERIFICATION RESULT ===');
console.log('✓ User context set via Sentry.setUser()');
console.log('✓ Error captured and sent to Sentry\n');

console.log('Expected user context in Sentry event:');
console.log(`  - User ID: ${testUser.userId}`);
console.log(`  - Email: ${testUser.email}`);
console.log(`  - Role: ${testUser.role}\n`);

console.log('Check Sentry dashboard to verify user context appears in event details.');

// Wait for Sentry to flush before exiting
setTimeout(async () => {
  console.log('\nFlushing Sentry...');
  await Sentry.close(2000);
  console.log('✅ Done! Check Sentry dashboard within 30 seconds.');
  process.exit(0);
}, 1000);
