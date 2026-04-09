#!/bin/bash
# Simplified E2E Backup & Restore Test
# This script tests the backup and restore process using simulated database operations

set -e

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
REPORT_FILE="/opt/snaptrade-unified/backend/E2E-BACKUP-RESTORE-TEST.log"
BACKUP_DIR="/opt/snaptrade-unified/backend/test-backups-e2e"
TEST_DB="snaptrade_test_e2e"

echo "╔════════════════════════════════════════════════╗"
echo "║  END-TO-END BACKUP & RESTORE TEST              ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "Timestamp: $TIMESTAMP"
echo "Test Database: $TEST_DB"
echo ""

mkdir -p "$BACKUP_DIR"

# Step 1: Capture Baseline Data
echo "=== STEP 1: Creating Test Database with Sample Data ==="
cat > /tmp/create-test-db.sql << 'EOSQL'
-- Clean up if exists
DROP DATABASE IF EXISTS snaptrade_test_e2e;
CREATE DATABASE snaptrade_test_e2e;

\c snaptrade_test_e2e

-- Create sample tables
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE trades (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  symbol VARCHAR(10),
  quantity INTEGER,
  price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE signals (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10),
  signal_type VARCHAR(20),
  status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert sample data
INSERT INTO users (email, name) VALUES
  ('alice@example.com', 'Alice Smith'),
  ('bob@example.com', 'Bob Jones'),
  ('charlie@example.com', 'Charlie Brown');

INSERT INTO trades (user_id, symbol, quantity, price) VALUES
  (1, 'AAPL', 100, 150.25),
  (1, 'GOOGL', 50, 2800.50),
  (2, 'MSFT', 75, 300.00),
  (3, 'TSLA', 25, 850.75);

INSERT INTO signals (symbol, signal_type, status) VALUES
  ('AAPL', 'BUY', 'active'),
  ('GOOGL', 'SELL', 'expired'),
  ('MSFT', 'HOLD', 'active');

-- Show baseline statistics
\echo ''
\echo 'Baseline Data:'
\echo '-------------'
SELECT 'users' as table_name, COUNT(*) as row_count FROM users
UNION ALL
SELECT 'trades', COUNT(*) FROM trades
UNION ALL
SELECT 'signals', COUNT(*) FROM signals;
EOSQL

# Execute database setup (try postgres user with peer auth)
echo "Creating test database..."
sudo -u postgres psql < /tmp/create-test-db.sql 2>&1 || {
  echo "✗ Failed to create test database"
  echo "This might be due to permission issues or PostgreSQL not being accessible"
  echo "Please ensure PostgreSQL is running and accessible"
  exit 1
}

echo "✓ Test database created with sample data"

# Capture baseline row counts
BASELINE_USERS=$(sudo -u postgres psql -d $TEST_DB -tAc "SELECT COUNT(*) FROM users")
BASELINE_TRADES=$(sudo -u postgres psql -d $TEST_DB -tAc "SELECT COUNT(*) FROM trades")
BASELINE_SIGNALS=$(sudo -u postgres psql -d $TEST_DB -tAc "SELECT COUNT(*) FROM signals")
echo "  users: $BASELINE_USERS rows"
echo "  trades: $BASELINE_TRADES rows"
echo "  signals: $BASELINE_SIGNALS rows"
echo ""

# Step 2: Create Backup
echo "=== STEP 2: Creating Database Backup ==="
BACKUP_FILE="$BACKUP_DIR/backup-$TIMESTAMP.dump"
sudo -u postgres pg_dump -Fc -Z9 $TEST_DB > "$BACKUP_FILE" 2>&1 || {
  echo "✗ Backup failed"
  exit 1
}

BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE")
BACKUP_SIZE_MB=$(echo "scale=2; $BACKUP_SIZE / 1024 / 1024" | bc)
echo "✓ Backup created: $(basename $BACKUP_FILE)"
echo "  Size: ${BACKUP_SIZE_MB} MB"
echo ""

# Step 3: Verify Backup (simulated S3 check)
echo "=== STEP 3: Verifying Backup File ==="
if [ -f "$BACKUP_FILE" ] && [ $BACKUP_SIZE -gt 1000 ]; then
  echo "✓ Backup file exists and has valid size"
  echo "  (S3 upload would happen here in production)"
else
  echo "✗ Backup file invalid"
  exit 1
fi
echo ""

# Step 4: Drop and Recreate Database
echo "=== STEP 4: Drop and Recreate Database ==="
sudo -u postgres psql << EOSQL2
DROP DATABASE IF EXISTS $TEST_DB;
CREATE DATABASE $TEST_DB;
EOSQL2
echo "✓ Database dropped and recreated (empty)"
echo ""

# Step 5: Restore from Backup
echo "=== STEP 5: Restoring from Backup ==="
sudo -u postgres pg_restore -d $TEST_DB --clean --if-exists "$BACKUP_FILE" 2>&1 || {
  echo "✗ Restore failed"
  exit 1
}
echo "✓ Database restored from backup"
echo ""

# Step 6: Verify Restored Data
echo "=== STEP 6: Verifying Restored Data ==="
RESTORE_USERS=$(sudo -u postgres psql -d $TEST_DB -tAc "SELECT COUNT(*) FROM users")
RESTORE_TRADES=$(sudo -u postgres psql -d $TEST_DB -tAc "SELECT COUNT(*) FROM trades")
RESTORE_SIGNALS=$(sudo -u postgres psql -d $TEST_DB -tAc "SELECT COUNT(*) FROM signals")

echo "Restored row counts:"
echo "  users: $RESTORE_USERS rows"
echo "  trades: $RESTORE_TRADES rows"
echo "  signals: $RESTORE_SIGNALS rows"
echo ""

# Compare results
echo "=== Comparing Baseline vs Restore ==="
ALL_MATCH=true

if [ "$BASELINE_USERS" = "$RESTORE_USERS" ]; then
  echo "✓ users: $RESTORE_USERS rows (MATCH)"
else
  echo "✗ users: MISMATCH (baseline: $BASELINE_USERS, restore: $RESTORE_USERS)"
  ALL_MATCH=false
fi

if [ "$BASELINE_TRADES" = "$RESTORE_TRADES" ]; then
  echo "✓ trades: $RESTORE_TRADES rows (MATCH)"
else
  echo "✗ trades: MISMATCH (baseline: $BASELINE_TRADES, restore: $RESTORE_TRADES)"
  ALL_MATCH=false
fi

if [ "$BASELINE_SIGNALS" = "$RESTORE_SIGNALS" ]; then
  echo "✓ signals: $RESTORE_SIGNALS rows (MATCH)"
else
  echo "✗ signals: MISMATCH (baseline: $BASELINE_SIGNALS, restore: $RESTORE_SIGNALS)"
  ALL_MATCH=false
fi

echo ""

# Generate Report
cat > "$REPORT_FILE" << EOREPORT
E2E BACKUP & RESTORE TEST REPORT
=================================
Timestamp: $TIMESTAMP
Test Database: $TEST_DB
Backup File: $(basename $BACKUP_FILE)
Backup Size: ${BACKUP_SIZE_MB} MB

RESULTS:
--------
✓ Backup Created: YES
✓ S3 Verification: SIMULATED (file exists and valid)
$([ "$ALL_MATCH" = true ] && echo "✓" || echo "✗") Data Verification: $([ "$ALL_MATCH" = true ] && echo "PASSED" || echo "FAILED")

BASELINE STATS:
---------------
users: $BASELINE_USERS rows
trades: $BASELINE_TRADES rows
signals: $BASELINE_SIGNALS rows

RESTORE STATS:
--------------
users: $RESTORE_USERS rows
trades: $RESTORE_TRADES rows
signals: $RESTORE_SIGNALS rows

Test Status: $([ "$ALL_MATCH" = true ] && echo "PASSED ✅" || echo "FAILED ✗")
EOREPORT

echo "Report saved to: $REPORT_FILE"
echo ""

# Cleanup
echo "=== Cleanup ==="
sudo -u postgres psql -c "DROP DATABASE IF EXISTS $TEST_DB;" 2>&1 > /dev/null
echo "✓ Test database dropped"
echo ""

if [ "$ALL_MATCH" = true ]; then
  echo "✅ E2E TEST PASSED"
  cat "$REPORT_FILE"
  exit 0
else
  echo "❌ E2E TEST FAILED"
  cat "$REPORT_FILE"
  exit 1
fi
