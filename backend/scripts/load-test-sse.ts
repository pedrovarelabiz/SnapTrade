#!/usr/bin/env tsx

import jwt from 'jsonwebtoken';

const CONCURRENT_CONNECTIONS = 100;
const DURATION_SECONDS = 60;
const API_URL = 'http://localhost:3001/api/signals/stream';
const JWT_SECRET = 'test-jwt-secret-for-backup-health-testing';

interface Metrics {
  totalAttempted: number;
  successfulConnections: number;
  failedConnections: number;
  disconnected: number;
  stillActive: number;
}

const metrics: Metrics = {
  totalAttempted: 0,
  successfulConnections: 0,
  failedConnections: 0,
  disconnected: 0,
  stillActive: 0,
};

// Generate a valid JWT token
function generateToken(userId: string): string {
  return jwt.sign({ userId, role: 'user' }, JWT_SECRET, { expiresIn: '2h' });
}

// Create a single SSE connection
async function createSSEConnection(connectionId: number): Promise<AbortController> {
  const controller = new AbortController();
  const token = generateToken(`load-test-user-${connectionId}`);

  metrics.totalAttempted++;

  try {
    const response = await fetch(API_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[Connection ${connectionId}] Failed with status: ${response.status}`);
      metrics.failedConnections++;
      return controller;
    }

    if (!response.body) {
      console.error(`[Connection ${connectionId}] No response body`);
      metrics.failedConnections++;
      return controller;
    }

    metrics.successfulConnections++;
    console.log(`[Connection ${connectionId}] ✓ Connected successfully`);

    // Read the SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            metrics.disconnected++;
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          // Optionally log events (commented out to reduce noise)
          // if (chunk.trim()) {
          //   console.log(`[Connection ${connectionId}] Received: ${chunk.trim()}`);
          // }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error(`[Connection ${connectionId}] Stream error:`, error.message);
        }
        metrics.disconnected++;
      }
    })();

  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.error(`[Connection ${connectionId}] Connection error:`, error.message);
      metrics.failedConnections++;
    }
  }

  return controller;
}

// Main load test function
async function runLoadTest() {
  console.log(`\n🚀 Starting SSE Load Test`);
  console.log(`   Connections: ${CONCURRENT_CONNECTIONS}`);
  console.log(`   Duration: ${DURATION_SECONDS} seconds`);
  console.log(`   Target: ${API_URL}\n`);

  const startTime = Date.now();
  const controllers: AbortController[] = [];

  // Create all connections concurrently
  console.log(`Creating ${CONCURRENT_CONNECTIONS} concurrent connections...\n`);

  const connectionPromises = Array.from({ length: CONCURRENT_CONNECTIONS }, (_, i) =>
    createSSEConnection(i + 1)
  );

  const results = await Promise.all(connectionPromises);
  controllers.push(...results);

  console.log(`\n✅ Connection phase complete`);
  console.log(`   Successful: ${metrics.successfulConnections}`);
  console.log(`   Failed: ${metrics.failedConnections}\n`);

  // Keep connections open for the specified duration
  console.log(`⏱️  Keeping connections open for ${DURATION_SECONDS} seconds...`);

  let countdown = DURATION_SECONDS;
  const countdownInterval = setInterval(() => {
    countdown -= 10;
    if (countdown > 0) {
      console.log(`   ${countdown} seconds remaining...`);
    }
  }, 10000);

  await new Promise(resolve => setTimeout(resolve, DURATION_SECONDS * 1000));
  clearInterval(countdownInterval);

  // Disconnect all connections
  console.log(`\n🔌 Disconnecting all connections...`);
  controllers.forEach(controller => controller.abort());

  // Wait a bit for graceful disconnection
  await new Promise(resolve => setTimeout(resolve, 1000));

  const endTime = Date.now();
  const totalDuration = ((endTime - startTime) / 1000).toFixed(2);

  // Calculate final metrics
  metrics.stillActive = metrics.successfulConnections - metrics.disconnected;

  // Print final report
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 LOAD TEST FINAL METRICS`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total Duration:           ${totalDuration}s`);
  console.log(`Target Connections:       ${CONCURRENT_CONNECTIONS}`);
  console.log(`Connection Attempts:      ${metrics.totalAttempted}`);
  console.log(`Successful Connections:   ${metrics.successfulConnections}`);
  console.log(`Failed Connections:       ${metrics.failedConnections}`);
  console.log(`Disconnected:             ${metrics.disconnected}`);
  console.log(`Still Active:             ${metrics.stillActive}`);
  console.log(`Success Rate:             ${((metrics.successfulConnections / metrics.totalAttempted) * 100).toFixed(2)}%`);
  console.log(`${'='.repeat(60)}\n`);

  process.exit(0);
}

// Run the load test
runLoadTest().catch(error => {
  console.error('Load test failed:', error);
  process.exit(1);
});
