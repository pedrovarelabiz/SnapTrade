"""Integration tests for signal matching logic."""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

from listener import ChannelHandler


class TestSignalMatching(unittest.TestCase):
    """Tests for find_matching_signal integration."""

    def setUp(self):
        """Set up test fixtures."""
        self.channel_config = {
            "id": "test-channel",
            "slug": "test-channel",
            "name": "Test Channel",
            "timezone": "UTC",
            "sourceFormat": "blacklist_live",
            "maxGaleLevel": 2,
            "telegramId": "123456",
            "telegramName": "test_channel"
        }
        self.handler = ChannelHandler(self.channel_config)

    @patch('listener.listener.find_by_exact_expiration')
    def test_find_matching_signal_uses_exact_first(self, mock_exact):
        """Test that exact matching is called first and proximity only if exact returns None."""
        # Setup test data
        result_date = datetime(2024, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
        asset = "EURUSD"

        # Add a signal to active_signals for proximity matching to potentially find
        self.handler.active_signals.append({
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": [],
            "status": "pending"
        })

        # Test Case 1: Exact match returns a signal
        mock_exact.return_value = {"asset": "EURUSD", "direction": "CALL", "entryTimeUtc": "2024-01-01T10:00:00Z"}
        result = self.handler.find_matching_signal_proximity_only(result_date, asset=asset)

        # Verify exact was called with correct parameters
        mock_exact.assert_called_once_with(asset, result_date, self.handler.active_signals)

        # Verify the exact match was returned (not proximity match)
        self.assertIsNotNone(result)
        self.assertEqual(result["asset"], "EURUSD")

        # Reset mock for next test
        mock_exact.reset_mock()

        # Test Case 2: Exact match returns None, falls back to proximity
        mock_exact.return_value = None
        result = self.handler.find_matching_signal_proximity_only(result_date, asset=asset)

        # Verify exact was called first
        mock_exact.assert_called_once_with(asset, result_date, self.handler.active_signals)

        # Verify proximity matching was triggered (should find the signal we added)
        # The proximity logic should kick in and find the signal
        self.assertIsNotNone(result, "Proximity matching should find the signal when exact returns None")


if __name__ == '__main__':
    unittest.main()
