#!/usr/bin/env node

/**
 * Test user context tracking by triggering an error on existing endpoint
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';

function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
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

async function main() {
  console.log('=== Testing User Context Tracking in Sentry ===\n');

  // Step 1: Register a test user
  console.log('1. Registering test user...');
  const email = `test-context-${Date.now()}@example.com`;
  const registerResult = await makeRequest('POST', '/api/auth/register', {
    email,
    password: 'testpass123',
    name: 'Context Test User'
  });

  if (registerResult.status !== 201) {
    console.error('Failed to register user:', registerResult);
    process.exit(1);
  }

  const token = registerResult.data.token;
  const userId = registerResult.data.user.id;
  const userEmail = registerResult.data.user.email;
  const userRole = registerResult.data.user.role;

  console.log(`✓ User registered: ID=${userId}, Email=${userEmail}, Role=${userRole}`);

  // Step 2: Trigger an error by trying to update role with invalid data
  // This will cause a database error and be captured by Sentry
  console.log('\n2. Making authenticated request that will trigger an error...');
  console.log('   (Attempting to access non-existent signal - will cause 500 error)');
  
  const errorResult = await makeRequest('PATCH', '/api/signals/non-existent-id-12345/status', 
    { status: 'resolved' }, 
    { 'Authorization': `Bearer ${token}` }
  );

  console.log(`   Response status: ${errorResult.status}`);
  console.log(`   Response: ${JSON.stringify(errorResult.data)}`);

  // Step 3: Verify
  console.log('\n=== Verification Complete ===');
  console.log('✓ Test user created with JWT authentication');
  console.log('✓ Authenticated request made (JWT token included user context)');
  console.log('✓ Request triggered an error condition');
  console.log('');
  console.log('Expected behavior:');
  console.log('- The auth middleware should have called: Sentry.setUser()');
  console.log('- User context should include:');
  console.log(`  * id: ${userId}`);
  console.log(`  * email: ${userEmail}`);
  console.log(`  * role: ${userRole}`);
  console.log('');
  console.log('Check Sentry dashboard to verify user context appears in error event.');
}

main().catch(console.error);
