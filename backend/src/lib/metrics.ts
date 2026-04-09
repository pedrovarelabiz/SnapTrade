import { Registry, collectDefaultMetrics, Gauge, Counter } from 'prom-client';

// Create a new Prometheus registry
export const register = new Registry();

// Collect default metrics (process, Node.js runtime metrics)
collectDefaultMetrics({ register });

// SSE active connections gauge
export const sseActiveConnections = new Gauge({
  name: 'sse_active_connections',
  help: 'Number of active SSE connections',
  labelNames: ['endpoint'],
  registers: [register],
});

// SSE connection age gauge
export const sseConnectionAgeSeconds = new Gauge({
  name: 'sse_connection_age_seconds',
  help: 'Age of oldest SSE connection in seconds',
  registers: [register],
});

// SSE disconnects counter
export const sseDisconnectsTotal = new Counter({
  name: 'sse_disconnects_total',
  help: 'Total number of SSE disconnections',
  labelNames: ['reason'],
  registers: [register],
});

// SSE rejected connections counter
export const sseRejectedConnectionsTotal = new Counter({
  name: 'sse_rejected_connections_total',
  help: 'Total number of rejected SSE connections due to capacity',
  registers: [register],
});

// Export metrics as text
export async function getMetrics(): Promise<string> {
  return register.metrics();
}
