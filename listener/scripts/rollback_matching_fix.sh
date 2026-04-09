#!/bin/bash
set -euo pipefail

# Deployment Rollback Script - D3 Matching Fix
# This script rolls back the enhanced matching logic to legacy implementation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LISTENER_DIR="/opt/snaptrade-unified/listener"
SERVICE_NAME="listener"
HEALTH_ENDPOINT="${HEALTH_ENDPOINT:-http://localhost:8080/health}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
MAX_HEALTH_RETRIES=30
HEALTH_RETRY_DELAY=2
DRY_RUN=false

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

send_slack_alert() {
    local message="$1"
    local status="${2:-warning}"

    if [[ -z "$SLACK_WEBHOOK" ]]; then
        log "SLACK_WEBHOOK not set, skipping Slack notification"
        return 0
    fi

    local color="warning"
    [[ "$status" == "success" ]] && color="good"
    [[ "$status" == "error" ]] && color="danger"

    local payload=$(cat <<EOF
{
    "attachments": [{
        "color": "$color",
        "title": "Listener Rollback Alert",
        "text": "$message",
        "footer": "Deployment Rollback Script",
        "ts": $(date +%s)
    }]
}
EOF
)

    curl -X POST -H 'Content-type: application/json' \
        --data "$payload" \
        "$SLACK_WEBHOOK" 2>/dev/null || log "Failed to send Slack alert"
}

rollback_matching_logic() {
    log "Step 1: Aliasing find_matching_signal to find_matching_signal_legacy"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would create alias file mapping find_matching_signal -> find_matching_signal_legacy"
        log "[DRY RUN] Would create file at $LISTENER_DIR/src/matching_rollback.py"
        return 0
    fi

    # Create Python alias file to map find_matching_signal to find_matching_signal_legacy
    local alias_file="$LISTENER_DIR/src/matching_rollback.py"
    cat > "$alias_file" <<'PYEOF'
"""
Rollback alias for D3 matching fix
Maps find_matching_signal to find_matching_signal_legacy
"""
from listener.matching.legacy import find_matching_signal as find_matching_signal_legacy

# Alias for rollback - enhanced matching reverted to legacy
find_matching_signal = find_matching_signal_legacy
PYEOF

    log "Created alias file at $alias_file"
    log "find_matching_signal now points to find_matching_signal_legacy"
}

restart_service() {
    log "Step 2: Restarting listener service"

    if [[ "$DRY_RUN" == "true" ]]; then
        if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
            log "[DRY RUN] Would run: sudo systemctl restart $SERVICE_NAME"
        elif [[ -f "$LISTENER_DIR/restart.sh" ]]; then
            log "[DRY RUN] Would run: bash $LISTENER_DIR/restart.sh"
        else
            log "[DRY RUN] Would fail: no systemctl or restart script found"
        fi
        log "[DRY RUN] Would sleep 5 seconds after restart"
        return 0
    fi

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        sudo systemctl restart "$SERVICE_NAME"
        log "Service $SERVICE_NAME restarted successfully"
    elif [[ -f "$LISTENER_DIR/restart.sh" ]]; then
        bash "$LISTENER_DIR/restart.sh"
        log "Service restarted using restart.sh script"
    else
        error "Unable to restart service - no systemctl or restart script found"
        return 1
    fi

    sleep 5
}

verify_health() {
    log "Step 3: Verifying health endpoint"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would check health endpoint: $HEALTH_ENDPOINT"
        log "[DRY RUN] Would retry up to $MAX_HEALTH_RETRIES times with ${HEALTH_RETRY_DELAY}s delay"
        return 0
    fi

    local retries=0
    while [[ $retries -lt $MAX_HEALTH_RETRIES ]]; do
        if curl -f -s -o /dev/null "$HEALTH_ENDPOINT"; then
            log "Health check passed - service is responding"
            return 0
        fi

        retries=$((retries + 1))
        log "Health check attempt $retries/$MAX_HEALTH_RETRIES failed, retrying in ${HEALTH_RETRY_DELAY}s..."
        sleep $HEALTH_RETRY_DELAY
    done

    error "Health check failed after $MAX_HEALTH_RETRIES attempts"
    return 1
}

main() {
    # Parse command line arguments
    for arg in "$@"; do
        case "$arg" in
            --dry-run)
                DRY_RUN=true
                ;;
        esac
    done

    if [[ "$DRY_RUN" == "true" ]]; then
        log "========================================"
        log "DRY RUN MODE - No changes will be made"
        log "========================================"
    fi

    log "Starting rollback of D3 matching fix"
    log "This will revert find_matching_signal to find_matching_signal_legacy"

    # Step 1: Rollback matching logic
    if ! rollback_matching_logic; then
        error "Failed to rollback matching logic"
        [[ "$DRY_RUN" == "false" ]] && send_slack_alert "❌ Rollback FAILED: Unable to configure legacy matching" "error"
        exit 1
    fi

    # Step 2: Restart service
    if ! restart_service; then
        error "Failed to restart service"
        [[ "$DRY_RUN" == "false" ]] && send_slack_alert "❌ Rollback FAILED: Service restart failed" "error"
        exit 1
    fi

    # Step 3: Verify health
    if ! verify_health; then
        error "Health check failed after rollback"
        [[ "$DRY_RUN" == "false" ]] && send_slack_alert "❌ Rollback FAILED: Service health check failed after restart" "error"
        exit 1
    fi

    # Step 4: Send success alert
    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would send Slack success notification"
        log "========================================"
        log "DRY RUN COMPLETE - No changes were made"
        log "========================================"
    else
        log "Rollback completed successfully"
        send_slack_alert "✅ Rollback SUCCESSFUL: Listener reverted to find_matching_signal_legacy. Service is healthy." "success"
    fi

    log "Rollback complete - listener is now using legacy matching logic"
}

main "$@"
