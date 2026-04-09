#!/usr/bin/env node
/**
 * Standalone test script for /api/admin/trigger-backup endpoint
 * Tests authentication, response structure, rate limiting, and backup job creation
 */

const jwt = require('jsonwebtoken');
const http = require('http');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = 'test-jwt-secret-for-backup-health-testing';
const API_BASE = 'http://localhost:3002';

// Generate admin JWT token
function generateAdminToken() {
  return jwt.sign(
    { userId: 'test-admin-id', email: 'admin@snaptrade.io', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Make HTTP request
function makeRequest(method, path, token, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing /api/admin/trigger-backup endpoint\n');

  const adminToken = generateAdminToken();
  console.log('✓ Generated admin JWT token');
  console.log(`  Token: ${adminToken.substring(0, 50)}...\n`);

  // Test 1: Unauthorized access (no token)
  console.log('Test 1: POST without authentication');
  try {
    const res1 = await makeRequest('POST', '/api/admin/trigger-backup', null);
    console.log(`  Status: ${res1.status} ${res1.status === 401 ? '✓' : '✗'}`);
    console.log(`  Response: ${JSON.stringify(res1.body)}\n`);
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
  }

  // Test 2: Successful trigger with admin auth
  console.log('Test 2: POST with admin authentication');
  try {
    const res2 = await makeRequest('POST', '/api/admin/trigger-backup', adminToken);
    console.log(`  Status: ${res2.status} ${res2.status === 200 ? '✓' : '✗'}`);
    console.log(`  Response: ${JSON.stringify(res2.body, null, 2)}`);

    if (res2.status === 200 && res2.body) {
      console.log(`  ✓ Job ID present: ${res2.body.jobId ? 'Yes' : 'No'}`);
      console.log(`  ✓ Message: ${res2.body.message}`);
      console.log(`  ✓ Status URL: ${res2.body.statusCheckUrl}`);

      // Check if backup-status.json was created
      const statusFile = path.join(process.cwd(), 'backup-status.json');
      if (fs.existsSync(statusFile)) {
        const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
        console.log(`  ✓ Backup status file created:`);
        console.log(`    - Job ID: ${status.jobId}`);
        console.log(`    - Status: ${status.status}`);
        console.log(`    - Started: ${status.startedAt}`);
        console.log(`    - Triggered by: ${status.triggeredBy}\n`);
      }
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
  }

  // Test 3: Rate limiting (second request within an hour)
  console.log('Test 3: Rate limiting (second request)');
  try {
    const res3 = await makeRequest('POST', '/api/admin/trigger-backup', adminToken);
    console.log(`  Status: ${res3.status} ${res3.status === 429 ? '✓' : '✗'}`);
    console.log(`  Response: ${JSON.stringify(res3.body, null, 2)}`);

    if (res3.status === 429) {
      console.log(`  ✓ Rate limiting enforced correctly\n`);
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
  }

  // Test 4: Check backup status via health endpoint
  console.log('Test 4: GET /api/health/backup');
  try {
    const res4 = await makeRequest('GET', '/api/health/backup', null);
    console.log(`  Status: ${res4.status}`);
    console.log(`  Response: ${JSON.stringify(res4.body, null, 2)}\n`);
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
  }

  console.log('✅ Test suite completed!\n');
  console.log('Verification command:');
  console.log(`curl -X POST ${API_BASE}/api/admin/trigger-backup -H "Authorization: Bearer ${adminToken}" | jq .`);
}

// Check if server is running
http.get(`${API_BASE}/api/health/backup`, (res) => {
  runTests().catch(console.error);
}).on('error', (err) => {
  console.error('❌ Server is not running on port 3001');
  console.error('   Please start the server first with: npm run dev');
  process.exit(1);
});
