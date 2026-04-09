#!/bin/bash
# Final production deployment script
# This updates the system service to point to the correct location
# Run with: sudo bash final-production-deploy.sh

set -e

echo "=== Final Production Deployment ==="
echo "Started: $(date)"
echo ""

if [ "$EUID" -ne 0 ]; then
   echo "ERROR: This script must be run with sudo"
   echo "Please run: sudo bash final-production-deploy.sh"
   exit 1
fi

LISTENER_DIR="/opt/snaptrade-unified/listener"

# Step 1: Update systemd service file
echo "[1/5] Installing updated systemd service..."
cp "$LISTENER_DIR/snaptrade-listener.service" /etc/systemd/system/
systemctl daemon-reload

# Step 2: Stop existing service if running
echo "[2/5] Stopping old service..."
systemctl stop snaptrade-listener.service || echo "Service not currently running"

# Step 3: Enable and start service
echo "[3/5] Enabling service for auto-start..."
systemctl enable snaptrade-listener.service

echo "[4/5] Starting service..."
systemctl start snaptrade-listener.service

# Step 5: Wait and verify
echo "[5/5] Verifying service status..."
sleep 5

if systemctl is-active --quiet snaptrade-listener.service; then
    echo "✓ Service is running"
    systemctl status snaptrade-listener.service --no-pager | head -15
else
    echo "⚠ Service state check (may be restarting due to credentials)"
    systemctl status snaptrade-listener.service --no-pager | head -15
fi

echo ""
echo "=== Deployment Complete ==="
echo "Service: snaptrade-listener.service"
echo "User: maestro"
echo "WorkingDirectory: /opt/snaptrade-unified/listener"
echo "Restart Policy: Restart=always, RestartSec=10"
echo ""
echo "Monitor with: journalctl -u snaptrade-listener.service -f"
echo "Finished: $(date)"
