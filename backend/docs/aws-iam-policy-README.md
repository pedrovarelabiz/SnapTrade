# AWS IAM Policy for Backups

## Overview
This IAM policy grants the minimum required permissions for backup operations to an S3 bucket.

## Setup Instructions
1. Replace `your-backup-bucket-name` in `aws-iam-policy.json` with your actual S3 bucket name
2. In AWS IAM Console, create a new policy and paste the JSON content
3. Attach the policy to the IAM user or role that will perform backups

## Permission Explanations

### s3:PutObject
**Purpose:** Upload backup files to the S3 bucket
**Why needed:** Required to write new backup files and create objects in the bucket

### s3:GetObject
**Purpose:** Download and retrieve backup files from the S3 bucket
**Why needed:** Required to restore data from backups or verify backup integrity

### s3:ListBucket
**Purpose:** List and enumerate objects in the S3 bucket
**Why needed:** Required to view available backups, check if files exist, and manage backup retention

### s3:DeleteObject
**Purpose:** Remove backup files from the S3 bucket
**Why needed:** Required to implement backup retention policies and clean up old backups to manage storage costs

## Security Best Practices
- Always restrict the policy to specific bucket ARNs (never use `*`)
- Use separate IAM users/roles for backup operations vs. application access
- Enable MFA Delete on the S3 bucket for additional protection
- Regularly rotate IAM credentials
- Monitor CloudTrail logs for unauthorized access attempts
