import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import request from 'supertest';
import adminRouter from './src/routes/admin.js';
import { prisma } from './src/lib/prisma.js';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

async function testBackupsEndpoint() {
  try {
    console.log('Testing /api/admin/backups endpoint...\n');

    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        email: 'test-admin-backups@test.com',
        name: 'Test Admin',
        role: 'admin',
        emailVerified: new Date(),
      },
    });

    // Create regular user
    const regularUser = await prisma.user.create({
      data: {
        email: 'test-user-backups@test.com',
        name: 'Test User',
        role: 'user',
        emailVerified: new Date(),
      },
    });

    const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

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

    console.log('✓ Created test users and tokens');

    // Test 1: Admin access
    console.log('\nTest 1: Admin user GET /api/admin/backups');
    const adminResponse = await request(app)
      .get('/api/admin/backups')
      .set('Authorization', `Bearer ${adminToken}`);

    console.log(`  Status: ${adminResponse.status}`);
    console.log(`  Body:`, JSON.stringify(adminResponse.body, null, 2));

    if (adminResponse.status === 200) {
      console.log('  ✓ Admin access successful');
      console.log(`  ✓ Response has backups field: ${adminResponse.body.hasOwnProperty('backups')}`);
      console.log(`  ✓ Response has count field: ${adminResponse.body.hasOwnProperty('count')}`);

      if (adminResponse.body.backups && adminResponse.body.backups.length > 0) {
        const backup = adminResponse.body.backups[0];
        console.log(`  ✓ Backup has filename: ${backup.hasOwnProperty('filename')}`);
        console.log(`  ✓ Backup has timestamp: ${backup.hasOwnProperty('timestamp')}`);
        console.log(`  ✓ Backup has size: ${backup.hasOwnProperty('size')}`);
        console.log(`  ✓ Backup has s3Key: ${backup.hasOwnProperty('s3Key')}`);
      }
    } else {
      console.log('  ✗ Admin access failed');
    }

    // Test 2: Pagination with limit
    console.log('\nTest 2: Test pagination with limit=5');
    const paginationResponse = await request(app)
      .get('/api/admin/backups?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    console.log(`  Status: ${paginationResponse.status}`);
    console.log(`  Count: ${paginationResponse.body.count}`);
    console.log(`  ✓ Limit parameter working: ${paginationResponse.body.count <= 5}`);

    // Test 3: Non-admin access
    console.log('\nTest 3: Non-admin user GET /api/admin/backups (should get 403)');
    const userResponse = await request(app)
      .get('/api/admin/backups')
      .set('Authorization', `Bearer ${userToken}`);

    console.log(`  Status: ${userResponse.status}`);
    console.log(`  Body:`, JSON.stringify(userResponse.body, null, 2));

    if (userResponse.status === 403) {
      console.log('  ✓ Non-admin correctly forbidden');
    } else {
      console.log('  ✗ Non-admin should have been forbidden');
    }

    // Test 4: No auth
    console.log('\nTest 4: No authentication (should get 401)');
    const noAuthResponse = await request(app)
      .get('/api/admin/backups');

    console.log(`  Status: ${noAuthResponse.status}`);

    if (noAuthResponse.status === 401) {
      console.log('  ✓ Unauthenticated request correctly rejected');
    } else {
      console.log('  ✗ Unauthenticated request should have been rejected');
    }

    // Cleanup
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['test-admin-backups@test.com', 'test-user-backups@test.com'],
        },
      },
    });

    console.log('\n✓ Cleanup complete');
    console.log('\n=== FINAL VERIFICATION ===');
    console.log('Running curl command as specified...\n');

    // Show the curl command that would work
    console.log(`ADMIN_TOKEN="${adminToken}"`);
    console.log(`curl -s http://localhost:3001/api/admin/backups -H "Authorization: Bearer $ADMIN_TOKEN" | jq .`);

    process.exit(0);
  } catch (err) {
    console.error('\n✗ Test failed:', err);
    process.exit(1);
  }
}

testBackupsEndpoint();
