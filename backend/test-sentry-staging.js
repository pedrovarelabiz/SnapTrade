#!/usr/bin/env node

/**
 * Sentry Staging Verification Script
 * Tests Sentry integration with staging environment
 */

require('dotenv').config();
const Sentry = require('@sentry/node');

// Initialize Sentry with staging configuration
const dsn = process.env.SENTRY_DSN || process.env.SENTRY_DSN_BACKEND;
const environment = 'staging';
const release = 'snaptrade-backend@1.0.0';

console.log('=== Sentry Staging Verification ===');
console.log(`DSN: ${dsn ? dsn.substring(0, 30) + '...' : 'NOT SET'}`);
console.log(`Environment: ${environment}`);
console.log(`Release: ${release}`);
console.log('');

if (!dsn || dsn.includes('your-dsn')) {
  console.warn('⚠️  WARNING: SENTRY_DSN is not configured with a real DSN');
  console.warn('   Current value:', dsn);
  console.warn('   Please update .env with a real Sentry DSN to complete verification');
  console.warn('');
  console.warn('📝 What would happen with a real DSN:');
  console.warn('   1. Sentry would initialize successfully');
  console.warn('   2. Test error would be sent to Sentry');
  console.warn('   3. Error would appear in Sentry dashboard within 30 seconds');
  console.warn('   4. Error would have correct tags:');
  console.warn('      - environment: staging');
  console.warn('      - release:', release);
  console.warn('      - test: true');
  console.warn('      - source: health-sentry-test-endpoint');
  process.exit(1);
}

try {
  // Initialize Sentry (same configuration as in src/config/sentry.ts)
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: 0.1,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
    ],
  });

  console.log('✅ Sentry initialized successfully');
  console.log('');

  // Simulate the /health/sentry-test endpoint
  console.log('📤 Sending test error to Sentry...');

  Sentry.captureException(new Error('Test error from backend'), {
    tags: {
      test: true,
      environment: 'staging'
    },
    extra: {
      source: 'health-sentry-test-endpoint',
      timestamp: new Date().toISOString(),
      verificationTest: true
    }
  });

  console.log('✅ Test error sent to Sentry');
  console.log('');
  console.log('🔍 Verification steps:');
  console.log('   1. Open Sentry dashboard: https://sentry.io');
  console.log('   2. Navigate to your project');
  console.log('   3. Check for error within 30 seconds');
  console.log('   4. Verify error has:');
  console.log('      ✓ Environment tag: staging');
  console.log('      ✓ Release version:', release);
  console.log('      ✓ Test tag: true');
  console.log('      ✓ Source: health-sentry-test-endpoint');
  console.log('');

  // Flush events and exit
  Sentry.close(2000).then(() => {
    console.log('✅ Sentry events flushed');
    console.log('✅ Verification complete!');
    process.exit(0);
  });

} catch (error) {
  console.error('❌ Error during Sentry verification:', error.message);
  console.error(error.stack);
  process.exit(1);
}
