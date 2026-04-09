#!/bin/bash
# Network failure test for Telegram listener
# Tests auto-reconnection after simulated network outage

set -e

TELEGRAM_API="api.telegram.org"
WAIT_DISCONNECT=10
WAIT_RECONNECT=30
LISTENER_LOG="listener/logs/listener.log"

echo "=== Network Failure Test ==="
echo "This script requires sudo to modify iptables"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run with sudo"
    exit 1
fi

# Function to cleanup on exit
cleanup() {
    echo "Cleaning up iptables rules..."
    iptables -D OUTPUT -d "$TELEGRAM_API" -j REJECT 2>/dev/null || true
    echo "Cleanup complete"
}
trap cleanup EXIT

# Get initial connection state
echo "Step 1: Checking initial listener state..."
if pgrep -f "listener" > /dev/null; then
    echo "✓ Listener process is running"
else
    echo "✗ Listener is not running - start it first"
    exit 1
fi

# Block Telegram API
echo "Step 2: Blocking Telegram API ($TELEGRAM_API)..."
iptables -I OUTPUT -d "$TELEGRAM_API" -j REJECT
echo "✓ Network blocked via iptables"

# Wait during disconnection
echo "Step 3: Waiting ${WAIT_DISCONNECT}s with blocked network..."
sleep "$WAIT_DISCONNECT"

# Restore connection
echo "Step 4: Restoring network connection..."
iptables -D OUTPUT -d "$TELEGRAM_API" -j REJECT
echo "✓ Network restored"

# Monitor for reconnection
echo "Step 5: Monitoring for auto-reconnection (${WAIT_RECONNECT}s timeout)..."
START_TIME=$(date +%s)
RECONNECTED=false

while [ $(($(date +%s) - START_TIME)) -lt "$WAIT_RECONNECT" ]; do
    # Check for reconnection indicators in logs or process state
    if [ -f "$LISTENER_LOG" ]; then
        if tail -n 20 "$LISTENER_LOG" | grep -qi "connect\|ready\|started" 2>/dev/null; then
            RECONNECTED=true
            break
        fi
    fi

    # Alternative: check if listener process is still healthy
    if pgrep -f "listener" > /dev/null; then
        sleep 1
    else
        echo "✗ Listener process died"
        exit 1
    fi
done

ELAPSED=$(($(date +%s) - START_TIME))

# Report results
echo ""
echo "=== Test Results ==="
if [ "$RECONNECTED" = true ]; then
    echo "✓ SUCCESS: Listener reconnected within ${ELAPSED}s"
    exit 0
else
    echo "✗ TIMEOUT: No reconnection detected within ${WAIT_RECONNECT}s"
    echo "  Check logs at: $LISTENER_LOG"
    exit 1
fi
