#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
USER_NAME="snaptrade-backup-user"
POLICY_NAME="SnapTradeBackupPolicy"
BUCKET_NAME="snaptrade-unified-backups"

echo -e "${GREEN}🔨 Creating IAM User for Backups${NC}"
echo "User: $USER_NAME"
echo "Bucket: $BUCKET_NAME"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Installing...${NC}"
    # Fallback to Python script
    python3 /opt/snaptrade-unified/create-backup-iam-user.py
    exit $?
fi

# Step 1: Create IAM User
echo -e "${YELLOW}Step 1: Creating IAM user${NC}"
if aws iam create-user --user-name "$USER_NAME" 2>/dev/null; then
    echo -e "${GREEN}✅ Created user: $USER_NAME${NC}"
else
    echo -e "${YELLOW}⚠️  User may already exist, continuing...${NC}"
fi

# Step 2: Create Policy
echo -e "\n${YELLOW}Step 2: Creating IAM policy${NC}"

# Create policy document
POLICY_DOC=$(cat <<EOF
{
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
        "arn:aws:s3:::${BUCKET_NAME}",
        "arn:aws:s3:::${BUCKET_NAME}/*"
      ]
    }
  ]
}
EOF
)

# Write policy to temp file
POLICY_FILE=$(mktemp)
echo "$POLICY_DOC" > "$POLICY_FILE"

# Create policy
if POLICY_ARN=$(aws iam create-policy \
    --policy-name "$POLICY_NAME" \
    --policy-document "file://$POLICY_FILE" \
    --description "Minimum permissions for $BUCKET_NAME backup operations" \
    --query 'Policy.Arn' \
    --output text 2>/dev/null); then
    echo -e "${GREEN}✅ Created policy: $POLICY_NAME${NC}"
    echo "   ARN: $POLICY_ARN"
else
    # Policy might exist, get ARN
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"
    echo -e "${YELLOW}⚠️  Policy may already exist${NC}"
    echo "   ARN: $POLICY_ARN"
fi

rm -f "$POLICY_FILE"

# Step 3: Attach Policy to User
echo -e "\n${YELLOW}Step 3: Attaching policy to user${NC}"
if aws iam attach-user-policy \
    --user-name "$USER_NAME" \
    --policy-arn "$POLICY_ARN"; then
    echo -e "${GREEN}✅ Attached policy to user${NC}"
else
    echo -e "${RED}❌ Failed to attach policy${NC}"
    exit 1
fi

# Step 4: Create Access Keys
echo -e "\n${YELLOW}Step 4: Creating access keys${NC}"
CREDS_FILE="/opt/snaptrade-unified/backup-user-credentials.txt"

if KEY_OUTPUT=$(aws iam create-access-key --user-name "$USER_NAME" 2>/dev/null); then
    ACCESS_KEY_ID=$(echo "$KEY_OUTPUT" | grep -o '"AccessKeyId": "[^"]*"' | cut -d'"' -f4)
    SECRET_ACCESS_KEY=$(echo "$KEY_OUTPUT" | grep -o '"SecretAccessKey": "[^"]*"' | cut -d'"' -f4)

    echo -e "${GREEN}✅ Created access keys${NC}"
    echo ""
    echo "============================================================"
    echo "🔐 CREDENTIALS - SAVE THESE SECURELY (shown only once)"
    echo "============================================================"
    echo "AWS_ACCESS_KEY_ID=$ACCESS_KEY_ID"
    echo "AWS_SECRET_ACCESS_KEY=$SECRET_ACCESS_KEY"
    echo "============================================================"
    echo ""

    # Save to file
    cat > "$CREDS_FILE" <<EOF
# Backup IAM User Credentials - Created on $(date)
# User: $USER_NAME
# Bucket: $BUCKET_NAME

AWS_ACCESS_KEY_ID=$ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=$SECRET_ACCESS_KEY
AWS_REGION=eu-west-1
S3_BACKUP_BUCKET=$BUCKET_NAME
EOF

    chmod 600 "$CREDS_FILE"
    echo -e "${GREEN}💾 Credentials saved to: $CREDS_FILE (chmod 600)${NC}"
else
    echo -e "${RED}❌ Failed to create access keys${NC}"
    exit 1
fi

# Step 5: Verify
echo -e "\n${YELLOW}Step 5: Verifying user creation${NC}"
if aws iam get-user --user-name "$USER_NAME" &>/dev/null; then
    echo -e "${GREEN}✅ User verified successfully${NC}"
    aws iam get-user --user-name "$USER_NAME"
else
    echo -e "${RED}❌ User verification failed${NC}"
    exit 1
fi

echo -e "\n${GREEN}✅ IAM User Setup Complete!${NC}"
echo ""
echo "Summary:"
echo "  • User: $USER_NAME"
echo "  • Policy: $POLICY_NAME"
echo "  • Bucket: $BUCKET_NAME"
echo "  • Permissions: s3:PutObject, s3:GetObject, s3:ListBucket, s3:DeleteObject"
echo "  • Credentials: $CREDS_FILE"
