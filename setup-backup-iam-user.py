#!/usr/bin/env python3
"""
Setup AWS IAM User for Backups
Creates snaptrade-backup-user with minimal S3 permissions for backup operations.
"""

import boto3
import json
import os
from datetime import datetime

# Configuration
IAM_USER_NAME = 'snaptrade-backup-user'
POLICY_NAME = 'snaptrade-backup-policy'
BACKUP_BUCKET = 'snaptrade-unified-backups'
CREDENTIALS_FILE = 'backup-user-credentials.json'

def create_backup_iam_user():
    """Create IAM user with backup permissions and generate access keys."""

    iam = boto3.client('iam')

    print(f"Creating IAM user: {IAM_USER_NAME}")

    # Step 1: Create IAM user
    try:
        user_response = iam.create_user(
            UserName=IAM_USER_NAME,
            Tags=[
                {'Key': 'Purpose', 'Value': 'Database Backups'},
                {'Key': 'Application', 'Value': 'SnapTrade'},
                {'Key': 'CreatedBy', 'Value': 'backup-setup-script'},
                {'Key': 'CreatedDate', 'Value': datetime.utcnow().isoformat()}
            ]
        )
        print(f"✓ User created: {IAM_USER_NAME}")
    except iam.exceptions.EntityAlreadyExistsException:
        print(f"✓ User already exists: {IAM_USER_NAME}")
        user_response = iam.get_user(UserName=IAM_USER_NAME)

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
                    f"arn:aws:s3:::{BACKUP_BUCKET}",
                    f"arn:aws:s3:::{BACKUP_BUCKET}/*"
                ]
            }
        ]
    }

    print(f"\nCreating IAM policy: {POLICY_NAME}")
    try:
        policy_response = iam.create_policy(
            PolicyName=POLICY_NAME,
            PolicyDocument=json.dumps(policy_document),
            Description=f"Minimum permissions for backup operations on {BACKUP_BUCKET}"
        )
        policy_arn = policy_response['Policy']['Arn']
        print(f"✓ Policy created: {policy_arn}")
    except iam.exceptions.EntityAlreadyExistsException:
        # Get the policy ARN if it already exists
        account_id = boto3.client('sts').get_caller_identity()['Account']
        policy_arn = f"arn:aws:iam::{account_id}:policy/{POLICY_NAME}"
        print(f"✓ Policy already exists: {policy_arn}")

    # Step 3: Attach policy to user
    print(f"\nAttaching policy to user...")
    try:
        iam.attach_user_policy(
            UserName=IAM_USER_NAME,
            PolicyArn=policy_arn
        )
        print(f"✓ Policy attached to user")
    except Exception as e:
        if 'already attached' in str(e).lower():
            print(f"✓ Policy already attached to user")
        else:
            raise

    # Step 4: Create access keys
    print(f"\nGenerating access keys for programmatic access...")
    try:
        # Check if user already has access keys
        existing_keys = iam.list_access_keys(UserName=IAM_USER_NAME)
        if existing_keys['AccessKeyMetadata']:
            print(f"⚠ User already has {len(existing_keys['AccessKeyMetadata'])} access key(s)")
            print(f"⚠ Skipping access key creation to avoid exceeding limit")
            print(f"⚠ If you need new keys, delete old ones first with:")
            print(f"   aws iam delete-access-key --user-name {IAM_USER_NAME} --access-key-id <KEY_ID>")
            return None

        access_key_response = iam.create_access_key(UserName=IAM_USER_NAME)
        access_key = access_key_response['AccessKey']

        print(f"✓ Access keys generated")

        # Step 5: Save credentials securely
        credentials = {
            'UserName': IAM_USER_NAME,
            'AccessKeyId': access_key['AccessKeyId'],
            'SecretAccessKey': access_key['SecretAccessKey'],
            'CreatedDate': access_key['CreateDate'].isoformat(),
            'Bucket': BACKUP_BUCKET,
            'Region': os.environ.get('AWS_REGION', 'us-east-1')
        }

        with open(CREDENTIALS_FILE, 'w') as f:
            json.dump(credentials, f, indent=2)

        # Set restrictive permissions on credentials file
        os.chmod(CREDENTIALS_FILE, 0o600)

        print(f"\n✓ Credentials saved to: {CREDENTIALS_FILE}")
        print(f"✓ File permissions set to 600 (owner read/write only)")

        # Print credentials (only this once)
        print(f"\n{'='*60}")
        print(f"IMPORTANT: Save these credentials securely!")
        print(f"{'='*60}")
        print(f"AWS_ACCESS_KEY_ID={access_key['AccessKeyId']}")
        print(f"AWS_SECRET_ACCESS_KEY={access_key['SecretAccessKey']}")
        print(f"BACKUP_S3_BUCKET={BACKUP_BUCKET}")
        print(f"AWS_REGION={credentials['Region']}")
        print(f"{'='*60}")
        print(f"\nAdd these to your backend/.env file")

        return credentials

    except Exception as e:
        print(f"✗ Error creating access keys: {e}")
        return None

def verify_user():
    """Verify the IAM user was created successfully."""
    iam = boto3.client('iam')

    print(f"\n{'='*60}")
    print(f"VERIFICATION")
    print(f"{'='*60}")

    try:
        user = iam.get_user(UserName=IAM_USER_NAME)
        print(f"✓ User exists: {IAM_USER_NAME}")
        print(f"  ARN: {user['User']['Arn']}")
        print(f"  Created: {user['User']['CreateDate']}")

        # List attached policies
        policies = iam.list_attached_user_policies(UserName=IAM_USER_NAME)
        print(f"\n✓ Attached policies:")
        for policy in policies['AttachedPolicies']:
            print(f"  - {policy['PolicyName']} ({policy['PolicyArn']})")

        # List access keys
        keys = iam.list_access_keys(UserName=IAM_USER_NAME)
        print(f"\n✓ Access keys: {len(keys['AccessKeyMetadata'])} key(s)")
        for key in keys['AccessKeyMetadata']:
            print(f"  - {key['AccessKeyId']} (Status: {key['Status']}, Created: {key['CreateDate']})")

        return True

    except iam.exceptions.NoSuchEntityException:
        print(f"✗ User not found: {IAM_USER_NAME}")
        return False
    except Exception as e:
        print(f"✗ Error verifying user: {e}")
        return False

if __name__ == '__main__':
    print("AWS IAM Backup User Setup")
    print("=" * 60)

    try:
        credentials = create_backup_iam_user()
        verify_user()

        print(f"\n{'='*60}")
        print(f"SETUP COMPLETE")
        print(f"{'='*60}")
        print(f"✓ IAM user '{IAM_USER_NAME}' is ready for backup operations")
        print(f"✓ Permissions: s3:PutObject, s3:GetObject, s3:ListBucket, s3:DeleteObject")
        print(f"✓ Bucket: {BACKUP_BUCKET}")

        if credentials:
            print(f"✓ Credentials saved to: {CREDENTIALS_FILE}")
            print(f"\nNext steps:")
            print(f"  1. Add credentials to backend/.env")
            print(f"  2. Test backup functionality")
            print(f"  3. Securely delete {CREDENTIALS_FILE} after setup")

    except Exception as e:
        print(f"\n✗ Setup failed: {e}")
        exit(1)
