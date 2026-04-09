import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRouter from '../auth.js';
import { prisma } from '../../lib/prisma.js';
import * as Sentry from '@sentry/node';
import { sendPasswordResetEmail } from '../../lib/emailService.js';
import { logger } from '../../lib/logger.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

// Mock Sentry methods
vi.mock('@sentry/node', async () => {
  const actual = await vi.importActual('@sentry/node');
  return {
    ...actual,
    captureException: vi.fn(),
    setContext: vi.fn(),
    setUser: vi.fn(),
    setTag: vi.fn(),
  };
});

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    user: {
      create: vi.fn().mockResolvedValue({
        id: 'mock-user-id',
        email: 'existing@example.com',
        passwordHash: 'dummy-hash',
        name: 'Existing User',
        role: 'user',
        emailVerified: false,
      }),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    subscription: {
      create: vi.fn().mockResolvedValue({ id: 'mock-sub-id', plan: 'free', status: 'active' }),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    passwordResetToken: {
      create: vi.fn().mockResolvedValue({ token: 'mock-reset-token' }),
      findFirst: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

vi.mock('../../middleware/rateLimiter.js', () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
  apiLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../lib/emailService.js', () => ({ sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('bcryptjs', () => {
  const hash = vi.fn().mockResolvedValue('hashed-password');
  const compare = vi.fn().mockResolvedValue(true);
  const genSalt = vi.fn().mockResolvedValue('salt');
  return {
    default: { hash, compare, genSalt },
    hash,
    compare,
    genSalt,
  };
});

describe('Auth Routes - Error Capture Integration Tests', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterAll(async () => {
    // Cleanup test users
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['test-error@example.com', 'existing@example.com'],
        },
      },
    });
  });

  describe('POST /api/auth/register - Error Handling', () => {
    beforeAll(async () => {
      // Create existing user for conflict testing
      await prisma.user.create({
        data: {
          email: 'existing@example.com',
          passwordHash: 'dummy-hash',
          name: 'Existing User',
          role: 'user',
          emailVerified: false,
        },
      });
    });

    it('should capture exception when database error occurs during registration', async () => {
      // Mock prisma to throw an error
      const originalCreate = prisma.user.create;
      vi.spyOn(prisma.user, 'create').mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test-error@example.com',
          password: 'password123',
          name: 'Test User',
        })
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Registration failed');

      // Verify Sentry.setContext was called with registration context
      expect(Sentry.setContext).toHaveBeenCalledWith('registration', {
        email: 'test-error@example.com',
        role: 'user',
      });

      // Verify Sentry.captureException was called
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      const capturedError = (Sentry.captureException as any).mock.calls[0][0];
      expect(capturedError).toBeInstanceOf(Error);
      expect(capturedError.message).toBe('Database connection failed');

      // Restore original method
      prisma.user.create = originalCreate;
    });

    it('should capture exception when password hashing fails', async () => {
      // Mock bcrypt to throw an error using the module-level mock
      const bcrypt = await import('bcryptjs');
      vi.mocked(bcrypt.hash).mockRejectedValueOnce(
        new Error('Hashing algorithm unavailable') as never
      );

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newemail@example.com',
          password: 'password123',
          name: 'New User',
        })
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Registration failed');

      // Verify Sentry methods were called
      expect(Sentry.setContext).toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalled();

      const capturedError = (Sentry.captureException as any).mock.calls[0][0];
      expect(capturedError.message).toContain('Hashing algorithm unavailable');
    });
  });

  describe('POST /api/auth/login - Error Handling', () => {
    beforeAll(async () => {
      // Ensure user exists for login tests
      const existingUser = await prisma.user.findUnique({
        where: { email: 'existing@example.com' },
      });
      if (!existingUser) {
        await prisma.user.create({
          data: {
            email: 'existing@example.com',
            passwordHash: 'dummy-hash',
            name: 'Existing User',
            role: 'user',
            emailVerified: false,
          },
        });
      }
    });

    it('should capture exception when database error occurs during login', async () => {
      // Mock prisma to throw an error
      const originalFindUnique = prisma.user.findUnique;
      vi.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(
        new Error('Database query timeout')
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'existing@example.com',
          password: 'anypassword',
        })
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Login failed');

      // Verify Sentry.setUser was called with email
      expect(Sentry.setUser).toHaveBeenCalledWith({
        email: 'existing@example.com',
      });

      // Verify Sentry.captureException was called
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      const capturedError = (Sentry.captureException as any).mock.calls[0][0];
      expect(capturedError).toBeInstanceOf(Error);
      expect(capturedError.message).toBe('Database query timeout');

      // Restore
      prisma.user.findUnique = originalFindUnique;
    });

    it('should capture exception when bcrypt compare fails', async () => {
      // Make findUnique return a user so bcrypt.compare is called
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: 'mock-user-id',
        email: 'existing@example.com',
        passwordHash: 'dummy-hash',
        name: 'Existing User',
        role: 'user',
        emailVerified: false,
      } as any);
      const bcrypt = await import('bcryptjs');
      vi.mocked(bcrypt.compare).mockRejectedValueOnce(
        new Error('Bcrypt comparison error') as never
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'existing@example.com',
          password: 'somepassword',
        })
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Login failed');
      expect(Sentry.setUser).toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalled();

      const capturedError = (Sentry.captureException as any).mock.calls[0][0];
      expect(capturedError.message).toContain('Bcrypt comparison error');
    });
  });

  describe('POST /api/auth/forgot-password - Error Handling', () => {
    it('should capture exception with feature tag when database error occurs', async () => {
      const originalFindUnique = prisma.user.findUnique;
      vi.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(
        new Error('Database unavailable')
      );

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'test@example.com',
        })
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');

      // Verify Sentry.setTag was called with feature tag
      expect(Sentry.setTag).toHaveBeenCalledWith('feature', 'password-reset');

      // Verify Sentry.captureException was called
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      const capturedError = (Sentry.captureException as any).mock.calls[0][0];
      expect(capturedError).toBeInstanceOf(Error);
      expect(capturedError.message).toBe('Database unavailable');

      // Restore
      prisma.user.findUnique = originalFindUnique;
    });
  });

  describe('POST /api/auth/forgot-password - Email Assertions', () => {
    it('should call sendPasswordResetEmail when user exists', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: 'mock-user-id',
        email: 'existing@example.com',
        passwordHash: 'dummy-hash',
        name: 'Existing User',
        role: 'user',
        emailVerified: false,
      } as any);

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'existing@example.com' })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(vi.mocked(sendPasswordResetEmail)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(sendPasswordResetEmail)).toHaveBeenCalledWith(
        'existing@example.com',
        expect.stringContaining('reset-password')
      );
    });

    it('should NOT call sendPasswordResetEmail when user does not exist', async () => {
      // Default mock returns null (user not found)
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@example.com' })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(vi.mocked(sendPasswordResetEmail)).not.toHaveBeenCalled();
    });

    it('should handle email failure non-fatally — still return 200 and capture via Sentry', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: 'mock-user-id',
        email: 'existing@example.com',
        passwordHash: 'dummy-hash',
        name: 'Existing User',
        role: 'user',
        emailVerified: false,
      } as any);
      vi.mocked(sendPasswordResetEmail).mockRejectedValueOnce(
        new Error('SMTP connection refused') as never
      );

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'existing@example.com' })
        .expect(200);

      // Non-fatal: request still succeeds
      expect(response.body).toHaveProperty('message');

      // Sentry should have captured the email error
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      const capturedError = (Sentry.captureException as any).mock.calls[0][0];
      expect(capturedError).toBeInstanceOf(Error);
      expect(capturedError.message).toBe('SMTP connection refused');

      // Email failure is P0 — must be logged at error level, not warn
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'mock-user-id', err: expect.any(Error) }),
        'Failed to send password reset email — user cannot reset',
      );
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.anything(),
        'Failed to send password reset email — user cannot reset',
      );
    });
  });

  describe('POST /forgot-password', () => {
    // 1. Returns 400 when email is missing
    it('returns 400 when email field is absent', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({})
        .expect(400);
      expect(res.body).toHaveProperty('error');
    });

    // 1b. Returns 400 when email is malformed
    it('returns 400 when email is malformed', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'not-an-email' })
        .expect(400);
      expect(res.body).toHaveProperty('error');
    });

    // 2. Returns 200 and does NOT reveal absence of the account (anti-enumeration)
    it('returns 200 without calling sendPasswordResetEmail when user does not exist', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'ghost@example.com' })
        .expect(200);

      expect(res.body).toHaveProperty('message');
      expect(vi.mocked(sendPasswordResetEmail)).not.toHaveBeenCalled();
    });

    // 3. Calls sendPasswordResetEmail with correct toEmail and a resetUrl that begins with config.frontendUrl
    it('calls sendPasswordResetEmail with toEmail and a resetUrl prefixed by config.frontendUrl', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: 'mock-user-id',
        email: 'user@example.com',
        passwordHash: 'hash',
        name: 'User',
        role: 'user',
        emailVerified: false,
      } as any);

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user@example.com' })
        .expect(200);

      const { config } = await import('../../config.js');
      expect(vi.mocked(sendPasswordResetEmail)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(sendPasswordResetEmail)).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringMatching(new RegExp(`^${config.frontendUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)),
      );
    });

    // 4. Returns 200 and calls logger.error when sendPasswordResetEmail throws (silent-failure path)
    it('returns 200 and calls logger.error when sendPasswordResetEmail throws', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: 'mock-user-id',
        email: 'user@example.com',
        passwordHash: 'hash',
        name: 'User',
        role: 'user',
        emailVerified: false,
      } as any);
      vi.mocked(sendPasswordResetEmail).mockRejectedValueOnce(
        new Error('SMTP timeout') as never,
      );

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user@example.com' })
        .expect(200);

      expect(res.body).toHaveProperty('message');
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'mock-user-id', err: expect.any(Error) }),
        'Failed to send password reset email — user cannot reset',
      );
    });

    // 5. D2 regression guard — raw resetToken must never appear in any log call
    it('does not log the raw resetToken anywhere in the happy path', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: 'mock-user-id',
        email: 'user@example.com',
        passwordHash: 'hash',
        name: 'User',
        role: 'user',
        emailVerified: false,
      } as any);

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user@example.com' })
        .expect(200);

      // Extract the token from the URL passed to sendPasswordResetEmail
      const emailCalls = vi.mocked(sendPasswordResetEmail).mock.calls;
      expect(emailCalls).toHaveLength(1);
      const resetUrl = emailCalls[0][1];
      const tokenMatch = resetUrl.match(/[?&]token=([^&]+)/);
      expect(tokenMatch).not.toBeNull();
      const rawToken = tokenMatch![1];
      // Confirm it is JWT-shaped (3 dot-separated base64url segments)
      expect(rawToken.split('.')).toHaveLength(3);

      // None of the logger calls may contain the raw token string
      const allLogCalls = [
        ...vi.mocked(logger.info).mock.calls,
        ...vi.mocked(logger.warn).mock.calls,
        ...vi.mocked(logger.error).mock.calls,
        ...vi.mocked(logger.debug).mock.calls,
      ];
      expect(JSON.stringify(allLogCalls)).not.toContain(rawToken);
    });
  });

  describe('POST /api/auth/reset-password - Error Handling', () => {
    it('should capture exception with feature tag when password update fails', async () => {
      // Create a valid reset token first
      const jwt = await import('jsonwebtoken');
      const { config } = await import('../../config.js');
      const validToken = jwt.default.sign(
        { userId: 'some-user-id', purpose: 'password-reset' },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      // Mock prisma.user.update to throw an error
      const originalUpdate = prisma.user.update;
      vi.spyOn(prisma.user, 'update').mockRejectedValueOnce(
        new Error('Database write failed')
      );

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: validToken,
          newPassword: 'newpassword123',
        })
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');

      // Verify Sentry.setTag was called with feature tag
      expect(Sentry.setTag).toHaveBeenCalledWith('feature', 'password-reset');

      // Verify Sentry.captureException was called
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      const capturedError = (Sentry.captureException as any).mock.calls[0][0];
      expect(capturedError).toBeInstanceOf(Error);
      expect(capturedError.message).toBe('Database write failed');

      // Restore
      prisma.user.update = originalUpdate;
    });

    it('should capture exception when bcrypt hashing fails during password reset', async () => {
      const jwt = await import('jsonwebtoken');
      const { config } = await import('../../config.js');
      const validToken = jwt.default.sign(
        { userId: 'some-user-id', purpose: 'password-reset' },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      const bcrypt = await import('bcryptjs');
      const originalHash = bcrypt.default.hash;
      vi.spyOn(bcrypt.default, 'hash').mockRejectedValueOnce(
        new Error('Hashing failed')
      );

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: validToken,
          newPassword: 'newpassword123',
        })
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');
      expect(Sentry.setTag).toHaveBeenCalledWith('feature', 'password-reset');
      expect(Sentry.captureException).toHaveBeenCalled();

      const capturedError = (Sentry.captureException as any).mock.calls[0][0];
      expect(capturedError.message).toContain('Hashing failed');

      // Restore
      bcrypt.default.hash = originalHash;
    });
  });
});
