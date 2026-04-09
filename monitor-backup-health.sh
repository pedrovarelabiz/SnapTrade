#!/bin/bash
# Backup Health Monitoring Script
# Checks /api/health/backup endpoint and alerts if unhealthy
# Usage: ./monitor-backup-health.sh

set -euo pipefail

# Configuration
API_URL="https://snaptrade.faroldigital.pt/api/health/backup"
ALERT_THRESHOLD_HOURS=25
LOG_FILE="/var/log/backup-health-monitor.log"
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

check_backup_health() {
    log "Checking backup health at $API_URL"

    # Make request and capture both response and status code
    response=$(curl -s -w "\n%{http_code}" "$API_URL" 2>&1) || {
        send_alert "⚠️ Backup Health Check Failed" "Failed to connect to backup health endpoint: $API_URL"
        return 1
    }

    # Extract status code and body
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    log "HTTP Status: $http_code"
    log "Response: $body"

    # Check if status is 503 (unhealthy)
    if [ "$http_code" = "503" ]; then
        # Parse response to get details
        message=$(echo "$body" | jq -r '.message // "Backup system unhealthy"' 2>/dev/null || echo "Backup system unhealthy")
        last_backup_age=$(echo "$body" | jq -r '.lastBackup.hoursSinceBackup // "unknown"' 2>/dev/null || echo "unknown")

        send_alert "🚨 Backup System Unhealthy (HTTP 503)" \
            "Backup health check failed!\n\nStatus: $http_code\nMessage: $message\nHours since last backup: $last_backup_age\n\nURL: $API_URL\n\nAction Required: Investigate backup system immediately."

        echo -e "${RED}❌ UNHEALTHY${NC}: $message (Age: $last_backup_age hours)"
        return 1

    elif [ "$http_code" = "200" ]; then
        # Parse healthy response
        last_backup_age=$(echo "$body" | jq -r '.lastBackup.hoursSinceBackup // 0' 2>/dev/null || echo "0")
        last_backup_time=$(echo "$body" | jq -r '.lastBackup.timestamp // "unknown"' 2>/dev/null || echo "unknown")

        # Check if age exceeds threshold
        if (( $(echo "$last_backup_age > $ALERT_THRESHOLD_HOURS" | bc -l) )); then
            send_alert "⚠️ Backup Age Exceeds Threshold" \
                "Last backup is ${last_backup_age} hours old (threshold: ${ALERT_THRESHOLD_HOURS}h)\n\nLast backup: $last_backup_time\n\nURL: $API_URL"

            echo -e "${YELLOW}⚠️  WARNING${NC}: Backup age (${last_backup_age}h) exceeds threshold (${ALERT_THRESHOLD_HOURS}h)"
            return 1
        fi

        log "✅ Backup system healthy (Age: ${last_backup_age}h, Last: $last_backup_time)"
        echo -e "${GREEN}✅ HEALTHY${NC}: Last backup ${last_backup_age}h ago ($last_backup_time)"
        return 0

    else
        send_alert "⚠️ Unexpected Backup Health Response" \
            "Received unexpected HTTP status: $http_code\n\nResponse: $body\n\nURL: $API_URL"

        echo -e "${RED}❌ UNEXPECTED STATUS${NC}: HTTP $http_code"
        return 1
    fi
}

# Main execution
main() {
    log "========== Backup Health Monitor Started =========="

    if check_backup_health; then
        exit 0
    else
        exit 1
    fi
}

main
