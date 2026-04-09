/**
 * Load test to verify delayed signal setTimeout doesn't leak memory
 * by holding references to disconnected clients
 */

import { addClient, sendSignalEvent, clearAllClients, getClientCount, startHeartbeat, stopHeartbeat } from './sse.js';
import { SSEClient } from '../types/index.js';
import { Response } from 'express';

// Mock response object
function createMockResponse(): Response {
  const chunks: string[] = [];
  const mockRes = {
    writeHead: () => mockRes,
    write: (data: string) => { chunks.push(data); return true; },
    on: () => mockRes,
    end: () => mockRes,
  } as unknown as Response;
  return mockRes;
}

async function runMemoryLeakTest() {
  console.log('Starting memory leak test for delayed signals...\n');

  // Clear any existing clients
  clearAllClients();
  startHeartbeat();

  const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`Initial memory: ${initialMemory.toFixed(2)} MB`);

  // Simulate 500 free clients connecting and immediately disconnecting
  const NUM_CLIENTS = 500;
  const clientIds: string[] = [];

  console.log(`\nConnecting ${NUM_CLIENTS} free clients...`);
  for (let i = 0; i < NUM_CLIENTS; i++) {
    const mockRes = createMockResponse();
    const client: SSEClient = {
      id: `test-client-${i}`,
      userId: `test-user-${i}`,
      res: mockRes,
      role: 'free', // Free users trigger delayed signals
      lastHeartbeat: Date.now(),
      connectionTime: Date.now(),
    };
    addClient(client, 'test');
    clientIds.push(client.id);
  }

  console.log(`Connected clients: ${getClientCount()}`);

  // Send premium signal that will trigger delayed timeouts for all free clients
  console.log('\nSending premium signal (triggers delayed sends for free users)...');
  sendSignalEvent('signal:new', {
    symbol: 'TEST',
    price: 100,
    timestamp: Date.now()
  }, 'premium');

  // Immediately disconnect all clients (simulating aggressive churn)
  console.log('Disconnecting all clients immediately...');
  clearAllClients();
  console.log(`Remaining clients: ${getClientCount()}`);

  // Force garbage collection if available
  if (global.gc) {
    console.log('\nForcing garbage collection...');
    global.gc();
  }

  const afterDisconnectMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`Memory after disconnect: ${afterDisconnectMemory.toFixed(2)} MB`);

  // Wait a bit and check memory again
  console.log('\nWaiting 2 seconds for any lingering references...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  if (global.gc) {
    global.gc();
  }

  const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`Final memory: ${finalMemory.toFixed(2)} MB`);

  const memoryIncrease = finalMemory - initialMemory;
  const memoryIncreasePerClient = memoryIncrease / NUM_CLIENTS * 1024; // KB per client

  console.log(`\n=== RESULTS ===`);
  console.log(`Memory increase: ${memoryIncrease.toFixed(2)} MB`);
  console.log(`Per-client overhead: ${memoryIncreasePerClient.toFixed(2)} KB`);

  // Each setTimeout should only hold a small string (clientId), not the full client object
  // If it's holding client objects with Response streams, we'd see 50-100+ KB per client
  // With just clientId strings, we should see < 1 KB per client
  const LEAK_THRESHOLD_KB = 5; // More than 5KB per client indicates a leak

  if (memoryIncreasePerClient > LEAK_THRESHOLD_KB) {
    console.log(`❌ FAIL: Memory leak detected! ${memoryIncreasePerClient.toFixed(2)} KB per client exceeds ${LEAK_THRESHOLD_KB} KB threshold`);
    console.log('   This suggests setTimeout closures are holding full client objects.');
  } else {
    console.log(`✅ PASS: No significant memory leak. ${memoryIncreasePerClient.toFixed(2)} KB per client is within acceptable range.`);
    console.log('   setTimeout closures are correctly holding only client IDs.');
  }

  stopHeartbeat();
  console.log('\nNote: Run with --expose-gc flag for accurate results (node --expose-gc)');
}

// Run the test
runMemoryLeakTest().catch(console.error);
