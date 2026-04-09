
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response, Request, NextFunction } from 'express';
import request from 'supertest';
import express from 'express';
import * as signalService from '../../services/signalService.js';

// Mock the dependencies
vi.mock('../../services/signalService.js');
vi.mock('../../lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));
let mockUser: any = undefined;

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (req: Request, res: Response, next: NextFunction) => next(),
  optionalAuth: (req: any, res: Response, next: NextFunction) => { req.user = mockUser; next(); },
}));
vi.mock('../../middleware/rateLimiter.js', () => ({
  apiLimiter: (req: Request, res: Response, next: NextFunction) => next(),
}));

// Import the router after mocking
import router from '../signals.js';

describe('Signals Route - Visibility Check', () => {
  let app: express.Application;

  beforeEach(() => {
    mockUser = undefined;
    app = express();
    app.use(express.json());
    app.use('/api/signals', router);
    vi.clearAllMocks();
  });

  it('should allow free users to access free signals', async () => {
    const mockSignal = { id: '1', visibility: 'free', asset: 'BTCUSD' };
    vi.mocked(signalService.getSignalById).mockResolvedValue(mockSignal as any);

    const response = await request(app)
      .get('/api/signals/1')
      .send();

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockSignal);
  });

  it('should block free users from accessing premium signals', async () => {
    vi.mocked(signalService.getSignalById).mockResolvedValue({ id: '2', visibility: 'premium', asset: 'BTCUSD' } as any);
    mockUser = { role: 'user' };
    const response = await request(app).get('/api/signals/2');
    expect(response.status).toBe(403);
  });

  it('should allow premium users to access premium signals', async () => {
    vi.mocked(signalService.getSignalById).mockResolvedValue({ id: '2', visibility: 'premium', asset: 'BTCUSD' } as any);
    mockUser = { role: 'premium' };
    const response = await request(app).get('/api/signals/2');
    expect(response.status).toBe(200);
  });
});
