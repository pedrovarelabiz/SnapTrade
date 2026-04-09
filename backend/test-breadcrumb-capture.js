#!/usr/bin/env node

/**
 * Breadcrumb Capture Test Script
 * Tests multi-step operation with auth, DB query, external API call, and error
 */

const https = require('https');

const STAGING_URL = process.env.STAGING_URL || 'snaptrade-staging.faroldigital.pt';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('Error: AUTH_TOKEN environment variable not set');
  console.error('Please set AUTH_TOKEN with a valid JWT token for testing');
  process.exit(1);
}

console.log('=== Sentry Breadcrumb Capture Test ===\n');
console.log('Configuration:');
console.log(`  - Target: ${STAGING_URL}`);
console.log('  - Endpoint: /api/test-error/breadcrumb-test');
console.log('  - Expected breadcrumbs:');
console.log('     1. auth - Authentication check');
console.log('     2. db - Database query');
console.log('     3. http - External API call');
console.log('     4. error - Error trigger');
console.log('');

function makeAuthenticatedRequest() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: STAGING_URL,
      path: '/api/test-error/breadcrumb-test',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    };

    console.log('Triggering multi-step operation...\n');

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`Response Status: ${res.statusCode}`);
        console.log('Response Body:', JSON.parse(data));
        console.log('');
        resolve({
          statusCode: res.statusCode,
          body: JSON.parse(data)
        });
      });
    });

    req.on('error', (err) => {
      console.error('Request Error:', err.message);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function runTest() {
  try {
    const result = await makeAuthenticatedRequest();

    console.log('=== Test Complete ===\n');

    if (result.statusCode === 500) {
      console.log('✓ Error triggered successfully');
      console.log('');
      console.log('=== Sentry Verification Steps ===\n');
      console.log('1. Open Sentry Issues Dashboard:');
      console.log('   https://sentry.io/organizations/[your-org]/issues/');
      console.log('');
      console.log('2. Find the event:');
      console.log('   - Error: "Multi-step operation breadcrumb test error"');
      console.log('   - Environment: staging');
      console.log('   - Time: Last few minutes');
      console.log('');
      console.log('3. Click on the event and verify BREADCRUMBS tab shows:');
      console.log('');
      console.log('   Expected breadcrumb sequence:');
      console.log('   ┌─────────────────────────────────────────────────┐');
      console.log('   │ Category │ Message                              │');
      console.log('   ├──────────┼──────────────────────────────────────┤');
      console.log('   │ http     │ Incoming request (auto-captured)     │');
      console.log('   │ auth     │ Authentication verified for user     │');
      console.log('   │ db       │ Fetching user data from database     │');
      console.log('   │ db       │ User data retrieved successfully     │');
      console.log('   │ http     │ Making external API call...          │');
      console.log('   │ http     │ External API call completed          │');
      console.log('   │ error    │ About to trigger test error          │');
      console.log('   └──────────┴──────────────────────────────────────┘');
      console.log('');
      console.log('4. Verify each breadcrumb has:');
      console.log('   ✓ Timestamp (showing progression over time)');
      console.log('   ✓ Category (auth, db, http, error)');
      console.log('   ✓ Message describing the operation');
      console.log('   ✓ Additional data (where applicable)');
      console.log('');
      console.log('5. Verify breadcrumbs show the complete flow:');
      console.log('   Auth check → DB query → External API → Error');
      console.log('');
      console.log('✓ Breadcrumb capture test complete!');
      console.log('  Check Sentry for the event with breadcrumbs.');
    } else {
      console.error('✗ Unexpected status code:', result.statusCode);
      console.error('  Expected 500 (error triggered)');
    }
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    process.exit(1);
  }
}

runTest();
