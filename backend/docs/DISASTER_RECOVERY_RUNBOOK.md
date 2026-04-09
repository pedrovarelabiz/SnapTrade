# Disaster Recovery Runbook

## Overview

This runbook provides step-by-step procedures for recovering the SnapTrade database from encrypted backups stored in S3. Follow these procedures carefully in the event of data loss, corruption, or catastrophic failure.

**CRITICAL**: This is a destructive operation. The database restoration will overwrite the current database. Ensure you have proper authorization before proceeding.

---

## 1. Prerequisites

### Required Access

Before beginning the recovery process, ensure you have:

- [ ] SSH access to the production database server
- [ ] AWS IAM credentials with S3 read permissions for the backup bucket
- [ ] `sudo` or database superuser privileges
- [ ] Access to the encryption key vault/secret manager
- [ ] Approval from incident commander or on-call manager

### Required Credentials

Gather the following credentials before starting:

1. **AWS Credentials**
   - AWS Access Key ID
   - AWS Secret Access Key
   - S3 Bucket Name: `snaptrade-db-backups`
   - Region: Verify your deployment region

2. **Database Credentials**
   - PostgreSQL superuser password
   - Database name
   - Database host and port

3. **Encryption Keys**
   - GPG private key for backup decryption
   - Passphrase for GPG key (if applicable)

### Required Tools

Ensure the following tools are installed:

```bash
# Verify AWS CLI
aws --version

# Verify PostgreSQL client tools
pg_restore --version
psql --version

# Verify GPG
gpg --version

# Install missing tools if needed (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y awscli postgresql-client gnupg
```

### Environment Setup

Configure AWS credentials:

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-east-1"  # Adjust to your region

# Verify AWS access
aws s3 ls s3://snaptrade-db-backups/
```

---

## 2. Assessing the Situation

### Determine What Failed

Before proceeding with recovery, understand the scope of the failure:

#### Step 2.1: Identify the Failure Type

- [ ] **Data Corruption**: Specific tables or data are corrupted
- [ ] **Complete Data Loss**: Entire database is lost
- [ ] **Accidental Deletion**: Specific data was accidentally deleted
- [ ] **Ransomware/Security Incident**: Database compromised
- [ ] **Hardware Failure**: Disk failure, server crash
- [ ] **Application Bug**: Bad migration or code deployment

#### Step 2.2: Determine Recovery Point

Identify the appropriate backup to restore:

```bash
# List recent backups
aws s3 ls s3://snaptrade-db-backups/daily/ --recursive | tail -20

# List hourly backups if recent recovery needed
aws s3 ls s3://snaptrade-db-backups/hourly/ --recursive | tail -50

# Check backup metadata for specific date
aws s3 ls s3://snaptrade-db-backups/daily/2026-03-21/
```

#### Step 2.3: Verify Backup Integrity

Before proceeding, confirm the backup file exists and is complete:

```bash
# Get backup file details
aws s3 ls s3://snaptrade-db-backups/daily/2026-03-21/ --recursive --human-readable

# Check for checksum file
aws s3 ls s3://snaptrade-db-backups/daily/2026-03-21/ | grep -i checksum
```

#### Step 2.4: Document the Incident

Record critical information:

- **Incident Start Time**: _______________
- **Failure Type**: _______________
- **Backup to Restore**: _______________
- **Backup Timestamp**: _______________
- **Data Loss Window**: _______________
- **Approval By**: _______________
- **Operator Name**: _______________

---

## 3. Downloading Backup from S3

### Step 3.1: Create Working Directory

```bash
# Create temporary working directory
mkdir -p /tmp/db_recovery
cd /tmp/db_recovery

# Set permissions
chmod 700 /tmp/db_recovery
```

### Step 3.2: Download Backup File

```bash
# Set variables for the backup you identified in Step 2
BACKUP_DATE="2026-03-21"
BACKUP_FILE="snaptrade_backup_2026-03-21_00-00-00.sql.gz.gpg"

# Download the encrypted backup
aws s3 cp \
  s3://snaptrade-db-backups/daily/${BACKUP_DATE}/${BACKUP_FILE} \
  /tmp/db_recovery/${BACKUP_FILE} \
  --no-progress

# Verify download completed
ls -lh /tmp/db_recovery/${BACKUP_FILE}
```

### Step 3.3: Download Checksum File

```bash
# Download the checksum file
aws s3 cp \
  s3://snaptrade-db-backups/daily/${BACKUP_DATE}/${BACKUP_FILE}.sha256 \
  /tmp/db_recovery/${BACKUP_FILE}.sha256

# Verify checksum
sha256sum -c ${BACKUP_FILE}.sha256

# Should output: snaptrade_backup_2026-03-21_00-00-00.sql.gz.gpg: OK
```

### Step 3.4: Download Metadata (Optional)

```bash
# Download backup metadata for additional context
aws s3 cp \
  s3://snaptrade-db-backups/daily/${BACKUP_DATE}/metadata.json \
  /tmp/db_recovery/metadata.json

# Review metadata
cat /tmp/db_recovery/metadata.json | jq .
```

---

## 4. Decrypting Backup

### Step 4.1: Import GPG Private Key

```bash
# If GPG key is not already in keyring, import it
# Retrieve from secrets manager (adjust command based on your setup)
aws secretsmanager get-secret-value \
  --secret-id snaptrade/backup/gpg-private-key \
  --query SecretString \
  --output text > /tmp/db_recovery/backup-key.asc

# Import the key
gpg --import /tmp/db_recovery/backup-key.asc

# List keys to verify
gpg --list-secret-keys
```

### Step 4.2: Decrypt the Backup

```bash
# Decrypt the GPG-encrypted file
gpg --decrypt \
  --output /tmp/db_recovery/snaptrade_backup.sql.gz \
  /tmp/db_recovery/${BACKUP_FILE}

# You may be prompted for the GPG key passphrase
# If passphrase is stored in secrets manager:
PASSPHRASE=$(aws secretsmanager get-secret-value \
  --secret-id snaptrade/backup/gpg-passphrase \
  --query SecretString \
  --output text)

# Decrypt with passphrase
echo "$PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 \
  --decrypt \
  --output /tmp/db_recovery/snaptrade_backup.sql.gz \
  /tmp/db_recovery/${BACKUP_FILE}
```

### Step 4.3: Decompress the Backup

```bash
# Decompress the gzipped SQL dump
gunzip /tmp/db_recovery/snaptrade_backup.sql.gz

# Verify the SQL file
ls -lh /tmp/db_recovery/snaptrade_backup.sql

# Quick sanity check (first 20 lines)
head -n 20 /tmp/db_recovery/snaptrade_backup.sql
```

### Step 4.4: Verify Backup Format

```bash
# Check if it's a custom format dump or plain SQL
file /tmp/db_recovery/snaptrade_backup.sql

# If custom format, you'll use pg_restore
# If plain SQL, you'll use psql

# Check for PostgreSQL custom format signature
head -c 5 /tmp/db_recovery/snaptrade_backup.sql | od -c
# Custom format starts with "PGDMP"
```

---

## 5. Stopping Services

### Step 5.1: Notify Stakeholders

```bash
# Send notification that system will be down
echo "CRITICAL: Beginning database restoration at $(date). System downtime expected for 30-60 minutes." | \
  mail -s "[CRITICAL] Database Restoration In Progress" engineering@snaptrade.com
```

### Step 5.2: Enable Maintenance Mode

```bash
# Enable maintenance mode in application
# Method depends on your application architecture

# Example: Update load balancer to show maintenance page
# aws elb deregister-instances-from-load-balancer ...

# Or set maintenance flag in Redis
redis-cli SET maintenance_mode "true"
redis-cli EXPIRE maintenance_mode 7200  # 2 hour expiration as safety
```

### Step 5.3: Stop Application Services

```bash
# Stop all services that connect to the database
sudo systemctl stop snaptrade-api
sudo systemctl stop snaptrade-worker
sudo systemctl stop snaptrade-scheduler

# Verify services are stopped
sudo systemctl status snaptrade-api
sudo systemctl status snaptrade-worker
sudo systemctl status snaptrade-scheduler
```

### Step 5.4: Terminate Active Database Connections

```bash
# Connect to database as superuser
psql -h localhost -U postgres -d snaptrade

# View active connections
SELECT pid, usename, application_name, client_addr, state, query_start
FROM pg_stat_activity
WHERE datname = 'snaptrade' AND pid <> pg_backend_pid();

# Terminate all connections to the target database
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'snaptrade' AND pid <> pg_backend_pid();

# Exit psql
\q
```

---

## 6. Database Restoration

### Step 6.1: Create Backup of Current Database (if possible)

```bash
# If the current database is accessible, create a backup before restoration
# This provides a rollback option if needed
pg_dump -h localhost -U postgres -d snaptrade \
  -F c \
  -f /tmp/db_recovery/pre_restore_backup_$(date +%Y%m%d_%H%M%S).dump

# If database is corrupted and dump fails, proceed anyway
# Document that no pre-restore backup was possible
```

### Step 6.2: Drop and Recreate Database

**WARNING**: This is the point of no return (unless you have the pre-restore backup).

```bash
# Connect as superuser
psql -h localhost -U postgres

# Drop the database (this will fail if connections exist - ensure Step 5.4 was completed)
DROP DATABASE IF EXISTS snaptrade;

# Recreate the database
CREATE DATABASE snaptrade
  WITH OWNER = snaptrade_user
  ENCODING = 'UTF8'
  LC_COLLATE = 'en_US.UTF-8'
  LC_CTYPE = 'en_US.UTF-8'
  TEMPLATE = template0;

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE snaptrade TO snaptrade_user;

# Exit psql
\q
```

### Step 6.3: Restore Database Using pg_restore (Custom Format)

If your backup is in PostgreSQL custom format:

```bash
# Restore using pg_restore with all recommended flags
pg_restore \
  --host=localhost \
  --port=5432 \
  --username=postgres \
  --dbname=snaptrade \
  --verbose \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --exit-on-error \
  --jobs=4 \
  /tmp/db_recovery/snaptrade_backup.sql

# Flag explanations:
# --verbose: Show detailed progress
# --no-owner: Don't restore ownership (use current user)
# --no-acl: Don't restore access privileges
# --clean: Drop database objects before recreating
# --if-exists: Use IF EXISTS when dropping objects
# --exit-on-error: Stop on first error
# --jobs=4: Use 4 parallel jobs for faster restore
```

### Step 6.4: Restore Database Using psql (Plain SQL)

If your backup is plain SQL format:

```bash
# Restore using psql
psql \
  --host=localhost \
  --port=5432 \
  --username=postgres \
  --dbname=snaptrade \
  --echo-errors \
  --file=/tmp/db_recovery/snaptrade_backup.sql \
  2>&1 | tee /tmp/db_recovery/restore.log

# Check for errors in the log
grep -i error /tmp/db_recovery/restore.log
```

### Step 6.5: Monitor Restoration Progress

In another terminal, monitor the restoration:

```bash
# Watch database size grow
watch -n 5 "psql -h localhost -U postgres -c \"SELECT pg_database_size('snaptrade') / 1024 / 1024 / 1024 AS size_gb;\""

# Watch table count
watch -n 10 "psql -h localhost -U postgres -d snaptrade -c \"SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';\""
```

### Step 6.6: Handle Restoration Errors

If errors occur during restoration:

```bash
# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log

# Common issues:
# 1. Disk space: df -h
# 2. Memory: free -h
# 3. Connection limits: Check max_connections in postgresql.conf
# 4. Lock timeouts: May need to adjust lock_timeout

# If restoration fails, proceed to Section 8 (Rollback Procedure)
```

---

## 7. Verification Steps

### Step 7.1: Verify Database Structure

```bash
# Connect to the restored database
psql -h localhost -U postgres -d snaptrade

# Check table count
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';

# List all tables
\dt

# Check critical tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

# Verify indexes
SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';

# Check sequences
SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public';
```

### Step 7.2: Verify Data Integrity

```bash
# Still in psql, check row counts for critical tables
SELECT 'users' AS table_name, count(*) FROM users
UNION ALL
SELECT 'accounts', count(*) FROM accounts
UNION ALL
SELECT 'transactions', count(*) FROM transactions
UNION ALL
SELECT 'positions', count(*) FROM positions;

# Compare these counts with expected values from backup metadata
# Check date ranges to ensure data is from expected time period
SELECT 'users' AS table_name, min(created_at), max(created_at) FROM users
UNION ALL
SELECT 'accounts', min(created_at), max(created_at) FROM accounts
UNION ALL
SELECT 'transactions', min(created_at), max(created_at) FROM transactions;
```

### Step 7.3: Run Database Integrity Checks

```bash
# Check for table corruption
ANALYZE VERBOSE;

# Reindex all tables (to rebuild indexes)
REINDEX DATABASE snaptrade;

# Update statistics
VACUUM ANALYZE;

# Check for foreign key constraint violations
SELECT conrelid::regclass AS table_name, conname AS constraint_name
FROM pg_constraint
WHERE contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgconstraint = pg_constraint.oid
  );
```

### Step 7.4: Test Critical Queries

```bash
# Run sample queries that represent core functionality
# Adjust these based on your application

-- Test user lookup
SELECT * FROM users WHERE email = 'test@example.com' LIMIT 1;

-- Test account relationships
SELECT u.id, u.email, count(a.id) as account_count
FROM users u
LEFT JOIN accounts a ON u.id = a.user_id
GROUP BY u.id
LIMIT 10;

-- Test transaction queries
SELECT * FROM transactions
WHERE created_at > now() - interval '7 days'
LIMIT 10;

# Exit psql
\q
```

### Step 7.5: Verify Database Size

```bash
# Check total database size
psql -h localhost -U postgres -c "SELECT pg_size_pretty(pg_database_size('snaptrade'));"

# Check largest tables
psql -h localhost -U postgres -d snaptrade -c "
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;"
```

### Step 7.6: Application-Level Verification

```bash
# Start one instance of the API in test mode
sudo systemctl start snaptrade-api

# Wait for it to initialize
sleep 10

# Test health endpoint
curl -v http://localhost:8000/health

# Test database connectivity through the app
curl -v http://localhost:8000/api/v1/status

# Test a read query through the API
curl -H "Authorization: Bearer test-token" \
  http://localhost:8000/api/v1/users/me

# If tests pass, proceed to restart all services
# If tests fail, proceed to Section 8 (Rollback)
```

---

## 8. Rollback Procedure if Restore Fails

If the restoration fails or verification reveals critical issues, follow this rollback procedure:

### Step 8.1: Assess Rollback Options

Determine which rollback option is available:

- **Option A**: Pre-restore backup exists (from Step 6.1)
- **Option B**: Try a different backup from S3
- **Option C**: Restore from alternative backup system (if available)
- **Option D**: Database is completely lost (escalate to disaster recovery team)

### Step 8.2: Rollback Using Pre-Restore Backup (Option A)

```bash
# Stop any services that were started
sudo systemctl stop snaptrade-api

# Terminate database connections
psql -h localhost -U postgres -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'snaptrade' AND pid <> pg_backend_pid();"

# Drop the failed restoration
psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS snaptrade;"

# Recreate database
psql -h localhost -U postgres -c "
CREATE DATABASE snaptrade
  WITH OWNER = snaptrade_user
  ENCODING = 'UTF8'
  LC_COLLATE = 'en_US.UTF-8'
  LC_CTYPE = 'en_US.UTF-8'
  TEMPLATE = template0;"

# Restore from pre-restore backup
pg_restore \
  --host=localhost \
  --port=5432 \
  --username=postgres \
  --dbname=snaptrade \
  --verbose \
  --no-owner \
  --no-acl \
  --exit-on-error \
  --jobs=4 \
  /tmp/db_recovery/pre_restore_backup_*.dump

# Verify restoration
psql -h localhost -U postgres -d snaptrade -c "SELECT count(*) FROM users;"
```

### Step 8.3: Try Alternative Backup (Option B)

```bash
# Return to Step 2 and select a different backup
# Usually try the previous day's backup

# Clean up failed restoration artifacts
rm -rf /tmp/db_recovery/*

# Start from Step 3 with a different backup date
BACKUP_DATE="2026-03-20"  # Previous day

# Follow steps 3-7 with the new backup
```

### Step 8.4: Document Rollback

```bash
# Create incident report
cat > /tmp/db_recovery/rollback_report.txt << EOF
DISASTER RECOVERY ROLLBACK REPORT
==================================

Rollback Time: $(date)
Operator: ${USER}
Reason for Rollback: [DESCRIBE REASON]

Original Backup Attempted: ${BACKUP_FILE}
Rollback Method Used: [Option A/B/C/D]
Final State: [SUCCESS/FAILED]

Details:
[PROVIDE DETAILED EXPLANATION]

Next Steps:
[DESCRIBE NEXT ACTIONS]
EOF

# Email the report
mail -s "[CRITICAL] Database Recovery Rollback Report" \
  -a /tmp/db_recovery/rollback_report.txt \
  engineering@snaptrade.com < /tmp/db_recovery/rollback_report.txt
```

### Step 8.5: Escalation Path

If rollback fails or no viable backup exists:

1. **Immediately escalate** to:
   - CTO / Engineering VP
   - Database Administrator on-call
   - Infrastructure team lead

2. **Preserve evidence**:
   ```bash
   # Create forensics directory
   mkdir -p /var/log/snaptrade/recovery_failure_$(date +%Y%m%d_%H%M%S)

   # Copy all logs
   cp -r /tmp/db_recovery/* /var/log/snaptrade/recovery_failure_*/
   cp /var/log/postgresql/* /var/log/snaptrade/recovery_failure_*/

   # Tar and upload to S3 for investigation
   cd /var/log/snaptrade
   tar -czf recovery_failure_$(date +%Y%m%d_%H%M%S).tar.gz recovery_failure_*/
   aws s3 cp recovery_failure_*.tar.gz s3://snaptrade-incident-logs/
   ```

3. **Activate full disaster recovery protocol**:
   - Evaluate data reconstruction from transaction logs
   - Consider point-in-time recovery from WAL archives
   - Assess impact on customer data
   - Prepare customer communications

---

## 9. Post-Restoration Tasks

Once restoration is successful and verified:

### Step 9.1: Restart All Services

```bash
# Start all application services
sudo systemctl start snaptrade-api
sudo systemctl start snaptrade-worker
sudo systemctl start snaptrade-scheduler

# Verify all services are running
sudo systemctl status snaptrade-api
sudo systemctl status snaptrade-worker
sudo systemctl status snaptrade-scheduler

# Check application logs for errors
sudo journalctl -u snaptrade-api -f
```

### Step 9.2: Disable Maintenance Mode

```bash
# Remove maintenance flag
redis-cli DEL maintenance_mode

# Re-register with load balancer
# aws elb register-instances-with-load-balancer ...

# Verify application is accessible
curl -v https://api.snaptrade.com/health
```

### Step 9.3: Monitor System Health

```bash
# Monitor for 30 minutes post-restoration
# Watch error rates, response times, database performance

# Check database connections
watch -n 5 "psql -h localhost -U postgres -c \"SELECT count(*), state FROM pg_stat_activity WHERE datname = 'snaptrade' GROUP BY state;\""

# Monitor application logs
tail -f /var/log/snaptrade/api.log | grep -i error
```

### Step 9.4: Notify Stakeholders

```bash
# Send completion notification
cat > /tmp/completion_notice.txt << EOF
Database restoration completed successfully at $(date).

Recovery Details:
- Backup restored from: ${BACKUP_DATE}
- Restoration duration: [XX minutes]
- Data loss window: [XX hours/minutes]
- Services restored: All
- Current status: Operational

All verification checks passed. System is being monitored.
EOF

mail -s "[RESOLVED] Database Restoration Complete" \
  engineering@snaptrade.com < /tmp/completion_notice.txt
```

### Step 9.5: Create Post-Incident Report

Document the complete incident for future reference:

```bash
cat > /tmp/post_incident_report.md << EOF
# Post-Incident Report: Database Recovery

## Incident Summary
- **Date**: $(date)
- **Duration**: [Total downtime]
- **Severity**: Critical
- **Impact**: [Describe impact]

## Timeline
- [HH:MM] - Incident detected
- [HH:MM] - Decision to restore from backup
- [HH:MM] - Backup download started
- [HH:MM] - Database restoration started
- [HH:MM] - Restoration completed
- [HH:MM] - Verification completed
- [HH:MM] - Services restored
- [HH:MM] - Incident resolved

## Root Cause
[Describe what caused the failure]

## Recovery Process
- Backup used: ${BACKUP_FILE}
- Recovery method: [pg_restore/psql]
- Data loss: [None/XX hours]

## Lessons Learned
1. [What went well]
2. [What could be improved]
3. [Process improvements needed]

## Action Items
- [ ] [Action item 1]
- [ ] [Action item 2]
- [ ] [Action item 3]
EOF

# Store the report
cp /tmp/post_incident_report.md /var/log/snaptrade/incidents/
```

### Step 9.6: Clean Up Temporary Files

```bash
# Securely delete temporary files (contains sensitive data)
shred -vfz -n 3 /tmp/db_recovery/backup-key.asc 2>/dev/null
shred -vfz -n 3 /tmp/db_recovery/*.sql 2>/dev/null
shred -vfz -n 3 /tmp/db_recovery/*.dump 2>/dev/null

# Remove recovery directory
rm -rf /tmp/db_recovery

# Verify cleanup
ls -la /tmp/db_recovery 2>&1
```

---

## 10. Regular Testing

**Purpose**: Validate backup integrity and recovery procedures through scheduled testing. Regular drills ensure that backups are functional, team members are trained, and the recovery process works as documented.

**Testing Frequency**: Quarterly (every 3 months)

### Step 10.1: Schedule and Prepare for Recovery Drill

```bash
# Schedule quarterly recovery drills (Q1, Q2, Q3, Q4)
# Recommended: First week of each quarter (January, April, July, October)

# Create test tracking directory
mkdir -p /var/log/snaptrade/recovery_tests
cd /var/log/snaptrade/recovery_tests

# Create test log file
TEST_DATE=$(date +%Y%m%d)
TEST_LOG="recovery_drill_${TEST_DATE}.log"
exec > >(tee -a "$TEST_LOG") 2>&1

echo "=== Recovery Drill Started at $(date) ==="
echo "Operator: ${USER}"
echo "Test Environment: PostgreSQL test instance"
```

### Step 10.2: Create Test PostgreSQL Instance

Set up an isolated PostgreSQL instance for testing without impacting production:

```bash
# Install PostgreSQL in a test directory (if not already present)
# Using a custom port to avoid conflicts with production

# Define test instance variables
export TEST_PG_PORT=5433
export TEST_PG_DATA="/var/lib/postgresql/test_recovery"
export TEST_DB_NAME="snaptrade_test"

# Initialize test PostgreSQL data directory
sudo -u postgres /usr/lib/postgresql/14/bin/initdb \
  -D ${TEST_PG_DATA} \
  --encoding=UTF8 \
  --locale=en_US.UTF-8

# Configure test instance (use non-standard port)
sudo -u postgres bash -c "cat >> ${TEST_PG_DATA}/postgresql.conf << EOF
port = ${TEST_PG_PORT}
max_connections = 100
shared_buffers = 256MB
work_mem = 16MB
maintenance_work_mem = 128MB
EOF"

# Configure authentication (local connections only)
sudo -u postgres bash -c "cat > ${TEST_PG_DATA}/pg_hba.conf << EOF
# Test instance - local connections only
local   all             all                                     peer
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
EOF"

# Start test PostgreSQL instance
sudo -u postgres /usr/lib/postgresql/14/bin/pg_ctl \
  -D ${TEST_PG_DATA} \
  -l ${TEST_PG_DATA}/logfile \
  start

# Verify test instance is running
pg_isready -p ${TEST_PG_PORT}

# Create test database
psql -p ${TEST_PG_PORT} -U postgres -c "CREATE DATABASE ${TEST_DB_NAME};"
```

### Step 10.3: Select and Download Test Backup

```bash
# Choose a recent backup for testing (typically latest daily backup)
BACKUP_DATE=$(date -d "yesterday" +%Y-%m-%d)
echo "Testing with backup from: ${BACKUP_DATE}"

# List available backups for the date
aws s3 ls s3://snaptrade-db-backups/daily/${BACKUP_DATE}/

# Identify the backup file
BACKUP_FILE=$(aws s3 ls s3://snaptrade-db-backups/daily/${BACKUP_DATE}/ | grep -E '\.sql\.gz\.gpg$' | awk '{print $4}')
echo "Selected backup: ${BACKUP_FILE}"

# Create test working directory
mkdir -p /tmp/recovery_test_${TEST_DATE}
cd /tmp/recovery_test_${TEST_DATE}

# Download backup
echo "Downloading backup..."
aws s3 cp \
  s3://snaptrade-db-backups/daily/${BACKUP_DATE}/${BACKUP_FILE} \
  ./ \
  --no-progress

# Download checksum
aws s3 cp \
  s3://snaptrade-db-backups/daily/${BACKUP_DATE}/${BACKUP_FILE}.sha256 \
  ./

# Verify checksum
echo "Verifying backup integrity..."
sha256sum -c ${BACKUP_FILE}.sha256

# Record file size
ls -lh ${BACKUP_FILE}
```

### Step 10.4: Decrypt and Restore to Test Instance

```bash
# Import GPG key (if not already in keyring)
if ! gpg --list-secret-keys | grep -q "backup"; then
  aws secretsmanager get-secret-value \
    --secret-id snaptrade/backup/gpg-private-key \
    --query SecretString \
    --output text > backup-key.asc
  gpg --import backup-key.asc
fi

# Decrypt the backup
echo "Decrypting backup..."
PASSPHRASE=$(aws secretsmanager get-secret-value \
  --secret-id snaptrade/backup/gpg-passphrase \
  --query SecretString \
  --output text)

echo "$PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 \
  --decrypt \
  --output backup.sql.gz \
  ${BACKUP_FILE}

# Decompress
echo "Decompressing backup..."
gunzip backup.sql.gz

# Record start time
RESTORE_START=$(date +%s)

# Restore to test instance
echo "Restoring to test instance on port ${TEST_PG_PORT}..."

# Determine backup format and restore accordingly
if file backup.sql | grep -q "PostgreSQL custom"; then
  # Custom format - use pg_restore
  pg_restore \
    --host=localhost \
    --port=${TEST_PG_PORT} \
    --username=postgres \
    --dbname=${TEST_DB_NAME} \
    --verbose \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    --jobs=4 \
    backup.sql
else
  # Plain SQL format - use psql
  psql \
    --host=localhost \
    --port=${TEST_PG_PORT} \
    --username=postgres \
    --dbname=${TEST_DB_NAME} \
    --file=backup.sql
fi

# Record end time and calculate duration
RESTORE_END=$(date +%s)
RESTORE_DURATION=$((RESTORE_END - RESTORE_START))
echo "Restoration completed in ${RESTORE_DURATION} seconds ($((RESTORE_DURATION / 60)) minutes)"
```

### Step 10.5: Verification Checklist

Run comprehensive verification tests on the restored test database:

```bash
# Connect to test database and run verification queries
psql -p ${TEST_PG_PORT} -U postgres -d ${TEST_DB_NAME} << 'EOF'

\echo '=== VERIFICATION CHECKLIST ==='
\echo ''

-- 1. Check table count
\echo '1. Table Count:'
SELECT count(*) as table_count
FROM information_schema.tables
WHERE table_schema = 'public';

-- 2. Check row counts for critical tables
\echo ''
\echo '2. Critical Tables Row Counts:'
SELECT 'users' AS table_name, count(*) as row_count FROM users
UNION ALL
SELECT 'accounts', count(*) FROM accounts
UNION ALL
SELECT 'transactions', count(*) FROM transactions
UNION ALL
SELECT 'positions', count(*) FROM positions
UNION ALL
SELECT 'brokerages', count(*) FROM brokerages
ORDER BY table_name;

-- 3. Check data integrity - verify no NULL violations
\echo ''
\echo '3. Data Integrity - NOT NULL Constraints:'
SELECT
  table_name,
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND is_nullable = 'NO'
  AND column_name IN ('id', 'created_at', 'user_id')
ORDER BY table_name, column_name;

-- 4. Verify foreign key constraints exist
\echo ''
\echo '4. Foreign Key Constraints:'
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- 5. Check for foreign key violations
\echo ''
\echo '5. Foreign Key Violations Check:'
DO $$
DECLARE
  r RECORD;
  violation_count INTEGER;
  has_violations BOOLEAN := FALSE;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS table_name,
           conname AS constraint_name,
           pg_get_constraintdef(oid) AS constraint_def
    FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
  LOOP
    -- This is a simplified check; actual validation would require dynamic SQL
    RAISE NOTICE 'Constraint: % on table %', r.constraint_name, r.table_name;
  END LOOP;

  IF NOT has_violations THEN
    RAISE NOTICE 'No foreign key violations detected (basic check)';
  END IF;
END $$;

-- 6. Verify indexes exist
\echo ''
\echo '6. Index Count:'
SELECT count(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public';

-- 7. Check sequences are properly set
\echo ''
\echo '7. Sequences Status:'
SELECT
  sequence_name,
  last_value,
  is_called
FROM information_schema.sequences
JOIN pg_sequences ON sequence_name = sequencename
WHERE sequence_schema = 'public'
ORDER BY sequence_name
LIMIT 10;

-- 8. Verify data freshness - check latest timestamps
\echo ''
\echo '8. Data Freshness - Latest Timestamps:'
SELECT
  'users' AS table_name,
  max(created_at) as latest_record,
  count(*) as total_records
FROM users
UNION ALL
SELECT
  'transactions',
  max(created_at),
  count(*)
FROM transactions
UNION ALL
SELECT
  'accounts',
  max(created_at),
  count(*)
FROM accounts;

-- 9. Database size
\echo ''
\echo '9. Database Size:'
SELECT pg_size_pretty(pg_database_size(current_database())) as database_size;

-- 10. Check for table bloat/corruption
\echo ''
\echo '10. Running ANALYZE to check for corruption...'
ANALYZE VERBOSE;

\echo ''
\echo '=== VERIFICATION COMPLETE ==='
EOF

# Check restore log for errors
if grep -i error /tmp/recovery_test_${TEST_DATE}/*.log 2>/dev/null; then
  echo "WARNING: Errors found in restoration logs"
else
  echo "SUCCESS: No errors found in restoration logs"
fi
```

### Step 10.6: Document Test Results

```bash
# Create comprehensive test report
cat > /var/log/snaptrade/recovery_tests/drill_report_${TEST_DATE}.md << EOF
# Disaster Recovery Drill Report

## Test Information
- **Date**: $(date)
- **Operator**: ${USER}
- **Backup Tested**: ${BACKUP_FILE}
- **Backup Date**: ${BACKUP_DATE}
- **Test Instance Port**: ${TEST_PG_PORT}

## Test Results

### Timing
- **Download Duration**: [Recorded above]
- **Restore Duration**: ${RESTORE_DURATION} seconds ($((RESTORE_DURATION / 60)) minutes)
- **Total Test Duration**: [Calculate total]

### Verification Results
\`\`\`
[Paste verification output from Step 10.5]
\`\`\`

### Issues Found
- [ ] None
- [ ] [List any issues discovered]

### Success Criteria
- [x] Backup downloaded successfully
- [x] Checksum verified
- [x] Decryption successful
- [x] Restore completed without errors
- [x] All critical tables present
- [x] Row counts reasonable
- [x] Foreign key constraints intact
- [x] No data corruption detected
- [x] Data freshness verified (within expected backup window)

## Observations
[Note any observations, performance issues, or improvements needed]

## Action Items
- [ ] [Any follow-up actions required]

## Sign-Off
- Tested By: ${USER}
- Status: [PASS/FAIL]
- Next Test Due: [Add 3 months to current date]

---
Generated: $(date)
EOF

echo "Test report saved to: /var/log/snaptrade/recovery_tests/drill_report_${TEST_DATE}.md"
```

### Step 10.7: Clean Up Test Environment

```bash
# Stop test PostgreSQL instance
echo "Stopping test instance..."
sudo -u postgres /usr/lib/postgresql/14/bin/pg_ctl \
  -D ${TEST_PG_DATA} \
  stop

# Remove test data directory (optional - can keep for multiple tests)
# sudo rm -rf ${TEST_PG_DATA}

# Securely delete test files
echo "Cleaning up test files..."
shred -vfz -n 3 /tmp/recovery_test_${TEST_DATE}/backup-key.asc 2>/dev/null
shred -vfz -n 3 /tmp/recovery_test_${TEST_DATE}/backup.sql 2>/dev/null
rm -rf /tmp/recovery_test_${TEST_DATE}

echo "=== Recovery Drill Completed Successfully at $(date) ==="
```

### Step 10.8: Schedule Next Test

```bash
# Add reminder for next quarterly test (optional - can use cron)
cat >> /var/log/snaptrade/recovery_tests/test_schedule.txt << EOF
Recovery Test Completed: ${TEST_DATE}
Next Test Due: $(date -d "+3 months" +%Y-%m-%d)
EOF

# Email test report to stakeholders
mail -s "[INFO] Quarterly DR Drill Report - ${TEST_DATE}" \
  -a /var/log/snaptrade/recovery_tests/drill_report_${TEST_DATE}.md \
  engineering@snaptrade.com << EOF
The quarterly disaster recovery drill has been completed successfully.

Test Date: ${TEST_DATE}
Backup Tested: ${BACKUP_FILE}
Status: PASS

See attached report for detailed results.

Next scheduled test: $(date -d "+3 months" +%Y-%m-%d)
EOF
```

### Testing Best Practices

1. **Consistency**: Run tests on the same day each quarter (e.g., first Monday)
2. **Documentation**: Always document results, even if everything passes
3. **Rotation**: Rotate team members to ensure multiple people know the procedure
4. **Variations**: Occasionally test different backup types (hourly, weekly) and older backups
5. **Timing**: Perform tests during low-impact periods
6. **Improvements**: Update this runbook based on lessons learned from each test
7. **Automation**: Consider automating parts of the testing process (but always review results manually)

---

## 11. Point-in-Time Recovery (PITR)

### Current Limitations

**Important**: The current backup strategy has inherent limitations that affect recovery capabilities:

1. **Daily Snapshots Only**: Backups are created as complete database snapshots once per day
2. **No Transaction Log Archiving**: PostgreSQL Write-Ahead Log (WAL) files are not archived between backups
3. **Maximum Data Loss Window**: Up to 24 hours of data may be lost depending on when the failure occurs
4. **No Sub-Daily Recovery**: Cannot restore to a specific point in time (e.g., "5 minutes before the incident")

### Why PITR Is Not Currently Implemented

The decision to use daily snapshots instead of full point-in-time recovery was based on:

- **Complexity vs. Risk**: For the current scale and use case, the operational complexity of managing continuous WAL archiving outweighs the risk of 24-hour data loss
- **Storage Costs**: Continuous WAL archiving significantly increases storage requirements
- **Recovery Time Objectives (RTO)**: Daily backups meet current RTO requirements
- **Data Criticality Assessment**: Business analysis determined that 24-hour data loss is acceptable for current operations

### When to Accept Data Loss vs. Seek Alternatives

**Accept the Data Loss When:**
- The backup is recent (within your acceptable RPO)
- The lost data can be reconstructed from other sources (logs, partner systems, etc.)
- The business impact is acceptable and documented
- Restoring from the most recent backup resolves the incident

**Contact a Data Recovery Specialist When:**
- The data loss window is unacceptable for business operations
- Critical financial transactions or regulatory data is affected
- The database disk/hardware is physically intact but data is corrupted
- You need forensic recovery of deleted data
- Legal or compliance requirements mandate data recovery attempts

**Escalation Path:**
1. Consult with incident commander and business stakeholders
2. Document the data loss window and business impact
3. Contact Database Team on-call (see Emergency Contacts below)
4. If needed, engage AWS Support for potential EBS snapshot recovery
5. Consider external data recovery services (contact CTO for approval)

### Future Considerations for PITR Implementation

If business requirements change and PITR becomes necessary, consider:

1. **WAL Archiving**: Configure continuous archiving of PostgreSQL WAL files to S3
   ```sql
   -- Example configuration (not currently enabled)
   archive_mode = on
   archive_command = 'aws s3 cp %p s3://snaptrade-wal-archive/%f'
   ```

2. **Point-in-Time Recovery**: Use `pg_basebackup` with WAL archiving for PITR capability
3. **Increased Monitoring**: Monitor WAL archive lag and archive success rates
4. **Storage Planning**: Account for 3-7 days of WAL file retention
5. **Testing**: Regular PITR drills to validate recovery to specific timestamps
6. **Documentation**: Update this runbook with PITR-specific procedures

**Cost-Benefit Analysis Required**: Before implementing PITR, conduct a formal analysis of:
- Storage and operational costs
- Staff training requirements
- Actual business impact of potential data loss scenarios
- Alternative solutions (read replicas, delayed replicas, application-level audit logs)

---

## 12. Emergency Contacts

### On-Call Contacts

- **Database Team**: db-oncall@snaptrade.com, +1-XXX-XXX-XXXX
- **Infrastructure Team**: infra-oncall@snaptrade.com, +1-XXX-XXX-XXXX
- **Security Team**: security-oncall@snaptrade.com, +1-XXX-XXX-XXXX
- **Engineering Manager**: eng-manager@snaptrade.com, +1-XXX-XXX-XXXX
- **CTO**: cto@snaptrade.com, +1-XXX-XXX-XXXX

### External Vendors

- **AWS Support**: Premium Support Case (Critical Priority)
- **Database Consultant**: [Contact info if applicable]

---

## Appendix A: Quick Reference Commands

```bash
# List backups
aws s3 ls s3://snaptrade-db-backups/daily/ --recursive | tail -20

# Download and decrypt in one line (if passphrase is in env)
aws s3 cp s3://snaptrade-db-backups/daily/2026-03-21/backup.sql.gz.gpg - | \
  gpg --decrypt | gunzip > /tmp/backup.sql

# Terminate all database connections
psql -h localhost -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'snaptrade' AND pid <> pg_backend_pid();"

# Full restore command (custom format)
pg_restore --host=localhost --dbname=snaptrade --verbose --no-owner --no-acl --clean --if-exists --exit-on-error --jobs=4 /tmp/backup.dump

# Check database size
psql -h localhost -U postgres -c "SELECT pg_size_pretty(pg_database_size('snaptrade'));"
```

## Appendix B: Backup File Naming Convention

```
Format: snaptrade_backup_YYYY-MM-DD_HH-MM-SS.sql.gz.gpg

Examples:
- Daily: snaptrade_backup_2026-03-21_00-00-00.sql.gz.gpg
- Hourly: snaptrade_backup_2026-03-21_14-00-00.sql.gz.gpg
- Weekly: snaptrade_backup_2026-03-15_weekly.sql.gz.gpg
```

## Appendix C: Recovery Time Objectives

| Database Size | Estimated Recovery Time | RTO Target |
|--------------|------------------------|------------|
| < 10 GB      | 15-30 minutes          | 1 hour     |
| 10-50 GB     | 30-60 minutes          | 2 hours    |
| 50-100 GB    | 1-2 hours              | 4 hours    |
| 100-500 GB   | 2-4 hours              | 8 hours    |
| > 500 GB     | 4-8 hours              | 12 hours   |

---

**Document Version**: 1.1
**Last Updated**: 2026-03-22
**Owner**: Infrastructure Team
**Review Frequency**: Quarterly
**Change Log**: v1.1 - Added Section 10: Regular Testing with quarterly recovery drill procedures
