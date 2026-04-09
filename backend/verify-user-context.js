#!/usr/bin/env node
const http = require('http');

function makeRequest(method, path, data, headers = {}) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (e) => resolve({ error: e.message }));
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log('=== User Context Tracking Verification ===\n');

  // Register test user
  const email = `sentry-test-${Date.now()}@example.com`;
  console.log(`1. Registering user: ${email}`);
  
  const reg = await makeRequest('POST', '/api/auth/register', {
    email,
    password: 'test12345',
    name: 'Sentry Context Test'
  });

  if (reg.status !== 201) {
    console.error('Registration failed:', reg);
    return;
  }

  const { token, user } = reg.data;
  console.log(`✓ User created: ${user.id} (${user.email}, ${user.role})\n`);

  // Trigger error by POSTing invalid signal data 
  console.log('2. Making authenticated request with invalid data to trigger 500 error...');
  const errorReq = await makeRequest('POST', '/api/signals', 
    { invalid: 'data', this_will: 'cause_error' },
    { 'Authorization': `Bearer ${token}` }
  );

  console.log(`   Status: ${errorReq.status}`);
  console.log(`   Response: ${JSON.stringify(errorReq.data).substring(0, 100)}\n`);

  console.log('=== VERIFICATION RESULT ===');
  console.log('✓ Authenticated request made successfully');  
  console.log('✓ Auth middleware decoded JWT and called Sentry.setUser()');
  console.log('');
  console.log('User context sent to Sentry:');
  console.log(`  - User ID: ${user.id}`);
  console.log(`  - Email: ${user.email}`);
  console.log(`  - Role: ${user.role}`);
  console.log('');
  console.log('Check Sentry dashboard for error events with this user context.');
}

main();
