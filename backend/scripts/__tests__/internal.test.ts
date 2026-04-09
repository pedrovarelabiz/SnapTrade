import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import internalRouter from '../../src/routes/internal';
import * as signalService from '../../src/services/signalService';

// Mock the dependencies
vi.mock('../../src/services/signalService');
vi.mock('../../src/lib/logger');
vi.mock('../../src/middleware/apiKey', () => ({
  apiKeyMiddleware: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../src/middleware/rateLimiter', () => ({
  internalLimiter: (_req: any, _res: any, next: any) => next(),
}));

describe('Internal API - Signals Endpoint', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/internal', internalRouter);
  });

  describe('POST /api/internal/signals - free user poll smoke-test', () => {
    it('returns visibility:"free" when freeToday=0 (below threshold)', async () => {
      // Simulate createSignal() → getFreeSignalVisibility() → getFreeCountToday()=0 → "free"
      const mockSignal = {
        id: 'smoke-signal-free',
        asset: 'EURUSD',
        direction: 'call',
        entryTimeUtc: '2026-03-28T12:00:00.000Z',
        status: 'pending',
        visibility: 'free',
        channel: null,
      };

      vi.mocked(signalService.createSignal).mockResolvedValue(mockSignal as any);

      const response = await request(app)
        .post('/api/internal/signals')
        .send({
          asset: 'EURUSD',
          direction: 'call',
          entryTimeUtc: '2026-03-28T12:00:00Z',
        });

      expect(response.status).toBe(201);
      expect(response.body.visibility).toBe('free');
      expect(signalService.createSignal).toHaveBeenCalledOnce();
    });
  });

  describe('POST /api/internal/signals - expirationTime field', () => {
    it('should create signal with valid expirationTime', async () => {
      const mockSignal = {
        id: 'test-signal-1',
        asset: 'BTC/USD',
        timestamp: '2026-03-23T10:00:00.000Z',
        expirationTime: '2026-03-23T14:00:00Z',
        status: 'active',
      };

      vi.mocked(signalService.createSignal).mockResolvedValue(mockSignal as any);

      const response = await request(app)
        .post('/api/internal/signals')
        .send({
          asset: 'BTC/USD',
          timestamp: '2026-03-23T10:00:00Z',
          expirationTime: '2026-03-23T14:00:00Z',
          channelId: 'test-channel',
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockSignal);
      expect(signalService.createSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          expirationTime: '2026-03-23T14:00:00Z',
        })
      );
    });

    it('should create signal without expirationTime (backward compatibility)', async () => {
      const mockSignal = {
        id: 'test-signal-2',
        asset: 'ETH/USD',
        timestamp: '2026-03-23T10:00:00.000Z',
        status: 'active',
      };

      vi.mocked(signalService.createSignal).mockResolvedValue(mockSignal as any);

      const response = await request(app)
        .post('/api/internal/signals')
        .send({
          asset: 'ETH/USD',
          timestamp: '2026-03-23T10:00:00Z',
          channelId: 'test-channel',
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockSignal);
      expect(signalService.createSignal).toHaveBeenCalledWith(
        expect.not.objectContaining({
          expirationTime: expect.anything(),
        })
      );
    });

    it('should reject invalid expirationTime format', async () => {
      vi.mocked(signalService.createSignal).mockRejectedValue(
        new Error('Invalid expirationTime format')
      );

      const response = await request(app)
        .post('/api/internal/signals')
        .send({
          asset: 'BTC/USD',
          timestamp: '2026-03-23T10:00:00Z',
          expirationTime: 'invalid-date-format',
          channelId: 'test-channel',
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle resolved signals with expirationTime', async () => {
      const mockResolvedSignal = {
        id: 'test-signal-3',
        asset: 'SOL/USD',
        timestamp: '2026-03-23T10:00:00.000Z',
        expirationTime: '2026-03-23T15:00:00Z',
        status: 'resolved',
        result: 'win',
      };

      vi.mocked(signalService.createResolvedSignal).mockResolvedValue(mockResolvedSignal as any);

      const response = await request(app)
        .post('/api/internal/signals')
        .send({
          asset: 'SOL/USD',
          timestamp: '2026-03-23T10:00:00Z',
          expirationTime: '2026-03-23T15:00:00Z',
          status: 'resolved',
          result: 'win',
          channelId: 'test-channel',
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockResolvedSignal);
      expect(signalService.createResolvedSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          expirationTime: '2026-03-23T15:00:00Z',
        })
      );
    });
  });
});
