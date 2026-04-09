#!/usr/bin/env node

/**
 * Breadcrumb Verification Test
 * Simulates multi-step operation with breadcrumb capture
 */

const Sentry = require('@sentry/node');

// Initialize Sentry (using staging DSN from environment)
Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN,
  environment: 'staging',
  tracesSampleRate: 1.0,
});

console.log('=== Breadcrumb Capture Verification Test ===\n');

async function simulateMultiStepOperation() {
  try {
    // Step 1: Auth check breadcrumb
    console.log('Step 1: Simulating authentication check...');
    Sentry.addBreadcrumb({
      category: 'auth',
      message: 'Authentication verified for user',
      level: 'info',
      data: {
        userId: 'test-user-123',
        email: 'test@example.com',
      },
      timestamp: Date.now() / 1000,
    });
    console.log('  ✓ Auth breadcrumb added\n');

    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 2: Database query breadcrumbs
    console.log('Step 2: Simulating database query...');
    Sentry.addBreadcrumb({
      category: 'db',
      message: 'Fetching user data from database',
      level: 'info',
      timestamp: Date.now() / 1000,
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    Sentry.addBreadcrumb({
      category: 'db',
      message: 'User data retrieved successfully',
      level: 'info',
      data: {
        recordFound: true,
      },
      timestamp: Date.now() / 1000,
    });
    console.log('  ✓ Database breadcrumbs added\n');

    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 3: External API call breadcrumbs
    console.log('Step 3: Simulating external API call...');
    Sentry.addBreadcrumb({
      category: 'http',
      message: 'Making external API call to httpbin.org',
      level: 'info',
      timestamp: Date.now() / 1000,
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    Sentry.addBreadcrumb({
      category: 'http',
      message: 'External API call completed',
      level: 'info',
      data: {
        statusCode: 200,
        endpoint: 'httpbin.org/delay/1',
      },
      timestamp: Date.now() / 1000,
    });
    console.log('  ✓ HTTP breadcrumbs added\n');

    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 4: Error trigger
    console.log('Step 4: Triggering test error...');
    Sentry.addBreadcrumb({
      category: 'error',
      message: 'About to trigger test error',
      level: 'warning',
      timestamp: Date.now() / 1000,
    });
    console.log('  ✓ Error warning breadcrumb added\n');

    await new Promise(resolve => setTimeout(resolve, 50));

    // Throw error to capture with all breadcrumbs
    throw new Error('Multi-step operation breadcrumb test error');

  } catch (error) {
    console.log('Step 5: Capturing error with all breadcrumbs...');
    Sentry.captureException(error);
    console.log('  ✓ Error captured and sent to Sentry\n');

    // Wait for Sentry to flush
    await Sentry.flush(2000);

    console.log('=== Test Complete ===\n');
    console.log('Expected Sentry Event Structure:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Error: "Multi-step operation breadcrumb test error"');
    console.log('\nBreadcrumbs (chronological order):');
    console.log('  1. [auth] Authentication verified for user');
    console.log('     Data: userId, email');
    console.log('  2. [db] Fetching user data from database');
    console.log('  3. [db] User data retrieved successfully');
    console.log('     Data: recordFound: true');
    console.log('  4. [http] Making external API call to httpbin.org');
    console.log('  5. [http] External API call completed');
    console.log('     Data: statusCode: 200, endpoint');
    console.log('  6. [error] About to trigger test error');
    console.log('  7. [error] Multi-step operation breadcrumb test error');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✓ Verification complete!');
    console.log('  Check Sentry dashboard for event with breadcrumbs\n');
  }
}

simulateMultiStepOperation().catch(console.error);
