#!/bin/bash
#
# Setup Backup Directory Structure
#
# Creates /var/backups/snaptrade with required subdirectories,
# sets ownership to snaptrade user, and configures permissions.
#

set -e

# Configuration
BACKUP_ROOT="/var/backups/snaptrade"
BACKUP_USER="snaptrade"
BACKUP_GROUP="snaptrade"
DIR_PERMISSIONS="750"

echo "Setting up backup directory structure at $BACKUP_ROOT..."

# Create main backup directory and subdirectories
sudo mkdir -p "$BACKUP_ROOT"/{temp,logs,status}

# Set ownership to backend service user
sudo chown -R "$BACKUP_USER:$BACKUP_GROUP" "$BACKUP_ROOT"

# Set permissions
sudo chmod "$DIR_PERMISSIONS" "$BACKUP_ROOT"
sudo chmod "$DIR_PERMISSIONS" "$BACKUP_ROOT"/{temp,logs,status}

echo "Backup directory structure created successfully!"
echo ""
echo "Verification:"
ls -ld "$BACKUP_ROOT"
ls -l "$BACKUP_ROOT/"

echo ""
echo "Directory structure:"
echo "  $BACKUP_ROOT/temp/   - Temporary dump files"
echo "  $BACKUP_ROOT/logs/   - Backup operation logs"
echo "  $BACKUP_ROOT/status/ - Backup status JSON files"
