#!/bin/bash
#
# Setup and Test Backup Status Tracking
# This script must be run with sudo or as root to create /var/backups/snaptrade
#

set -e

BACKUP_ROOT="/var/backups/snaptrade"
BACKUP_USER="snaptrade"
BACKUP_GROUP="snaptrade"
STATUS_FILE="$BACKUP_ROOT/status/last-backup-status.json"

echo "=== Backup Status Test Setup and Execution ==="
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ] && [ -z "$SUDO_USER" ]; then
  echo "This script requires root privileges to create /var/backups/snaptrade"
  echo "Please run: sudo bash $0"
  exit 1
fi

# Create directory structure
echo "Creating backup directory structure at $BACKUP_ROOT..."
mkdir -p "$BACKUP_ROOT"/{temp,logs,status}

# Set ownership to snaptrade user
echo "Setting ownership to $BACKUP_USER:$BACKUP_GROUP..."
chown -R "$BACKUP_USER:$BACKUP_GROUP" "$BACKUP_ROOT"

# Set permissions (750 for directories)
chmod 750 "$BACKUP_ROOT"
chmod 750 "$BACKUP_ROOT"/{temp,logs,status}

echo "✓ Directory structure created successfully"
echo ""
ls -ld "$BACKUP_ROOT"
ls -l "$BACKUP_ROOT/"
echo ""

# Run the test as snaptrade user
echo "Running backup status test as $BACKUP_USER user..."
echo ""

su -s /bin/bash - "$BACKUP_USER" <<'EOF'
cd /opt/snaptrade-unified/backend/scripts
npx ts-node test-backup-status.ts
EOF

echo ""
echo "=== Final Verification ==="
echo ""

# Verify the JSON file exists and is readable
if test -f "$STATUS_FILE"; then
  echo "✓ Status file exists at: $STATUS_FILE"
  echo ""
  echo "File permissions:"
  ls -l "$STATUS_FILE"
  echo ""
  echo "File contents:"
  cat "$STATUS_FILE" | jq .
  echo ""
  echo "✓ All tests completed successfully!"
else
  echo "✗ Status file not found at: $STATUS_FILE"
  exit 1
fi
