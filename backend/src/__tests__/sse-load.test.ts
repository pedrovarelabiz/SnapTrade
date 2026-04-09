import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addClient, removeClient, broadcast, getClientCount, clearAllClients } from '../lib/sse.js';
import { SSEClient } from '../types/index.js';
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

describe('SSE Load Tests', () => {
  beforeEach(() => {
    clearAllClients();
  });

  afterEach(() => {
    clearAllClients();
  });

  it('should handle 1000 concurrent connections', async () => {
    // Mark as slow test - expected to take longer
    const startTime = Date.now();
    const initialMemory = process.memoryUsage().heapUsed;
    const MEMORY_THRESHOLD_MB = 200; // 200MB threshold

    // Create 1000 SSE connections simultaneously
    const connectionPromises = Array.from({ length: 1000 }, (_, index) => {
      return Promise.resolve().then(() => {
        const mockRes = createMockResponse();
        const client: SSEClient = {
          id: `load-test-client-${index}`,
          res: mockRes,
          userId: `user-${index}`,
          role: index % 3 === 0 ? 'premium' : 'free',
          lastHeartbeat: Date.now(),
          connectionTime: Date.now(),
        };
        const result = addClient(client);
        return { result, mockRes };
      });
    });

    // Wait for all connections to complete
    const connections = await Promise.all(connectionPromises);

    // Assert all connections succeeded
    expect(connections.every(conn => conn.result === true)).toBe(true);
    expect(getClientCount()).toBe(1000);

    // Check memory usage doesn't exceed threshold
    const currentMemory = process.memoryUsage().heapUsed;
    const memoryUsedMB = (currentMemory - initialMemory) / 1024 / 1024;
    expect(memoryUsedMB).toBeLessThan(MEMORY_THRESHOLD_MB);

    // Verify all clients can receive broadcast
    const testMessage = { type: 'load-test', timestamp: Date.now() };
    broadcast('test-event', testMessage);

    // Verify all mock responses received the broadcast
    connections.forEach(({ mockRes }) => {
      const writes = (mockRes.write as ReturnType<typeof vi.fn>).mock.calls;
      const receivedBroadcast = writes.some(call =>
        call[0]?.includes('test-event') && call[0]?.includes('load-test')
      );
      expect(receivedBroadcast).toBe(true);
    });

    const duration = Date.now() - startTime;
    console.log(`Load test completed in ${duration}ms with ${memoryUsedMB.toFixed(2)}MB memory used`);
  }, 30000); // 30 second timeout for slow test
});
