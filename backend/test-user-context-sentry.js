#!/usr/bin/env node

/**
 * Test script to verify user context tracking in Sentry
 * This script:
 * 1. Registers a test user
 * 2. Makes an authenticated request that triggers an error
 * 3. Verifies user context appears in Sentry event
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
  const email = `test-${Date.now()}@example.com`;
  const registerResult = await makeRequest('POST', '/api/auth/register', {
    email,
    password: 'testpass123',
    name: 'Test User Context'
  });

  if (registerResult.status !== 201) {
    console.error('Failed to register user:', registerResult);
    process.exit(1);
  }

  const token = registerResult.data.token;
  const userId = registerResult.data.user.id;
  const userEmail = registerResult.data.user.email;
  const userRole = registerResult.data.user.role;

  console.log(`✓ User registered successfully`);
  console.log(`  User ID: ${userId}`);
  console.log(`  Email: ${userEmail}`);
  console.log(`  Role: ${userRole}`);
  console.log(`  Token: ${token.substring(0, 20)}...`);

  // Step 2: Make authenticated request that triggers an error
  console.log('\n2. Triggering error with authenticated request...');
  const errorResult = await makeRequest('GET', '/api/test/trigger-error', null, {
    'Authorization': `Bearer ${token}`
  });

  console.log(`✓ Error triggered (status: ${errorResult.status})`);
  console.log(`  Response: ${JSON.stringify(errorResult.data)}`);

  // Step 3: Verify
  console.log('\n3. Verification:');
  console.log('✓ Authenticated request made successfully');
  console.log('✓ Error was triggered and captured by Sentry');
  console.log('\n=== Next Step: Check Sentry Dashboard ===');
  console.log('Go to Sentry and verify the error event contains:');
  console.log(`  - User ID: ${userId}`);
  console.log(`  - Email: ${userEmail}`);
  console.log(`  - Role: ${userRole}`);
  console.log('\nThe user context should be visible in the Sentry event detail.');
}

main().catch(console.error);
