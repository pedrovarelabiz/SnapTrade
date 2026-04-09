import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:postgres@localhost:5432/snaptrade_test'
    }
  }
});

const JWT_SECRET = 'test-jwt-secret-for-backup-health-testing';
const BASE_URL = 'http://localhost:3001';

async function testEndpoint() {
  try {
    console.log('Testing /api/admin/backups endpoint with real users...\n');

    // Create or find admin user
    let adminUser = await prisma.user.findUnique({
      where: { email: 'test-admin-backups@example.com' }
    });

    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          email: 'test-admin-backups@example.com',
          name: 'Test Admin',
          role: 'admin',
          emailVerified: new Date(),
        }
      });
      console.log('✓ Created admin user');
    } else {
      console.log('✓ Found existing admin user');
    }

    // Create or find regular user
    let regularUser = await prisma.user.findUnique({
      where: { email: 'test-regular-backups@example.com' }
    });

    if (!regularUser) {
      regularUser = await prisma.user.create({
        data: {
          email: 'test-regular-backups@example.com',
          name: 'Test User',
          role: 'user',
          emailVerified: new Date(),
        }
      });
      console.log('✓ Created regular user');
    } else {
      console.log('✓ Found existing regular user');
    }

    // Generate tokens
    const adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const userToken = jwt.sign(
      { userId: regularUser.id, email: regularUser.email, role: 'user' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('✓ Generated JWT tokens\n');

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

      if (adminData.backups && adminData.backups.length > 0) {
        const backup = adminData.backups[0];
        console.log(`  ✓ Backup has filename: ${backup.hasOwnProperty('filename')}`);
        console.log(`  ✓ Backup has timestamp: ${backup.hasOwnProperty('timestamp')}`);
        console.log(`  ✓ Backup has size: ${backup.hasOwnProperty('size')}`);
        console.log(`  ✓ Backup has s3Key: ${backup.hasOwnProperty('s3Key')}`);
        console.log(`\n  Sample backup:`, JSON.stringify(backup, null, 4));
      } else {
        console.log('  ⚠ No backups in S3 yet (this is okay for testing)');
      }
    } else {
      console.log('  ✗ Admin access failed');
      console.log(`  Response:`, JSON.stringify(adminData, null, 2));
    }

    // Test 2: Pagination with limit
    console.log('\nTest 2: Test pagination with limit=5');
    const paginationResponse = await fetch(`${BASE_URL}/api/admin/backups?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const paginationData = await paginationResponse.json();

    console.log(`  Status: ${paginationResponse.status}`);
    if (paginationResponse.status === 200) {
      console.log(`  Count: ${paginationData.count}`);
      console.log(`  ✓ Limit parameter working: ${paginationData.count <= 5}`);
    }

    // Test 3: Non-admin access (should get 403)
    console.log('\nTest 3: Non-admin user GET /api/admin/backups (should get 403)');
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

    // Test 4: No auth (should get 401)
    console.log('\nTest 4: No authentication (should get 401)');
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

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

testEndpoint();
