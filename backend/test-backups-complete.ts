const BASE_URL = 'http://localhost:3001';

async function testEndpoint() {
  console.log('=== Testing /api/admin/backups endpoint ===\n');

  try {
    // Step 1: Login as admin
    console.log('Step 1: Login as admin user');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@snaptrade.io',
        password: 'admin123'
      })
    });

    if (loginResponse.status !== 200) {
      console.log('  ⚠ Admin user may not exist. Creating regular users for testing...');

      // Register admin-like user (will be regular user)
      const registerAdmin = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `admin-test-${Date.now()}@example.com`,
          password: 'password123',
          name: 'Test Admin'
        })
      });

      if (registerAdmin.status !== 201) {
        throw new Error('Failed to create test user');
      }

      const adminData = await registerAdmin.json();
      console.log('  ⚠ Note: Created regular user for testing (not actual admin)');
      console.log('  ⚠ This endpoint requires admin role, so 403 is expected\n');

      const regularToken = adminData.token;

      // Test with regular user (should fail)
      console.log('Test: Regular user GET /api/admin/backups (should get 403)');
      const testResponse = await fetch(`${BASE_URL}/api/admin/backups`, {
        headers: { Authorization: `Bearer ${regularToken}` }
      });
      console.log(`  Status: ${testResponse.status}`);

      if (testResponse.status === 403) {
        console.log('  ✓ Non-admin correctly forbidden');
      }

      // Test without auth
      console.log('\nTest: No authentication (should get 401)');
      const noAuthResponse = await fetch(`${BASE_URL}/api/admin/backups`);
      console.log(`  Status: ${noAuthResponse.status}`);

      if (noAuthResponse.status === 401) {
        console.log('  ✓ Unauthenticated request correctly rejected');
      }

      console.log('\n=== Tests Complete (Limited - no admin user available) ===');
      console.log('To test with admin access, first seed the database:');
      console.log('  npx prisma db seed');
      console.log('  (requires valid database credentials)');
      return;
    }

    const loginData = await loginResponse.json();
    const adminToken = loginData.token;

    console.log(`  ✓ Logged in as: ${loginData.user.email}`);
    console.log(`  ✓ Role: ${loginData.user.role}\n`);

    // Test 1: Admin access
    console.log('Test 1: Admin user GET /api/admin/backups');
    const adminResponse = await fetch(`${BASE_URL}/api/admin/backups`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminData = await adminResponse.json();

    console.log(`  Status: ${adminResponse.status}`);

    if (adminResponse.status === 200) {
      console.log('  ✓ Admin access successful');
      console.log(`  ✓ Response has backups field: ${adminData.hasOwnProperty('backups')}`);
      console.log(`  ✓ Response has count field: ${adminData.hasOwnProperty('count')}`);
      console.log(`  ✓ Response has nextContinuationToken field: ${adminData.hasOwnProperty('nextContinuationToken')}`);
      console.log(`  ✓ Response has isTruncated field: ${adminData.hasOwnProperty('isTruncated')}`);
      console.log(`  Backups count: ${adminData.count}`);

      if (adminData.backups && adminData.backups.length > 0) {
        const backup = adminData.backups[0];
        console.log(`  ✓ Backup has filename: ${backup.hasOwnProperty('filename')}`);
        console.log(`  ✓ Backup has timestamp: ${backup.hasOwnProperty('timestamp')}`);
        console.log(`  ✓ Backup has size: ${backup.hasOwnProperty('size')}`);
        console.log(`  ✓ Backup has s3Key: ${backup.hasOwnProperty('s3Key')}`);
        console.log(`\n  Sample backup object:`);
        console.log(`    filename: ${backup.filename}`);
        console.log(`    timestamp: ${backup.timestamp}`);
        console.log(`    size: ${backup.size} bytes`);
        console.log(`    s3Key: ${backup.s3Key}`);
      } else {
        console.log('  ⚠ No backups in S3 yet (this is normal for new setup)');
      }
    } else {
      console.log('  ✗ Admin access failed');
      console.log(`  Response:`, JSON.stringify(adminData, null, 2));
    }

    // Test 2: Pagination with limit
    console.log('\nTest 2: Pagination with limit=5');
    const paginationResponse = await fetch(`${BASE_URL}/api/admin/backups?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const paginationData = await paginationResponse.json();

    console.log(`  Status: ${paginationResponse.status}`);
    if (paginationResponse.status === 200) {
      console.log(`  Count: ${paginationData.count}`);
      console.log(`  ✓ Limit parameter working: ${paginationData.count <= 5}`);
      console.log(`  Is truncated: ${paginationData.isTruncated}`);
    }

    // Test 3: Register a regular user
    console.log('\nTest 3: Create regular user and test access');
    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test-user-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Test User'
      })
    });

    if (registerResponse.status === 201) {
      const registerData = await registerResponse.json();
      const userToken = registerData.token;

      console.log(`  ✓ Created regular user: ${registerData.user.email} (role: ${registerData.user.role})`);

      // Test 4: Non-admin access (should get 403)
      console.log('\nTest 4: Non-admin user GET /api/admin/backups (should get 403)');
      const userResponse = await fetch(`${BASE_URL}/api/admin/backups`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      const userData = await userResponse.json();

      console.log(`  Status: ${userResponse.status}`);

      if (userResponse.status === 403) {
        console.log('  ✓ Non-admin correctly forbidden');
      } else {
        console.log('  ✗ Non-admin should have been forbidden');
        console.log(`  Response:`, JSON.stringify(userData, null, 2));
      }
    }

    // Test 5: No auth (should get 401)
    console.log('\nTest 5: No authentication (should get 401)');
    const noAuthResponse = await fetch(`${BASE_URL}/api/admin/backups`);
    const noAuthData = await noAuthResponse.json();

    console.log(`  Status: ${noAuthResponse.status}`);

    if (noAuthResponse.status === 401) {
      console.log('  ✓ Unauthenticated request correctly rejected');
    } else {
      console.log('  ✗ Unauthenticated request should have been rejected');
    }

    // Final verification
    console.log('\n=== FINAL VERIFICATION ===');
    console.log('Run this command to verify manually:\n');
    console.log(`export ADMIN_TOKEN="${adminToken}"`);
    console.log(`curl -s http://localhost:3001/api/admin/backups -H "Authorization: Bearer $ADMIN_TOKEN" | jq .`);
    console.log('\n✓ All tests complete!');

  } catch (error) {
    console.error('\n✗ Test failed:', error);
    throw error;
  }
}

testEndpoint().catch(() => process.exit(1));
