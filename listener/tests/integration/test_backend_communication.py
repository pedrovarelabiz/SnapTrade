"""Integration tests for backend communication with expiration_time."""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Dict, Any

# Import components under test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from api_client import post_signal


class TestBackendCommunication:
    """Integration tests for backend signal communication."""

    @pytest.mark.asyncio
    async def test_post_signal_with_expiration_time(self):
        """
        Test sending signal with expiration_time to backend API.
        Verifies:
        - HTTP POST request is made with expiration_time
        - Response status is 201
        - Signal is created with expiration field
        """
        # Setup signal payload with expiration_time
        signal_timestamp = datetime(2026, 3, 23, 14, 30, 0, tzinfo=timezone.utc)
        expiration_time = signal_timestamp + timedelta(minutes=5)

        signal_payload = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": signal_timestamp.isoformat(),
            "expirationTime": expiration_time.isoformat(),
            "expirationMinutes": 5,
            "martingaleTimes": [1, 2],
            "messageId": 1001,
        }

        # Mock HTTP session and response
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status = 201
        mock_response.json = AsyncMock(return_value={
            "id": "signal_abc123",
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": signal_timestamp.isoformat(),
            "expirationTime": expiration_time.isoformat(),
            "expirationMinutes": 5,
            "status": "active",
            "createdAt": datetime.now(timezone.utc).isoformat()
        })

        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=mock_response)
        cm.__aexit__ = AsyncMock(return_value=False)
        mock_session.post.return_value = cm

        # Execute POST request to backend
        backend_response = await post_signal(mock_session, "/api/signals", signal_payload)

        # Verify POST was called with correct payload
        mock_session.post.assert_called_once()
        call_args = mock_session.post.call_args
        assert "/api/signals" in call_args[0][0]
        assert call_args[1]["json"]["expirationTime"] == expiration_time.isoformat()

        # Verify response status 201 and signal created with expiration field
        assert mock_response.status == 201, "Backend should return 201 Created"
        assert backend_response is not None, "Should receive response from backend"
        assert backend_response["id"] == "signal_abc123"
        assert backend_response["expirationTime"] == expiration_time.isoformat()
        assert backend_response["status"] == "active"

    @pytest.mark.asyncio
    async def test_post_signal_expiration_time_field_presence(self):
        """
        Test that expiration_time is included in POST request payload.
        Verifies the field is present and properly formatted.
        """
        expiration_time = datetime(2026, 3, 23, 15, 45, 0, tzinfo=timezone.utc)

        payload = {
            "asset": "GBPUSD",
            "direction": "PUT",
            "expirationTime": expiration_time.isoformat(),
            "expirationMinutes": 10,
        }

        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status = 201
        mock_response.json = AsyncMock(return_value={
            "id": "signal_xyz789",
            "expirationTime": expiration_time.isoformat(),
        })

        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=mock_response)
        cm.__aexit__ = AsyncMock(return_value=False)
        mock_session.post.return_value = cm

        # POST signal with expiration_time
        result = await post_signal(mock_session, "/api/signals", payload)

        # Verify expiration_time was in the POST payload
        mock_session.post.assert_called_once()
        posted_data = mock_session.post.call_args[1]["json"]
        assert "expirationTime" in posted_data
        assert posted_data["expirationTime"] == expiration_time.isoformat()

        # Verify response includes expiration field
        assert result["expirationTime"] == expiration_time.isoformat()
