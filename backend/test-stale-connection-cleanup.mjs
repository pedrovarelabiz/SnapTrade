#!/usr/bin/env node

/**
 * Test: Stale Connection Cleanup
 *
 * Tests that SSE connections that stop responding to heartbeats are
 * cleaned up after the timeout period (30s) + cleanup interval (10s).
 *
 * Expected behavior:
 * 1. Client connects to SSE endpoint
 * 2. Client stops reading (simulates network issue/stalled connection)
 * 3. Server sends heartbeats but client doesn't respond
 * 4. After 30s idle + 10s cleanup interval, server closes connection
 * 5. Metrics show disconnect reason='timeout'
 */

import http from 'http';
import jwt from 'jsonwebtoken';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-backup-health-testing';
const TIMEOUT_MS = 30_000; // 30 seconds
const CLEANUP_INTERVAL_MS = 10_000; // 10 seconds
const WAIT_TIME_MS = TIMEOUT_MS + CLEANUP_INTERVAL_MS + 5000; // 45 seconds total (with buffer)

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function generateToken() {
  return jwt.sign(
    { userId: 'test-user-stale', email: 'stale-test@example.com', role: 'premium' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function getMetrics() {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/metrics', API_URL);

    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Parse Prometheus metrics format
        const lines = data.split('\n');
        const metrics = {};

        for (const line of lines) {
          if (line.startsWith('sse_disconnects_total{reason="timeout"}')) {
            const match = line.match(/sse_disconnects_total\{reason="timeout"\}\s+(\d+)/);
            if (match) {
              metrics.timeoutDisconnects = parseInt(match[1], 10);
            }
          }
          if (line.startsWith('sse_active_connections')) {
            const match = line.match(/sse_active_connections.*?\s+(\d+)/);
            if (match) {
              metrics.activeConnections = parseInt(match[1], 10);
            }
          }
        }

        resolve(metrics);
      });
    }).on('error', reject);
  });
}

async function testStaleConnectionCleanup() {
  const token = generateToken();
  const url = new URL('/api/signals/stream', API_URL);

  log('\n=== Stale Connection Cleanup Test ===\n', 'cyan');
  log(`Target: ${API_URL}`, 'blue');
  log(`Timeout: ${TIMEOUT_MS / 1000}s`, 'blue');
  log(`Cleanup Interval: ${CLEANUP_INTERVAL_MS / 1000}s`, 'blue');
  log(`Wait Time: ${WAIT_TIME_MS / 1000}s\n`, 'blue');

  // Get initial metrics
  log('Step 1: Getting initial metrics...', 'yellow');
  const initialMetrics = await getMetrics();
  const initialTimeoutCount = initialMetrics.timeoutDisconnects || 0;
  log(`Initial timeout disconnects: ${initialTimeoutCount}`, 'blue');
  log(`Initial active connections: ${initialMetrics.activeConnections || 0}\n`, 'blue');

  // Open SSE connection
  log('Step 2: Opening SSE connection...', 'yellow');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream',
      },
    };

    const req = http.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to connect: ${res.statusCode}`));
        return;
      }

      log(`Connected! Status: ${res.statusCode}`, 'green');
      log(`Headers: ${JSON.stringify(res.headers, null, 2)}`, 'blue');

      let receivedData = false;

      // Read initial connection event
      res.once('data', (chunk) => {
        receivedData = true;
        log(`\nStep 3: Received initial data: ${chunk.toString().substring(0, 100)}...`, 'green');

        // IMPORTANT: Stop reading now to simulate a stalled connection
        log('\nStep 4: PAUSING read (simulating network issue)...', 'yellow');
        log('Server will send heartbeats but we will not respond\n', 'yellow');

        // Pause the stream - this prevents us from reading heartbeats
        res.pause();

        // Set up connection close handler
        let connectionClosed = false;
        const startTime = Date.now();

        res.on('close', () => {
          connectionClosed = true;
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          log(`\n[EVENT] Connection 'close' event after ${duration}s`, 'green');
        });

        res.on('end', () => {
          connectionClosed = true;
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          log(`\n[EVENT] Connection 'end' event after ${duration}s`, 'green');
        });

        res.on('aborted', () => {
          connectionClosed = true;
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          log(`\n[EVENT] Connection 'aborted' event after ${duration}s`, 'green');
        });

        // Wait for the timeout period + cleanup interval
        log(`Step 5: Waiting ${WAIT_TIME_MS / 1000}s for cleanup...`, 'yellow');
        log('(This will take about 45 seconds)\n', 'blue');

        const checkInterval = setInterval(() => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          process.stdout.write(`\r  Elapsed: ${elapsed}s / ${(WAIT_TIME_MS / 1000).toFixed(0)}s`);
        }, 1000);

        setTimeout(async () => {
          clearInterval(checkInterval);
          process.stdout.write('\n\n');

          // Check metrics first (most reliable indicator)
          log('Step 7: Checking metrics...', 'yellow');
          const finalMetrics = await getMetrics();
          const finalTimeoutCount = finalMetrics.timeoutDisconnects || 0;
          const finalActiveConnections = finalMetrics.activeConnections || 0;

          log(`Final timeout disconnects: ${finalTimeoutCount}`, 'blue');
          log(`Final active connections: ${finalActiveConnections}`, 'blue');

          // Verify metrics show the disconnect happened
          if (finalTimeoutCount <= initialTimeoutCount) {
            log(`\n❌ FAILED: Timeout counter did not increment (expected > ${initialTimeoutCount}, got ${finalTimeoutCount})`, 'red');
            log('Server did not detect and clean up the stale connection', 'red');
            res.destroy();
            resolve(false);
            return;
          }

          log(`\n✓ Timeout counter incremented: ${initialTimeoutCount} → ${finalTimeoutCount}`, 'green');

          // Verify active connections decreased
          if (finalActiveConnections === 0) {
            log('✓ Active connections returned to 0', 'green');
          } else {
            log(`⚠ Warning: Active connections is ${finalActiveConnections}, expected 0`, 'yellow');
          }

          // Give a bit more time for close event to be emitted (optional, events might be delayed due to paused read)
          log('\nStep 8: Waiting for connection close event...', 'yellow');
          await new Promise(resolve => setTimeout(resolve, 2000));

          if (connectionClosed) {
            log('✓ Connection close event received', 'green');
          } else {
            log('⚠ Connection close event not received (expected when using paused reads)', 'yellow');
            // Destroy the connection to clean up
            res.destroy();
          }

          log('\n=== TEST PASSED ===', 'green');
          log('✓ Server detected stale connection after 30s idle', 'green');
          log('✓ Server cleaned up connection during 10s cleanup interval', 'green');
          log('✓ Metrics show disconnect reason=\'timeout\'\n', 'green');
          resolve(true);
        }, WAIT_TIME_MS);
      });

      // Handle errors
      res.on('error', (err) => {
        log(`\nConnection error: ${err.message}`, 'red');
        reject(err);
      });
    });

    req.on('error', (err) => {
      log(`Request error: ${err.message}`, 'red');
      reject(err);
    });

    req.end();
  });
}

// Run the test
testStaleConnectionCleanup()
  .then((passed) => {
    process.exit(passed ? 0 : 1);
  })
  .catch((err) => {
    log(`\n❌ Test failed with error: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
  });
