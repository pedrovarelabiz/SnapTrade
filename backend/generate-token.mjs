import jwt from 'jsonwebtoken';

const token = jwt.sign(
  { userId: 'test-user', email: 'test@example.com', role: 'user' },
  'test-jwt-secret-for-backup-health-testing',
  { expiresIn: '1h' }
);

console.log(token);
