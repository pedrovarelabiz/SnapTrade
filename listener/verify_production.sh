#!/bin/bash
# Production verification test for snaptrade-listener service

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METRICS_FILE="$SCRIPT_DIR/metrics.json"
SERVICE_NAME="snaptrade-listener.service"
MAX_METRICS_AGE_SECONDS=600  # 10 minutes

# Load HEALTHCHECK_PORT from .env if present
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | grep HEALTHCHECK_PORT | xargs) 2>/dev/null || true
fi
HEALTHCHECK_PORT="${HEALTHCHECK_PORT:-0}"

echo "=== Production Verification Test ==="
echo ""

# 1. Check systemd service is active
echo "1. Checking systemd service status..."
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "   ✓ Service $SERVICE_NAME is active"
else
    echo "   ✗ Service $SERVICE_NAME is NOT active"
    systemctl status "$SERVICE_NAME" --no-pager 2>&1 | head -20 || true
    exit 1
fi

# 2. Verify metrics.json exists and is recent
echo "2. Checking metrics.json..."
if [ ! -f "$METRICS_FILE" ]; then
    echo "   ✗ Metrics file not found: $METRICS_FILE"
    exit 1
fi

# Check file age (last modification time)
CURRENT_TIME=$(date +%s)
FILE_MOD_TIME=$(stat -c %Y "$METRICS_FILE" 2>/dev/null || stat -f %m "$METRICS_FILE" 2>/dev/null)
AGE_SECONDS=$((CURRENT_TIME - FILE_MOD_TIME))

if [ $AGE_SECONDS -gt $MAX_METRICS_AGE_SECONDS ]; then
    echo "   ✗ Metrics file is too old: ${AGE_SECONDS}s (max: ${MAX_METRICS_AGE_SECONDS}s)"
    exit 1
fi

echo "   ✓ Metrics file exists and is recent (${AGE_SECONDS}s old)"

# Validate JSON format
if command -v jq &> /dev/null; then
    if ! jq empty "$METRICS_FILE" 2>/dev/null; then
        echo "   ✗ Metrics file is not valid JSON"
        exit 1
    fi
    echo "   ✓ Metrics file is valid JSON"
else
    # Fallback if jq not available
    if python3 -c "import json; json.load(open('$METRICS_FILE'))" 2>/dev/null; then
        echo "   ✓ Metrics file is valid JSON"
    else
        echo "   ✗ Metrics file is not valid JSON"
        exit 1
    fi
fi

# 3. Test health endpoint (if configured)
echo "3. Checking health endpoint..."
if [ "$HEALTHCHECK_PORT" -gt 0 ]; then
    if curl -sf "http://localhost:$HEALTHCHECK_PORT/health" > /dev/null 2>&1; then
        echo "   ✓ Health endpoint responding on port $HEALTHCHECK_PORT"
    else
        echo "   ✗ Health endpoint not responding on port $HEALTHCHECK_PORT"
        exit 1
    fi
else
    echo "   ⊘ Health endpoint not configured (HEALTHCHECK_PORT=0)"
fi

# 4. Check recent logs for errors
echo "4. Checking recent logs for critical errors..."
if command -v journalctl &> /dev/null; then
    ERROR_COUNT=$(journalctl -u "$SERVICE_NAME" --since "5 minutes ago" --no-pager 2>/dev/null | grep -ci "critical\|fatal" || echo "0")

    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo "   ⚠ Found $ERROR_COUNT critical/fatal errors in last 5 minutes:"
        journalctl -u "$SERVICE_NAME" --since "5 minutes ago" --no-pager 2>/dev/null | grep -i "critical\|fatal" | tail -5
        # Don't fail on errors, just warn
    fi

    # Check if service has recent activity
    RECENT_LOGS=$(journalctl -u "$SERVICE_NAME" --since "1 minute ago" --no-pager 2>/dev/null | wc -l)
    if [ "$RECENT_LOGS" -gt 0 ]; then
        echo "   ✓ Service has recent log activity ($RECENT_LOGS lines in last minute)"
    else
        echo "   ⚠ No recent log activity in last minute"
    fi
else
    echo "   ⊘ journalctl not available, skipping log checks"
fi

# 5. Send test alert (verify module can be imported)
echo "5. Testing alert capability..."
if python3 -c "
import sys
sys.path.insert(0, '$SCRIPT_DIR')
try:
    from listener import TelegramAlerter
    import os
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN', 'test')
    chat_id = os.getenv('TELEGRAM_ALERT_CHAT_ID', 'test')
    alerter = TelegramAlerter(bot_token, chat_id)
    print('   ✓ TelegramAlerter instantiated successfully')
except Exception as e:
    print(f'   ✗ Failed to load TelegramAlerter: {e}')
    sys.exit(1)
" 2>&1; then
    :  # Success message already printed by python
else
    echo "   ✗ Alert module verification failed"
    exit 1
fi

echo ""
echo "=== All Production Verification Checks Passed ✓ ==="
exit 0
