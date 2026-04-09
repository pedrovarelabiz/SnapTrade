import unittest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, call
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from listener import ChannelHandler, find_matching_signal


class TestSentryIntegration(unittest.TestCase):
    """Test Sentry SDK integration in find_matching_signal."""

    def setUp(self):
        """Set up test fixtures."""
        self.channel_config = {
            "id": "test-channel-id",
            "slug": "test-channel",
            "name": "Test Channel",
            "timezone": "UTC",
            "sourceFormat": "blacklist_inline",
            "maxGaleLevel": 2,
            "telegramId": "123456",
            "telegramName": "test_channel"
        }

    @patch('listener.listener.sentry_sdk')
    def test_sentry_breadcrumb_on_match(self, mock_sentry):
        """Test that sentry_sdk.add_breadcrumb is called when a signal is matched."""
        # Create signal: EURUSD CALL, entry 10:00, explicit expirationTime for TIER 1 match
        signal = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationTime": "2024-01-01T10:05:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }
        signals = [signal]

        # Result arrives at 10:05 (exact match)
        result_date = datetime(2024, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
        matched_signal, tier, confidence = find_matching_signal("EURUSD", result_date, 0, signals)

        # Verify signal was matched
        self.assertIsNotNone(matched_signal)
        self.assertEqual(matched_signal, signal)

        # Verify sentry_sdk.add_breadcrumb was called
        mock_sentry.add_breadcrumb.assert_called()
        # Verify the final match breadcrumb
        last_call = mock_sentry.add_breadcrumb.call_args
        self.assertEqual(last_call.kwargs['category'], 'signal_matching')
        self.assertIn('tier', last_call.kwargs['message'].lower())
        self.assertEqual(last_call.kwargs['level'], 'info')
        self.assertIn('signal_id', last_call.kwargs['data'])

    @patch('listener.listener.sentry_sdk')
    def test_sentry_capture_message_on_ambiguous_match(self, mock_sentry):
        """Test that sentry_sdk.capture_event is called on ambiguous matches."""
        # Create multiple signals sharing the same expirationTime to force TIER 1 race condition
        signals = []
        for i in range(5):  # Create 5 tier1 candidates with identical expiration
            signal = {
                "asset": "EURUSD",
                "direction": "CALL",
                "entryTimeUtc": f"2024-01-01T10:0{i}:00Z",
                "expirationTime": "2024-01-01T10:15:00Z",
                "expirationMinutes": 5,
                "martingaleTimes": []
            }
            signals.append(signal)

        # Result arrives at 10:15 - all 5 signals match TIER 1 → race condition detected
        result_date = datetime(2024, 1, 1, 10, 15, 0, tzinfo=timezone.utc)
        matched_signal, tier, confidence = find_matching_signal("EURUSD", result_date, 0, signals)

        # Verify a signal was matched (via proximity fallback after race condition)
        self.assertIsNotNone(matched_signal)

        # Run 9 more ambiguous matches to accumulate calls
        for _ in range(9):
            result_date = datetime(2024, 1, 1, 10, 15, 0, tzinfo=timezone.utc)
            find_matching_signal("EURUSD", result_date, 0, signals)

        # On ambiguous match, sentry_sdk.capture_event should be called
        mock_sentry.capture_event.assert_called()
        call_args = mock_sentry.capture_event.call_args
        self.assertIn('race condition', call_args.args[0]['message'].lower())
        self.assertEqual(call_args.args[0]['level'], 'error')

    @patch('listener.listener.sentry_sdk')
    def test_both_sentry_calls_in_function(self, mock_sentry):
        """Test that both sentry_sdk calls exist in find_matching_signal function."""
        # Create multiple signals sharing the same expirationTime to trigger race condition
        signals = []
        for i in range(5):
            signal = {
                "asset": "EURUSD",
                "direction": "CALL",
                "entryTimeUtc": f"2024-01-01T10:0{i}:00Z",
                "expirationTime": "2024-01-01T10:15:00Z",
                "expirationMinutes": 5,
                "martingaleTimes": []
            }
            signals.append(signal)

        # Trigger 10 matches to get both breadcrumb and capture_event calls
        for i in range(10):
            result_date = datetime(2024, 1, 1, 10, 15, 0, tzinfo=timezone.utc)
            find_matching_signal("EURUSD", result_date, 0, signals)

        # Verify both Sentry SDK methods were called
        self.assertTrue(mock_sentry.add_breadcrumb.called, "sentry_sdk.add_breadcrumb should be called")
        self.assertTrue(mock_sentry.capture_event.called, "sentry_sdk.capture_event should be called")


if __name__ == '__main__':
    unittest.main()
