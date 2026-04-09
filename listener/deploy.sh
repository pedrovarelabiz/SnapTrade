#!/bin/bash
set -e

echo "=== SnapTrade Listener Deployment Script ==="
echo "Started: $(date)"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Step 1: Stop the service
echo -e "${YELLOW}[1/7] Stopping snaptrade-listener service...${NC}"
sudo systemctl stop snaptrade-listener.service || echo "Service not running"
sleep 2

# Step 2: Pull latest code
echo -e "${YELLOW}[2/7] Pulling latest code from git...${NC}"
git pull origin main || git pull origin master

# Step 3: Install/update requirements
echo -e "${YELLOW}[3/7] Installing Python requirements...${NC}"
cd listener
pip3 install -r requirements.txt --quiet --user

# Step 4: Validate configuration
echo -e "${YELLOW}[4/7] Validating configuration...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi

# Check required environment variables
source .env
required_vars=("TELEGRAM_BOT_TOKEN" "TELEGRAM_CHAT_ID" "DISCORD_BOT_TOKEN")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}ERROR: Required variable $var not set in .env${NC}"
        exit 1
    fi
done

# Validate Python syntax
python3 -m py_compile listener.py
echo -e "${GREEN}Configuration valid${NC}"

# Step 5: Restart the service
echo -e "${YELLOW}[5/7] Starting snaptrade-listener service...${NC}"
sudo systemctl restart snaptrade-listener.service

# Step 6: Tail logs to verify successful start
echo -e "${YELLOW}[6/7] Tailing logs for 10 seconds to verify startup...${NC}"
sleep 2
timeout 10s sudo journalctl -u snaptrade-listener.service -f --no-pager -n 20 || true

# Check service status
if sudo systemctl is-active --quiet snaptrade-listener.service; then
    echo -e "${GREEN}Service is running${NC}"
else
    echo -e "${RED}ERROR: Service failed to start${NC}"
    sudo systemctl status snaptrade-listener.service --no-pager
    exit 1
fi

# Step 7: Send test alert
echo -e "${YELLOW}[7/7] Sending test deployment alert...${NC}"
python3 -c "
import asyncio
from listener import TelegramAlerter
from config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

async def send_test():
    alerter = TelegramAlerter(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
    await alerter.send_alert('Deployment completed successfully at $(date +%Y-%m-%d\ %H:%M:%S)', 'INFO')

asyncio.run(send_test())
" && echo -e "${GREEN}Test alert sent${NC}" || echo -e "${YELLOW}Warning: Test alert failed${NC}"

echo ""
echo -e "${GREEN}=== Deployment completed successfully ===${NC}"
echo "Finished: $(date)"
