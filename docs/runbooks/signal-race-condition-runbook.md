# Signal Race Condition Runbook

## Alert Description

This alert fires when multiple signals are processed concurrently for the same entity, potentially causing race conditions. Race conditions can lead to:
- Duplicate signal processing
- Conflicting state updates
- Data inconsistencies
- Lost updates or overwritten data

**Alert Trigger Conditions:**
- Multiple signals with identical identifiers processed within a short time window
- Concurrent signal processing detected for the same resource
- Database conflicts or retry storms indicating simultaneous writes

---

## Triage Steps

### 1. Check Sentry for Signal Details

1. Navigate to Sentry dashboard
2. Filter for the specific alert time window
3. Identify the conflicting signal IDs:
   - Look for error messages containing signal identifiers
   - Check for tags: `signal_id`, `entity_id`, `resource_id`
   - Note the timestamps of conflicting signals

### 2. Query Database for Conflicting Signals

```sql
-- Find signals processed around the same time for the same entity
SELECT
    id,
    signal_id,
    entity_id,
    processed_at,
    status,
    created_at
FROM signals
WHERE entity_id = '<entity_id_from_sentry>'
  AND processed_at BETWEEN '<alert_time - 5m>' AND '<alert_time + 5m>'
ORDER BY processed_at ASC;
```

```sql
-- Check for duplicate signal IDs
SELECT
    signal_id,
    COUNT(*) as count,
    array_agg(id) as record_ids,
    array_agg(status) as statuses
FROM signals
WHERE signal_id IN ('<signal_id_1>', '<signal_id_2>', ...)
GROUP BY signal_id
HAVING COUNT(*) > 1;
```

### 3. Verify Impact

- Check if duplicate processing occurred (same action executed multiple times)
- Verify data consistency for affected entities
- Assess if any user-facing issues resulted from the race condition

---

## Resolution

### 1. Verify Exact Matching is Working

Check that signal deduplication logic is functioning:

```python
# Verify signal matching in code
# Ensure exact matching on signal_id or composite key
# Check for proper unique constraints in DB
```

**Validation Steps:**
- Confirm unique index exists on `signal_id` in the signals table
- Verify application-level checks for duplicate signals before processing
- Test idempotency keys are being generated and validated correctly

### 2. Check for Duplicate Signal Parsing

Investigate the source of duplicate signals:

1. **Review incoming webhooks/events:**
   - Check webhook delivery logs for duplicate deliveries
   - Verify external system isn't sending duplicate events

2. **Check message queue:**
   - Look for duplicate messages in the queue
   - Verify message deduplication is enabled
   - Check for retry/replay issues

3. **Review signal parsing logic:**
   - Ensure signals are parsed exactly once
   - Verify no duplicates are created during transformation
   - Check for race conditions in signal creation itself

### 3. Immediate Mitigation

If race condition is active:

```bash
# Pause signal processing if necessary
# Review and manually reconcile affected entities
# Restart services with proper locking mechanisms
```

---

## Troubleshooting

### Query Recent Signals on Same Asset

Use the following SQL query to identify potential race conditions by finding signals within a 30-minute window for the same asset:

```sql
SELECT * FROM signals
WHERE asset='EUR/USD'
  AND timestamp > NOW() - INTERVAL '30 minutes'
ORDER BY timestamp;
```

Replace `'EUR/USD'` with the specific asset you're investigating.

### Grafana Dashboards

- [Signal Processing Dashboard](https://grafana.company.com/d/signals)
- [Race Condition Metrics](https://grafana.company.com/d/race-conditions)
- [Asset Signal Timeline](https://grafana.company.com/d/asset-signals)

---

## Prevention

### 1. Database-Level Protection

- **Unique Constraints:** Ensure `UNIQUE` index on `signal_id` or composite keys
- **Optimistic Locking:** Implement version numbers or timestamps for concurrent updates
- **Advisory Locks:** Use database advisory locks for critical sections

```sql
-- Add unique constraint example
ALTER TABLE signals ADD CONSTRAINT unique_signal_id UNIQUE (signal_id);

-- Optimistic locking example
ALTER TABLE entities ADD COLUMN version INTEGER DEFAULT 1;
```

### 2. Application-Level Protection

- **Idempotency Keys:** Generate and validate idempotency keys for all signal operations
- **Distributed Locks:** Use Redis or similar for distributed locking across services
- **Message Deduplication:** Enable deduplication in message queues (SQS, Kafka, etc.)

```python
# Example: Distributed lock pattern
with redis_lock(f"signal:{signal_id}", timeout=30):
    if not signal_already_processed(signal_id):
        process_signal(signal_id)
```

### 3. Monitoring & Alerting Improvements

- Add metrics for concurrent signal processing attempts
- Monitor signal processing duration and queue depth
- Alert on duplicate signal_id insertions
- Track retry rates and failure patterns

### 4. Code Review Checklist

When modifying signal processing:
- [ ] Verify idempotency of all operations
- [ ] Check for race conditions in multi-step processes
- [ ] Ensure proper error handling and rollback mechanisms
- [ ] Test concurrent processing scenarios
- [ ] Validate database transaction isolation levels

### 5. Testing

- Add integration tests for concurrent signal processing
- Load test with realistic race condition scenarios
- Verify rollback behavior on conflicts
- Test message queue behavior under high load

---

## Related Resources

- Database schema: `/db/schema.sql`
- Signal processing code: `/app/services/signal_processor.py`
- Queue configuration: `/config/queue_settings.yml`
- Sentry dashboard: [Link to Sentry project]
