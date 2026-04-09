# SSE Memory Leak Fix and Improvements

## Problem Statement

The original SSE (Server-Sent Events) implementation suffered from a critical memory leak issue:

- **Limited Capacity**: Only 100 concurrent clients supported
- **No Cleanup Mechanism**: Stale/disconnected clients remained in memory indefinitely
- **No Monitoring**: No metrics to track connection health or detect issues
- **Resource Exhaustion**: Long-running servers would accumulate zombie connections, eventually hitting the client limit and rejecting legitimate connections

This led to degraded performance over time and required manual server restarts to recover.

## Solution Overview

The SSE module was enhanced with comprehensive lifecycle management and observability:

### Capacity & Limits
- **Increased MAX_CLIENTS**: From 100 to **1,000** concurrent connections
- **Backpressure Warning**: Logs alert when 90% capacity reached (900/1000 clients)
- **Connection Rejection**: New connections rejected when at capacity, with metric tracking

### Cleanup & Health Management
- **Heartbeat Interval**: 30-second heartbeat messages (`HEARTBEAT_INTERVAL_MS = 30000`)
- **Heartbeat Timeout**: Clients idle for 30+ seconds are marked stale (`HEARTBEAT_TIMEOUT_MS = 30000`)
- **Cleanup Timer**: Automated cleanup runs every 10 seconds (`CLEANUP_INTERVAL_MS = 10000`)
- **Connection Tracking**: Each client tracks `lastHeartbeat` and `connectionTime` timestamps

### Observability
- **Prometheus Metrics**: Four new metrics for monitoring SSE health
- **Structured Logging**: Connection warnings and cleanup events logged
- **Health Indicators**: Connection age and count exposed via metrics endpoint

## Architecture

### Timers & Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                    SSE Module                            │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐         ┌──────────────┐              │
│  │ Heartbeat    │         │  Cleanup     │              │
│  │ Timer        │         │  Timer       │              │
│  │ (30s)        │         │  (10s)       │              │
│  └──────┬───────┘         └──────┬───────┘              │
│         │                        │                       │
│         ▼                        ▼                       │
│  broadcast()            Check stale clients              │
│  heartbeat event        Remove disconnected              │
│                         Update metrics                   │
│                                                           │
│  ┌─────────────────────────────────────┐                │
│  │  clients Map<string, SSEClient>     │                │
│  │  - id: string                        │                │
│  │  - res: Response                     │                │
│  │  - role: string                      │                │
│  │  - lastHeartbeat: number             │                │
│  │  - connectionTime: number            │                │
│  └─────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
```

### Connection Flow

1. **Client Connect**:
   - Check if `clients.size >= MAX_CLIENTS` → reject if at capacity
   - Initialize `lastHeartbeat` and `connectionTime`
   - Add to `clients` Map
   - Increment `sseActiveConnections` metric
   - Send `connected` event with client ID
   - Attach `close` event listener for cleanup

2. **Heartbeat Cycle** (every 30s):
   - Broadcast heartbeat event to all clients
   - Clients update their `lastHeartbeat` on receive

3. **Cleanup Cycle** (every 10s):
   - Iterate through all clients
   - Check if `Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS`
   - Remove stale clients
   - Update metrics accordingly

4. **Client Disconnect**:
   - `res.on("close")` triggered
   - Remove from `clients` Map
   - Decrement `sseActiveConnections`
   - Increment `sseDisconnectsTotal`

### Cleanup Implementation

The cleanup mechanism prevents memory leaks by:

- **Automatic Detection**: Identifies clients that haven't responded to heartbeats
- **Graceful Removal**: Closes connections and frees resources
- **Error Handling**: Catches write errors during broadcast and removes failed clients
- **Metric Updates**: Maintains accurate connection counts

## Available Metrics

All metrics are exported via `/metrics` endpoint in Prometheus format:

### `sse_active_connections` (Gauge)
- **Description**: Current number of active SSE connections
- **Labels**: `endpoint` (e.g., `/api/signals/stream`)
- **Use Case**: Monitor real-time connection count, detect capacity issues

### `sse_connection_age_seconds` (Gauge)
- **Description**: Age of the oldest active SSE connection in seconds
- **Labels**: None
- **Use Case**: Detect long-lived connections, identify potential stale clients

### `sse_disconnects_total` (Counter)
- **Description**: Total number of SSE disconnections since server start
- **Labels**: `reason` (e.g., `client_close`, `timeout`, `error`)
- **Use Case**: Track disconnection patterns, debug connection stability

### `sse_rejected_connections_total` (Counter)
- **Description**: Total number of rejected connections due to capacity limits
- **Labels**: None
- **Use Case**: Alert on capacity issues, inform scaling decisions

## Monitoring & Alerts

### Recommended Prometheus Alerts

```yaml
# Alert when approaching capacity
- alert: SSEHighCapacity
  expr: sse_active_connections > 900
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "SSE connections near capacity"
    description: "{{ $value }} active connections (90% of 1000 limit)"

# Alert when rejecting connections
- alert: SSERejectingConnections
  expr: rate(sse_rejected_connections_total[5m]) > 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "SSE rejecting new connections"
    description: "Server at capacity, rejecting {{ $value }} conn/sec"

# Alert on abnormal disconnect rate
- alert: SSEHighDisconnectRate
  expr: rate(sse_disconnects_total[5m]) > 10
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High SSE disconnect rate"
    description: "{{ $value }} disconnects/sec over 5 minutes"
```

### Grafana Dashboard Queries

```promql
# Active connections over time
sse_active_connections{endpoint="/api/signals/stream"}

# Connection acceptance rate
rate(sse_active_connections[5m])

# Rejection rate
rate(sse_rejected_connections_total[5m])

# Disconnect reasons breakdown
rate(sse_disconnects_total[5m]) by (reason)

# Oldest connection age
sse_connection_age_seconds
```

## Troubleshooting Guide

### Issue: Clients Not Receiving Events

**Symptoms**: Dashboard shows "connected" but no signal updates

**Diagnosis**:
1. Check if client is still in active connections:
   ```bash
   curl http://localhost:3000/metrics | grep sse_active_connections
   ```
2. Verify heartbeat timer is running (should see heartbeat events every 30s)
3. Check for write errors in server logs

**Resolution**:
- Ensure client properly handles SSE `heartbeat` events
- Check network/proxy timeouts (should be > 30s)
- Verify client updates `lastHeartbeat` on receiving events

### Issue: Connection Rejected (429 Too Many Requests)

**Symptoms**: `addClient()` returns `false`, client receives 429 error

**Diagnosis**:
1. Check current connection count:
   ```bash
   curl http://localhost:3000/metrics | grep sse_active_connections
   ```
2. Check rejection counter:
   ```bash
   curl http://localhost:3000/metrics | grep sse_rejected_connections_total
   ```

**Resolution**:
- If at capacity legitimately: scale horizontally (add more servers)
- If stale clients accumulating: verify cleanup timer is running
- Emergency: restart server to clear all connections
- Long-term: increase `MAX_CLIENTS` if sustained high usage

### Issue: Memory Growth Over Time

**Symptoms**: Node.js heap size grows continuously, connections leak

**Diagnosis**:
1. Check cleanup timer is active:
   ```typescript
   // In server logs, should see cleanup running every 10s
   ```
2. Monitor connection age:
   ```bash
   curl http://localhost:3000/metrics | grep sse_connection_age_seconds
   ```
3. Compare `sse_active_connections` to actual `clients.size`

**Resolution**:
- Ensure `startHeartbeat()` called on server start
- Verify cleanup timer removes stale clients (check logs)
- Check for error handlers that might be catching cleanup exceptions
- Restart server if immediate resolution needed

### Issue: Backpressure Warnings in Logs

**Symptoms**: `SSE backpressure warning: ${count} clients exceeds threshold`

**Diagnosis**:
- Normal during high traffic periods (90% capacity = 900 clients)
- Warning indicates approaching capacity, not a failure

**Resolution**:
- Monitor for trend: if sustained, plan scaling
- Review if all connections are legitimate (check for connection abuse)
- Consider increasing `MAX_CLIENTS` if hardware permits
- Set up alerting on this threshold for proactive scaling

### Issue: Clients Timing Out Prematurely

**Symptoms**: Clients disconnect after 30 seconds despite being active

**Diagnosis**:
1. Verify client is receiving and acknowledging heartbeat events
2. Check if `lastHeartbeat` timestamp is updating
3. Review cleanup logic for off-by-one errors

**Resolution**:
- Ensure client EventSource properly receives `heartbeat` events
- Client doesn't need to send anything back (SSE is one-way)
- Verify server-side `lastHeartbeat` update on heartbeat broadcast
- Check if cleanup timeout (`HEARTBEAT_TIMEOUT_MS`) is appropriate for use case

## Testing

### Unit Tests
Located in: `backend/src/lib/__tests__/sse.test.ts`

Key test coverage:
- Client addition/removal
- Broadcasting to all clients
- Role-based filtering (`sendToRole`)
- Signal visibility (free vs premium)
- Heartbeat start/stop
- Connection limits

### Integration Tests
Located in: `backend/src/__tests__/integration/sse-integration.test.ts`

Tests end-to-end flows with actual HTTP connections.

### Manual Testing

```bash
# Connect to SSE endpoint
curl -N http://localhost:3000/api/signals/stream \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should receive:
# 1. Connected event immediately
# 2. Heartbeat event every 30 seconds
# 3. Signal events when signals broadcast

# Monitor metrics
curl http://localhost:3000/metrics | grep sse_
```

## Configuration

### Constants (in `backend/src/lib/sse.ts`)

```typescript
MAX_CLIENTS = 1000                // Maximum concurrent connections
HEARTBEAT_INTERVAL_MS = 30_000    // Heartbeat broadcast frequency
HEARTBEAT_TIMEOUT_MS = 30_000     // Idle timeout before cleanup
CLEANUP_INTERVAL_MS = 10_000      // Cleanup check frequency
BACKPRESSURE_THRESHOLD = 0.9      // Warning at 90% capacity
```

### Tuning Recommendations

- **High-traffic systems**: Increase `MAX_CLIENTS` to 2000+, ensure adequate memory
- **Low-latency requirements**: Decrease `HEARTBEAT_INTERVAL_MS` to 15s
- **Mobile clients**: Increase `HEARTBEAT_TIMEOUT_MS` to 60s (account for poor networks)
- **Resource-constrained**: Decrease `MAX_CLIENTS`, increase `CLEANUP_INTERVAL_MS` to 30s

## References

- SSE Specification: [MDN Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- Architecture Note A9: SSE vs Polling decision (in `sse.ts` header)
- Prometheus Metrics: [Prometheus Node.js Client](https://github.com/siimon/prom-client)

---

**Last Updated**: 2026-03-25
**Authors**: Backend Team
**Related**: `SIGNAL_MATCHING_MONITORING.md`, `backend/src/lib/sse.ts`
