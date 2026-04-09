# Backup Setup Guide

This guide walks through setting up the PostgreSQL backup system for new deployments.

## Prerequisites

Install required tools:

```bash
# Install PostgreSQL client tools
sudo apt-get update
sudo apt-get install -y postgresql-client

# Verify pg_dump is available
pg_dump --version

# Optional: Install AWS CLI for S3 uploads
sudo apt-get install -y awscli
aws --version
```

## AWS Configuration

### 1. Create IAM User

Create an IAM user with S3 access:

```bash
# Via AWS CLI (if you have admin credentials configured)
aws iam create-user --user-name snaptrade-backup-user

# Create access key
aws iam create-access-key --user-name snaptrade-backup-user
```

Or use the AWS Console:
- Navigate to IAM → Users → Create User
- Username: `snaptrade-backup-user`
- Access type: Programmatic access
- Save the Access Key ID and Secret Access Key

### 2. Create S3 Bucket

```bash
# Create bucket (replace REGION with your preferred region)
REGION=us-east-1
BUCKET_NAME=snaptrade-backups-$(date +%s)

aws s3 mb s3://${BUCKET_NAME} --region ${REGION}

# Enable versioning (recommended)
aws s3api put-bucket-versioning \
  --bucket ${BUCKET_NAME} \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket ${BUCKET_NAME} \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
```

### 3. Create IAM Policy

Create policy with S3 access (save as `backup-policy.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR_BUCKET_NAME",
        "arn:aws:s3:::YOUR_BUCKET_NAME/*"
      ]
    }
  ]
}
```

Apply the policy:

```bash
# Create policy
aws iam create-policy \
  --policy-name SnapTradeBackupPolicy \
  --policy-document file://backup-policy.json

# Attach to user
aws iam attach-user-policy \
  --user-name snaptrade-backup-user \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/SnapTradeBackupPolicy
```

## Encryption Key Generation

Generate a strong encryption key for local backup encryption:

```bash
# Generate 256-bit encryption key
ENCRYPTION_KEY=$(openssl rand -base64 32)
echo "Generated encryption key: ${ENCRYPTION_KEY}"

# Save to secure location
echo "${ENCRYPTION_KEY}" > /opt/snaptrade-unified/backend/.backup_encryption_key
chmod 600 /opt/snaptrade-unified/backend/.backup_encryption_key
```

**Important:** Store this key securely in your password manager. You'll need it to decrypt backups.

## Environment Variables

Configure environment variables in `/opt/snaptrade-unified/backend/.env`:

```bash
# Add backup configuration
cat >> /opt/snaptrade-unified/backend/.env << 'EOF'

# Backup Configuration
BACKUP_ENCRYPTION_KEY=YOUR_GENERATED_KEY_HERE
AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_KEY
S3_BACKUP_BUCKET=YOUR_BUCKET_NAME
S3_BACKUP_REGION=us-east-1
BACKUP_RETENTION_DAYS=30

# Database connection (if not already set)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=snaptrade
DB_USER=snaptrade_user
DB_PASSWORD=your_db_password
EOF

# Secure the file
chmod 600 /opt/snaptrade-unified/backend/.env
```

Or set them individually:

```bash
export BACKUP_ENCRYPTION_KEY="$(cat /opt/snaptrade-unified/backend/.backup_encryption_key)"
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key"
export S3_BACKUP_BUCKET="your_bucket_name"
export S3_BACKUP_REGION="us-east-1"
export BACKUP_RETENTION_DAYS=30
```

## Local Directory Setup

Create required directories:

```bash
# Create backup directories
sudo mkdir -p /var/backups/snaptrade/postgres
sudo mkdir -p /var/backups/snaptrade/archive
sudo mkdir -p /var/log/snaptrade/backups

# Set ownership (replace 'snaptrade' with your app user)
sudo chown -R snaptrade:snaptrade /var/backups/snaptrade
sudo chown -R snaptrade:snaptrade /var/log/snaptrade

# Set permissions
sudo chmod 700 /var/backups/snaptrade
sudo chmod 755 /var/log/snaptrade
```

## Build and Test Backup Scripts

### 1. Make Scripts Executable

```bash
cd /opt/snaptrade-unified/backend/scripts

# Make all backup scripts executable
chmod +x backup_postgres.sh
chmod +x backup_cleanup.sh
chmod +x backup_restore.sh
```

### 2. Test Backup Script

Run a test backup:

```bash
# Source environment variables
source /opt/snaptrade-unified/backend/.env

# Run backup
./scripts/backup_postgres.sh

# Verify backup was created
ls -lh /var/backups/snaptrade/postgres/
```

Expected output: A new `.sql.gz.enc` file in the backup directory.

### 3. Test S3 Upload (Optional)

If using S3:

```bash
# Test upload
aws s3 ls s3://${S3_BACKUP_BUCKET}/

# You should see your backup file
```

### 4. Test Restoration (Important!)

```bash
# List available backups
./scripts/backup_restore.sh --list

# Test restore to a different database
./scripts/backup_restore.sh --file backup_20260322_120000.sql.gz.enc --database snaptrade_test

# Verify restoration worked
psql -h localhost -U snaptrade_user -d snaptrade_test -c "SELECT COUNT(*) FROM pg_tables;"
```

## SystemD Service and Timer Setup

### 1. Create SystemD Service

Create `/etc/systemd/system/snaptrade-backup.service`:

```bash
sudo tee /etc/systemd/system/snaptrade-backup.service > /dev/null << 'EOF'
[Unit]
Description=SnapTrade PostgreSQL Backup
After=postgresql.service
Requires=postgresql.service

[Service]
Type=oneshot
User=snaptrade
Group=snaptrade
WorkingDirectory=/opt/snaptrade-unified/backend
EnvironmentFile=/opt/snaptrade-unified/backend/.env
ExecStart=/opt/snaptrade-unified/backend/scripts/backup_postgres.sh
StandardOutput=journal
StandardError=journal
SyslogIdentifier=snaptrade-backup

[Install]
WantedBy=multi-user.target
EOF
```

### 2. Create SystemD Timer

Create `/etc/systemd/system/snaptrade-backup.timer`:

```bash
sudo tee /etc/systemd/system/snaptrade-backup.timer > /dev/null << 'EOF'
[Unit]
Description=SnapTrade PostgreSQL Backup Timer
Requires=snaptrade-backup.service

[Timer]
# Run daily at 2 AM
OnCalendar=daily
OnCalendar=02:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF
```

### 3. Create Cleanup Service and Timer

Create cleanup service `/etc/systemd/system/snaptrade-backup-cleanup.service`:

```bash
sudo tee /etc/systemd/system/snaptrade-backup-cleanup.service > /dev/null << 'EOF'
[Unit]
Description=SnapTrade Backup Cleanup
After=snaptrade-backup.service

[Service]
Type=oneshot
User=snaptrade
Group=snaptrade
WorkingDirectory=/opt/snaptrade-unified/backend
EnvironmentFile=/opt/snaptrade-unified/backend/.env
ExecStart=/opt/snaptrade-unified/backend/scripts/backup_cleanup.sh
StandardOutput=journal
StandardError=journal
SyslogIdentifier=snaptrade-backup-cleanup

[Install]
WantedBy=multi-user.target
EOF
```

Create cleanup timer `/etc/systemd/system/snaptrade-backup-cleanup.timer`:

```bash
sudo tee /etc/systemd/system/snaptrade-backup-cleanup.timer > /dev/null << 'EOF'
[Unit]
Description=SnapTrade Backup Cleanup Timer
Requires=snaptrade-backup-cleanup.service

[Timer]
# Run daily at 3 AM (after backup)
OnCalendar=daily
OnCalendar=03:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
```

### 4. Enable and Start Services

```bash
# Reload SystemD
sudo systemctl daemon-reload

# Enable timers (they will start on boot)
sudo systemctl enable snaptrade-backup.timer
sudo systemctl enable snaptrade-backup-cleanup.timer

# Start timers immediately
sudo systemctl start snaptrade-backup.timer
sudo systemctl start snaptrade-backup-cleanup.timer

# Verify timers are active
sudo systemctl status snaptrade-backup.timer
sudo systemctl status snaptrade-backup-cleanup.timer

# List all timers
sudo systemctl list-timers snaptrade-backup*
```

## Verify First Backup

### Manual Test Run

Trigger the backup service manually:

```bash
# Run backup service
sudo systemctl start snaptrade-backup.service

# Check status
sudo systemctl status snaptrade-backup.service

# View logs
sudo journalctl -u snaptrade-backup.service -n 50

# Verify backup file was created
ls -lh /var/backups/snaptrade/postgres/
```

### Verify Backup Contents

```bash
# Check the latest backup
LATEST_BACKUP=$(ls -t /var/backups/snaptrade/postgres/*.sql.gz.enc | head -1)
echo "Latest backup: ${LATEST_BACKUP}"

# Decrypt and check (without restoring)
openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:${BACKUP_ENCRYPTION_KEY} \
  -in "${LATEST_BACKUP}" | gunzip | head -n 20
```

### Verify S3 Upload (if configured)

```bash
# Check S3 bucket
aws s3 ls s3://${S3_BACKUP_BUCKET}/postgres/ --recursive

# Check latest upload
aws s3 ls s3://${S3_BACKUP_BUCKET}/postgres/ --recursive | tail -n 5
```

## Monitoring and Maintenance

### Check Backup Status

```bash
# View recent backup logs
sudo journalctl -u snaptrade-backup.service --since "24 hours ago"

# Check backup file sizes
du -sh /var/backups/snaptrade/postgres/*

# Check disk space
df -h /var/backups
```

### Test Restoration Regularly

Schedule regular restoration tests:

```bash
# Monthly restoration test
./scripts/backup_restore.sh --file "$(ls -t /var/backups/snaptrade/postgres/*.sql.gz.enc | head -1)" \
  --database snaptrade_restore_test

# Verify and cleanup
psql -h localhost -U snaptrade_user -d snaptrade_restore_test -c "SELECT version();"
dropdb -h localhost -U snaptrade_user snaptrade_restore_test
```

## Troubleshooting

### Backup Service Fails

```bash
# Check service status
sudo systemctl status snaptrade-backup.service

# View detailed logs
sudo journalctl -u snaptrade-backup.service -n 100 --no-pager

# Test script manually
sudo -u snaptrade bash -c 'source /opt/snaptrade-unified/backend/.env && /opt/snaptrade-unified/backend/scripts/backup_postgres.sh'
```

### Permission Issues

```bash
# Fix directory permissions
sudo chown -R snaptrade:snaptrade /var/backups/snaptrade
sudo chmod 700 /var/backups/snaptrade

# Fix script permissions
sudo chown snaptrade:snaptrade /opt/snaptrade-unified/backend/scripts/*.sh
sudo chmod +x /opt/snaptrade-unified/backend/scripts/*.sh
```

### S3 Upload Fails

```bash
# Test AWS credentials
aws s3 ls s3://${S3_BACKUP_BUCKET}

# Check IAM permissions
aws iam list-attached-user-policies --user-name snaptrade-backup-user
```

## Security Checklist

- [ ] Encryption key stored securely and backed up separately
- [ ] `.env` file has 600 permissions (not world-readable)
- [ ] Backup directories have 700 permissions
- [ ] AWS credentials use least-privilege IAM policy
- [ ] S3 bucket has versioning enabled
- [ ] S3 bucket has encryption enabled
- [ ] Tested backup restoration process
- [ ] Documented recovery procedures
- [ ] Set up monitoring/alerting for backup failures

## Next Steps

1. Set up monitoring alerts for backup failures
2. Document disaster recovery procedures
3. Schedule regular (monthly) restoration tests
4. Consider cross-region S3 replication for critical data
5. Review and update retention policies as needed
