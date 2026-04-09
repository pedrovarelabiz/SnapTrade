#!/bin/bash
set -e

# Test backup script disk space detection
echo "=== Testing Backup Script - Insufficient Disk Space ==="
echo ""

# Create a small tmpfs mount (1GB) to simulate low disk space
TEST_MOUNT="/tmp/test-backup-low-space"
echo "1. Creating test mount with 1GB capacity..."
sudo mkdir -p "$TEST_MOUNT"
sudo mount -t tmpfs -o size=1G tmpfs "$TEST_MOUNT"
sudo chmod 777 "$TEST_MOUNT"
echo "   ✓ Created tmpfs mount at $TEST_MOUNT with 1GB capacity"
echo ""

# Check available space (should be ~1GB, less than the 5GB required)
echo "2. Checking available disk space..."
df -h "$TEST_MOUNT"
echo ""

# Set environment variables for the test
export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-5432}"
export DB_NAME="${DB_NAME:-testdb}"
export DB_USER="${DB_USER:-testuser}"
export DB_PASSWORD="${DB_PASSWORD:-testpass}"
export BACKUP_DIR="$TEST_MOUNT"
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-test-key-32-characters-long!!!}"

echo "3. Running backup script (should fail with disk space error)..."
echo ""

# Run the backup script and capture the exit code
cd /opt/snaptrade-unified/backend
if npx ts-node scripts/db-backup.ts 2>&1; then
    EXIT_CODE=$?
    echo ""
    echo "✗ TEST FAILED: Backup script should have failed but succeeded"
    RESULT="FAIL"
else
    EXIT_CODE=$?
    echo ""
    echo "✓ TEST PASSED: Backup script failed as expected (exit code: $EXIT_CODE)"
    RESULT="PASS"
fi

echo ""
echo "4. Checking for partial backup files..."
FILES_LEFT=$(ls -la "$TEST_MOUNT" 2>/dev/null || true)
if [ -n "$(echo "$FILES_LEFT" | grep -E '\.(dump|enc)$')" ]; then
    echo "✗ WARNING: Partial backup files found:"
    echo "$FILES_LEFT"
else
    echo "✓ No partial backup files left behind"
fi

echo ""
echo "5. Cleaning up test mount..."
sudo umount "$TEST_MOUNT"
sudo rmdir "$TEST_MOUNT"
echo "   ✓ Test mount cleaned up"

echo ""
echo "=== Test Complete ==="
echo "Result: $RESULT"
echo ""

if [ "$RESULT" = "FAIL" ]; then
    exit 1
fi
