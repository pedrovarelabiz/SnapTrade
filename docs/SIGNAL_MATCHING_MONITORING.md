# Signal Matching Monitoring Runbook

## Overview
This runbook provides guidance for monitoring and troubleshooting signal matching health in the SnapTrade platform.

## Key Metrics

### exact_match_rate
- **Expected Value**: >80%
- **Description**: Percentage of signals that match exactly with expected patterns
- **Calculation**: (exact_matches / total_signals) * 100

## Alert Thresholds

| Metric | Warning | Critical | Action Required |
|--------|---------|----------|-----------------|
| exact_match_rate | <85% | <80% | Immediate investigation |
| match_latency | >500ms | >1000ms | Performance review |
| failed_matches | >5% | >10% | Investigate failures |
| signal_processing_errors | >1% | >5% | Check error logs |

## Investigating Low exact_match_rate

When exact_match_rate drops below 80%, follow these steps:

### 1. Check Recent Changes
- Review recent deployments or configuration changes
- Check if there were updates to signal matching rules
- Verify no changes to signal format or schema

### 2. Analyze Match Failures
```bash
# Check recent match failures
grep "match_failed\|exact_match_rate" /var/log/snaptrade/signal-matching.log | tail -n 100

# View match rate trends
grep "exact_match_rate" /var/log/snaptrade/metrics.log | tail -n 50
```

### 3. Identify Pattern Anomalies
- Compare current signal patterns with historical baselines
- Look for new signal types or unexpected formats
- Check for data quality issues in incoming signals

### 4. Check System Resources
- Verify CPU and memory utilization
- Check for network latency issues
- Ensure database connectivity is stable

## Logs to Check

### Primary Logs
1. **Signal Matching Logs**
   - Path: `/var/log/snaptrade/signal-matching.log`
   - Contains: Match results, failures, exact_match_rate metrics
   - Key patterns: `exact_match_rate`, `match_failed`, `signal_processed`

2. **Metrics Logs**
   - Path: `/var/log/snaptrade/metrics.log`
   - Contains: Aggregated performance metrics
   - Key patterns: `exact_match_rate`, `match_latency`, `throughput`

3. **Application Logs**
   - Path: `/var/log/snaptrade/app.log`
   - Contains: General application errors and warnings
   - Key patterns: `ERROR`, `WARN`, `signal_matching`

4. **System Logs**
   - Path: `/var/log/syslog` or `/var/log/messages`
   - Contains: System-level errors affecting service

### Log Analysis Commands
```bash
# Check exact_match_rate over last hour
grep "exact_match_rate" /var/log/snaptrade/metrics.log | \
  awk '{print $1, $2, $NF}' | tail -n 60

# Find all match failures in last 1000 lines
grep -i "match.*fail\|failed.*match" /var/log/snaptrade/signal-matching.log | tail -n 1000

# Check error distribution
grep ERROR /var/log/snaptrade/app.log | \
  awk '{print $5}' | sort | uniq -c | sort -rn

# Monitor real-time matching
tail -f /var/log/snaptrade/signal-matching.log | grep "exact_match_rate"
```

## Common Issues and Fixes

### Issue 1: Sudden Drop in exact_match_rate
**Symptoms**: exact_match_rate drops from >80% to <50% suddenly

**Common Causes**:
- Signal format change from upstream provider
- Configuration file corruption or incorrect update
- Cache invalidation or stale matching rules

**Fixes**:
1. Check signal format against schema: `validate_signal_schema.py`
2. Reload matching rules: `systemctl reload signal-matcher`
3. Clear and rebuild cache: `redis-cli FLUSHDB` (if using Redis)
4. Rollback recent config changes if necessary

### Issue 2: Gradual Decline in Match Rate
**Symptoms**: exact_match_rate slowly decreases over days/weeks

**Common Causes**:
- Accumulating data quality issues
- Outdated matching rules not covering new patterns
- Resource degradation (memory leaks, disk space)

**Fixes**:
1. Run data quality audit: `audit_signal_quality.py --days 7`
2. Update matching rules with new patterns
3. Restart services to clear memory leaks
4. Clean up old logs and temporary files

### Issue 3: High Match Latency with Normal exact_match_rate
**Symptoms**: exact_match_rate >80% but match_latency >1000ms

**Common Causes**:
- Database query performance degradation
- Insufficient resources (CPU/memory)
- Network latency to external services

**Fixes**:
1. Analyze slow queries: Check database slow query log
2. Add database indexes if missing
3. Scale up resources or add replicas
4. Optimize matching algorithms for performance

### Issue 4: Intermittent Matching Failures
**Symptoms**: exact_match_rate fluctuates between 70-90%

**Common Causes**:
- Timeout issues with external dependencies
- Race conditions in signal processing
- Inconsistent signal quality from providers

**Fixes**:
1. Increase timeout values in configuration
2. Add retry logic with exponential backoff
3. Implement circuit breakers for external calls
4. Contact signal providers about quality issues

### Issue 5: No Signals Being Processed
**Symptoms**: exact_match_rate = 0% or no metrics reported

**Common Causes**:
- Service not running or crashed
- Message queue connectivity issues
- Input stream disruption

**Fixes**:
1. Check service status: `systemctl status signal-matcher`
2. Restart service: `systemctl restart signal-matcher`
3. Verify queue connectivity: `check_queue_health.sh`
4. Check upstream signal providers

## Escalation Process

1. **Warning threshold (<85%)**: Monitor for 15 minutes
2. **Critical threshold (<80%)**:
   - Investigate immediately
   - Alert on-call engineer
   - Follow investigation steps above
3. **Severe degradation (<50%)**:
   - Page senior engineer
   - Consider service degradation announcement
   - Prepare rollback plan

## Dashboard Links
- Grafana: `https://monitoring.snaptrade.com/d/signal-matching`
- Logs: `https://logs.snaptrade.com/app/discover#/signal-matching`
- Alerts: `https://alerts.snaptrade.com/signal-matching`

## Additional Resources
- Signal Matching Architecture: `/docs/SIGNAL_MATCHING_ARCHITECTURE.md`
- Configuration Guide: `/docs/SIGNAL_MATCHING_CONFIG.md`
- API Documentation: `/docs/API.md#signal-matching`
