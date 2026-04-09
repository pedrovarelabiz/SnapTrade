#!/bin/bash
# Complete production deployment script
# This script requires root access to update systemd service
# Run as: sudo ./complete-deployment.sh

set -e

echo "=== SnapTrade Listener Production Deployment ==="
echo "Started: $(date)"
echo ""

if [ "$EUID" -ne 0 ]; then
   echo "ERROR: This script must be run as root"
   echo "Please run: sudo ./complete-deployment.sh"
   exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Step 1: Update systemd service file
echo "[1/6] Installing systemd service..."
cp "$SCRIPT_DIR/snaptrade-listener.service" /etc/systemd/system/
systemctl daemon-reload

# Step 2: Stop existing service if running
echo "[2/6] Stopping existing service..."
systemctl stop snaptrade-listener.service || echo "Service not currently running"

# Step 3: Install dependencies
echo "[3/6] Installing Python dependencies..."
cd "$SCRIPT_DIR"
pip3 install -r requirements.txt --break-system-packages --quiet

# Step 4: Enable and start service
echo "[4/6] Enabling service for auto-start..."
systemctl enable snaptrade-listener.service

echo "[5/6] Starting service..."
systemctl start snaptrade-listener.service

# Step 5: Wait and verify
echo "[6/6] Verifying service status..."
sleep 5

if systemctl is-active --quiet snaptrade-listener.service; then
    echo "✓ Service is running"
    systemctl status snaptrade-listener.service --no-pager | head -15
else
    echo "✗ Service failed to start"
    systemctl status snaptrade-listener.service --no-pager
    echo ""
    echo "Recent logs:"
    journalctl -u snaptrade-listener.service -n 30 --no-pager
    exit 1
fi

echo ""
echo "=== Deployment Complete ==="
echo "Service: snaptrade-listener.service"
echo "Status: ACTIVE"
echo "User: maestro"
echo "WorkingDirectory: /opt/snaptrade-unified/listener"
echo ""
echo "Monitor with: journalctl -u snaptrade-listener.service -f"
echo "Finished: $(date)"
