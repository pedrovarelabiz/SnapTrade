# Listener v2.1 Migration Guide

## Overview

This guide documents the deployment migration from listener v2.0.0 to v2.1. Follow these steps to ensure a smooth upgrade and proper monitoring configuration.

## Prerequisites

- Listener v2.0.0 currently running
- Access to Grafana dashboards
- Access to Sentry project configuration
- Database migration permissions

## 1. New Metrics to Add to Grafana

Add the following metrics to your Grafana dashboards for listener v2.1 monitoring:

### Martingale Processing Metrics

```
# Martingale execution attempts
listener_martingale_execution_total{status="success|failure"}

# Martingale processing duration
listener_martingale_processing_duration_seconds

# Martingale times per trade
listener_martingale_times_histogram

# Active martingale positions
listener_martingale_active_positions
```

### Recommended Dashboard Panels

1. **Martingale Success Rate**
   - Query: `rate(listener_martingale_execution_total{status="success"}[5m]) / rate(listener_martingale_execution_total[5m])`
   - Type: Gauge
   - Thresholds: Red < 0.95, Yellow < 0.98, Green >= 0.98

2. **Martingale Processing Time**
   - Query: `histogram_quantile(0.95, listener_martingale_processing_duration_seconds)`
   - Type: Graph
   - Alert if p95 > 5s

3. **Active Martingale Positions**
   - Query: `listener_martingale_active_positions`
   - Type: Stat
   - Alert if > 1000

## 2. Sentry Alert Configuration

Configure the following Sentry alerts for v2.1:

### Alert: Martingale Execution Failures

```yaml
Name: High Martingale Failure Rate
Condition: Error count > 10 in 5 minutes
Filter: event.tags.component = "martingale_handler"
Action: Alert #trading-alerts channel
Severity: High
```

### Alert: Database Schema Issues

```yaml
Name: Missing martingale_times Column
Condition: Error message contains "column martingale_times does not exist"
Filter: event.tags.component = "database"
Action: Page on-call, alert #critical
Severity: Critical
```

### Alert: Excessive Martingale Times

```yaml
Name: Excessive Martingale Attempts
Condition: event.tags.martingale_times > 5
Filter: event.tags.component = "martingale_handler"
Action: Alert #trading-alerts channel
Severity: Warning
```

## 3. Database Schema Check

### Verify martingale_times Column Exists

Before deploying v2.1, verify the database schema includes the `martingale_times` column:

```sql
-- Check if column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'trades'
  AND column_name = 'martingale_times';
```

Expected output:
```
 column_name     | data_type | is_nullable
-----------------+-----------+-------------
 martingale_times| integer   | YES
```

### If Column is Missing

Run the following migration:

```sql
-- Add martingale_times column
ALTER TABLE trades
ADD COLUMN martingale_times INTEGER DEFAULT 0;

-- Add index for performance
CREATE INDEX idx_trades_martingale_times
ON trades(martingale_times)
WHERE martingale_times > 0;

-- Verify
SELECT COUNT(*) FROM trades WHERE martingale_times IS NOT NULL;
```

### Post-Migration Validation

```sql
-- Verify column properties
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'trades'
  AND column_name = 'martingale_times';

-- Check index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'trades'
  AND indexname = 'idx_trades_martingale_times';
```

## 4. Rollback Procedure

If issues occur after deploying v2.1, follow this rollback procedure:

### Step 1: Immediate Rollback (5 minutes)

```bash
# Stop the v2.1 service
kubectl scale deployment listener --replicas=0

# Deploy v2.0.0
kubectl set image deployment/listener listener=listener:v2.0.0

# Scale back up
kubectl scale deployment listener --replicas=3

# Verify rollback
kubectl get pods -l app=listener
kubectl logs -l app=listener --tail=50
```

### Step 2: Verify Service Health

```bash
# Check service is responding
curl -f http://listener-service/health || echo "Health check failed"

# Check metrics endpoint
curl -f http://listener-service/metrics | grep listener_up

# Verify no errors in logs
kubectl logs -l app=listener --since=5m | grep -i error
```

### Step 3: Database Rollback (if needed)

The `martingale_times` column is backward compatible and does NOT need to be removed for v2.0.0 to function. However, if you must remove it:

```sql
-- CAUTION: Only run if absolutely necessary
-- This will drop data permanently

-- Remove index
DROP INDEX IF EXISTS idx_trades_martingale_times;

-- Remove column
ALTER TABLE trades DROP COLUMN IF EXISTS martingale_times;
```

### Step 4: Disable New Monitoring

```bash
# Comment out v2.1-specific Grafana panels
# Remove or disable Sentry alerts created for v2.1
# Document rollback reason for post-mortem
```

### Step 5: Incident Communication

```
1. Post in #incidents: "Rolled back listener from v2.1 to v2.0.0"
2. Update status page if customer-facing impact
3. Create post-mortem doc with failure details
4. Schedule retrospective with team
```

## Deployment Checklist

- [ ] Database schema verified (martingale_times column exists)
- [ ] Grafana dashboards updated with new metrics
- [ ] Sentry alerts configured
- [ ] Rollback procedure reviewed with team
- [ ] Staging environment tested successfully
- [ ] Backup of current production state taken
- [ ] On-call engineer identified for deployment window
- [ ] Communication sent to stakeholders

## Post-Deployment Verification

After deploying v2.1, verify:

```bash
# 1. Check service version
kubectl exec -it deployment/listener -- /app/listener --version

# 2. Verify metrics are being collected
curl http://listener-service/metrics | grep listener_martingale

# 3. Check Grafana dashboards show data
# Visit: https://grafana.company.com/d/listener-v2.1

# 4. Verify database writes include martingale_times
# Run query: SELECT id, martingale_times FROM trades ORDER BY created_at DESC LIMIT 10;

# 5. Monitor error rates for 1 hour
# Check Sentry for new error patterns
```

## Support

If you encounter issues during migration:

1. Check #trading-alerts Slack channel
2. Review Sentry errors: https://sentry.io/project/listener
3. Contact on-call engineer via PagerDuty
4. Escalate to @trading-team if critical

## Version History

- **v2.1**: Added martingale_times tracking and metrics (2026-03-23)
- **v2.0.0**: Initial production release
