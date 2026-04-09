"""Test Sentry race condition event capture for D3 issue.

This test verifies that when 2 signals for the same asset have overlapping
expiration times, Sentry captures an event with tag issue='D3' and extra
context includes all signal IDs.
"""

import os
import sys
import pytest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, call

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import directly from listener.listener module
from listener.listener import find_matching_signal, signal_race_conditions_detected_total


class TestSentryRaceConditionD3:
    """Test Sentry event capture for D3 race condition detection."""

    @patch('listener.listener.sentry_sdk')
    @patch('listener.listener.logger')
    def test_race_condition_sentry_event_capture(self, mock_logger, mock_sentry):
        """Test that race condition with 2 overlapping signals triggers Sentry D3 event."""
        # Create base time for signals
        base_time = datetime(2026, 3, 23, 14, 0, 0, tzinfo=timezone.utc)

        # Create 2 signals for EURUSD with overlapping expiration (within 60s tolerance)
        # Both signals expire around 14:05:00, creating a race condition
        signal_1 = {
            'id': 'signal_abc123',
            'asset': 'EURUSD',
            'entryTimeUtc': '2026-03-23T14:00:00+00:00',
            'martingaleTimes': ['05:00'],  # 5 minutes in MM:SS format
        }

        signal_2 = {
            'id': 'signal_def456',
            'asset': 'EURUSD',
            'entryTimeUtc': '2026-03-23T14:00:30+00:00',  # 30 seconds later
            'martingaleTimes': ['04:30'],  # 4 minutes 30 seconds
        }

        signals = [signal_1, signal_2]

        # Result timestamp that matches both signals' expiration (within tolerance)
        # Signal 1 expires at: 14:00:00 + 5:00 = 14:05:00
        # Signal 2 expires at: 14:00:30 + 4:30 = 14:05:00
        # Both expire at 14:05:00, creating exact race condition
        result_timestamp = datetime(2026, 3, 23, 14, 5, 2, tzinfo=timezone.utc)
        result_iteration = 0

        # Call find_matching_signal - should detect race condition
        result = find_matching_signal('EURUSD', result_timestamp, result_iteration, signals)

        # Verify Sentry capture_event was called
        assert mock_sentry.capture_event.called, "Sentry capture_event should be called for race condition"

        # Get the captured event
        captured_event = mock_sentry.capture_event.call_args[0][0]

        # Verify event structure
        assert captured_event['level'] == 'error', "Event level should be 'error'"
        assert 'Signal attribution race condition detected' in captured_event['message'], \
            "Event message should mention race condition"

        # Verify tag issue='D3'
        assert 'tags' in captured_event, "Event should have tags"
        assert captured_event['tags']['issue'] == 'D3', "Event should be tagged with issue='D3'"

        # Verify extra context includes all signal IDs
        assert 'extra' in captured_event, "Event should have extra context"
        assert 'signal_ids' in captured_event['extra'], "Extra context should include signal_ids"

        signal_ids = captured_event['extra']['signal_ids']
        assert len(signal_ids) == 2, "Should capture both signal IDs"
        assert 'signal_abc123' in signal_ids, "Should include first signal ID"
        assert 'signal_def456' in signal_ids, "Should include second signal ID"

        # Verify other extra context fields
        assert captured_event['extra']['asset'] == 'EURUSD', "Should include asset"
        assert captured_event['extra']['num_matches'] == 2, "Should indicate 2 matches"
        assert 'result_timestamp' in captured_event['extra'], "Should include result_timestamp"
        assert 'matching_details' in captured_event['extra'], "Should include matching_details"

        # Verify matching_details contains information about both signals
        matching_details = captured_event['extra']['matching_details']
        assert len(matching_details) == 2, "Should have details for both signals"
        assert any('signal_abc123' in detail for detail in matching_details), \
            "Details should mention first signal"
        assert any('signal_def456' in detail for detail in matching_details), \
            "Details should mention second signal"

        # Verify logger.error was called with race condition details
        assert mock_logger.error.called, "Logger should log error for race condition"
        error_log = mock_logger.error.call_args[0][0]
        assert 'Race condition detected' in error_log or 'multiple' in error_log.lower(), \
            "Error log should mention race condition"

    @patch('listener.listener.sentry_sdk')
    @patch('listener.listener.logger')
    def test_race_condition_metric_increment(self, mock_logger, mock_sentry):
        """Test that race condition increments the signal_race_conditions_detected_total metric."""
        # Get initial metric value
        initial_value = signal_race_conditions_detected_total.labels(asset='BTCUSD')._value._value

        # Create 2 signals for BTCUSD with overlapping expiration
        signal_1 = {
            'id': 'btc_signal_1',
            'asset': 'BTCUSD',
            'entryTimeUtc': '2026-03-23T15:00:00+00:00',
            'martingaleTimes': ['03:00'],  # 3 minutes
        }

        signal_2 = {
            'id': 'btc_signal_2',
            'asset': 'BTCUSD',
            'entryTimeUtc': '2026-03-23T15:00:20+00:00',  # 20 seconds later
            'martingaleTimes': ['02:40'],  # 2 minutes 40 seconds
        }

        signals = [signal_1, signal_2]

        # Result timestamp that matches both (both expire ~15:03:00)
        result_timestamp = datetime(2026, 3, 23, 15, 3, 1, tzinfo=timezone.utc)
        result_iteration = 0

        # Call find_matching_signal
        result = find_matching_signal('BTCUSD', result_timestamp, result_iteration, signals)

        # Verify metric was incremented
        final_value = signal_race_conditions_detected_total.labels(asset='BTCUSD')._value._value
        assert final_value == initial_value + 1, \
            f"Metric should increment from {initial_value} to {initial_value + 1}, got {final_value}"

    @patch('listener.listener.sentry_sdk')
    @patch('listener.listener.logger')
    def test_single_signal_no_race_condition(self, mock_logger, mock_sentry):
        """Test that single matching signal does NOT trigger Sentry D3 event."""
        # Create single signal
        signal_1 = {
            'id': 'signal_single',
            'asset': 'GBPUSD',
            'entryTimeUtc': '2026-03-23T16:00:00+00:00',
            'martingaleTimes': ['05:00'],
        }

        signals = [signal_1]

        # Result timestamp that matches the signal
        result_timestamp = datetime(2026, 3, 23, 16, 5, 2, tzinfo=timezone.utc)
        result_iteration = 0

        # Call find_matching_signal
        result = find_matching_signal('GBPUSD', result_timestamp, result_iteration, signals)

        # Verify Sentry capture_event was NOT called
        mock_sentry.capture_event.assert_not_called()

        # Verify we got a match (find_matching_signal returns a tuple: (signal, tier, confidence))
        assert result is not None, "Should return the matching signal"
        matched_signal, match_tier, confidence = result
        assert matched_signal is not None, "Signal should be found"
        assert matched_signal['id'] == 'signal_single', "Should return the correct signal"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
