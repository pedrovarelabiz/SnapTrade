#!/usr/bin/env python3
"""
Create IAM user for backups with minimum required permissions
"""
import boto3
import json
import os

# Initialize IAM client
iam = boto3.client('iam')

# Configuration
USER_NAME = 'snaptrade-backup-user'
POLICY_NAME = 'SnapTradeBackupPolicy'
BUCKET_NAME = 'snaptrade-unified-backups'

def create_backup_user():
    """Create IAM user and attach backup policy"""

    print(f"🔨 Creating IAM user: {USER_NAME}")

    # Step 1: Create IAM user
    try:
        user_response = iam.create_user(UserName=USER_NAME)
        print(f"✅ Created user: {USER_NAME}")
        print(f"   ARN: {user_response['User']['Arn']}")
    except iam.exceptions.EntityAlreadyExistsException:
        print(f"⚠️  User {USER_NAME} already exists")
    except Exception as e:
        print(f"❌ Failed to create user: {e}")
        return False

    # Step 2: Create custom policy with minimum permissions
    policy_document = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "BackupBucketAccess",
                "Effect": "Allow",
                "Action": [
                    "s3:PutObject",
                    "s3:GetObject",
                    "s3:ListBucket",
                    "s3:DeleteObject"
                ],
                "Resource": [
                    f"arn:aws:s3:::{BUCKET_NAME}",
                    f"arn:aws:s3:::{BUCKET_NAME}/*"
                ]
            }
        ]
    }

    print(f"\n🔨 Creating IAM policy: {POLICY_NAME}")

    try:
        policy_response = iam.create_policy(
            PolicyName=POLICY_NAME,
            PolicyDocument=json.dumps(policy_document),
            Description=f"Minimum permissions for {BUCKET_NAME} backup operations"
        )
        policy_arn = policy_response['Policy']['Arn']
        print(f"✅ Created policy: {POLICY_NAME}")
        print(f"   ARN: {policy_arn}")
    except iam.exceptions.EntityAlreadyExistsException:
        # Get existing policy ARN
        account_id = boto3.client('sts').get_caller_identity()['Account']
        policy_arn = f"arn:aws:iam::{account_id}:policy/{POLICY_NAME}"
        print(f"⚠️  Policy {POLICY_NAME} already exists")
        print(f"   ARN: {policy_arn}")
    except Exception as e:
        print(f"❌ Failed to create policy: {e}")
        return False

    # Step 3: Attach policy to user
    print(f"\n🔨 Attaching policy to user")

    try:
        iam.attach_user_policy(
            UserName=USER_NAME,
            PolicyArn=policy_arn
        )
        print(f"✅ Attached policy to {USER_NAME}")
    except Exception as e:
        print(f"❌ Failed to attach policy: {e}")
        return False

    # Step 4: Create access keys
    print(f"\n🔨 Creating access keys for programmatic access")

    try:
        key_response = iam.create_access_key(UserName=USER_NAME)
        access_key = key_response['AccessKey']

        print(f"✅ Created access keys")
        print(f"\n{'='*60}")
        print(f"🔐 CREDENTIALS - SAVE THESE SECURELY (shown only once)")
        print(f"{'='*60}")
        print(f"AWS_ACCESS_KEY_ID={access_key['AccessKeyId']}")
        print(f"AWS_SECRET_ACCESS_KEY={access_key['SecretAccessKey']}")
        print(f"{'='*60}\n")

        # Save to secure file
        creds_file = '/opt/snaptrade-unified/backup-user-credentials.txt'
        with open(creds_file, 'w') as f:
            f.write(f"# Backup IAM User Credentials - Created on {os.popen('date').read().strip()}\n")
            f.write(f"# User: {USER_NAME}\n")
            f.write(f"# Bucket: {BUCKET_NAME}\n\n")
            f.write(f"AWS_ACCESS_KEY_ID={access_key['AccessKeyId']}\n")
            f.write(f"AWS_SECRET_ACCESS_KEY={access_key['SecretAccessKey']}\n")
        os.chmod(creds_file, 0o600)  # Read/write for owner only
        print(f"💾 Credentials saved to: {creds_file} (chmod 600)")

    except Exception as e:
        print(f"❌ Failed to create access keys: {e}")
        return False

    print(f"\n✅ IAM user setup complete!")
    return True

if __name__ == '__main__':
    success = create_backup_user()
    exit(0 if success else 1)
