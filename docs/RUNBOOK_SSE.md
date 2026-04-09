# SSE (Server-Sent Events) Troubleshooting Runbook

## Common Issues

### Connection Rejected
**Symptoms:**
- Clients unable to establish SSE connections
- HTTP 429 (Too Many Requests) or 503 (Service Unavailable) errors
- Connection attempts timing out

**Likely Causes:**
- Connection limit reached (per user or global)
- Server overloaded or unhealthy
- Load balancer timeout configuration
- Authentication/authorization failures

### Stale Connections
**Symptoms:**
- Connections remain open but no data flows
- Clients not receiving events
- Memory usage gradually increasing
- Connection count not decreasing after client disconnects

**Likely Causes:**
- Cleanup timer not running or failing
- Network issues preventing proper TCP FIN/RST
- Client not properly closing connections
- Keep-alive mechanism failing

### High Disconnect Rate
**Symptoms:**
- Frequent connection churn
- Clients repeatedly reconnecting
- Increased error logs
- Degraded client experience

**Likely Causes:**
- Load balancer idle timeout too aggressive
- Server restarting frequently
- Network instability
- Application errors forcing disconnects
- Keep-alive intervals misconfigured

## Metrics to Check

### Connection Metrics
```promql
# Current active SSE connections
sse_active_connections{service="snaptrade-unified"}

# Connection rate (new connections per second)
rate(sse_connections_total{service="snaptrade-unified"}[5m])

# Disconnect rate
rate(sse_disconnections_total{service="snaptrade-unified"}[5m])

# Connection rejections
rate(sse_connection_rejections_total{service="snaptrade-unified"}[5m])
```

### Performance Metrics
```promql
# Average connection duration
histogram_quantile(0.5, rate(sse_connection_duration_seconds_bucket[5m]))

# Event send rate
rate(sse_events_sent_total{service="snaptrade-unified"}[5m])

# Event send errors
rate(sse_event_send_errors_total{service="snaptrade-unified"}[5m])

# Memory usage by SSE connections
process_resident_memory_bytes{service="snaptrade-unified"} - process_resident_memory_bytes{service="snaptrade-unified"} offset 1h
```

### Health Metrics
```promql
# Cleanup timer execution
rate(sse_cleanup_runs_total{service="snaptrade-unified"}[5m])

# Stale connections cleaned up
rate(sse_stale_connections_cleaned_total{service="snaptrade-unified"}[5m])

# Connection pool saturation (if applicable)
sse_active_connections / sse_max_connections * 100
```

## Resolution Steps

### Restart Cleanup Timer
If stale connections are accumulating:

```bash
# Check cleanup timer status
curl -X GET http://localhost:8080/internal/sse/cleanup/status

# Manually trigger cleanup
curl -X POST http://localhost:8080/internal/sse/cleanup/trigger

# Restart cleanup timer (if supported)
curl -X POST http://localhost:8080/internal/sse/cleanup/restart
```

### Check Logs
Review application logs for SSE-related errors:

```bash
# Recent SSE errors
kubectl logs -l app=snaptrade-unified --tail=1000 | grep -i "sse\|server-sent"

# Connection failures
kubectl logs -l app=snaptrade-unified --tail=1000 | grep -E "connection.*(reject|fail|refuse)"

# Cleanup issues
kubectl logs -l app=snaptrade-unified --tail=1000 | grep -i "cleanup\|stale"

# Follow logs in real-time
kubectl logs -l app=snaptrade-unified -f | grep -i sse
```

### Scale Limits
Adjust connection limits if legitimate traffic is being rejected:

**Configuration (environment variables):**
```bash
# Maximum connections per user
SSE_MAX_CONNECTIONS_PER_USER=5

# Global maximum connections
SSE_MAX_GLOBAL_CONNECTIONS=10000

# Stale connection timeout (seconds)
SSE_STALE_CONNECTION_TIMEOUT=300

# Cleanup interval (seconds)
SSE_CLEANUP_INTERVAL=60
```

**Apply changes:**
```bash
# Update ConfigMap or deployment
kubectl edit deployment snaptrade-unified

# Restart pods to apply new limits
kubectl rollout restart deployment/snaptrade-unified

# Monitor rollout
kubectl rollout status deployment/snaptrade-unified
```

### Network Configuration
Ensure load balancer and proxy timeouts accommodate SSE:

```bash
# Check current ingress timeout settings
kubectl get ingress snaptrade-unified -o yaml | grep timeout

# Update ingress annotations (example for nginx)
kubectl annotate ingress snaptrade-unified \
  nginx.ingress.kubernetes.io/proxy-read-timeout="3600" \
  nginx.ingress.kubernetes.io/proxy-send-timeout="3600" \
  --overwrite
```

## Emergency Procedures

### Force Disconnect All Connections
Use when immediate connection reset is required (e.g., configuration bug, memory leak):

```bash
# Gracefully close all SSE connections
curl -X POST http://localhost:8080/internal/sse/disconnect-all

# Verify connections are closing
watch -n 1 'curl -s http://localhost:8080/metrics | grep sse_active_connections'

# If graceful shutdown fails, force pod restart
kubectl delete pod -l app=snaptrade-unified
```

### Restart Server
Full service restart procedure:

```bash
# 1. Check current health
kubectl get pods -l app=snaptrade-unified
curl http://snaptrade-unified:8080/health

# 2. Perform rolling restart
kubectl rollout restart deployment/snaptrade-unified

# 3. Monitor restart progress
kubectl rollout status deployment/snaptrade-unified
watch kubectl get pods -l app=snaptrade-unified

# 4. Verify service recovery
# Check pod logs
kubectl logs -l app=snaptrade-unified --tail=50

# Check metrics
curl http://snaptrade-unified:8080/metrics | grep sse_

# Test SSE connection
curl -N -H "Accept: text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  http://snaptrade-unified:8080/api/v1/events
```

### Emergency Scale Down/Up
If server is overwhelmed:

```bash
# Temporary scale down to reduce load
kubectl scale deployment snaptrade-unified --replicas=2

# Wait for pods to stabilize
sleep 30

# Scale back up
kubectl scale deployment snaptrade-unified --replicas=5

# Or use HPA if configured
kubectl autoscale deployment snaptrade-unified \
  --min=3 --max=10 --cpu-percent=70
```

## Incident Response Checklist

- [ ] Identify affected users/connections
- [ ] Check metrics dashboard for anomalies
- [ ] Review recent deployments/changes
- [ ] Check application logs for errors
- [ ] Verify infrastructure health (nodes, network)
- [ ] Attempt cleanup timer restart
- [ ] Scale resources if needed
- [ ] Consider rolling restart if issue persists
- [ ] Document findings and resolution
- [ ] Create post-incident review ticket

## Post-Incident Actions

1. **Analyze root cause** - Review logs, metrics, and timeline
2. **Update monitoring** - Add alerts for similar patterns
3. **Adjust thresholds** - Update connection limits if needed
4. **Improve documentation** - Add specific scenario to this runbook
5. **Code fixes** - Create tickets for any bugs discovered

## Contact

For escalation or additional support:
- **On-call engineer:** PagerDuty rotation
- **Team channel:** #snaptrade-backend
- **Documentation:** `/opt/snaptrade-unified/docs/`
