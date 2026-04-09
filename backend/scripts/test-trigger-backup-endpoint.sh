#!/bin/bash
# Test script for admin backup trigger endpoint
# Usage: ./test-trigger-backup-endpoint.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Testing Admin Backup Trigger Endpoint"
echo "=========================================="

# Configuration
API_URL="${API_URL:-http://localhost:3001}"
JWT_SECRET="${JWT_SECRET:-test-jwt-secret-for-backup-health-testing}"

# Generate admin JWT token
echo -e "\n${YELLOW}[1/6]${NC} Generating admin JWT token..."
ADMIN_TOKEN=$(node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 'test-admin-id', email: 'admin@test.com', role: 'admin' },
  '$JWT_SECRET',
  { expiresIn: '1h' }
);
console.log(token);
")
echo -e "${GREEN}✓${NC} Admin token generated"

# Test 1: Verify unauthenticated request is rejected
echo -e "\n${YELLOW}[2/6]${NC} Testing unauthenticated request..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/admin/trigger-backup")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" == "401" ]; then
  echo -e "${GREEN}✓${NC} Unauthenticated request rejected (401)"
else
  echo -e "${RED}✗${NC} Expected 401, got $HTTP_CODE"
  exit 1
fi

# Test 2: Verify non-admin user is rejected (using user role token)
echo -e "\n${YELLOW}[3/6]${NC} Testing non-admin user request..."
USER_TOKEN=$(node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 'test-user-id', email: 'user@test.com', role: 'user' },
  '$JWT_SECRET',
  { expiresIn: '1h' }
);
console.log(token);
")
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/admin/trigger-backup" \
  -H "Authorization: Bearer $USER_TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" == "403" ]; then
  echo -e "${GREEN}✓${NC} Non-admin request rejected (403)"
else
  echo -e "${RED}✗${NC} Expected 403, got $HTTP_CODE"
  exit 1
fi

# Test 3: Trigger backup as admin
echo -e "\n${YELLOW}[4/6]${NC} Triggering backup as admin..."
RESPONSE=$(curl -s -X POST "$API_URL/api/admin/trigger-backup" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json")

echo "$RESPONSE" | jq .

# Verify response structure
JOB_ID=$(echo "$RESPONSE" | jq -r '.jobId')
MESSAGE=$(echo "$RESPONSE" | jq -r '.message')
STATUS_URL=$(echo "$RESPONSE" | jq -r '.statusCheckUrl')

if [[ "$JOB_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
  echo -e "${GREEN}✓${NC} Valid jobId received: $JOB_ID"
else
  echo -e "${RED}✗${NC} Invalid or missing jobId"
  exit 1
fi

if [ "$MESSAGE" == "Backup triggered successfully" ]; then
  echo -e "${GREEN}✓${NC} Success message received"
else
  echo -e "${RED}✗${NC} Unexpected message: $MESSAGE"
  exit 1
fi

if [ "$STATUS_URL" == "/api/admin/backup-status" ]; then
  echo -e "${GREEN}✓${NC} Status check URL received"
else
  echo -e "${RED}✗${NC} Invalid status URL: $STATUS_URL"
  exit 1
fi

# Test 4: Verify backup status file was created
echo -e "\n${YELLOW}[5/6]${NC} Checking backup status file..."
if [ -f "backup-status.json" ]; then
  echo -e "${GREEN}✓${NC} backup-status.json created"
  echo "Status file contents:"
  cat backup-status.json | jq .

  # Verify status file contents
  STATUS_JOB_ID=$(cat backup-status.json | jq -r '.jobId')
  STATUS=$(cat backup-status.json | jq -r '.status')

  if [ "$STATUS_JOB_ID" == "$JOB_ID" ]; then
    echo -e "${GREEN}✓${NC} Status file jobId matches response"
  else
    echo -e "${RED}✗${NC} Status file jobId mismatch"
  fi

  if [ "$STATUS" == "pending" ]; then
    echo -e "${GREEN}✓${NC} Initial status is 'pending'"
  else
    echo -e "${RED}✗${NC} Unexpected status: $STATUS"
  fi
else
  echo -e "${RED}✗${NC} backup-status.json not created"
  exit 1
fi

# Test 5: Verify rate limiting
echo -e "\n${YELLOW}[6/6]${NC} Testing rate limiting (max 1 per hour)..."
sleep 1
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/admin/trigger-backup" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" == "429" ]; then
  echo -e "${GREEN}✓${NC} Rate limiting enforced (429)"
  echo "Error message: $(echo "$BODY" | jq -r '.error')"
else
  echo -e "${RED}✗${NC} Expected 429, got $HTTP_CODE"
  exit 1
fi

# Verify can check status via health endpoint
echo -e "\n${YELLOW}[Bonus]${NC} Checking backup health endpoint..."
HEALTH_RESPONSE=$(curl -s "$API_URL/api/health/backup")
echo "Health check response:"
echo "$HEALTH_RESPONSE" | jq .

echo -e "\n${GREEN}=========================================="
echo "All tests passed! ✓"
echo "==========================================${NC}"
echo ""
echo "To manually verify:"
echo "curl -X POST $API_URL/api/admin/trigger-backup \\"
echo "  -H \"Authorization: Bearer \$ADMIN_TOKEN\" | jq ."
