#!/bin/bash
# Listener Health Monitoring Script
# Checks if listener process is running and heartbeat is recent
# Usage: ./monitor-listener-health.sh

set -euo pipefail

# Configuration
METRICS_FILE="/opt/snaptrade-unified/listener/metrics.json"
SERVICE_NAME="snaptrade-listener.service"
HEARTBEAT_THRESHOLD_MINUTES=10
LOG_FILE="/var/log/listener-health-monitor.log"
ALERT_EMAIL="${ALERT_EMAIL:-ops@faroldigital.pt}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

send_alert() {
    local subject="$1"
    local message="$2"

    # Log alert
    log "ALERT: $subject - $message"

    # Send email if mail command is available
    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "$subject" "$ALERT_EMAIL"
    fi

    # Could also integrate with Slack, PagerDuty, etc.
    # Example: curl -X POST -H 'Content-type: application/json' \
    #   --data "{\"text\":\"$subject: $message\"}" \
    #   "$SLACK_WEBHOOK_URL"
}

check_service_status() {
    log "Checking service status: $SERVICE_NAME"

    if ! systemctl is-active --quiet "$SERVICE_NAME"; then
        service_status=$(systemctl status "$SERVICE_NAME" --no-pager 2>&1 || true)
        send_alert "🚨 Listener Service Down" \
            "Service $SERVICE_NAME is not running!\n\nStatus:\n$service_status\n\nAction Required: Restart service immediately."

        echo -e "${RED}❌ SERVICE DOWN${NC}: $SERVICE_NAME is not active"
        return 1
    fi

    log "✅ Service is active: $SERVICE_NAME"
    return 0
}

check_heartbeat() {
    log "Checking heartbeat in $METRICS_FILE"

    if [ ! -f "$METRICS_FILE" ]; then
        send_alert "🚨 Listener Metrics Missing" \
            "Metrics file not found: $METRICS_FILE\n\nAction Required: Check listener is writing metrics."

        echo -e "${RED}❌ METRICS MISSING${NC}: $METRICS_FILE not found"
        return 1
    fi

    # Extract last_heartbeat timestamp
    last_heartbeat=$(jq -r '.last_heartbeat // empty' "$METRICS_FILE" 2>/dev/null)

    if [ -z "$last_heartbeat" ]; then
        send_alert "🚨 Listener Heartbeat Missing" \
            "No last_heartbeat field found in $METRICS_FILE\n\nAction Required: Check listener heartbeat mechanism."

        echo -e "${RED}❌ HEARTBEAT MISSING${NC}: No last_heartbeat in metrics"
        return 1
    fi

    # Calculate age of heartbeat in seconds
    current_time=$(date +%s)
    heartbeat_time=$(date -d "$last_heartbeat" +%s 2>/dev/null || echo "0")

    if [ "$heartbeat_time" = "0" ]; then
        send_alert "🚨 Listener Heartbeat Parse Error" \
            "Failed to parse heartbeat timestamp: $last_heartbeat\n\nAction Required: Check metrics.json format."

        echo -e "${RED}❌ PARSE ERROR${NC}: Invalid heartbeat format"
        return 1
    fi

    age_seconds=$((current_time - heartbeat_time))
    age_minutes=$((age_seconds / 60))
    threshold_seconds=$((HEARTBEAT_THRESHOLD_MINUTES * 60))

    log "Heartbeat age: ${age_minutes}m (${age_seconds}s), threshold: ${HEARTBEAT_THRESHOLD_MINUTES}m"

    if [ "$age_seconds" -gt "$threshold_seconds" ]; then
        send_alert "🚨 Listener Heartbeat Stale" \
            "Last heartbeat is ${age_minutes} minutes old (threshold: ${HEARTBEAT_THRESHOLD_MINUTES}m)\n\nLast heartbeat: $last_heartbeat\n\nAction Required: Listener may be frozen. Check process and restart if needed."

        echo -e "${RED}❌ STALE HEARTBEAT${NC}: ${age_minutes}m old (threshold: ${HEARTBEAT_THRESHOLD_MINUTES}m)"
        return 1
    fi

    log "✅ Heartbeat is fresh: ${age_minutes}m old ($last_heartbeat)"
    echo -e "${GREEN}✅ HEALTHY${NC}: Heartbeat ${age_minutes}m old ($last_heartbeat)"
    return 0
}

# Main execution
main() {
    log "========== Listener Health Monitor Started =========="

    service_ok=true
    heartbeat_ok=true

    if ! check_service_status; then
        service_ok=false
    fi

    if ! check_heartbeat; then
        heartbeat_ok=false
    fi

    if [ "$service_ok" = true ] && [ "$heartbeat_ok" = true ]; then
        log "========== Listener Health: HEALTHY =========="
        exit 0
    else
        log "========== Listener Health: UNHEALTHY =========="
        exit 1
    fi
}

main
