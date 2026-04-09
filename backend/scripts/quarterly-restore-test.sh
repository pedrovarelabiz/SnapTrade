#!/bin/bash
# Quarterly Backup Restore Test - Automated comprehensive validation
# Runs: First week of Jan, Apr, Jul, Oct
# Purpose: Verify full backup restore capability and data integrity

set -euo pipefail

# Configuration
BACKUP_BUCKET="s3://snaptrade-backups/postgres/"
TEMP_DB_NAME="snaptrade_restore_test_$(date +%Y%m%d_%H%M%S)"
TEMP_DB_PORT=5433
TEMP_DB_DIR="/tmp/postgres_restore_test"
REPORT_FILE="/tmp/quarterly_restore_test_report_$(date +%Y%m%d).txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$REPORT_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$REPORT_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$REPORT_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$REPORT_FILE"
}

cleanup() {
    log "Cleaning up test instance..."
    if [ -n "${TEMP_PG_PID:-}" ] && kill -0 "$TEMP_PG_PID" 2>/dev/null; then
        pg_ctl -D "$TEMP_DB_DIR" stop -m fast || true
    fi
    rm -rf "$TEMP_DB_DIR"
    rm -f /tmp/latest_backup.sql.gz
    log "Cleanup completed"
}

trap cleanup EXIT

# Start test report
log "========================================="
log "Quarterly Backup Restore Test Started"
log "========================================="

# Step 1: Identify latest backup
log "Step 1: Identifying latest backup..."
LATEST_BACKUP=$(aws s3 ls "$BACKUP_BUCKET" --recursive | sort | tail -1 | awk '{print $4}')
if [ -z "$LATEST_BACKUP" ]; then
    error "No backup found in S3 bucket"
    exit 1
fi
BACKUP_S3_PATH="s3://snaptrade-backups/$LATEST_BACKUP"
log "Latest backup: $BACKUP_S3_PATH"

# Step 2: Download backup
log "Step 2: Downloading backup..."
START_DOWNLOAD=$(date +%s)
aws s3 cp "$BACKUP_S3_PATH" /tmp/latest_backup.sql.gz
END_DOWNLOAD=$(date +%s)
DOWNLOAD_TIME=$((END_DOWNLOAD - START_DOWNLOAD))
BACKUP_SIZE=$(du -h /tmp/latest_backup.sql.gz | cut -f1)
log "Download completed in ${DOWNLOAD_TIME}s (Size: $BACKUP_SIZE)"

# Step 3: Spin up temporary PostgreSQL instance
log "Step 3: Spinning up temporary PostgreSQL instance..."
mkdir -p "$TEMP_DB_DIR"
initdb -D "$TEMP_DB_DIR" --auth=trust --encoding=UTF8 > /dev/null 2>&1

# Configure temp instance
cat >> "$TEMP_DB_DIR/postgresql.conf" <<EOF
port = $TEMP_DB_PORT
listen_addresses = 'localhost'
max_connections = 20
shared_buffers = 128MB
EOF

# Start PostgreSQL
pg_ctl -D "$TEMP_DB_DIR" -l "$TEMP_DB_DIR/logfile" start
TEMP_PG_PID=$(cat "$TEMP_DB_DIR/postmaster.pid" | head -1)
sleep 2
success "Temporary PostgreSQL instance started (PID: $TEMP_PG_PID, Port: $TEMP_DB_PORT)"

# Step 4: Create database and restore backup
log "Step 4: Restoring backup to temporary instance..."
createdb -h localhost -p $TEMP_DB_PORT "$TEMP_DB_NAME"
START_RESTORE=$(date +%s)
gunzip -c /tmp/latest_backup.sql.gz | psql -h localhost -p $TEMP_DB_PORT -d "$TEMP_DB_NAME" -q > /dev/null 2>&1
END_RESTORE=$(date +%s)
RESTORE_TIME=$((END_RESTORE - START_RESTORE))
success "Restore completed in ${RESTORE_TIME}s"

# Step 5: Run verification queries
log "Step 5: Running verification queries..."
PSQL_CMD="psql -h localhost -p $TEMP_DB_PORT -d $TEMP_DB_NAME -t -A"

# Check critical tables exist
CRITICAL_TABLES=("users" "accounts" "trades" "portfolios" "transactions")
for table in "${CRITICAL_TABLES[@]}"; do
    if $PSQL_CMD -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='$table');" | grep -q 't'; then
        COUNT=$($PSQL_CMD -c "SELECT COUNT(*) FROM $table;")
        success "Table '$table': $COUNT rows"
    else
        error "Table '$table' does not exist!"
        exit 1
    fi
done

# Verify data integrity checks
log "Running data integrity checks..."

# Check for NULL user IDs (should be 0)
NULL_USERS=$($PSQL_CMD -c "SELECT COUNT(*) FROM users WHERE id IS NULL;")
if [ "$NULL_USERS" -eq 0 ]; then
    success "Data integrity: No NULL user IDs"
else
    error "Data integrity: Found $NULL_USERS NULL user IDs"
fi

# Check for orphaned records
ORPHANED_ACCOUNTS=$($PSQL_CMD -c "SELECT COUNT(*) FROM accounts WHERE user_id NOT IN (SELECT id FROM users);")
if [ "$ORPHANED_ACCOUNTS" -eq 0 ]; then
    success "Data integrity: No orphaned accounts"
else
    warning "Data integrity: Found $ORPHANED_ACCOUNTS orphaned accounts"
fi

# Verify most recent record timestamp
LATEST_TRADE=$($PSQL_CMD -c "SELECT MAX(created_at) FROM trades;")
log "Latest trade timestamp: $LATEST_TRADE"

# Test sample queries
log "Testing sample queries..."
SAMPLE_USER=$($PSQL_CMD -c "SELECT id FROM users LIMIT 1;")
if [ -n "$SAMPLE_USER" ]; then
    USER_ACCOUNTS=$($PSQL_CMD -c "SELECT COUNT(*) FROM accounts WHERE user_id = $SAMPLE_USER;")
    success "Sample query: User $SAMPLE_USER has $USER_ACCOUNTS accounts"
fi

# Step 6: Generate summary report
log "========================================="
log "Test Summary"
log "========================================="
log "Backup File: $LATEST_BACKUP"
log "Backup Size: $BACKUP_SIZE"
log "Download Time: ${DOWNLOAD_TIME}s"
log "Restore Time: ${RESTORE_TIME}s"
log "Total Time: $((DOWNLOAD_TIME + RESTORE_TIME))s"
log "========================================="
success "Quarterly backup restore test completed successfully!"
log "Full report saved to: $REPORT_FILE"

# Send notification (integrate with your notification system)
if command -v mail &> /dev/null; then
    mail -s "Quarterly Backup Restore Test - SUCCESS" ops-team@snaptrade.com < "$REPORT_FILE"
fi

exit 0
