"""Test race condition scenarios with identical signals.

This test suite verifies that when multiple signals with identical parameters
(same asset, same entry time, same martingale_times) are matched against a result,
the system correctly detects the race condition, increments metrics, and falls back
to proximity matching.
"""

import os
import sys
import pytest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import directly from listener.listener module
from listener.listener import find_matching_signal, signal_race_conditions_detected_total, signal_matches_proximity_fallback_total


class TestRaceConditionScenarios:
    """Test suite for race condition detection with identical signals."""

    @patch('listener.listener.sentry_sdk')
    @patch('listener.listener.logger')
    @patch('listener.listener.find_matching_signal_proximity_only')
    def test_race_condition_two_identical_signals(self, mock_proximity, mock_logger, mock_sentry):
        """Test race condition with 2 signals that have identical parameters.

        Creates 2 signals with:
        - Same asset (EURUSD)
        - Same entry time (14:00:00)
        - Same martingale_times (['05:00'])

        Verifies that:
        1. Race condition is detected (2 exact matches)
        2. signal_race_conditions_detected_total metric is incremented
        3. Falls back to proximity matching
        """
        # Get initial metric value for EURUSD
        initial_value = signal_race_conditions_detected_total.labels(asset='EURUSD')._value._value

        # Create base time
        base_time = datetime(2026, 3, 23, 14, 0, 0, tzinfo=timezone.utc)

        # Create 2 identical signals - both expire at 14:05:00
        signal_1 = {
            'id': 'identical_signal_1',
            'asset': 'EURUSD',
            'entryTimeUtc': '2026-03-23T14:00:00+00:00',
            'martingaleTimes': ['05:00'],  # 5 minutes in MM:SS format
        }

        signal_2 = {
            'id': 'identical_signal_2',
            'asset': 'EURUSD',
            'entryTimeUtc': '2026-03-23T14:00:00+00:00',  # Same entry time
            'martingaleTimes': ['05:00'],  # Same martingale time
        }

        signals = [signal_1, signal_2]

        # Result timestamp that matches both signals (within tolerance)
        # Both signals expire at: 14:00:00 + 5:00 = 14:05:00
        result_timestamp = datetime(2026, 3, 23, 14, 5, 2, tzinfo=timezone.utc)
        result_iteration = 0

        # Mock the proximity fallback to return signal_1
        mock_proximity.return_value = signal_1

        # Call find_matching_signal - should detect race condition
        result = find_matching_signal('EURUSD', result_timestamp, result_iteration, signals)

        # Verify metric was incremented
        final_value = signal_race_conditions_detected_total.labels(asset='EURUSD')._value._value
        assert final_value == initial_value + 1, \
            f"signal_race_conditions_detected_total should increment from {initial_value} to {initial_value + 1}, got {final_value}"

        # Verify Sentry event was captured with D3 tag
        assert mock_sentry.capture_event.called, "Sentry capture_event should be called for race condition"
        captured_event = mock_sentry.capture_event.call_args[0][0]
        assert captured_event['tags']['issue'] == 'D3', "Event should be tagged with issue='D3'"

        # Verify proximity fallback was called
        assert mock_proximity.called, "Should fall back to proximity matching when race condition detected"

        # Verify the result is from proximity fallback (should be tuple: signal, tier, confidence)
        assert result is not None, "Should return result from proximity matching fallback"
        assert len(result) == 3, "Result should be a tuple of (signal, tier, confidence)"
        matched_signal, tier, confidence = result
        assert matched_signal == signal_1, "Should return signal from proximity matching fallback"
        assert tier == 3, "Should return tier 3 for proximity fallback"

        # Verify logger error was called
        assert mock_logger.error.called, "Logger should log error for race condition"
        error_log = mock_logger.error.call_args[0][0]
        assert ('Ambiguous match' in error_log or
                'multiple signals match' in error_log or
                'multiple martingale matches' in error_log or
                'Race condition detected' in error_log), \
            "Error log should mention race condition or multiple matches"

        # Verify extra context includes both signal IDs
        extra_context = captured_event['extra']
        assert 'signal_ids' in extra_context, "Extra context should include signal_ids"
        signal_ids = extra_context['signal_ids']
        assert len(signal_ids) == 2, "Should capture both signal IDs"
        assert 'identical_signal_1' in signal_ids, "Should include first signal ID"
        assert 'identical_signal_2' in signal_ids, "Should include second signal ID"

    @patch('listener.listener.sentry_sdk')
    @patch('listener.listener.logger')
    @patch('listener.listener.find_matching_signal_proximity_only')
    def test_race_condition_three_signals(self, mock_proximity, mock_logger, mock_sentry):
        """Test race condition with 3 signals matching within ±5s tolerance window.

        Creates 3 signals with:
        - Same asset (GBPUSD)
        - Same entry time (15:00:00)
        - Same martingale_times (['03:00'])

        Verifies that:
        1. Race condition is detected (3 exact matches)
        2. signal_race_conditions_detected_total metric is incremented
        3. Falls back to proximity matching
        4. Sentry event includes all 3 signal IDs in matching_details extra field
        """
        # Get initial metric value for GBPUSD
        initial_value = signal_race_conditions_detected_total.labels(asset='GBPUSD')._value._value

        # Create base time
        base_time = datetime(2026, 3, 23, 15, 0, 0, tzinfo=timezone.utc)

        # Create 3 identical signals - all expire at 15:03:00
        signal_1 = {
            'id': 'race_signal_1',
            'asset': 'GBPUSD',
            'entryTimeUtc': '2026-03-23T15:00:00+00:00',
            'martingaleTimes': ['03:00'],  # 3 minutes in MM:SS format
        }

        signal_2 = {
            'id': 'race_signal_2',
            'asset': 'GBPUSD',
            'entryTimeUtc': '2026-03-23T15:00:00+00:00',  # Same entry time
            'martingaleTimes': ['03:00'],  # Same martingale time
        }

        signal_3 = {
            'id': 'race_signal_3',
            'asset': 'GBPUSD',
            'entryTimeUtc': '2026-03-23T15:00:00+00:00',  # Same entry time
            'martingaleTimes': ['03:00'],  # Same martingale time
        }

        signals = [signal_1, signal_2, signal_3]

        # Result timestamp that matches all 3 signals (within ±5s tolerance)
        # All signals expire at: 15:00:00 + 3:00 = 15:03:00
        # Result is at 15:03:03, which is 3s after expiration (within ±5s tolerance)
        result_timestamp = datetime(2026, 3, 23, 15, 3, 3, tzinfo=timezone.utc)
        result_iteration = 0

        # Mock the proximity fallback to return signal_1
        mock_proximity.return_value = signal_1

        # Call find_matching_signal - should detect race condition
        result = find_matching_signal('GBPUSD', result_timestamp, result_iteration, signals)

        # Verify metric was incremented
        final_value = signal_race_conditions_detected_total.labels(asset='GBPUSD')._value._value
        assert final_value == initial_value + 1, \
            f"signal_race_conditions_detected_total should increment from {initial_value} to {initial_value + 1}, got {final_value}"

        # Verify Sentry event was captured with D3 tag
        assert mock_sentry.capture_event.called, "Sentry capture_event should be called for race condition"
        captured_event = mock_sentry.capture_event.call_args[0][0]
        assert captured_event['tags']['issue'] == 'D3', "Event should be tagged with issue='D3'"

        # Verify proximity fallback was called
        assert mock_proximity.called, "Should fall back to proximity matching when race condition detected"

        # Verify the result is from proximity fallback (should be tuple: signal, tier, confidence)
        assert result is not None, "Should return result from proximity matching fallback"
        assert len(result) == 3, "Result should be a tuple of (signal, tier, confidence)"
        matched_signal, tier, confidence = result
        assert matched_signal == signal_1, "Should return signal from proximity matching fallback"
        assert tier == 3, "Should return tier 3 for proximity fallback"

        # Verify logger error was called
        assert mock_logger.error.called, "Logger should log error for race condition"
        error_log = mock_logger.error.call_args[0][0]
        assert ('Ambiguous match' in error_log or
                'multiple signals match' in error_log or
                'multiple martingale matches' in error_log or
                'Race condition detected' in error_log), \
            "Error log should mention race condition or multiple matches"

        # Verify extra context includes all 3 signal IDs in matching_details
        extra_context = captured_event['extra']
        assert 'signal_ids' in extra_context, "Extra context should include signal_ids"
        signal_ids = extra_context['signal_ids']
        assert len(signal_ids) == 3, "Should capture all 3 signal IDs"
        assert 'race_signal_1' in signal_ids, "Should include first signal ID"
        assert 'race_signal_2' in signal_ids, "Should include second signal ID"
        assert 'race_signal_3' in signal_ids, "Should include third signal ID"

    def test_exact_match_different_iterations(self):
        """Test exact match with different iterations on same asset.

        Creates 2 signals on same asset:
        - signal1: expires at T+60s (iteration 0 only)
        - signal2: expires at T+120s (iteration 0), T+180s (iteration 1)

        Verifies that:
        1. result_iteration=0 at T+60s matches signal1 only
        2. result_iteration=1 at T+180s matches signal2 only
        """
        # Create base time
        base_time = datetime(2026, 3, 23, 16, 0, 0, tzinfo=timezone.utc)

        # signal1: only has iteration 0, expires at T+60s (16:01:00)
        signal_1 = {
            'id': 'iteration_signal_1',
            'asset': 'USDJPY',
            'entryTimeUtc': '2026-03-23T16:00:00+00:00',
            'martingaleTimes': ['01:00'],  # 1 minute = 60 seconds
        }

        # signal2: has iteration 0 at T+120s, iteration 1 at T+180s
        signal_2 = {
            'id': 'iteration_signal_2',
            'asset': 'USDJPY',
            'entryTimeUtc': '2026-03-23T16:00:00+00:00',
            'martingaleTimes': ['02:00', '03:00'],  # iteration 0 at 2min, iteration 1 at 3min
        }

        signals = [signal_1, signal_2]

        # Test 1: result_iteration=0 at T+60s should match signal1 only
        result_timestamp_iter0 = datetime(2026, 3, 23, 16, 1, 0, tzinfo=timezone.utc)
        result_iter0 = find_matching_signal('USDJPY', result_timestamp_iter0, 0, signals)
        assert result_iter0 is not None, "result_iteration=0 at T+60s should match signal1"
        matched_signal_0, tier_0, conf_0 = result_iter0
        assert matched_signal_0 == signal_1, \
            f"result_iteration=0 at T+60s should match signal1, got {matched_signal_0.get('id') if matched_signal_0 else None}"

        # Test 2: result_iteration=1 at T+180s should match signal2 only
        # signal1 doesn't have iteration 1, so only signal2 should match
        result_timestamp_iter1 = datetime(2026, 3, 23, 16, 3, 0, tzinfo=timezone.utc)
        result_iter1 = find_matching_signal('USDJPY', result_timestamp_iter1, 1, signals)
        assert result_iter1 is not None, "result_iteration=1 at T+180s should match signal2"
        matched_signal_1, tier_1, conf_1 = result_iter1
        assert matched_signal_1 == signal_2, \
            f"result_iteration=1 at T+180s should match signal2, got {matched_signal_1.get('id') if matched_signal_1 else None}"

    @patch('listener.listener.find_matching_signal_proximity_only')
    def test_proximity_fallback_no_exact_match(self, mock_proximity):
        """Test proximity fallback when no exact match exists.

        Creates a signal expiring at T+60s, but result_timestamp at T+130s
        (outside ±60s tolerance).

        Verifies that:
        1. No exact match is found
        2. signal_matches_proximity_fallback_total metric increments with reason='no_exact_match'
        3. Proximity function is called
        """
        # Get initial metric value for AUDUSD with reason='no_exact_match'
        initial_value = signal_matches_proximity_fallback_total.labels(
            asset='AUDUSD', reason='no_exact_match'
        )._value._value

        # Create base time
        base_time = datetime(2026, 3, 23, 17, 0, 0, tzinfo=timezone.utc)

        # Create signal that expires at T+60s (17:01:00)
        signal_1 = {
            'id': 'proximity_fallback_signal',
            'asset': 'AUDUSD',
            'entryTimeUtc': '2026-03-23T17:00:00+00:00',
            'martingaleTimes': ['01:00'],  # 1 minute = 60 seconds
        }

        signals = [signal_1]

        # Result timestamp at T+130s (17:02:10), which is 70 seconds after expiry
        # This is outside the ±60s tolerance window
        result_timestamp = datetime(2026, 3, 23, 17, 2, 10, tzinfo=timezone.utc)
        result_iteration = 0

        # Mock the proximity fallback to return signal_1
        mock_proximity.return_value = signal_1

        # Call find_matching_signal - should fall back to proximity matching
        result = find_matching_signal('AUDUSD', result_timestamp, result_iteration, signals)

        # Verify metric was incremented
        final_value = signal_matches_proximity_fallback_total.labels(
            asset='AUDUSD', reason='no_exact_match'
        )._value._value
        assert final_value == initial_value + 1, \
            f"signal_matches_proximity_fallback_total should increment from {initial_value} to {initial_value + 1}, got {final_value}"

        # Verify proximity fallback was called
        assert mock_proximity.called, "Proximity function should be called when no exact match exists"

        # Verify the result is from proximity fallback (should be tuple: signal, tier, confidence)
        assert result is not None, "Should return result from proximity matching fallback"
        assert len(result) == 3, "Result should be a tuple of (signal, tier, confidence)"
        matched_signal, tier, confidence = result
        assert matched_signal == signal_1, "Should return signal from proximity matching fallback"
        assert tier == 3, "Should return tier 3 for proximity fallback"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
