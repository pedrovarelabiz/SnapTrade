#!/usr/bin/env node

const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-jwt-secret-for-backup-health-testing';

// Generate token with test user data
const token = jwt.sign(
  {
    userId: 'test-user-' + Date.now(),
    email: 'user-context-test@example.com',
    role: 'user'
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

console.log(token);
