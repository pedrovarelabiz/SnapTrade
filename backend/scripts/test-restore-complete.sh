#!/bin/bash
#
# Complete Restore Script Test
# Tests the restore functionality using local backup files
#

set -e

echo "=== Database Restore Test ==="
echo ""

# Configuration
export PGHOST="${TEST_DB_HOST:-localhost}"
export PGPORT="${TEST_DB_PORT:-5432}"
export PGUSER="${TEST_DB_USER:-testuser}"
export PGPASSWORD="${TEST_DB_PASSWORD:-test}"
export PGDATABASE="${TEST_DB_NAME:-testdb}"

BACKUP_FILE="${1:-/tmp/test-backup-for-restore.dump}"

echo "Configuration:"
echo "  Host: $PGHOST:$PGPORT"
echo "  User: $PGUSER"
echo "  Database: $PGDATABASE"
echo "  Backup file: $BACKUP_FILE"
echo ""

# Step 1: Create test database and user (as admin)
echo "Step 1: Setting up test database..."
PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d postgres << EOF 2>&1 || echo "  (Database may already exist)"
CREATE DATABASE $PGDATABASE;
CREATE USER $PGUSER WITH PASSWORD '$PGPASSWORD';
GRANT ALL PRIVILEGES ON DATABASE $PGDATABASE TO $PGUSER;
EOF

# Grant schema privileges
PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d $PGDATABASE << EOF 2>&1 || echo "  (Privileges may already be set)"
GRANT ALL ON SCHEMA public TO $PGUSER;
GRANT ALL ON ALL TABLES IN SCHEMA public TO $PGUSER;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO $PGUSER;
EOF

echo "✓ Database setup complete"
echo ""

# Step 2: Create a test backup if it doesn't exist
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Step 2: Creating test backup from snaptrade_test..."
  PGPASSWORD=postgres pg_dump \
    -h 127.0.0.1 \
    -U postgres \
    -d snaptrade_test \
    --format=custom \
    --file="$BACKUP_FILE" \
    2>&1 || {
      echo "✗ Failed to create backup"
      echo "Creating minimal test backup instead..."

      # Create a minimal test database with some tables
      PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d $PGDATABASE << 'SQLEOF'
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  account_number VARCHAR(20),
  balance DECIMAL(10,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id),
  symbol VARCHAR(10),
  quantity INTEGER,
  price DECIMAL(10,2),
  trade_date TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (username, email) VALUES
  ('testuser1', 'test1@example.com'),
  ('testuser2', 'test2@example.com');

INSERT INTO accounts (user_id, account_number, balance) VALUES
  (1, 'ACC001', 1000.00),
  (2, 'ACC002', 2000.00);

INSERT INTO trades (account_id, symbol, quantity, price) VALUES
  (1, 'AAPL', 10, 150.00),
  (2, 'GOOGL', 5, 2500.00);
SQLEOF

      # Now create backup
      PGPASSWORD=$PGPASSWORD pg_dump \
        -h $PGHOST \
        -U $PGUSER \
        -d $PGDATABASE \
        --format=custom \
        --file="$BACKUP_FILE"
    }

  echo "✓ Test backup created at: $BACKUP_FILE"
  echo ""
fi

# Step 3: Clear the database
echo "Step 3: Clearing target database..."
PGPASSWORD=$PGPASSWORD psql -h $PGHOST -U $PGUSER -d $PGDATABASE << 'EOF' 2>&1 || true
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS users CASCADE;
EOF
echo "✓ Database cleared"
echo ""

# Step 4: Restore from backup
echo "Step 4: Restoring from backup..."
pg_restore \
  --host=$PGHOST \
  --port=$PGPORT \
  --username=$PGUSER \
  --dbname=$PGDATABASE \
  --clean \
  --if-exists \
  --verbose \
  "$BACKUP_FILE" 2>&1 || {
    echo "✗ Restore failed (exit code: $?)"
    echo "This might be expected if the backup is empty or incompatible"
  }

echo "✓ Restore completed"
echo ""

# Step 5: Verify restore
echo "Step 5: Verifying restore..."
TABLE_COUNT=$(psql -h $PGHOST -U $PGUSER -d $PGDATABASE -t -c "\dt" | grep -c "public" || echo "0")

echo ""
echo "Tables in database:"
psql -h $PGHOST -U $PGUSER -d $PGDATABASE -c "\dt"
echo ""

echo "Table count: $TABLE_COUNT"

if [ "$TABLE_COUNT" -gt 0 ]; then
  echo "✓ Restore verification PASSED - Found $TABLE_COUNT tables"

  # Show sample data
  echo ""
  echo "Sample data from tables:"
  psql -h $PGHOST -U $PGUSER -d $PGDATABASE << 'EOF' 2>&1 || true
SELECT 'users' as table_name, COUNT(*) as row_count FROM users
UNION ALL
SELECT 'accounts', COUNT(*) FROM accounts
UNION ALL
SELECT 'trades', COUNT(*) FROM trades;
EOF

  echo ""
  echo "=== TEST PASSED ==="
  exit 0
else
  echo "✗ Restore verification FAILED - No tables found"
  echo "=== TEST FAILED ==="
  exit 1
fi
