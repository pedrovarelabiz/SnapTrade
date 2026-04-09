# Restore Script Test Report

## Test Objective
Test the restore script (`restore-backup.ts`) on a test database to verify it can successfully restore from a backup file.

## Test Setup Attempted

### 1. Database Requirements
Per the verification command in the task:
```bash
PGPASSWORD=test psql -h localhost -U testuser testdb -c "\dt" | wc -l | awk '$1 > 5'
```

Required test database configuration:
- **Host**: localhost
- **Port**: 5432
- **Database**: testdb
- **User**: testuser
- **Password**: test

### 2. Challenges Encountered

#### PostgreSQL Authentication Issue
The test environment has PostgreSQL running but with authentication constraints:
- Cannot authenticate as `postgres` user via TCP (localhost/127.0.0.1)
- Cannot use `sudo` to access PostgreSQL configuration
- Password from `.env` file (`postgres`) fails authentication
- No Docker available to spin up isolated test database

Error encountered:
```
psql: error: connection to server at "localhost" (::1), port 5432 failed:
FATAL:  password authentication failed for user "postgres"
```

#### Files Created for Testing
1. `/opt/snaptrade-unified/backend/scripts/test-restore-local.ts` - TypeScript test using local backup
2. `/opt/snaptrade-unified/backend/scripts/test-restore-simple.ts` - Simplified restore test with .env credentials
3. `/opt/snaptrade-unified/backend/scripts/test-restore-complete.sh` - Comprehensive bash test script

## Alternative Test Approach

Since we cannot create the exact test database specified, here's what a proper test would entail:

### Step 1: Create Test Database
```bash
# As PostgreSQL superuser
psql -U postgres -c "CREATE DATABASE testdb;"
psql -U postgres -c "CREATE USER testuser WITH PASSWORD 'test';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE testdb TO testuser;"
psql -U postgres -d testdb -c "GRANT ALL ON SCHEMA public TO testuser;"
```

### Step 2: Prepare Test Backup
```bash
# Create a backup from existing database or create test data
pg_dump -h localhost -U postgres -d snaptrade_test --format=custom > /tmp/test-backup.dump
```

### Step 3: Run Restore Test
```bash
# Method 1: Using npm script (requires S3 setup)
cd /opt/snaptrade-unified/backend
DB_HOST=localhost \
DB_PORT=5432 \
DB_NAME=testdb \
DB_USER=testuser \
DB_PASSWORD=test \
npm run backup:restore -- --backup test-backup.dump --yes --no-service-control

# Method 2: Direct pg_restore test
PGPASSWORD=test pg_restore \
  --host=localhost \
  --port=5432 \
  --username=testuser \
  --dbname=testdb \
  --clean \
  --if-exists \
  --verbose \
  /tmp/test-backup.dump
```

### Step 4: Verify Restore
```bash
# Check tables exist
PGPASSWORD=test psql -h localhost -U testuser testdb -c "\dt"

# Verify table count (should be > 5 per task requirements)
PGPASSWORD=test psql -h localhost -U testuser testdb -c "\dt" | wc -l | awk '$1 > 5'

# Check data integrity
PGPASSWORD=test psql -h localhost -U testuser testdb << EOF
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
EOF
```

## Test Scripts Created

The following test scripts are ready to use once database authentication is resolved:

1. **test-restore-simple.ts**: Most straightforward option
   - Uses credentials from .env
   - Creates backup from snaptrade_test
   - Restores and verifies
   - Run with: `npx tsx scripts/test-restore-simple.ts`

2. **test-restore-complete.sh**: Full bash implementation
   - Creates test database and user
   - Handles backup creation
   - Performs restore
   - Verifies with table count
   - Run with: `bash scripts/test-restore-complete.sh`

## Recommendations

To complete this test, one of the following is needed:

1. **PostgreSQL Authentication Resolution**
   - Obtain correct postgres user password
   - Or configure pg_hba.conf for local trust authentication
   - Or run with sudo/root access

2. **Docker Alternative**
   - Install Docker
   - Run: `docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=test postgres:16`
   - Update test scripts to use port 5433

3. **Pre-configured Test Database**
   - Have a DBA create testdb/testuser
   - Provide credentials to run the test

## Expected Test Results

When authentication is resolved, the test should:

✓ Create backup from source database
✓ Restore to test database without errors
✓ Verify tables exist (count > 5)
✓ Confirm data integrity
✓ Complete in < 60 seconds for small databases

Exit code 0 indicates success.
