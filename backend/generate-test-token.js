#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:postgres@localhost:5432/snaptrade_test'
    }
  }
});

const JWT_SECRET = 'test-jwt-secret-for-backup-health-testing';

async function generateToken() {
  try {
    // Create or find test user
    let testUser = await prisma.user.findUnique({
      where: { email: 'breadcrumb-test@example.com' }
    });

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: 'breadcrumb-test@example.com',
          name: 'Breadcrumb Test User',
          role: 'user',
          emailVerified: new Date(),
        }
      });
      console.error('✓ Created test user');
    } else {
      console.error('✓ Found existing test user');
    }

    // Generate token
    const token = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: 'user' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Output token to stdout (for export)
    console.log(token);

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error generating token:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

generateToken();
