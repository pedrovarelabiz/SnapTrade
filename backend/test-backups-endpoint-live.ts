import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-backup-health-testing';
const BASE_URL = 'http://localhost:3001';

// Create test tokens
const adminToken = jwt.sign(
  { userId: 'test-admin-id', email: 'admin@test.com', role: 'admin' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const userToken = jwt.sign(
  { userId: 'test-user-id', email: 'user@test.com', role: 'user' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

async function testEndpoint() {
  console.log('Testing /api/admin/backups endpoint...\n');

  // Test 1: Admin access
  console.log('Test 1: Admin user GET /api/admin/backups');
  const adminResponse = await fetch(`${BASE_URL}/api/admin/backups`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const adminData = await adminResponse.json();

  console.log(`  Status: ${adminResponse.status}`);
  console.log(`  Body:`, JSON.stringify(adminData, null, 2));

  if (adminResponse.status === 200) {
    console.log('  ✓ Admin access successful');
    console.log(`  ✓ Response has backups field: ${adminData.hasOwnProperty('backups')}`);
    console.log(`  ✓ Response has count field: ${adminData.hasOwnProperty('count')}`);
    console.log(`  ✓ Response has nextContinuationToken field: ${adminData.hasOwnProperty('nextContinuationToken')}`);
    console.log(`  ✓ Response has isTruncated field: ${adminData.hasOwnProperty('isTruncated')}`);

    if (adminData.backups && adminData.backups.length > 0) {
      const backup = adminData.backups[0];
      console.log(`  ✓ Backup has filename: ${backup.hasOwnProperty('filename')}`);
      console.log(`  ✓ Backup has timestamp: ${backup.hasOwnProperty('timestamp')}`);
      console.log(`  ✓ Backup has size: ${backup.hasOwnProperty('size')}`);
      console.log(`  ✓ Backup has s3Key: ${backup.hasOwnProperty('s3Key')}`);
    } else {
      console.log('  ⚠ No backups in S3 yet (this is okay for testing)');
    }
  } else {
    console.log('  ✗ Admin access failed');
  }

  // Test 2: Pagination with limit
  console.log('\nTest 2: Test pagination with limit=5');
  const paginationResponse = await fetch(`${BASE_URL}/api/admin/backups?limit=5`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const paginationData = await paginationResponse.json();

  console.log(`  Status: ${paginationResponse.status}`);
  console.log(`  Count: ${paginationData.count}`);
  console.log(`  ✓ Limit parameter working: ${paginationData.count <= 5}`);

  // Test 3: Non-admin access (should get 403)
  console.log('\nTest 3: Non-admin user GET /api/admin/backups (should get 403)');
  const userResponse = await fetch(`${BASE_URL}/api/admin/backups`, {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  const userData = await userResponse.json();

  console.log(`  Status: ${userResponse.status}`);
  console.log(`  Body:`, JSON.stringify(userData, null, 2));

  if (userResponse.status === 403) {
    console.log('  ✓ Non-admin correctly forbidden');
  } else {
    console.log('  ✗ Non-admin should have been forbidden');
  }

  // Test 4: No auth (should get 401)
  console.log('\nTest 4: No authentication (should get 401)');
  const noAuthResponse = await fetch(`${BASE_URL}/api/admin/backups`);
  const noAuthData = await noAuthResponse.json();

  console.log(`  Status: ${noAuthResponse.status}`);
  console.log(`  Body:`, JSON.stringify(noAuthData, null, 2));

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
}

testEndpoint().catch(err => {
  console.error('✗ Test failed:', err);
  process.exit(1);
});
