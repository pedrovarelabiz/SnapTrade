import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addClient, removeClient, broadcast, sendToRole, sendSignalEvent, getClientCount, startHeartbeat, stopHeartbeat, startCleanup, stopCleanup, clearAllClients } from '../sse.js';
import { SSEClient } from '../../types/index.js';
import type { Response } from 'express';

// Mock Express Response
function createMockResponse(): Response {
  const res = {
    writeHead: vi.fn(),
    write: vi.fn(),
    on: vi.fn(),
    end: vi.fn(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('SSE Module', () => {
  let mockRes: Response;

  beforeEach(() => {
    mockRes = createMockResponse();
    // Clear all clients before each test
    clearAllClients();
  });

  afterEach(() => {
    stopHeartbeat();
    stopCleanup();
    vi.useRealTimers();
  });

  describe('addClient', () => {
    it('should add a client successfully', () => {
      const client: SSEClient = {
        id: 'test-client-1',
        res: mockRes,
        userId: 'user-1',
        role: 'free',
        lastHeartbeat: Date.now(),
        connectionTime: Date.now(),
      };

      const result = addClient(client);
      expect(result).toBe(true);
      expect(getClientCount()).toBe(1);
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'text/event-stream',
      }));
    });

    it('should send connected event to new client', () => {
      const client: SSEClient = {
        id: 'test-client-2',
        res: mockRes,
        userId: 'user-2',
        role: 'free',
        lastHeartbeat: Date.now(),
        connectionTime: Date.now(),
      };

      addClient(client);
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('connected'));
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('test-client-2'));
    });
  });

  describe('removeClient', () => {
    it('should remove a client and close connection', () => {
      const client: SSEClient = {
        id: 'test-client-3',
        res: mockRes,
        userId: 'user-3',
        role: 'free',
        lastHeartbeat: Date.now(),
        connectionTime: Date.now(),
      };

      addClient(client);
      expect(getClientCount()).toBe(1);

      removeClient('test-client-3');
      expect(getClientCount()).toBe(0);
      // Verify disconnect event is sent and connection is closed
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('disconnect'));
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('test-client-3'));
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should handle removeClient when connection is already closed', () => {
      const mockResWithError = createMockResponse();
      let callCount = 0;
      (mockResWithError.write as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        // First call is from addClient (connected event), allow it
        if (callCount === 1) return;
        // Subsequent calls should fail (disconnect event)
        throw new Error('Connection closed');
      });

      const client: SSEClient = {
        id: 'test-client-4',
        res: mockResWithError,
        userId: 'user-4',
        role: 'free',
        lastHeartbeat: Date.now(),
        connectionTime: Date.now(),
      };

      addClient(client);
      expect(getClientCount()).toBe(1);

      // Should not throw even if write fails
      expect(() => removeClient('test-client-4')).not.toThrow();
      expect(getClientCount()).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('should broadcast event to all clients', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();

      addClient({ id: 'client-1', res: mockRes1, userId: 'user-1', role: 'free', lastHeartbeat: Date.now(), connectionTime: Date.now() });
      addClient({ id: 'client-2', res: mockRes2, userId: 'user-2', role: 'premium', lastHeartbeat: Date.now(), connectionTime: Date.now() });

      broadcast('test-event', { message: 'hello' });

      expect(mockRes1.write).toHaveBeenCalledWith(expect.stringContaining('test-event'));
      expect(mockRes2.write).toHaveBeenCalledWith(expect.stringContaining('test-event'));
    });
  });

  describe('sendToRole', () => {
    it('should send event only to specified role', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();

      addClient({ id: 'free-client', res: mockRes1, userId: 'user-free', role: 'free', lastHeartbeat: Date.now(), connectionTime: Date.now() });
      addClient({ id: 'premium-client', res: mockRes2, userId: 'user-premium', role: 'premium', lastHeartbeat: Date.now(), connectionTime: Date.now() });

      sendToRole('premium-event', { data: 'premium' }, 'premium');

      // Premium client should receive it
      const premiumCalls = (mockRes2.write as ReturnType<typeof vi.fn>).mock.calls;
      const receivedPremiumEvent = premiumCalls.some(call =>
        call[0]?.includes('premium-event')
      );
      expect(receivedPremiumEvent).toBe(true);

      // Free client should not receive it (only connection event)
      const freeCalls = (mockRes1.write as ReturnType<typeof vi.fn>).mock.calls;
      const receivedByFree = freeCalls.some(call =>
        call[0]?.includes('premium-event')
      );
      expect(receivedByFree).toBe(false);
    });

    it('should send event to admin regardless of role filter', () => {
      const mockResAdmin = createMockResponse();

      addClient({ id: 'admin-client', res: mockResAdmin, userId: 'user-admin', role: 'admin', lastHeartbeat: Date.now(), connectionTime: Date.now() });

      sendToRole('premium-event', { data: 'premium' }, 'premium');

      const adminCalls = (mockResAdmin.write as ReturnType<typeof vi.fn>).mock.calls;
      const receivedEvent = adminCalls.some(call =>
        call[0]?.includes('premium-event')
      );
      expect(receivedEvent).toBe(true);
    });
  });

  describe('sendSignalEvent', () => {
    it('should send free signals to all clients immediately', () => {
      const mockResFree = createMockResponse();
      const mockResPremium = createMockResponse();

      addClient({ id: 'free-client', res: mockResFree, userId: 'user-free', role: 'free', lastHeartbeat: Date.now(), connectionTime: Date.now() });
      addClient({ id: 'premium-client', res: mockResPremium, userId: 'user-premium', role: 'premium', lastHeartbeat: Date.now(), connectionTime: Date.now() });

      sendSignalEvent('signal:new', { symbol: 'AAPL' }, 'free');

      const freeCalls = (mockResFree.write as ReturnType<typeof vi.fn>).mock.calls;
      const premiumCalls = (mockResPremium.write as ReturnType<typeof vi.fn>).mock.calls;

      expect(freeCalls.some(call => call[0]?.includes('signal:new'))).toBe(true);
      expect(premiumCalls.some(call => call[0]?.includes('signal:new'))).toBe(true);
    });

    it('should send premium signals to premium clients immediately', () => {
      const mockResPremium = createMockResponse();

      addClient({ id: 'premium-client', res: mockResPremium, userId: 'user-premium', role: 'premium', lastHeartbeat: Date.now(), connectionTime: Date.now() });

      sendSignalEvent('signal:new', { symbol: 'TSLA' }, 'premium');

      const premiumCalls = (mockResPremium.write as ReturnType<typeof vi.fn>).mock.calls;
      expect(premiumCalls.some(call => call[0]?.includes('signal:new'))).toBe(true);
    });
  });

  describe('cleanup and timeouts', () => {
    it('should remove stale clients after timeout', async () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const mockRes1 = createMockResponse();
      const client: SSEClient = {
        id: 'timeout-test-client',
        res: mockRes1,
        userId: 'user-timeout',
        role: 'free',
        lastHeartbeat: startTime,
        connectionTime: startTime,
      };

      addClient(client);
      expect(getClientCount()).toBe(1);

      // Advance time by 31s to make client stale
      vi.setSystemTime(startTime + 31000);

      // Start cleanup which runs every 10s
      startCleanup();

      // Fast-forward to trigger cleanup interval
      await vi.advanceTimersByTimeAsync(10000);

      // Client should be removed due to timeout
      expect(getClientCount()).toBe(0);

      stopCleanup();
      vi.useRealTimers();
    });

    it('should keep clients alive when heartbeat updates lastHeartbeat', async () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const mockRes1 = createMockResponse();
      const client: SSEClient = {
        id: 'alive-client',
        res: mockRes1,
        userId: 'user-alive',
        role: 'free',
        lastHeartbeat: startTime,
        connectionTime: startTime,
      };

      addClient(client);
      expect(getClientCount()).toBe(1);

      startHeartbeat();
      startCleanup();

      // Fast-forward 35s (past timeout but heartbeat should update)
      await vi.advanceTimersByTimeAsync(35000);

      // Client should still be connected
      expect(getClientCount()).toBe(1);

      stopHeartbeat();
      stopCleanup();
      vi.useRealTimers();
    });
  });

  describe('getClientCount', () => {
    it('should return correct client count', () => {
      expect(getClientCount()).toBe(0);

      addClient({ id: 'client-1', res: createMockResponse(), userId: 'user-1', role: 'free', lastHeartbeat: Date.now(), connectionTime: Date.now() });
      expect(getClientCount()).toBe(1);

      addClient({ id: 'client-2', res: createMockResponse(), userId: 'user-2', role: 'premium', lastHeartbeat: Date.now(), connectionTime: Date.now() });
      expect(getClientCount()).toBe(2);

      removeClient('client-1');
      expect(getClientCount()).toBe(1);
    });
  });

  describe('clearAllClients', () => {
    it('should close all connections before clearing', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();

      addClient({ id: 'client-1', res: mockRes1, userId: 'user-1', role: 'free', lastHeartbeat: Date.now(), connectionTime: Date.now() });
      addClient({ id: 'client-2', res: mockRes2, userId: 'user-2', role: 'premium', lastHeartbeat: Date.now(), connectionTime: Date.now() });

      expect(getClientCount()).toBe(2);

      clearAllClients();

      // Verify all connections were closed
      expect(mockRes1.end).toHaveBeenCalled();
      expect(mockRes2.end).toHaveBeenCalled();
      expect(getClientCount()).toBe(0);
    });

    it('should handle errors when closing connections', () => {
      const mockResWithError = createMockResponse();
      (mockResWithError.end as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Connection already closed');
      });

      addClient({ id: 'client-error', res: mockResWithError, userId: 'user-error', role: 'free', lastHeartbeat: Date.now(), connectionTime: Date.now() });

      // Should not throw even if end() fails
      expect(() => clearAllClients()).not.toThrow();
      expect(getClientCount()).toBe(0);
    });
  });

  describe('heartbeat', () => {
    it('should start and stop heartbeat', () => {
      startHeartbeat();
      stopHeartbeat();
      // No errors expected
      expect(true).toBe(true);
    });

    it('should keep clients alive with heartbeat updates and not disconnect after 30s', () => {
      vi.useFakeTimers();

      const client: SSEClient = {
        id: 'test-heartbeat-client',
        res: mockRes,
        userId: 'user-heartbeat',
        role: 'free',
        lastHeartbeat: Date.now(),
        connectionTime: Date.now(),
      };

      addClient(client);
      expect(getClientCount()).toBe(1);

      startHeartbeat();
      startCleanup();

      // Advance time by 35 seconds (past the 30s timeout)
      vi.advanceTimersByTime(35_000);

      // Client should still be connected because heartbeat updated lastHeartbeat
      expect(getClientCount()).toBe(1);

      // Advance another 35 seconds to verify continued stability
      vi.advanceTimersByTime(35_000);
      expect(getClientCount()).toBe(1);

      vi.useRealTimers();
      stopHeartbeat();
      stopCleanup();
    });
  });
});
