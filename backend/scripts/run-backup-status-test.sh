#!/bin/bash
#
# Run backup status test as snaptrade user
# This script sets up the backup directories and runs the status tracking test
#

set -e

BACKUP_ROOT="/var/backups/snaptrade"
TEST_SCRIPT="/opt/snaptrade-unified/backend/scripts/test-backup-status.ts"

echo "=== Backup Status Test Setup ==="
echo ""

# Create directory structure
echo "Creating backup directory structure..."
mkdir -p "$BACKUP_ROOT"/{temp,logs,status}

# Set permissions
chmod 755 "$BACKUP_ROOT"
chmod 755 "$BACKUP_ROOT"/{temp,logs,status}

echo "Directory structure created:"
ls -ld "$BACKUP_ROOT"
ls -l "$BACKUP_ROOT/"
echo ""

# Run the test
echo "Running backup status test..."
cd /opt/snaptrade-unified/backend/scripts
npx ts-node "$TEST_SCRIPT"

echo ""
echo "=== Test Complete ==="
echo ""
echo "Verifying JSON file..."
test -f /var/backups/snaptrade/status/last-backup-status.json && cat /var/backups/snaptrade/status/last-backup-status.json | jq .
