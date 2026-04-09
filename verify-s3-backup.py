#!/usr/bin/env python3
"""
Verify backup file in S3 bucket
Checks for existence, naming format, size, and metadata
"""
import boto3
import os
import sys
import re
from datetime import datetime

def verify_s3_backup():
    bucket_name = os.environ.get('S3_BACKUP_BUCKET', 'snaptrade-test-backups')

    print(f"🔍 Verifying backups in S3 bucket: {bucket_name}")
    print("-" * 70)

    try:
        s3 = boto3.client('s3')

        # List objects with the backup prefix
        response = s3.list_objects_v2(
            Bucket=bucket_name,
            Prefix='snaptrade-postgres-'
        )

        if 'Contents' not in response:
            print("❌ No backup files found in bucket")
            return False

        # Filter for .dump.enc files and sort by LastModified
        backup_files = [
            obj for obj in response['Contents']
            if obj['Key'].endswith('.dump.enc') and 'snaptrade-postgres-' in obj['Key']
        ]

        if not backup_files:
            print("❌ No encrypted backup files found matching pattern")
            return False

        # Sort by LastModified descending
        backup_files.sort(key=lambda x: x['LastModified'], reverse=True)

        # Get the most recent backup
        latest = backup_files[0]

        print(f"\n✅ Latest backup file found:")
        print(f"   📄 Name: {latest['Key']}")
        print(f"   📦 Size: {latest['Size']:,} bytes ({latest['Size'] / 1024:.2f} KB, {latest['Size'] / (1024*1024):.2f} MB)")
        print(f"   📅 Last Modified: {latest['LastModified']}")
        print(f"   🔗 S3 URL: s3://{bucket_name}/{latest['Key']}")

        # Verify size (should be > 100KB)
        size_ok = latest['Size'] > 100 * 1024
        if size_ok:
            print(f"   ✅ Size check passed (>{100}KB)")
        else:
            print(f"   ⚠️  Warning: Size is less than 100KB")

        # Verify naming format: snaptrade-postgres-YYYY-MM-DD-HHmmss.dump.enc
        pattern = r'snaptrade-postgres-\d{4}-\d{2}-\d{2}-\d{6}\.dump\.enc$'
        format_ok = bool(re.match(pattern, latest['Key']))
        if format_ok:
            print(f"   ✅ Naming format correct (snaptrade-postgres-YYYY-MM-DD-HHmmss.dump.enc)")
        else:
            print(f"   ⚠️  Warning: Naming format doesn't match expected pattern")

        # Get object metadata
        try:
            metadata_response = s3.head_object(Bucket=bucket_name, Key=latest['Key'])
            print(f"\n📋 Metadata:")
            print(f"   Content-Type: {metadata_response.get('ContentType', 'N/A')}")
            print(f"   Storage Class: {metadata_response.get('StorageClass', 'STANDARD')}")
            print(f"   ETag: {metadata_response.get('ETag', 'N/A')}")

            if metadata_response.get('Metadata'):
                print(f"   Custom Metadata:")
                for key, value in metadata_response['Metadata'].items():
                    print(f"     {key}: {value}")
        except Exception as e:
            print(f"   ⚠️  Could not retrieve metadata: {e}")

        # List all recent backups
        print(f"\n📚 All recent backups ({len(backup_files)} total):")
        for i, backup in enumerate(backup_files[:5], 1):
            size_mb = backup['Size'] / (1024*1024)
            print(f"   {i}. {backup['Key']}")
            print(f"      Size: {size_mb:.2f} MB | Modified: {backup['LastModified']}")

        if len(backup_files) > 5:
            print(f"   ... and {len(backup_files) - 5} more backups")

        print("\n" + "-" * 70)
        print("✅ VERIFICATION COMPLETE")
        print(f"   Latest backup: {latest['Key']}")
        print(f"   Ready for restore testing with URL: s3://{bucket_name}/{latest['Key']}")

        return True

    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\n💡 Troubleshooting:")
        print("   1. Ensure AWS credentials are configured:")
        print("      - Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in backend/.env")
        print("      - Or configure ~/.aws/credentials")
        print("   2. Verify S3_BACKUP_BUCKET environment variable is set")
        print("   3. Check AWS permissions for S3 bucket access")
        return False

if __name__ == '__main__':
    success = verify_s3_backup()
    sys.exit(0 if success else 1)
