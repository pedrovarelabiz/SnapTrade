#!/usr/bin/env python3
"""
Test alert rate limiting functionality.
Send 10 identical crash alerts rapidly, verify only 1 is actually sent.
"""

import asyncio
import logging
from unittest.mock import AsyncMock, patch
import pytest
import sys
sys.path.insert(0, '/opt/snaptrade-unified/listener')
from listener import TelegramAlerter

# Configure logging to capture rate limit messages
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('listener.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


@pytest.mark.asyncio
async def test_rate_limiting():
    """Send 10 identical alerts rapidly and verify rate limiting."""

    # Create alerter instance with dummy credentials
    alerter = TelegramAlerter(bot_token="test_token", chat_id="test_chat_id")

    # Mock the HTTP session to track actual send attempts
    send_count = 0

    async def mock_post(*args, **kwargs):
        nonlocal send_count
        send_count += 1
        return AsyncMock()

    # Patch aiohttp.ClientSession to track actual sends
    with patch('aiohttp.ClientSession') as mock_session_class:
        mock_session = AsyncMock()
        mock_session.post = mock_post
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)
        mock_session_class.return_value = mock_session

        # Send 10 identical crash alerts rapidly
        test_message = "🛑 Listener crashed - Out of memory"
        test_severity = "CRITICAL"

        logger.info("="*60)
        logger.info("Starting rate limit test: sending 10 identical alerts")
        logger.info("="*60)

        for i in range(10):
            logger.info(f"Attempt {i+1}/10: Sending alert...")
            await alerter.send_alert(test_message, test_severity)
            await asyncio.sleep(0.1)  # Small delay to simulate rapid succession

        logger.info("="*60)
        logger.info(f"Test complete. Actual alerts sent: {send_count}/10")
        logger.info("="*60)

    # Verify results
    if send_count == 1:
        logger.info("✅ SUCCESS: Only 1 alert was sent (9 were rate-limited)")
        return True
    else:
        logger.error(f"❌ FAILURE: Expected 1 alert sent, but got {send_count}")
        return False


async def main():
    """Run the rate limiting test."""
    success = await test_rate_limiting()

    # Check log file for suppression messages
    print("\n" + "="*60)
    print("Checking logs for 'Alert suppressed (rate limit)' messages...")
    print("="*60)

    exit_code = 0 if success else 1
    exit(exit_code)


if __name__ == "__main__":
    asyncio.run(main())
