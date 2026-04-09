# Crash Recovery Runbook

## Overview

The SnapTrade Telegram Listener implements robust crash recovery using exponential backoff reconnection strategy. This runbook provides operational guidance for understanding, monitoring, and troubleshooting the crash recovery system.

**Version:** 2.0.0-crash-recovery
**Last Updated:** 2026-03-22

---

## How Crash Recovery Works

### Architecture

The listener implements a multi-layered crash recovery system:

1. **Connection State Management** - Tracks connection state (DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, FAILED)
2. **ReconnectionManager** - Handles reconnection attempts with exponential backoff
3. **ConnectionMetrics** - Tracks connection statistics and uptime/downtime
4. **HealthTracker** - Monitors service health via heartbeat mechanism
5. **TelegramAlerter** - Sends notifications for crash events and recovery status

### Recovery Flow

```
┌─────────────┐
│   CRASH     │
│  (SIGKILL,  │
│ disconnect) │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ Record Failure   │
│ - Increment      │
│   attempt_count  │
│ - Log timestamp  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Calculate Delay  │
│ (exponential     │
│  backoff)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Wait (delay)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Attempt          │
│ Reconnection     │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────┐
│SUCCESS │ │  FAIL    │
│        │ │          │
│Reset   │ │Loop Back │
│state   │ │to Record │
└────────┘ └──────────┘
```

---

## Exponential Backoff Parameters

### Default Configuration

The reconnection system uses the following exponential backoff parameters:

| Parameter | Default Value | Environment Variable | Description |
|-----------|---------------|----------------------|-------------|
| **Initial Delay** | 1 second | `INITIAL_RECONNECT_DELAY_SECONDS` | Starting delay for first reconnection attempt |
| **Max Delay** | 60 seconds | `MAX_RECONNECT_DELAY_SECONDS` | Maximum delay between reconnection attempts |
| **Backoff Multiplier** | 2.0 | (hardcoded) | Exponential growth factor |
| **Max Retries** | Unlimited | (hardcoded) | Set to `None` for infinite retries |

### Delay Sequence

With default parameters, the reconnection delay sequence is:

```
Attempt 1: 1 second   (1 × 2^0)
Attempt 2: 2 seconds  (1 × 2^1)
Attempt 3: 4 seconds  (1 × 2^2)
Attempt 4: 8 seconds  (1 × 2^3)
Attempt 5: 16 seconds (1 × 2^4)
Attempt 6: 32 seconds (1 × 2^5)
Attempt 7: 60 seconds (capped at max_delay)
Attempt 8+: 60 seconds (continues at max_delay)
```

**Formula:** `delay = min(initial_delay × (backoff_multiplier ^ attempt_count), max_delay)`

### Customizing Backoff Parameters

Edit your `.env` file or export environment variables:

```bash
# Aggressive reconnection (faster recovery, more load)
export INITIAL_RECONNECT_DELAY_SECONDS=0.5
export MAX_RECONNECT_DELAY_SECONDS=30

# Conservative reconnection (slower recovery, less load)
export INITIAL_RECONNECT_DELAY_SECONDS=5
export MAX_RECONNECT_DELAY_SECONDS=300
```

### Verification Script

Test your backoff configuration:

```bash
cd listener
python3 verify_backoff.py
```

Expected output:
```
Actual delays: [1, 2, 4, 8, 16, 32, 60, 60, 60]
Expected delays: [1, 2, 4, 8, 16, 32, 60, 60, 60]
Match: True
✓ Exponential backoff timing verified!
```

---

## Configuring Alerts

### Alert System Setup

The listener sends crash and recovery alerts via Telegram Bot API.

#### 1. Create Alert Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Use `/newbot` command and follow prompts
3. Save the bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

#### 2. Get Chat ID

1. Add your bot to a chat or group
2. Send a test message to the bot
3. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Find `"chat":{"id": 123456789}` in the response

#### 3. Configure Environment Variables

Add to your `.env` file:

```bash
# Alert configuration
ALERT_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
ALERT_CHAT_ID=-1001234567890
ENABLE_CRASH_ALERTS=true
```

#### 4. Test Alert Delivery

```bash
cd listener
python3 test_alert_delivery.py
```

### Alert Types and Severity Levels

| Severity | Emoji | Use Case | Example |
|----------|-------|----------|---------|
| **info** | ℹ️ | Normal operations | Service started, reconnection successful |
| **warning** | ⚠️ | Potential issues | High reconnection attempts, temporary failures |
| **error** | 🚨 | Service disruptions | Connection failures, parser errors |
| **critical** | 💥 | Severe failures | SystemExit, MemoryError, AuthKeyError |

### Alert Rate Limiting

Alerts are automatically rate-limited to prevent spam:
- **Duplicate suppression:** Same alert not sent within 60 seconds
- **Tracked by:** `severity:message` key
- **Purpose:** Prevent alert storms during cascading failures

### Disabling Alerts

Temporarily disable crash alerts:

```bash
export ENABLE_CRASH_ALERTS=false
```

Or permanently in `.env`:
```bash
ENABLE_CRASH_ALERTS=false
```

---

## Troubleshooting Reconnection Issues

### Common Issues and Solutions

#### 1. Listener Won't Reconnect

**Symptoms:**
- Listener stuck in DISCONNECTED state
- No reconnection attempts logged
- Process appears frozen

**Diagnosis:**
```bash
# Check if process is running
ps aux | grep listener.py

# Check recent logs
tail -n 100 logs/listener.log

# Check for infinite loops or deadlocks
pgrep -a python | grep listener
```

**Solutions:**
- **Hard restart:** `pkill -9 -f listener.py && python3 listener/listener.py`
- **Check network:** `ping api.telegram.org`
- **Verify credentials:** Ensure `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_PHONE` are correct
- **Session corruption:** Delete session file and re-authenticate

#### 2. Rapid Reconnection Loop

**Symptoms:**
- Reconnection attempts happening at maximum frequency
- High CPU usage
- Logs filled with reconnection messages

**Diagnosis:**
```bash
# Count reconnection attempts in last hour
grep -c "reconnect" logs/listener.log

# Check current backoff delay
grep "delay" logs/listener.log | tail -5
```

**Solutions:**
- **Increase max delay:** `export MAX_RECONNECT_DELAY_SECONDS=300`
- **Check for auth issues:** Look for `AuthKeyError` or `PhoneNumberInvalidError` in logs
- **Verify API credentials:** Ensure Telegram API credentials are valid
- **Check API rate limits:** May be hitting Telegram's rate limits

#### 3. Authentication Failures

**Symptoms:**
- `AuthKeyError` in logs
- Immediate reconnection failures
- Session invalidation messages

**Diagnosis:**
```bash
# Check for auth errors
grep "AuthKeyError\|PhoneNumberInvalidError" logs/listener.log
```

**Solutions:**
```bash
# Delete corrupted session and re-authenticate
rm listener/*.session
python3 listener/listener.py
# Follow authentication prompts
```

#### 4. FloodWait Errors

**Symptoms:**
- `FloodWaitError` exceptions
- Forced wait times in logs
- Temporarily blocked from Telegram

**Solutions:**
- **Wait it out:** Telegram API enforces rate limits, respect the wait time
- **Reduce message frequency:** If parsing too many channels
- **Check for loops:** Ensure no infinite message processing loops

#### 5. Connection Metrics Not Updating

**Symptoms:**
- `metrics.json` not updated
- Stale timestamp in metrics file
- Missing connection statistics

**Diagnosis:**
```bash
# Check metrics file modification time
ls -lh listener/metrics.json

# Verify metrics content
cat listener/metrics.json | jq
```

**Solutions:**
- **Check file permissions:** `chmod 644 listener/metrics.json`
- **Verify save task:** Ensure `save_metrics_periodically` is running
- **Check for exceptions:** `grep "Failed to save metrics" logs/listener.log`

---

## Debugging Signal Matching Issues

### Overview

Signal matching connects incoming Telegram signals to stored trade signals in the database. When matching fails or becomes ambiguous, trades may not be processed correctly. This section covers how to diagnose and resolve signal matching problems.

### Enable Debug Logging

To enable detailed signal matching logs, set the debug environment variable:

```bash
# In .env file
SIGNAL_MATCHING_DEBUG=true

# Or export directly
export SIGNAL_MATCHING_DEBUG=true

# Restart listener to apply
pkill -SIGTERM -f listener.py
python3 listener/listener.py
```

When enabled, the listener logs detailed matching information for each signal including:
- Candidate matches found in database
- Match scores and confidence levels
- Selected match and reasoning
- Ambiguous match warnings

### Interpreting Matching Logs

#### Successful Match

```
[INFO] Signal matching: Found 1 candidate for symbol AAPL, entry 150.25
[DEBUG] Match scores: [{'id': 12345, 'score': 0.95, 'symbol': 'AAPL', 'entry': 150.25}]
[INFO] Selected match: signal_id=12345 (confidence: 0.95)
```

**Interpretation:** Clear match with high confidence (>0.9), signal processed normally.

#### Ambiguous Match

```
[WARNING] Signal matching: Found 3 candidates for symbol AAPL, entry 150.00
[DEBUG] Match scores: [
  {'id': 12345, 'score': 0.85, 'symbol': 'AAPL', 'entry': 150.00, 'timestamp': '2026-03-22T10:00:00'},
  {'id': 12346, 'score': 0.82, 'symbol': 'AAPL', 'entry': 150.00, 'timestamp': '2026-03-22T10:05:00'},
  {'id': 12347, 'score': 0.80, 'symbol': 'AAPL', 'entry': 150.00, 'timestamp': '2026-03-22T10:10:00'}
]
[WARNING] Ambiguous match: Top 2 scores within 0.1 threshold
[INFO] Selected match: signal_id=12345 (most recent)
```

**Interpretation:** Multiple similar signals found. System selects most recent, but this may indicate duplicate signals in database or insufficient distinguishing data.

#### No Match

```
[ERROR] Signal matching: No candidates found for symbol TSLA, entry 250.50
[DEBUG] Search criteria: symbol=TSLA, entry_price=250.50, status=PENDING
[ERROR] Failed to match signal - no database records found
```

**Interpretation:** Signal not found in database. Possible causes:
- Signal never created in database
- Signal already processed (status != PENDING)
- Price mismatch due to rounding or data inconsistency

### Checking Matching Stats

The health endpoint exposes signal matching statistics at:

```bash
# Check matching stats
curl http://localhost:${HEALTHCHECK_PORT:-8080}/health | jq '.matching_stats'
```

**Response format:**
```json
{
  "matching_stats": {
    "total_matches_attempted": 1543,
    "successful_matches": 1489,
    "failed_matches": 31,
    "ambiguous_matches": 23,
    "success_rate": 0.965,
    "ambiguous_rate": 0.015,
    "avg_match_confidence": 0.91,
    "last_updated": "2026-03-23T14:32:10+00:00"
  }
}
```

#### Healthy Thresholds

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| `success_rate` | > 95% | 90-95% | < 90% |
| `ambiguous_rate` | < 5% | 5-10% | > 10% |
| `avg_match_confidence` | > 0.85 | 0.70-0.85 | < 0.70 |
| `failed_matches` | < 5% | 5-10% | > 10% |

#### Monitoring Commands

```bash
# Watch matching stats live
watch -n 5 'curl -s http://localhost:8080/health | jq ".matching_stats"'

# Calculate current success rate
curl -s http://localhost:8080/health | jq '.matching_stats | (.successful_matches / .total_matches_attempted) * 100'

# Check for high ambiguity rate
curl -s http://localhost:8080/health | jq '.matching_stats.ambiguous_rate | if . > 0.1 then "CRITICAL: High ambiguity" else "OK" end'
```

### Querying Race Condition Metrics

The listener exposes a Prometheus-style metric to track signal matching race conditions:

**Metric Name:** `signal_race_conditions_detected_total`

**Description:** Counter tracking the total number of race conditions detected during signal matching, where multiple concurrent signals attempt to match the same database record.

#### Query Commands

```bash
# Query the race conditions metric
curl -s http://localhost:${HEALTHCHECK_PORT:-8080}/metrics | grep signal_race_conditions_detected_total

# Get current count
curl -s http://localhost:8080/metrics | grep signal_race_conditions_detected_total | awk '{print $2}'

# Monitor for increases (check every 10 seconds)
watch -n 10 'curl -s http://localhost:8080/metrics | grep signal_race_conditions_detected_total'
```

#### Interpreting the Metric

| Count | Status | Action |
|-------|--------|--------|
| 0 | Normal | No race conditions detected, matching is operating correctly |
| 1-5 | Warning | Occasional race conditions, monitor for patterns |
| > 5 | Critical | Frequent race conditions, investigate concurrent signal processing |

**Common Causes of Race Conditions:**
- Multiple Telegram channels sending identical signals simultaneously
- High message processing rate with duplicate pending signals in database
- Insufficient locking or transaction isolation during matching

**Resolution:**
```bash
# 1. Enable debug logging to see race condition details
export SIGNAL_MATCHING_DEBUG=true

# 2. Check for duplicate pending signals
psql -d snaptrade -c "SELECT symbol, entry_price, COUNT(*) FROM signals WHERE status='PENDING' GROUP BY symbol, entry_price HAVING COUNT(*) > 1;"

# 3. Review concurrent message processing in logs
tail -f logs/listener.log | grep "race condition\|concurrent"
```

### When Ambiguous Matches Indicate a Problem

#### Normal Ambiguity (Acceptable)

- **Ambiguous rate < 5%**
- Occurs occasionally for rapid successive signals
- Confidence scores still > 0.8
- Trade processing continues normally

**Action:** Monitor, no immediate action needed.

#### Problematic Ambiguity (Investigate)

**Symptoms:**
- Ambiguous rate > 10%
- Multiple candidates with low confidence scores (< 0.7)
- Frequent "wrong signal matched" reports
- Duplicate trade executions

**Common Causes:**

1. **Duplicate signals in database**
   ```bash
   # Check for duplicate pending signals
   psql -d snaptrade -c "SELECT symbol, entry_price, COUNT(*) as cnt FROM signals WHERE status='PENDING' GROUP BY symbol, entry_price HAVING COUNT(*) > 1;"
   ```

2. **Insufficient signal metadata**
   - Missing timestamp or unique identifiers
   - Signals lack distinguishing features (SL, TP, strategy name)
   - Solution: Enhance signal creation to include more metadata

3. **Stale signals not cleaned up**
   ```bash
   # Find old pending signals (> 7 days)
   psql -d snaptrade -c "SELECT id, symbol, entry_price, created_at FROM signals WHERE status='PENDING' AND created_at < NOW() - INTERVAL '7 days';"
   ```

4. **Price precision mismatch**
   - Database stores 150.25, Telegram sends 150.250000
   - Solution: Normalize price precision in matching logic

**Resolution Steps:**

```bash
# 1. Enable debug logging
export SIGNAL_MATCHING_DEBUG=true

# 2. Restart listener
pkill -SIGTERM -f listener.py
python3 listener/listener.py

# 3. Monitor logs for ambiguous matches
tail -f logs/listener.log | grep "ambiguous\|Ambiguous"

# 4. Review matching stats
curl -s http://localhost:8080/health | jq '.matching_stats'

# 5. Clean up duplicates/stale signals (if identified)
# (Run appropriate database cleanup queries)

# 6. Verify improvement
# Watch success_rate and ambiguous_rate metrics
```

### Debugging Checklist

When investigating matching issues, check:

- [ ] `SIGNAL_MATCHING_DEBUG=true` enabled
- [ ] Recent logs contain matching details
- [ ] Health endpoint accessible and returning matching_stats
- [ ] Success rate > 90%
- [ ] Ambiguous rate < 10%
- [ ] No duplicate signals in database for same symbol/price/timestamp
- [ ] Signal metadata includes sufficient distinguishing information
- [ ] Price precision consistent between Telegram and database
- [ ] Old pending signals cleaned up (< 7 days old)

---

## Manual Recovery Procedures

### Emergency Recovery Steps

#### 1. Standard Restart

```bash
# Stop listener gracefully
pkill -SIGTERM -f listener.py

# Wait for shutdown
sleep 5

# Restart
cd /opt/snaptrade-unified/listener
python3 listener.py
```

#### 2. Force Kill and Restart

```bash
# Force kill
pkill -9 -f listener.py

# Clean up zombie processes
ps aux | grep listener | grep defunct | awk '{print $2}' | xargs kill -9

# Restart
python3 listener/listener.py
```

#### 3. Session Reset

```bash
# Stop listener
pkill -9 -f listener.py

# Backup old session
cp listener/*.session listener/*.session.backup

# Delete session
rm listener/*.session

# Restart and re-authenticate
python3 listener/listener.py
```

#### 4. Full Clean Restart

```bash
# Stop listener
pkill -9 -f listener.py

# Clean temporary files
rm listener/*.session
rm listener/*.log
rm listener/metrics.json

# Clear Python cache
find listener -name "__pycache__" -type d -exec rm -rf {} +
find listener -name "*.pyc" -delete

# Restart
python3 listener/listener.py
```

### Recovery Verification

After recovery, verify the listener is functioning:

```bash
# 1. Check process is running
ps aux | grep listener.py

# 2. Monitor live logs
tail -f logs/listener.log

# 3. Verify connection state
grep "CONNECTED\|Connected" logs/listener.log | tail -1

# 4. Check recent message processing
grep "Processing message" logs/listener.log | tail -10

# 5. Verify metrics are updating
watch -n 5 cat listener/metrics.json
```

### Escalation Criteria

Escalate to engineering if:
- Listener fails to recover after 3 manual restart attempts
- Authentication failures persist after session reset
- Metrics show sustained error rate > 50%
- Reconnection attempts exceed 100 in 1 hour
- System resources (CPU/memory) consistently maxed out

---

## Monitoring Metrics

### Metrics File Location

```bash
listener/metrics.json
```

**Update Frequency:** Every 5 minutes (300 seconds)

### Metrics Schema

```json
{
  "uptime": 3600,
  "message_count": 1543,
  "error_count": 12,
  "reconnection_count": 3,
  "last_heartbeat": "2026-03-22T20:43:15.123456+00:00"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `uptime` | integer | Total uptime in seconds since service start |
| `message_count` | integer | Total messages processed successfully |
| `error_count` | integer | Total errors encountered |
| `reconnection_count` | integer | Total reconnection attempts |
| `last_heartbeat` | ISO 8601 | Timestamp of last successfully processed message |

### Connection Metrics (Internal)

Tracked in `ConnectionMetrics` class (not persisted to disk):

- `total_connections` - Total connection attempts
- `successful_connections` - Successful connections
- `failed_connections` - Failed connection attempts
- `total_uptime_seconds` - Cumulative connected time
- `total_downtime_seconds` - Cumulative disconnected time

### Health Check

The `HealthTracker` determines service health based on heartbeat freshness:

```python
# Service is healthy if heartbeat is < 5 minutes old
is_healthy = (current_time - last_heartbeat) < 300 seconds
```

### Monitoring Commands

```bash
# View current metrics
cat listener/metrics.json | jq

# Calculate uptime percentage
jq '.uptime as $up | .reconnection_count as $rc | ($up / ($up + ($rc * 30))) * 100' listener/metrics.json

# Calculate error rate
jq '(.error_count / .message_count) * 100' listener/metrics.json

# Check if heartbeat is fresh (< 5 min)
python3 -c "
import json
from datetime import datetime, timezone, timedelta
with open('listener/metrics.json') as f:
    data = json.load(f)
    last = datetime.fromisoformat(data['last_heartbeat'])
    age = (datetime.now(timezone.utc) - last).total_seconds()
    print(f'Heartbeat age: {age:.0f}s')
    print(f'Healthy: {age < 300}')
"
```

### Log Files

| File | Purpose | Rotation | Location |
|------|---------|----------|----------|
| `listener.log` | Main operational log | 10 MB, 5 backups | `logs/listener.log` |
| `listener_crashes.log` | Crash-specific events | 10 MB, 5 backups | `logs/listener_crashes.log` |
| `test_crash_recovery.log` | Test execution logs | Not rotated | `listener/test_crash_recovery.log` |

### Log Analysis

```bash
# Count errors in last hour
grep -c "ERROR" logs/listener.log

# View recent crashes
tail -50 logs/listener_crashes.log

# Track reconnection history
grep "reconnect" logs/listener.log | tail -20

# Monitor live activity
tail -f logs/listener.log | grep --line-buffered "Processing\|ERROR\|reconnect"

# Extract backoff timing
grep "delay" logs/listener.log | awk '{print $NF}' | tail -10
```

### Alerting Thresholds (Recommended)

Set up external monitoring with these thresholds:

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Heartbeat age | > 5 min | > 15 min | Restart service |
| Error rate | > 5% | > 20% | Investigate logs |
| Reconnection count | > 10/hour | > 50/hour | Check network/auth |
| Uptime | N/A | < 85% | Review stability |
| Message rate | < 10/hour | < 1/hour | Verify channels |

---

## Testing and Validation

### Automated Tests

#### Crash Recovery Test

Simulates SIGKILL crash and verifies reconnection:

```bash
cd listener
python3 test_crash_recovery.py
```

**Expected Output:**
```
=== Crash Recovery Test Started ===
Starting listener subprocess...
Listener started with PID 12345
Waiting 5 seconds for listener to initialize...
Sending SIGKILL to PID 12345
Process 12345 killed
Waiting 2 seconds before restart...
Starting listener subprocess...
Listener started with PID 12346
Waiting 10 seconds for reconnection attempts...
Stopping listener gracefully...
Verifying reconnection backoff timing...
Found 3 backoff delays: [1.0, 2.0, 4.0]
✓ Reconnection backoff timing verified
=== ✓ Crash Recovery Test PASSED ===
```

#### Network Failure Test

Simulates network disconnection:

```bash
cd listener
./test_network_failure.sh
```

#### Integration Test

Full end-to-end validation:

```bash
cd listener
python3 test_integration.py
```

### Manual Testing

#### Test Crash Recovery

```bash
# Terminal 1: Start listener with logging
python3 listener/listener.py 2>&1 | tee test_crash.log

# Terminal 2: Monitor metrics
watch -n 1 cat listener/metrics.json

# Terminal 3: Simulate crash
sleep 30 && pkill -9 -f listener.py

# Expected: Listener exits, manual restart required
# (Production: Would be restarted by process manager)
```

#### Test Exponential Backoff

```bash
# Run backoff verification
python3 listener/verify_backoff.py

# Expected output confirms delay sequence
✓ Exponential backoff timing verified!
```

#### Test Alert Delivery

```bash
python3 listener/test_alert_delivery.py

# Check your Telegram chat for test alert
```

---

## Quick Reference

### Environment Variables

```bash
# Telegram credentials
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
TELEGRAM_PHONE=your_phone_number

# Reconnection tuning
INITIAL_RECONNECT_DELAY_SECONDS=1
MAX_RECONNECT_DELAY_SECONDS=60

# Alert configuration
ALERT_BOT_TOKEN=bot_token
ALERT_CHAT_ID=chat_id
ENABLE_CRASH_ALERTS=true

# Health check
HEALTHCHECK_PORT=0

# Backend API
API_BASE=http://127.0.0.1:3001
INTERNAL_API_KEY=your_secure_key
```

### Common Commands

```bash
# Start listener
python3 listener/listener.py

# Stop gracefully
pkill -SIGTERM -f listener.py

# Force kill
pkill -9 -f listener.py

# View logs
tail -f logs/listener.log

# Check metrics
cat listener/metrics.json | jq

# Test crash recovery
python3 listener/test_crash_recovery.py

# Verify backoff
python3 listener/verify_backoff.py
```

### Support Contacts

- **Engineering Team:** [Your contact info]
- **On-Call Rotation:** [Your rotation schedule]
- **Documentation:** `listener/README.md`
- **Issue Tracker:** [Your issue tracker URL]

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-22 | 2.0.0 | Initial crash recovery runbook created |

---

**End of Runbook**
