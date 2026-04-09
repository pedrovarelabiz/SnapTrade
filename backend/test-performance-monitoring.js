#!/usr/bin/env node

/**
 * Performance Monitoring Test Script
 * Tests Sentry Performance (APM) integration with 10% sampling
 */

const https = require('https');

const STAGING_URL = 'snaptrade-staging.faroldigital.pt';
const STATS_ENDPOINTS = [
  '/api/stats/overview',
  '/api/stats/by-channel',
  '/api/stats/public-summary'
];

console.log('=== Sentry Performance Monitoring Test ===\n');
console.log('Configuration:');
console.log('  - Sample Rate: 10% (expect ~2 out of 20 requests traced)');
console.log('  - Transaction naming: Route-based (e.g., "GET /api/stats/overview")');
console.log('  - Database spans: Captured via Prisma integration');
console.log('');

let completedRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;

function makeRequest(endpoint, index) {
  return new Promise((resolve) => {
    const options = {
      hostname: STAGING_URL,
      path: endpoint,
      method: 'GET',
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        completedRequests++;
        if (res.statusCode === 200) {
          successfulRequests++;
          console.log(`✓ Request ${index + 1}/20: ${endpoint} - ${res.statusCode}`);
        } else {
          failedRequests++;
          console.log(`✗ Request ${index + 1}/20: ${endpoint} - ${res.statusCode}`);
        }
        resolve({ success: res.statusCode === 200, endpoint, statusCode: res.statusCode });
      });
    });

    req.on('error', (err) => {
      completedRequests++;
      failedRequests++;
      console.log(`✗ Request ${index + 1}/20: ${endpoint} - ERROR: ${err.message}`);
      resolve({ success: false, endpoint, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      completedRequests++;
      failedRequests++;
      console.log(`✗ Request ${index + 1}/20: ${endpoint} - TIMEOUT`);
      resolve({ success: false, endpoint, error: 'timeout' });
    });

    req.end();
  });
}

async function runTest() {
  console.log('Starting 20 requests to stats endpoints...\n');

  const requests = [];
  for (let i = 0; i < 20; i++) {
    const endpoint = STATS_ENDPOINTS[i % STATS_ENDPOINTS.length];
    requests.push(makeRequest(endpoint, i));
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  await Promise.all(requests);

  console.log('\n=== Test Summary ===');
  console.log(`Total Requests: ${completedRequests}`);
  console.log(`Successful: ${successfulRequests}`);
  console.log(`Failed: ${failedRequests}`);
  console.log('');

  console.log('=== Sentry Performance Verification Steps ===\n');
  console.log('1. Open Sentry Performance Dashboard:');
  console.log('   https://sentry.io/organizations/[your-org]/performance/');
  console.log('');
  console.log('2. Filter by:');
  console.log('   - Environment: staging');
  console.log('   - Time range: Last 5 minutes');
  console.log('   - Transaction: GET /api/stats/*');
  console.log('');
  console.log('3. Expected Results:');
  console.log('   ✓ ~2 traces visible (10% of 20 requests)');
  console.log('   ✓ Transaction names:');
  console.log('      - GET /api/stats/overview');
  console.log('      - GET /api/stats/by-channel');
  console.log('      - GET /api/stats/public-summary');
  console.log('   ✓ Database query spans visible (Prisma queries)');
  console.log('   ✓ Span operations include:');
  console.log('      - db.query (Prisma SELECT operations)');
  console.log('      - http.server (Express request handling)');
  console.log('');
  console.log('4. Verify Span Details:');
  console.log('   - Click on any transaction trace');
  console.log('   - Waterfall view should show:');
  console.log('      * HTTP request span (parent)');
  console.log('      * Database query spans (children)');
  console.log('      * Query details in span data');
  console.log('');
  console.log('5. Check Sampling:');
  console.log('   - Approximately 10% of requests should appear');
  console.log('   - Stats routes use default 0.1 sample rate');
  console.log('   - Admin routes would use 1.0 sample rate');
  console.log('   - Webhook routes would use 0.5 sample rate');
  console.log('');
  console.log('✓ Performance monitoring test complete!');
  console.log('');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
