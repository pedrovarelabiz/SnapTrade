"""Test alert delivery for TelegramAlerter."""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from listener import TelegramAlerter


@pytest.mark.asyncio
async def test_telegram_alerter_initialization():
    """Test TelegramAlerter initializes with bot token and chat ID."""
    bot_token = "test_bot_token_123"
    chat_id = "test_chat_id_456"

    alerter = TelegramAlerter(bot_token, chat_id)

    assert alerter.bot_token == bot_token
    assert alerter.chat_id == chat_id
    assert alerter.last_alert_time == {}


@pytest.mark.asyncio
async def test_telegram_alerter_sends_alert_with_correct_payload():
    """Test TelegramAlerter sends HTTP POST to correct URL with proper payload."""
    bot_token = "test_bot_token_123"
    chat_id = "test_chat_id_456"
    test_message = "Test alert message"
    severity = "INFO"

    alerter = TelegramAlerter(bot_token, chat_id)

    # Mock aiohttp ClientSession and post method
    mock_response = AsyncMock()
    mock_session = MagicMock()
    mock_session.post = AsyncMock(return_value=mock_response)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=None)

    with patch("listener.listener.aiohttp.ClientSession", return_value=mock_session):
        await alerter.send_alert(test_message, severity)

    # Verify HTTP POST was called with correct URL
    expected_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    mock_session.post.assert_called_once()
    call_args = mock_session.post.call_args

    assert call_args[0][0] == expected_url

    # Verify payload structure
    json_payload = call_args[1]["json"]
    assert json_payload["chat_id"] == chat_id
    assert test_message in json_payload["text"]
    assert severity.upper() in json_payload["text"]
    assert json_payload["parse_mode"] == "HTML"
    assert "ℹ️" in json_payload["text"]  # INFO severity emoji


@pytest.mark.asyncio
async def test_telegram_alerter_different_severity_levels():
    """Test TelegramAlerter sends alerts with different severity emojis."""
    bot_token = "test_bot"
    chat_id = "test_chat"

    severity_emojis = {
        "info": "ℹ️",
        "warning": "⚠️",
        "error": "🚨",
        "critical": "💥",
    }

    alerter = TelegramAlerter(bot_token, chat_id)

    mock_session = MagicMock()
    mock_session.post = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=None)

    with patch("listener.listener.aiohttp.ClientSession", return_value=mock_session):
        for severity, emoji in severity_emojis.items():
            await alerter.send_alert("Test", severity)
            call_args = mock_session.post.call_args
            json_payload = call_args[1]["json"]
            assert emoji in json_payload["text"]
            assert severity.upper() in json_payload["text"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
