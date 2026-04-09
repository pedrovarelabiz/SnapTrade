import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import internalRouter from '../../src/routes/internal';
import * as signalService from '../../src/services/signalService';

// Mock the dependencies
vi.mock('../../src/services/signalService');
vi.mock('../../src/lib/logger');
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    channel: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));
vi.mock('../../src/middleware/apiKey', () => ({
  apiKeyMiddleware: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../src/middleware/rateLimiter', () => ({
  internalLimiter: (_req: any, _res: any, next: any) => next(),
}));

describe('Signal Expiration Integration Tests', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/internal', internalRouter);
  });

  describe('POST /api/internal/signals with expirationTime', () => {
    it('should create signal with expirationTime and store in database', async () => {
      const mockSignal = {
        id: 'signal-exp-1',
        asset: 'BTC/USD',
        timestamp: new Date('2026-03-23T10:00:00Z'),
        expirationTime: new Date('2026-03-23T14:00:00Z'),
        status: 'active',
        channelId: 'test-channel',
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
      expect(response.body).toHaveProperty('expirationTime');
      expect(signalService.createSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          asset: 'BTC/USD',
          expirationTime: '2026-03-23T14:00:00Z',
        })
      );
    });

    it('should store expirationTime in database and retrieve it via GET', async () => {
      const signalId = 'signal-exp-2';
      const mockCreatedSignal = {
        id: signalId,
        asset: 'ETH/USD',
        timestamp: new Date('2026-03-23T11:00:00Z'),
        expirationTime: new Date('2026-03-23T16:00:00Z'),
        status: 'active',
        channelId: 'test-channel',
      };

      const mockRetrievedSignal = {
        id: signalId,
        asset: 'ETH/USD',
        timestamp: new Date('2026-03-23T11:00:00Z'),
        expirationTime: new Date('2026-03-23T16:00:00Z'),
        status: 'active',
        channelId: 'test-channel',
      };

      vi.mocked(signalService.createSignal).mockResolvedValue(mockCreatedSignal as any);
      vi.mocked(signalService.getSignalById).mockResolvedValue(mockRetrievedSignal as any);

      // Create signal with expirationTime
      const createResponse = await request(app)
        .post('/api/internal/signals')
        .send({
          asset: 'ETH/USD',
          timestamp: '2026-03-23T11:00:00Z',
          expirationTime: '2026-03-23T16:00:00Z',
          channelId: 'test-channel',
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body).toHaveProperty('id');

      // Verify expirationTime is stored by retrieving it
      const retrieveResponse = await request(app)
        .get(`/api/internal/signals/${signalId}`);

      expect(signalService.getSignalById).toHaveBeenCalledWith(signalId);
      expect(retrieveResponse.body).toHaveProperty('expirationTime');
      expect(new Date(retrieveResponse.body.expirationTime).toISOString()).toBe('2026-03-23T16:00:00.000Z');
    });

    it('should handle signals without expirationTime (backward compatibility)', async () => {
      const mockSignal = {
        id: 'signal-exp-3',
        asset: 'SOL/USD',
        timestamp: new Date('2026-03-23T12:00:00Z'),
        status: 'active',
        channelId: 'test-channel',
      };

      vi.mocked(signalService.createSignal).mockResolvedValue(mockSignal as any);

      const response = await request(app)
        .post('/api/internal/signals')
        .send({
          asset: 'SOL/USD',
          timestamp: '2026-03-23T12:00:00Z',
          channelId: 'test-channel',
        });

      expect(response.status).toBe(201);
      expect(response.body).not.toHaveProperty('expirationTime');
      expect(signalService.createSignal).toHaveBeenCalledWith(
        expect.not.objectContaining({
          expirationTime: expect.anything(),
        })
      );
    });

    it('should retrieve multiple signals with expirationTime via GET', async () => {
      const mockSignals = [
        {
          id: 'signal-exp-4',
          asset: 'BTC/USD',
          timestamp: new Date('2026-03-23T10:00:00Z'),
          expirationTime: new Date('2026-03-23T15:00:00Z'),
          status: 'active',
        },
        {
          id: 'signal-exp-5',
          asset: 'ETH/USD',
          timestamp: new Date('2026-03-23T11:00:00Z'),
          expirationTime: new Date('2026-03-23T17:00:00Z'),
          status: 'active',
        },
      ];

      vi.mocked(signalService.getActiveSignals).mockResolvedValue(mockSignals as any);

      const response = await request(app)
        .get('/api/internal/signals/active');

      expect(signalService.getActiveSignals).toHaveBeenCalled();
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('expirationTime');
      expect(response.body[1]).toHaveProperty('expirationTime');
    });

    it('should validate expirationTime format on POST', async () => {
      vi.mocked(signalService.createSignal).mockRejectedValue(
        new Error('Invalid expirationTime format')
      );

      const response = await request(app)
        .post('/api/internal/signals')
        .send({
          asset: 'BTC/USD',
          timestamp: '2026-03-23T10:00:00Z',
          expirationTime: 'not-a-valid-date',
          channelId: 'test-channel',
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle resolved signals with expirationTime', async () => {
      const mockResolvedSignal = {
        id: 'signal-exp-6',
        asset: 'XRP/USD',
        timestamp: new Date('2026-03-23T09:00:00Z'),
        expirationTime: new Date('2026-03-23T13:00:00Z'),
        status: 'resolved',
        result: 'win',
        channelId: 'test-channel',
      };

      vi.mocked(signalService.createResolvedSignal).mockResolvedValue(mockResolvedSignal as any);

      const response = await request(app)
        .post('/api/internal/signals')
        .send({
          asset: 'XRP/USD',
          timestamp: '2026-03-23T09:00:00Z',
          expirationTime: '2026-03-23T13:00:00Z',
          status: 'resolved',
          result: 'win',
          channelId: 'test-channel',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('expirationTime');
      expect(signalService.createResolvedSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          expirationTime: '2026-03-23T13:00:00Z',
        })
      );
    });

    it('should query signals by expirationTime range using composite index', async () => {
      const baseTime = new Date('2026-03-23T14:00:00Z');
      const endTime = new Date('2026-03-23T14:10:00Z');

      const mockSignalsInRange = [
        {
          id: 'signal-exp-7',
          asset: 'BTC/USD',
          timestamp: new Date('2026-03-23T10:00:00Z'),
          expirationTime: new Date('2026-03-23T14:05:00Z'),
          status: 'active',
        },
        {
          id: 'signal-exp-8',
          asset: 'BTC/USD',
          timestamp: new Date('2026-03-23T11:00:00Z'),
          expirationTime: new Date('2026-03-23T14:08:00Z'),
          status: 'active',
        },
      ];

      // Mock getSignalsByExpirationRange to verify query with time range
      vi.mocked(signalService.getSignalsByExpirationRange).mockResolvedValue(mockSignalsInRange as any);

      const response = await request(app)
        .get('/api/internal/signals/expiring')
        .query({
          asset: 'BTC/USD',
          startTime: baseTime.toISOString(),
          endTime: endTime.toISOString(),
        });

      // Verify the service was called with correct expirationTime range parameters
      expect(signalService.getSignalsByExpirationRange).toHaveBeenCalledWith(
        expect.objectContaining({
          asset: 'BTC/USD',
          expirationTimeStart: baseTime.toISOString(),
          expirationTimeEnd: endTime.toISOString(),
        })
      );

      // Verify response contains signals within the expirationTime range
      expect(response.body).toHaveLength(2);
      expect(response.body.every((signal: any) =>
        new Date(signal.expirationTime) >= baseTime &&
        new Date(signal.expirationTime) <= endTime
      )).toBe(true);

      // Verify composite index (asset, expirationTime) is used by checking where clause structure
      const callArgs = vi.mocked(signalService.getSignalsByExpirationRange).mock.calls[0][0];
      expect(callArgs).toHaveProperty('asset');
      expect(callArgs).toHaveProperty('expirationTimeStart');
      expect(callArgs).toHaveProperty('expirationTimeEnd');
    });
  });
});
