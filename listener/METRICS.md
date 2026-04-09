# Listener Metrics Documentation

This document explains the metrics system for the SnapTrade Telegram listener, including the metrics.json schema, field definitions, health status interpretation, and monitoring strategies.

## Overview

The listener service exposes metrics in two ways:
1. **metrics.json file** - Persisted to disk every 5 minutes
2. **HTTP /health endpoint** - Real-time health check via HTTP (default port: 8080)

## metrics.json Schema

The `listener/metrics.json` file contains the following fields:

```json
{
  "uptime": 5,
  "message_count": 5,
  "error_count": 0,
  "reconnection_count": 1,
  "last_heartbeat": "2026-03-22T19:41:56.294908+00:00"
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `uptime` | integer | Total service uptime in seconds since the current session started |
| `message_count` | integer | Total number of Telegram messages successfully processed in the current session |
| `error_count` | integer | Total number of errors encountered during message parsing or processing |
| `reconnection_count` | integer | Number of times the service has reconnected to Telegram after connection loss |
| `last_heartbeat` | string (ISO 8601) | UTC timestamp of the last successfully processed message. Null if no messages processed yet. |

### Persistence

- **Update interval**: Metrics are written to disk every 5 minutes (300 seconds)
- **Location**: `listener/metrics.json` in the project root
- **On startup**: Previous session metrics are loaded and logged for continuity tracking
- **On shutdown**: Final metrics snapshot is saved

## Health Endpoint

### Endpoint Details

- **URL**: `http://localhost:8080/health`
- **Method**: GET
- **Response Format**: JSON

### Response Schema

```json
{
  "status": "healthy",
  "uptime": 300,
  "message_count": 42,
  "last_heartbeat": "2026-03-22T20:15:30.123456+00:00",
  "errors": 0
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always returns "healthy" (endpoint availability indicates service is running) |
| `uptime` | integer | Service uptime in seconds |
| `message_count` | integer | Messages processed in current session |
| `last_heartbeat` | string (ISO 8601) | UTC timestamp of last message processed, null if none |
| `errors` | integer | Total error count |

## Health Status Interpretation

### Healthy Service Indicators

A healthy listener service exhibits:
- **Recent heartbeat**: `last_heartbeat` timestamp is within the last 5 minutes (300 seconds)
- **Low error rate**: `error_count` is 0 or grows slowly relative to `message_count`
- **Stable connections**: `reconnection_count` is low or stable over time
- **HTTP endpoint responsive**: `/health` endpoint returns 200 OK

### Warning Signs

Monitor for these warning indicators:
- **Stale heartbeat**: `last_heartbeat` is older than 5 minutes (indicates no messages being processed)
- **Increasing errors**: `error_count` growing rapidly suggests parsing or processing issues
- **Frequent reconnections**: `reconnection_count` increasing indicates network instability
- **HTTP timeout**: `/health` endpoint not responding suggests service crash or hang

### Health Check Logic

The internal `HealthTracker.is_healthy()` method considers the service healthy if:
```
current_time - last_heartbeat <= 300 seconds (5 minutes)
```

**Note**: A stale heartbeat doesn't necessarily mean the service is down - it could mean the monitored channels are inactive. Cross-reference with the HTTP endpoint availability.

## Monitoring from External Systems

### Option 1: HTTP Health Checks

**Best for**: Kubernetes, Docker health probes, uptime monitors, load balancers

```bash
# Basic health check
curl -f http://localhost:8080/health

# Exit code 0 if healthy, non-zero if unreachable
```

**Example integrations**:

**Docker Compose:**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

**Kubernetes:**
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 30
  timeoutSeconds: 5
readinessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
```

**Python monitoring script:**
```python
import requests
from datetime import datetime, timezone

response = requests.get("http://localhost:8080/health", timeout=5)
data = response.json()

# Check heartbeat freshness
if data["last_heartbeat"]:
    heartbeat = datetime.fromisoformat(data["last_heartbeat"])
    age = (datetime.now(timezone.utc) - heartbeat).total_seconds()

    if age > 300:
        print(f"WARNING: Heartbeat is {age}s old")
    else:
        print(f"OK: Service healthy, {data['message_count']} messages processed")
```

### Option 2: File-Based Monitoring

**Best for**: Cron jobs, log aggregation systems, offline analysis

```bash
# Read and parse metrics.json
cat listener/metrics.json | jq '.last_heartbeat'

# Check if heartbeat is recent (Linux)
HEARTBEAT=$(cat listener/metrics.json | jq -r '.last_heartbeat')
AGE=$(( $(date +%s) - $(date -d "$HEARTBEAT" +%s) ))

if [ $AGE -gt 300 ]; then
    echo "WARNING: Last heartbeat was ${AGE}s ago"
fi
```

**Python monitoring script:**
```python
import json
from datetime import datetime, timezone
from pathlib import Path

metrics_file = Path("listener/metrics.json")
data = json.loads(metrics_file.read_text())

# Validate health
if data["last_heartbeat"]:
    heartbeat = datetime.fromisoformat(data["last_heartbeat"])
    age = (datetime.now(timezone.utc) - heartbeat).total_seconds()

    is_healthy = age <= 300

    print(f"Uptime: {data['uptime']}s")
    print(f"Messages: {data['message_count']}")
    print(f"Errors: {data['error_count']}")
    print(f"Reconnections: {data['reconnection_count']}")
    print(f"Heartbeat age: {age:.0f}s")
    print(f"Status: {'HEALTHY' if is_healthy else 'UNHEALTHY'}")
```

### Option 3: Log-Based Monitoring

Monitor the log files for critical events:

```bash
# Watch for connection issues
tail -f listener/logs/listener.log | grep -i "reconnect\|error\|failed"

# Count errors in last hour
grep "ERROR" listener/logs/listener.log | grep "$(date '+%Y-%m-%d %H')" | wc -l
```

## Recommended Monitoring Strategy

For production deployments:

1. **Primary**: HTTP health checks every 30 seconds via orchestration platform
2. **Secondary**: File-based metrics parsing every 5 minutes for trend analysis
3. **Alerting**: Alert if:
   - HTTP endpoint unreachable for 2+ consecutive checks
   - `last_heartbeat` > 10 minutes old (2x the healthy threshold)
   - `error_count` exceeds 10% of `message_count`
   - `reconnection_count` increases by >5 in a 15-minute window

## Metrics Reset Behavior

- **On restart**: All metrics reset to zero, previous session data logged but not accumulated
- **After reconnection**: `uptime` continues from service start, `reconnection_count` increments
- **File corruption**: If metrics.json is corrupted, service logs a warning and continues with zero values

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture and component overview
- [CRASH_RECOVERY_RUNBOOK.md](CRASH_RECOVERY_RUNBOOK.md) - Crash recovery procedures
- [README.md](README.md) - Setup and deployment guide
