#!/usr/bin/env python3
"""Standalone test for TelegramAlerter that works without dependencies."""

import os
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Set required environment variables before import
os.environ.setdefault('INTERNAL_API_KEY', 'test_key_1234567890123456789012345')
os.environ.setdefault('API_KEY', 'test_api_key_123')
os.environ.setdefault('API_HASH', 'test_api_hash_123')
os.environ.setdefault('PHONE_NUMBER', '+1234567890')

from listener import TelegramAlerter


@pytest.mark.asyncio
async def test_alert_delivery():
    """Test that TelegramAlerter sends to correct URL with proper payload."""
    bot_token = "test_token_123"
    chat_id = "test_chat_456"

    # Create alerter
    alerter = TelegramAlerter(bot_token, chat_id)

    # Create a proper mock session that supports async context manager protocol
    mock_response = AsyncMock()
    mock_session = MagicMock()
    mock_session.post = AsyncMock(return_value=mock_response)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=None)

    # Patch at the correct location where listener.py has bound aiohttp
    with patch("listener.listener.aiohttp.ClientSession", return_value=mock_session):
        # Send alert
        await alerter.send_alert("Test alert", "INFO")

    # Verify the call
    assert mock_session.post.called, "HTTP POST was not called"

    call_args = mock_session.post.call_args
    url = call_args[0][0]
    json_payload = call_args[1]["json"]

    # Print for grep verification
    print(f"HTTP POST to: {url}")
    print(f"Payload: {json_payload}")

    # Verify URL contains sendMessage
    assert "sendMessage" in url, f"URL missing 'sendMessage': {url}"
    assert bot_token in url, f"URL missing bot token"

    # Verify payload structure
    assert json_payload["chat_id"] == chat_id
    assert "Test alert" in json_payload["text"]
    assert json_payload["parse_mode"] == "HTML"

    print("All assertions passed!")
    print(f"OK - sendMessage verified in URL: {url}")


if __name__ == "__main__":
    asyncio.run(test_alert_delivery())
