# Backup IAM User Setup

## Overview
Created dedicated AWS IAM user for backup operations with minimum required permissions.

## Configuration

**User Name:** `snaptrade-backup-user`
**Policy Name:** `SnapTradeBackupPolicy`
**Bucket:** `snaptrade-unified-backups`
**Access Type:** Programmatic (Access Key ID + Secret Access Key)

## Permissions (Principle of Least Privilege)

The policy grants ONLY these S3 permissions on the backup bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BackupBucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",      // Upload backups
        "s3:GetObject",       // Download/restore backups
        "s3:ListBucket",      // List backup files
        "s3:DeleteObject"     // Cleanup old backups
      ],
      "Resource": [
        "arn:aws:s3:::snaptrade-prod-backups-cf1a37fed3d33a28",
        "arn:aws:s3:::snaptrade-prod-backups-cf1a37fed3d33a28/*"
      ]
    }
  ]
}
```

## Setup Instructions

### Option 1: Using Bash Script (requires AWS CLI)

```bash
# Ensure AWS credentials are configured
export AWS_ACCESS_KEY_ID=<your-admin-key>
export AWS_SECRET_ACCESS_KEY=<your-admin-secret>
export AWS_REGION=eu-west-1

# Run setup script
./setup-backup-iam-user.sh
```

### Option 2: Using Python Script (requires boto3)

```bash
# Ensure AWS credentials are configured
export AWS_ACCESS_KEY_ID=<your-admin-key>
export AWS_SECRET_ACCESS_KEY=<your-admin-secret>
export AWS_REGION=eu-west-1

# Run setup script
python3 create-backup-iam-user.py
```

### Option 3: Manual AWS Console Steps

1. **Create User:**
   - Go to IAM → Users → Add Users
   - Username: `snaptrade-backup-user`
   - Access type: Programmatic access

2. **Create Policy:**
   - IAM → Policies → Create Policy
   - Use the JSON policy document above
   - Name: `SnapTradeBackupPolicy`

3. **Attach Policy:**
   - Select user `snaptrade-backup-user`
   - Attach policies → Select `SnapTradeBackupPolicy`

4. **Generate Access Keys:**
   - User → Security credentials → Create access key
   - Save the credentials securely

## Verification

```bash
# Verify user exists
aws iam get-user --user-name snaptrade-backup-user

# Verify policy is attached
aws iam list-attached-user-policies --user-name snaptrade-backup-user

# Test S3 access (using the new credentials)
aws s3 ls s3://snaptrade-prod-backups-cf1a37fed3d33a28/ \
  --profile backup-user
```

## Security Best Practices

✅ **Implemented:**
- Minimum required permissions (least privilege)
- Scope limited to single bucket
- Programmatic-only access (no console)
- Credentials saved with restrictive permissions (chmod 600)

⚠️ **Remember to:**
- Rotate access keys every 90 days
- Store credentials in secure secret management (AWS Secrets Manager, Vault, etc.)
- Monitor CloudTrail logs for unusual activity
- Never commit credentials to version control

## Credentials Location

After running the setup script, credentials are saved to:
```
/opt/snaptrade-unified/backup-user-credentials.txt
```

**File permissions:** `600` (owner read/write only)

## Usage in Backup Scripts

Update your backup scripts to use the new credentials:

```bash
export AWS_ACCESS_KEY_ID=<from-credentials-file>
export AWS_SECRET_ACCESS_KEY=<from-credentials-file>
export AWS_REGION=eu-west-1
export S3_BACKUP_BUCKET=snaptrade-prod-backups-cf1a37fed3d33a28

# Now run your backup scripts
./run-backup.sh
```

## Troubleshooting

**User creation fails:**
```bash
# Check if user already exists
aws iam get-user --user-name snaptrade-backup-user
```

**Policy attachment fails:**
```bash
# List existing policies
aws iam list-policies --scope Local | grep SnapTradeBackup
```

**Access denied errors:**
```bash
# Verify policy is attached
aws iam list-attached-user-policies --user-name snaptrade-backup-user

# Check policy document
aws iam get-policy-version --policy-arn <arn> --version-id v1
```

## Cleanup (if needed)

```bash
# Delete access keys first
aws iam delete-access-key --user-name snaptrade-backup-user --access-key-id <key-id>

# Detach policy
aws iam detach-user-policy --user-name snaptrade-backup-user --policy-arn <arn>

# Delete policy
aws iam delete-policy --policy-arn <arn>

# Delete user
aws iam delete-user --user-name snaptrade-backup-user
```
