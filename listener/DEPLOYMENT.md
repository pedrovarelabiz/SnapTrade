# Deployment Guide

This guide covers deploying the listener service to production with proper crash recovery, monitoring, and alerting.

## Prerequisites

- Python 3.8+
- systemd (for service management)
- Prometheus/Grafana (for monitoring)
- Access to production environment

## Basic Deployment

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Configure environment variables (see `.env.example`)

3. Test the service locally before deploying

## Crash Recovery with systemd

### systemd Service Configuration

Create a systemd service unit at `/etc/systemd/system/listener.service`:

```ini
[Unit]
Description=Signal Listener Service
After=network.target
Documentation=file:///opt/snaptrade-unified/listener/README.md

[Service]
Type=simple
User=maestro
Group=maestro
WorkingDirectory=/opt/snaptrade-unified/listener
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/opt/snaptrade-unified/listener/.env
ExecStart=/usr/bin/python3 /opt/snaptrade-unified/listener/listener.py
Restart=always
RestartSec=10
StartLimitInterval=300
StartLimitBurst=5

# Crash recovery settings
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30

# Resource limits
LimitNOFILE=65536
MemoryLimit=2G

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=listener

[Install]
WantedBy=multi-user.target
```

**Key auto-restart parameters:**
- `Restart=always`: Always restart the service on any exit (crash or clean shutdown)
- `RestartSec=10`: Wait 10 seconds between restart attempts
- `StartLimitInterval=300`: Track restart rate over 5-minute windows
- `StartLimitBurst=5`: Allow max 5 restarts within the interval before giving up

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable listener.service
sudo systemctl start listener.service
```

### Monitoring Setup

**1. Service Health Monitoring**

Monitor systemd service status with Prometheus `node_exporter` and `systemd_exporter`:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'listener-systemd'
    static_configs:
      - targets: ['localhost:9100']  # node_exporter
      - targets: ['localhost:9558']  # systemd_exporter
```

**2. Application Metrics**

The listener exposes metrics at `/metrics` endpoint (see `METRICS.md`). Key metrics to monitor:
- `listener_uptime_seconds`: Service uptime
- `listener_crashes_total`: Total crash count
- `listener_messages_processed`: Message processing rate
- `listener_reconnections_total`: Reconnection attempts

**3. Log Monitoring**

Monitor systemd journal logs:
```bash
# Real-time monitoring
journalctl -u listener.service -f

# Check for crashes in last hour
journalctl -u listener.service --since "1 hour ago" | grep -i "crash\|error\|exception"
```

### Alert Configuration

Configure Prometheus alerts for crash recovery issues:

```yaml
# alerts/listener.yml
groups:
  - name: listener_crash_recovery
    interval: 30s
    rules:
      - alert: ListenerServiceDown
        expr: up{job="listener"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Listener service is down"
          description: "Service has been down for 2+ minutes. Check systemd status."

      - alert: ListenerFrequentRestarts
        expr: rate(listener_crashes_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Listener restarting frequently"
          description: "Service is restarting more than once per 10 minutes. Check logs for root cause."

      - alert: ListenerRestartLimitReached
        expr: systemd_unit_state{name="listener.service",state="failed"} == 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Listener restart limit exceeded"
          description: "Service failed too many times and systemd gave up. Manual intervention required."

      - alert: ListenerHighMemory
        expr: process_resident_memory_bytes{job="listener"} > 1.8e9
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Listener memory usage high"
          description: "Memory usage exceeds 1.8GB. Potential memory leak."
```

### Verifying Crash Recovery in Production

**1. Manual Crash Test**

Simulate a crash and verify auto-restart:
```bash
# Kill the process
sudo systemctl kill -s SIGKILL listener.service

# Wait 15 seconds
sleep 15

# Verify it auto-restarted
sudo systemctl status listener.service
# Should show "Active: active (running)" with recent start time

# Check restart count
journalctl -u listener.service | grep -c "Started Signal Listener Service"
```

**2. Automated Health Check**

Create a monitoring script at `/opt/snaptrade-unified/listener/verify_crash_recovery.sh`:

```bash
#!/bin/bash
# Verify crash recovery is working

echo "Testing crash recovery..."

# Get initial uptime
INITIAL_UPTIME=$(curl -s http://localhost:8080/metrics | grep listener_uptime_seconds | awk '{print $2}')

# Trigger crash
sudo systemctl kill -s SIGKILL listener.service

# Wait for restart
sleep 15

# Check if service is running
if systemctl is-active --quiet listener.service; then
    NEW_UPTIME=$(curl -s http://localhost:8080/metrics | grep listener_uptime_seconds | awk '{print $2}')
    if (( $(echo "$NEW_UPTIME < $INITIAL_UPTIME" | bc -l) )); then
        echo "✓ Crash recovery working: Service auto-restarted"
        exit 0
    else
        echo "✗ Issue: Uptime didn't reset"
        exit 1
    fi
else
    echo "✗ Crash recovery failed: Service not running"
    exit 1
fi
```

**3. Production Verification Checklist**

- [ ] Verify systemd service is enabled: `systemctl is-enabled listener.service`
- [ ] Check service status: `systemctl status listener.service`
- [ ] Verify restart policy: `systemctl show listener.service | grep Restart`
- [ ] Test manual restart: `sudo systemctl restart listener.service`
- [ ] Confirm metrics endpoint responding: `curl http://localhost:8080/metrics`
- [ ] Verify SENTRY_DSN_* set in environment: `systemctl show listener.service -p Environment | grep SENTRY_DSN`
- [ ] Test error capture post-deployment: Trigger test error and verify in Sentry dashboard
- [ ] Verify release tracking shows new version: Check Sentry releases for deployed version
- [ ] Check error rate doesn't spike after deploy: Monitor Sentry error rate for 15-30 minutes
- [ ] Check Prometheus is scraping: Query `up{job="listener"}` should return 1
- [ ] Verify alerts are loaded: Check Prometheus UI for listener alerts
- [ ] Test alert delivery: Trigger a test alert via Alertmanager
- [ ] Review crash recovery logs: `journalctl -u listener.service --since today`
- [ ] Monitor for 24h: Ensure no unexpected restarts

**4. Continuous Monitoring**

Add to cron for daily verification:
```bash
# Check crash recovery capability daily
0 2 * * * /opt/snaptrade-unified/listener/verify_crash_recovery.sh >> /var/log/listener-recovery-test.log 2>&1
```

## Rollback Procedure

If deployment fails:
```bash
sudo systemctl stop listener.service
# Restore previous version
sudo systemctl start listener.service
```

## See Also

- [CRASH_RECOVERY_RUNBOOK.md](./CRASH_RECOVERY_RUNBOOK.md) - Incident response procedures
- [ALERTING_SETUP.md](./ALERTING_SETUP.md) - Alert configuration details
- [METRICS.md](./METRICS.md) - Available metrics documentation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
