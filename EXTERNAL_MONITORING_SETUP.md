# External Monitoring Setup for Backup Health

## Overview
This document provides configuration instructions for setting up external uptime monitoring for the SnapTrade backup health endpoint.

**Endpoint:** `https://snaptrade.faroldigital.pt/api/health/backup`
**Check Frequency:** Every hour
**Alert Threshold:** HTTP 503 status OR >25 hours since last backup

---

## UptimeRobot Configuration

### 1. Create New Monitor

1. Log into UptimeRobot dashboard
2. Click "Add New Monitor"
3. Configure as follows:

**Monitor Settings:**
- **Monitor Type:** HTTP(s)
- **Friendly Name:** SnapTrade Backup Health
- **URL:** `https://snaptrade.faroldigital.pt/api/health/backup`
- **Monitoring Interval:** 60 minutes (1 hour)

**Advanced Settings:**
- **Expected HTTP Status Code:** 200
- **Alert When:** Status code is not 200 (will catch 503 errors)
- **HTTP Method:** GET
- **Request Timeout:** 30 seconds

**Response Validation (Optional but Recommended):**
- **Keyword:** `"healthy":true`
- **Alert if keyword not found:** Yes

### 2. Configure Alert Contacts

Add the following alert contacts:
- **Operations Team Email:** ops@faroldigital.pt
- **Escalation (optional):** SMS, Slack, PagerDuty

### 3. Alert Thresholds

- **Alert After:** 1 failed check (immediate alert)
- **Down Notification Interval:** 60 minutes
- **Up Notification:** Send when service recovers

---

## Pingdom Configuration

### 1. Create Uptime Check

1. Log into Pingdom
2. Navigate to "Uptime" → "Add New Check"

**Check Configuration:**
- **Name:** SnapTrade Backup Health
- **Check Type:** HTTP
- **URL:** `https://snaptrade.faroldigital.pt/api/health/backup`
- **Check Interval:** 60 minutes

**Advanced Settings:**
- **Request Type:** GET
- **Expected HTTP Response:** 200
- **Timeout:** 30 seconds
- **SSL Check:** Enabled

**Response Validation:**
```json
Should contain: "healthy":true
```

### 2. Alert Settings

- **When Down:** Send alert immediately (no threshold)
- **Alert via:** Email (ops@faroldigital.pt)
- **Integration:** Consider Slack/PagerDuty for critical alerts

### 3. Maintenance Windows

Configure maintenance windows if backup jobs are scheduled during specific times that might cause brief unavailability.

---

## Alternative: Better Uptime (formerly Uptime.com)

### Configuration

```yaml
Name: SnapTrade Backup Health
URL: https://snaptrade.faroldigital.pt/api/health/backup
Method: GET
Interval: 60 minutes
Expected Status: 200
Alert Threshold: 1 failed check
Notifications:
  - ops@faroldigital.pt
  - Slack: #ops-alerts
```

---

## Monitoring What to Watch For

### Endpoint Responses

**Healthy (HTTP 200):**
```json
{
  "healthy": true,
  "message": "Backup system is healthy",
  "lastBackup": {
    "timestamp": "2026-03-22T02:00:00.000Z",
    "success": true,
    "hoursSinceBackup": 11.5,
    "fileSize": "45.2 MB"
  },
  "nextScheduledBackup": "2026-03-23T02:00:00.000Z",
  "schedule": "0 2 * * *"
}
```

**Unhealthy (HTTP 503) - Stale Backup:**
```json
{
  "healthy": false,
  "message": "Last backup is stale (>25 hours old)",
  "lastBackup": {
    "timestamp": "2026-03-20T02:00:00.000Z",
    "success": true,
    "hoursSinceBackup": 26.5
  }
}
```

**Unhealthy (HTTP 503) - Failed Backup:**
```json
{
  "healthy": false,
  "message": "Last backup failed",
  "lastBackup": {
    "timestamp": "2026-03-22T02:00:00.000Z",
    "success": false,
    "errorMessage": "S3 upload failed"
  }
}
```

### Alert Triggers

Configure alerts for:
1. **HTTP 503 status** - Indicates backup system is unhealthy
2. **Connection failure** - Endpoint unreachable
3. **Response time >5s** - Potential performance issue
4. **SSL certificate expiry** - Monitor certificate validity

---

## Notification Routing

### Severity Levels

**Critical (Immediate Response Required):**
- HTTP 503 (backup failed or >25 hours old)
- Endpoint unreachable for >15 minutes
- Send to: ops@faroldigital.pt, on-call engineer

**Warning (Investigation Needed):**
- Slow response time (>5s)
- Approaching backup age threshold (>20 hours)
- Send to: ops@faroldigital.pt

**Info:**
- Backup recovered
- Service back online
- Send to: ops@faroldigital.pt

---

## Local Monitoring Alternative

If external monitoring services are not available, use the included monitoring script:

```bash
# Make executable
chmod +x /opt/snaptrade-unified/monitor-backup-health.sh

# Test manually
/opt/snaptrade-unified/monitor-backup-health.sh

# Add to crontab for hourly monitoring (on the 7th minute to avoid :00 and :30)
7 * * * * /opt/snaptrade-unified/monitor-backup-health.sh
```

Configure email alerts by setting:
```bash
export ALERT_EMAIL="ops@faroldigital.pt"
```

---

## Verification

After configuring monitoring, verify it's working:

1. **Test healthy state:**
   ```bash
   curl -s https://snaptrade.faroldigital.pt/api/health/backup | jq .
   ```
   Should return HTTP 200 with `"healthy": true`

2. **Check monitoring dashboard** to confirm:
   - Monitor is active
   - First check completed successfully
   - Alert contacts configured

3. **Test alerting** (optional):
   - Temporarily trigger an unhealthy state
   - Verify alerts are received
   - Restore to healthy state

---

## Current Status

⚠️ **NOTE:** As of 2026-03-22 18:03 UTC, the `/api/health/backup` endpoint is **NOT DEPLOYED** to production.

**Current endpoint status:**
- Base health endpoint works: ✅ `https://snaptrade.faroldigital.pt/api/health`
- Backup health endpoint: ❌ `https://snaptrade.faroldigital.pt/api/health/backup` returns 404

**Deployment Checklist:**

1. **Deploy updated code to production:**
   ```bash
   # Copy updated health route from snaptrade-unified to production
   sudo cp /opt/snaptrade-unified/backend/src/routes/health.ts /opt/snaptrade/backend/src/routes/health.ts

   # Ensure backup dependencies exist in production
   sudo cp -r /opt/snaptrade-unified/backend/scripts/backup-*.ts /opt/snaptrade/backend/scripts/
   ```

2. **Restart backend service:**
   ```bash
   sudo systemctl restart snaptrade-backend
   sudo systemctl status snaptrade-backend
   ```

3. **Verify endpoint works:**
   ```bash
   curl -s https://snaptrade.faroldigital.pt/api/health/backup | jq .
   # Expected: HTTP 200 with {"healthy": true, ...} or HTTP 503 if backups are stale
   ```

4. **Configure external monitoring** (choose ONE):
   - **Option A:** UptimeRobot / Pingdom (see configuration above)
   - **Option B:** Local cron monitoring (see below)

5. **Option B - Set up cron monitoring:**
   ```bash
   # Add to crontab (runs hourly at 7 minutes past the hour)
   crontab -e
   # Add: 7 * * * * /opt/snaptrade-unified/monitor-backup-health.sh
   ```

**⚠️ BLOCKING ISSUE:** Production deployment requires sudo access. Current status prevents external monitoring setup.

---

**Last Updated:** 2026-03-22
**Owner:** Platform Engineering Team
