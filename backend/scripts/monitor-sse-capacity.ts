#!/usr/bin/env tsx

import http from 'http';

interface MonitorOptions {
  threshold: number;
  metricsUrl: string;
}

const DEFAULT_THRESHOLD = 80;
const CRITICAL_THRESHOLD = 95;
const DEFAULT_METRICS_URL = 'http://localhost:3000/api/metrics';
const MAX_SSE_CONNECTIONS = 10000; // Default max connections

/**
 * Fetches metrics from the /api/metrics endpoint
 */
async function fetchMetrics(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname,
      method: 'GET',
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: Failed to fetch metrics`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Parses sse_active_connections value from Prometheus metrics format
 */
function parseSSEActiveConnections(metricsText: string): number {
  const regex = /^sse_active_connections\s+(\d+)/m;
  const match = metricsText.match(regex);

  if (!match) {
    throw new Error('sse_active_connections metric not found in response');
  }

  return parseInt(match[1], 10);
}

/**
 * Parses max SSE connections from metrics if available
 */
function parseMaxSSEConnections(metricsText: string): number {
  const regex = /^sse_max_connections\s+(\d+)/m;
  const match = metricsText.match(regex);

  if (match) {
    return parseInt(match[1], 10);
  }

  return MAX_SSE_CONNECTIONS;
}

/**
 * Monitors SSE capacity and logs warnings/errors based on thresholds
 */
async function monitorSSECapacity(options: MonitorOptions): Promise<void> {
  try {
    console.log(`Fetching metrics from ${options.metricsUrl}...`);
    const metricsText = await fetchMetrics(options.metricsUrl);

    const activeConnections = parseSSEActiveConnections(metricsText);
    const maxConnections = parseMaxSSEConnections(metricsText);
    const capacityPercentage = (activeConnections / maxConnections) * 100;

    console.log(`SSE Active Connections: ${activeConnections}/${maxConnections}`);
    console.log(`Capacity: ${capacityPercentage.toFixed(2)}%`);

    if (capacityPercentage >= CRITICAL_THRESHOLD) {
      console.error(
        `🚨 ERROR: SSE capacity is CRITICAL at ${capacityPercentage.toFixed(2)}% (${activeConnections}/${maxConnections} connections)`
      );
      process.exit(1);
    } else if (capacityPercentage >= options.threshold) {
      console.warn(
        `⚠️  WARNING: SSE capacity is high at ${capacityPercentage.toFixed(2)}% (${activeConnections}/${maxConnections} connections)`
      );
      process.exit(1);
    } else {
      console.log(`✅ SSE capacity is healthy at ${capacityPercentage.toFixed(2)}%`);
      process.exit(0);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to monitor SSE capacity: ${errorMessage}`);
    process.exit(1);
  }
}

/**
 * Parses command line arguments
 */
function parseArgs(): MonitorOptions {
  const args = process.argv.slice(2);
  let threshold = DEFAULT_THRESHOLD;
  let metricsUrl = DEFAULT_METRICS_URL;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--threshold' && args[i + 1]) {
      threshold = parseInt(args[i + 1], 10);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        console.error('Error: --threshold must be a number between 0 and 100');
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--url' && args[i + 1]) {
      metricsUrl = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: tsx monitor-sse-capacity.ts [options]

Options:
  --threshold <number>  Warning threshold percentage (default: ${DEFAULT_THRESHOLD})
  --url <url>           Metrics endpoint URL (default: ${DEFAULT_METRICS_URL})
  --help, -h            Show this help message

Examples:
  tsx monitor-sse-capacity.ts
  tsx monitor-sse-capacity.ts --threshold 75
  tsx monitor-sse-capacity.ts --threshold 90 --url http://localhost:4000/api/metrics
      `);
      process.exit(0);
    }
  }

  return { threshold, metricsUrl };
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  monitorSSECapacity(options);
}
