#!/bin/bash
set -e

# VPS Deployment Script for Listener Service
# Includes smoke tests, healthcheck verification, and rollback capability

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="/tmp/listener_backup_$(date +%Y%m%d_%H%M%S)"

echo "=== Starting Listener Deployment ==="

# Backup current version for rollback
echo "Creating backup at $BACKUP_DIR..."
mkdir -p "$BACKUP_DIR"
cp -r "$PROJECT_DIR/listener" "$BACKUP_DIR/" 2>/dev/null || echo "No existing listener to backup"

# Deploy listener code
echo "Deploying listener code..."
cd "$PROJECT_DIR/listener"

# Install/update dependencies
pip install -r requirements.txt

# Restart listener service
echo "Restarting listener service..."
sudo systemctl restart snaptrade-listener || {
    echo "Failed to restart service, attempting rollback..."
    if [ -d "$BACKUP_DIR/listener" ]; then
        cp -r "$BACKUP_DIR/listener/"* "$PROJECT_DIR/listener/"
        sudo systemctl restart snaptrade-listener
    fi
    exit 1
}

# Wait for service to start
sleep 5

# Run smoke tests
echo "Running smoke tests..."
cd "$PROJECT_DIR"
python3 -m pytest tests/test_smoke.py -v || {
    echo "ERROR: Smoke tests failed! Rolling back deployment..."
    if [ -d "$BACKUP_DIR/listener" ]; then
        cp -r "$BACKUP_DIR/listener/"* "$PROJECT_DIR/listener/"
        sudo systemctl restart snaptrade-listener
        echo "Rollback complete. Service restored to previous version."
    fi
    exit 1
}

# Healthcheck: Verify matching_stats endpoint
echo "Verifying matching_stats endpoint..."
HEALTHCHECK_URL="http://localhost:5000/matching_stats"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTHCHECK_URL" || echo "000")

if [ "$RESPONSE" != "200" ]; then
    echo "ERROR: Healthcheck failed! matching_stats endpoint returned $RESPONSE"
    echo "Rolling back deployment..."
    if [ -d "$BACKUP_DIR/listener" ]; then
        cp -r "$BACKUP_DIR/listener/"* "$PROJECT_DIR/listener/"
        sudo systemctl restart snaptrade-listener
        echo "Rollback complete. Service restored to previous version."
    fi
    exit 1
fi

echo "Healthcheck passed: matching_stats endpoint is responding"

# Cleanup backup on success
echo "Deployment successful! Cleaning up backup..."
rm -rf "$BACKUP_DIR"

echo "=== Deployment Complete ==="
