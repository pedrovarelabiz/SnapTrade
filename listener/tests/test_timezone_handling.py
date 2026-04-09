"""Tests for timezone handling in signal matching."""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

from listener.listener import find_matching_signal


class TestTimezoneHandling(unittest.TestCase):
    """Tests for timezone mismatch handling in find_matching_signal."""

    @patch('listener.listener.sentry_sdk')
    @patch('listener.listener.logger')
    def test_naive_result_timestamp(self, mock_logger, mock_sentry):
        """Test that naive datetime (no tzinfo) is converted to UTC and logs error."""
        # Create a naive datetime (tzinfo is None)
        naive_timestamp = datetime(2024, 1, 1, 10, 5, 0)
        assert naive_timestamp.tzinfo is None, "Timestamp should be naive for this test"

        asset = "EURUSD"
        result_iteration = 0
        signals = []

        # Call find_matching_signal with naive timestamp
        result = find_matching_signal(asset, naive_timestamp, result_iteration, signals)

        # Verify error was logged about naive timestamp (per lines 290-293)
        mock_logger.error.assert_called()

        # Find the error call about timezone awareness
        error_calls = [call for call in mock_logger.error.call_args_list
                      if "not timezone-aware" in str(call)]
        assert len(error_calls) >= 1, "Expected error log about naive timestamp"

        error_message = error_calls[0][0][0]
        assert "not timezone-aware" in error_message, f"Expected timezone warning, got: {error_message}"
        assert asset in error_message, f"Expected asset {asset} in error message"
        assert "converting to UTC" in error_message, f"Expected UTC conversion mention in error message"


if __name__ == '__main__':
    unittest.main()
