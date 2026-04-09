#!/bin/bash
# Verification script for backup IAM user setup

USER_NAME="snaptrade-backup-user"

echo "🔍 Verifying IAM User: $USER_NAME"
echo ""

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    echo "⚠️  AWS CLI not installed - cannot verify"
    echo ""
    echo "Expected verification command:"
    echo "  aws iam get-user --user-name $USER_NAME"
    echo ""
    echo "Expected output when user exists:"
    echo '  {
      "User": {
        "UserName": "snaptrade-backup-user",
        "UserId": "AIDAI...",
        "Arn": "arn:aws:iam::123456789012:user/snaptrade-backup-user",
        "CreateDate": "2026-03-22T...",
        "Path": "/"
      }
    }'
    exit 1
fi

# Try to get user
if aws iam get-user --user-name "$USER_NAME" 2>/dev/null; then
    echo "✅ User exists and is accessible"
    echo ""
    echo "Checking attached policies..."
    aws iam list-attached-user-policies --user-name "$USER_NAME"
    echo ""
    echo "Checking access keys..."
    aws iam list-access-keys --user-name "$USER_NAME"
else
    echo "❌ User not created yet"
    echo ""
    echo "To create the user, run:"
    echo "  ./setup-backup-iam-user.sh"
    echo ""
    echo "Or use Python script:"
    echo "  python3 create-backup-iam-user.py"
    exit 1
fi
