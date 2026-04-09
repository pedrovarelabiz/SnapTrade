# Backup System Security Documentation

## Security Review Checklist

### ✅ 1. No Credentials in Code
- All credentials are loaded from environment variables
- No hardcoded AWS keys (AKIA*) or secrets found in source code
- Database passwords loaded from `DB_PASSWORD` environment variable
- Encryption key loaded from `BACKUP_ENCRYPTION_KEY` environment variable

### ✅ 2. .gitignore Configuration
The `.gitignore` file includes all sensitive patterns:
- `.env` files and variants (.env.*, .env.local, etc.)
- AWS credentials files
- Encryption key files (*.key)
- Backup files (*.dump, *.dump.enc)
- Audit logs
- Backup directories

### ✅ 3. Encryption Key Strength
- Encryption uses **AES-256-GCM** (authenticated encryption)
- Key length: **32 bytes (256 bits)** - cryptographically strong
- Keys generated using `crypto.randomBytes(32)` (CSPRNG)
- Authentication tag prevents tampering
- Generate new key: `npm run generate-encryption-key`

### ✅ 4. S3 Bucket Security Configuration

#### Required S3 Bucket Settings
```json
{
  "BlockPublicAcls": true,
  "IgnorePublicAcls": true,
  "BlockPublicPolicy": true,
  "RestrictPublicBuckets": true
}
```

#### Server-Side Encryption
- **Automatic**: Files uploaded with `ServerSideEncryption: 'AES256'`
- S3 applies additional encryption at rest
- Double encryption: client-side (before upload) + server-side (S3)

#### Recommended Bucket Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::YOUR-BUCKET-NAME",
        "arn:aws:s3:::YOUR-BUCKET-NAME/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

### ✅ 5. IAM Permissions (Minimal/Least Privilege)

#### Backup Process IAM Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BackupS3Permissions",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR-BUCKET-NAME/backups/*",
        "arn:aws:s3:::YOUR-BUCKET-NAME"
      ]
    },
    {
      "Sid": "BackupBucketCheck",
      "Effect": "Allow",
      "Action": [
        "s3:HeadBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME"
    }
  ]
}
```

**Notes:**
- Does NOT include `s3:DeleteObject` - backups cannot be deleted by backup process
- Limited to `backups/*` prefix only
- No wildcard S3 access
- No KMS permissions needed (using S3-managed keys)

#### Restore Process IAM Policy (Separate User)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RestoreS3Permissions",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR-BUCKET-NAME/backups/*",
        "arn:aws:s3:::YOUR-BUCKET-NAME"
      ]
    }
  ]
}
```

### ✅ 6. Local File Permissions

#### Backup Directory
- **Permissions**: `0700` (rwx------) - owner only
- **Location**: `/var/backups/snaptrade` (configurable via `LOCAL_BACKUP_DIR`)
- Automatically created with restricted permissions
- Existing directories are verified and corrected to 0700

#### Audit Log File
- **Permissions**: `0600` (rw-------) - owner read/write only
- **Location**: `${LOCAL_BACKUP_DIR}/backup-audit.log`
- Contains security-sensitive information:
  - User who triggered backup
  - Source IP addresses
  - Encryption key access events
  - S3 operations

#### Lock File
- **Permissions**: `0644` (rw-r--r--) - readable by all for monitoring
- **Location**: `/var/run/db-backup.lock` or `/tmp/db-backup.lock`
- Contains only PID and timestamp (non-sensitive)

#### Unencrypted Backup Files
- **Retention**: **ZERO** - deleted immediately after encryption
- Never written to disk with permissive permissions
- Temporary files deleted on error to prevent disk bloat

#### Encrypted Backup Files
- Deleted after S3 upload (unless `KEEP_LOCAL_BACKUP_COPY=true`)
- If retained locally, inherits directory permissions (0700)

### ✅ 7. Comprehensive Audit Logging

#### Logged Events
All security-relevant events are logged to `backup-audit.log`:

1. **BACKUP_START** - Backup initiated
   - Trigger type (manual/scheduled)
   - User who triggered
   - Source IP address
   - Parent process

2. **LOCK_ACQUIRED** / **LOCK_RELEASED** - Concurrency control
   - Lock file path
   - Process ID

3. **FILE_CREATED** - File operations
   - File path
   - File size
   - Encrypted status (true/false)

4. **ENCRYPTION_KEY_ACCESSED** - Key usage tracking
   - Purpose (backup-encryption/backup-decryption)
   - Key environment variable name

5. **FILE_DELETED** - File cleanup
   - File path
   - Reason (security-requirement, cleanup-after-s3-upload)

6. **S3_UPLOAD** - Cloud storage operations
   - S3 bucket and key
   - File size
   - Region

7. **BACKUP_SUCCESS** / **BACKUP_FAILURE** - Operation results
   - Duration
   - Error messages (if failed)
   - Stack traces (if failed)

#### Log Format
- **Format**: JSON (one entry per line)
- **Fields**: timestamp, action, pid, hostname, event-specific data
- **Retention**: Rotate logs externally (e.g., logrotate)

#### Example Audit Entry
```json
{
  "timestamp": "2026-03-22T14:30:22.123Z",
  "action": "BACKUP_START",
  "pid": 12345,
  "hostname": "backup-server-01",
  "triggerType": "manual",
  "triggeredBy": "admin",
  "sourceIp": "192.168.1.100",
  "parentProcess": "bash",
  "database": "snaptrade_db",
  "host": "db.example.com"
}
```

## Security Best Practices

### Environment Variables
Store all sensitive values in environment variables:
- `DB_PASSWORD` - Database password
- `BACKUP_ENCRYPTION_KEY` - 32-byte hex key (64 characters)
- `AWS_ACCESS_KEY_ID` - AWS credentials
- `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `S3_BACKUP_BUCKET` - S3 bucket name

### Key Management
- **Generation**: Use `npm run generate-encryption-key`
- **Storage**: AWS Secrets Manager, HashiCorp Vault, or secure password manager
- **Rotation**: Plan for key rotation (requires re-encryption of old backups)
- **Backup**: Store key securely offline - losing it means data loss

### Network Security
- Database connections use SSL/TLS when `DB_SSL=true`
- S3 uploads always use HTTPS (enforced by bucket policy)
- No plaintext transmission of credentials

### Monitoring
- Review `backup-audit.log` regularly for suspicious activity
- Set up alerts for backup failures (via alerts.ts)
- Monitor S3 bucket access logs (CloudTrail)

### Disaster Recovery
- Test restore process regularly (`npm run test:restore`)
- Store encryption key in multiple secure locations
- Document recovery procedures

## Verification Commands

```bash
# 1. No hardcoded credentials
cd /opt/snaptrade-unified
grep -r "AKIA\|secret" backend/scripts/ --include="*.ts" || echo "No hardcoded credentials found"

# 2. Check .gitignore includes sensitive files
grep -E "\.env|audit|key|encryption|\.dump" .gitignore

# 3. Verify encryption key strength (should be 64 hex chars = 32 bytes)
echo $BACKUP_ENCRYPTION_KEY | wc -c  # Should output 65 (64 chars + newline)

# 4. Check backup directory permissions
ls -ld /var/backups/snaptrade  # Should show: drwx------ (0700)

# 5. Check audit log permissions
ls -l /var/backups/snaptrade/backup-audit.log  # Should show: -rw------- (0600)

# 6. Validate S3 bucket is private
aws s3api get-public-access-block --bucket YOUR-BUCKET-NAME

# 7. Test IAM permissions
aws s3 ls s3://YOUR-BUCKET-NAME/backups/  # Should work
aws s3 rm s3://YOUR-BUCKET-NAME/backups/test.txt  # Should fail (no delete permission)
```

## Compliance Notes

This backup system is designed to meet common security compliance requirements:
- **SOC 2**: Audit logging, encryption at rest, access controls
- **HIPAA**: Encryption, audit trails, secure transmission
- **PCI DSS**: Encryption, access controls, audit logging
- **GDPR**: Data protection, encryption, access controls

Consult with your compliance team for specific requirements.
