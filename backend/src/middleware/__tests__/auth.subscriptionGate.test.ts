import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../types/index.js';

// Mock prisma
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock jwt
vi.mock('../../lib/jwt.js', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'test-user-id',
    email: 'test@example.com',
    role: 'user',
  }),
}));

// Mock Sentry to prevent side effects
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  setUser: vi.fn(),
}));

import { authMiddleware, optionalAuth } from '../auth.js';
import { prisma } from '../../lib/prisma.js';
import { verifyToken } from '../../lib/jwt.js';

describe('auth subscription gate', () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  const defaultPayload = {
    userId: 'test-user-id',
    email: 'test@example.com',
    role: 'user',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockReset();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      cookies: {},
      headers: {},
      query: {},
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
    } as any;

    mockNext = vi.fn();

    // Restore default verifyToken mock after reset
    vi.mocked(verifyToken).mockReturnValue(defaultPayload);
  });

  describe('authMiddleware', () => {
    describe('missing token returns 401', () => {
      it('should return 401 when no token is provided', async () => {
        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Authentication required' });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('valid JWT token proceeds', () => {
      it('should call next() with user set when a valid Bearer token is provided', async () => {
        mockReq.headers = { authorization: 'Bearer valid-jwt-token' };
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          id: 'test-user-id',
          role: 'user',
        } as any);

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledOnce();
        expect(mockReq.user).toMatchObject({ userId: 'test-user-id', role: 'user' });
        expect(statusMock).not.toHaveBeenCalled();
      });

      it('should call next() with user set when token is provided via cookie', async () => {
        mockReq.cookies = { token: 'valid-jwt-token' };
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          id: 'test-user-id',
          role: 'user',
        } as any);

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledOnce();
        expect(mockReq.user).toMatchObject({ userId: 'test-user-id', email: 'test@example.com' });
      });

      it('should call next() with user set when token is provided via query param', async () => {
        mockReq.query = { token: 'valid-jwt-token' };
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          id: 'test-user-id',
          role: 'user',
        } as any);

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledOnce();
        expect(mockReq.user).toBeDefined();
      });

      it('should use DB role when it differs from JWT role (role downgrade)', async () => {
        mockReq.headers = { authorization: 'Bearer valid-jwt-token' };
        vi.mocked(verifyToken).mockReturnValue({
          userId: 'test-user-id',
          email: 'test@example.com',
          role: 'admin',
        });
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          id: 'test-user-id',
          role: 'user',
        } as any);

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledOnce();
        expect(mockReq.user?.role).toBe('user');
      });

      it('should fall back to JWT role when DB lookup fails', async () => {
        mockReq.headers = { authorization: 'Bearer valid-jwt-token' };
        vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('DB error'));

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledOnce();
        expect(mockReq.user?.role).toBe('user');
      });
    });

    describe('invalid token returns 401', () => {
      it('should return 401 when JWT verification throws and no extension token match', async () => {
        mockReq.headers = { authorization: 'Bearer invalid-token' };
        vi.mocked(verifyToken).mockImplementation(() => {
          throw new Error('invalid signature');
        });
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('extension token support', () => {
      it('should authenticate successfully with a valid ext_ token', async () => {
        mockReq.headers = { authorization: 'Bearer ext_valid-extension-token' };
        vi.mocked(verifyToken).mockImplementation(() => {
          throw new Error('not a JWT');
        });
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          id: 'ext-user-id',
          email: 'ext@example.com',
          role: 'user',
          subscription: { status: 'active', expiresAt: new Date() },
        } as any);

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledOnce();
        expect(mockReq.user).toMatchObject({
          userId: 'ext-user-id',
          email: 'ext@example.com',
          role: 'user',
        });
      });

      it('should return 401 when ext_ token has an expired subscription', async () => {
        mockReq.headers = { authorization: 'Bearer ext_expired-token' };
        vi.mocked(verifyToken).mockImplementation(() => {
          throw new Error('not a JWT');
        });
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          id: 'ext-user-id',
          email: 'ext@example.com',
          role: 'user',
          subscription: { status: 'expired', expiresAt: new Date() },
        } as any);

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should return 401 when ext_ token has a cancelled subscription', async () => {
        mockReq.headers = { authorization: 'Bearer ext_cancelled-token' };
        vi.mocked(verifyToken).mockImplementation(() => {
          throw new Error('not a JWT');
        });
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          id: 'ext-user-id',
          email: 'ext@example.com',
          role: 'user',
          subscription: { status: 'cancelled', expiresAt: new Date() },
        } as any);

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should return 401 when ext_ token does not match any user', async () => {
        mockReq.headers = { authorization: 'Bearer ext_unknown-token' };
        vi.mocked(verifyToken).mockImplementation(() => {
          throw new Error('not a JWT');
        });
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });
  });

  describe('optionalAuth', () => {
    it('should call next() without setting user when no token is present', async () => {
      await optionalAuth(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockReq.user).toBeUndefined();
    });

    it('should set req.user and call next() when a valid JWT is provided', async () => {
      mockReq.headers = { authorization: 'Bearer valid-jwt-token' };
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'test-user-id',
        role: 'subscriber',
      } as any);

      await optionalAuth(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockReq.user).toMatchObject({ userId: 'test-user-id', role: 'subscriber' });
    });

    it('should call next() without setting user when JWT is invalid', async () => {
      mockReq.headers = { authorization: 'Bearer bad-token' };
      vi.mocked(verifyToken).mockImplementation(() => {
        throw new Error('invalid token');
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await optionalAuth(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should set req.user via ext_ token and call next()', async () => {
      mockReq.cookies = { token: 'ext_valid-extension-token' };
      vi.mocked(verifyToken).mockImplementation(() => {
        throw new Error('not a JWT');
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'ext-user-id',
        email: 'ext@example.com',
        role: 'user',
      } as any);

      await optionalAuth(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockReq.user).toMatchObject({ userId: 'ext-user-id' });
    });
  });
});
