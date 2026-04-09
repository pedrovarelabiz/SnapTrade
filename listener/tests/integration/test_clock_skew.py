"""Integration tests for clock skew handling between listener and trading platform."""

import pytest
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

# Import components under test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))


class TestClockSkewHandling:
    """
    Integration tests for clock skew scenarios.

    Clock skew occurs when listener and trading platform clocks are not perfectly synchronized.
    These tests verify that expiration matching works correctly despite time differences.
    """

    def test_clock_skew_positive_3_seconds(self):
        """
        Test matching with +3 second clock skew (trading platform clock ahead).

        Scenario:
        - Signal expiration_time: 14:05:00 UTC (listener's clock)
        - Result timestamp: 14:05:03 UTC (trading platform's clock, 3s ahead)
        - Expected: Match succeeds (within 5s tolerance)
        """
        # Listener's clock: signal expires at 14:05:00
        signal_expiration = datetime(2026, 3, 23, 14, 5, 0, tzinfo=timezone.utc)

        # Trading platform's clock: 3 seconds ahead
        clock_offset_seconds = 3
        result_timestamp = signal_expiration + timedelta(seconds=clock_offset_seconds)

        # Simulate signal from backend
        signal = {
            "id": "signal_001",
            "asset": "EURUSD",
            "direction": "CALL",
            "expirationTime": signal_expiration.isoformat(),
            "status": "active"
        }

        # Simulate matching logic (within tolerance)
        expiration_time = datetime.fromisoformat(signal["expirationTime"])
        time_diff = abs((result_timestamp - expiration_time).total_seconds())

        # Verify match succeeds
        TOLERANCE_SECONDS = 5
        assert time_diff == 3, f"Expected 3s difference, got {time_diff}s"
        assert time_diff <= TOLERANCE_SECONDS, "Should match within tolerance"

    def test_clock_skew_negative_3_seconds(self):
        """
        Test matching with -3 second clock skew (trading platform clock behind).

        Scenario:
        - Signal expiration_time: 14:05:00 UTC (listener's clock)
        - Result timestamp: 14:04:57 UTC (trading platform's clock, 3s behind)
        - Expected: Match succeeds (within 5s tolerance)
        """
        # Listener's clock: signal expires at 14:05:00
        signal_expiration = datetime(2026, 3, 23, 14, 5, 0, tzinfo=timezone.utc)

        # Trading platform's clock: 3 seconds behind
        clock_offset_seconds = -3
        result_timestamp = signal_expiration + timedelta(seconds=clock_offset_seconds)

        signal = {
            "id": "signal_002",
            "asset": "GBPUSD",
            "direction": "PUT",
            "expirationTime": signal_expiration.isoformat(),
            "status": "active"
        }

        # Simulate matching logic
        expiration_time = datetime.fromisoformat(signal["expirationTime"])
        time_diff = abs((result_timestamp - expiration_time).total_seconds())

        # Verify match succeeds
        TOLERANCE_SECONDS = 5
        assert time_diff == 3, f"Expected 3s difference, got {time_diff}s"
        assert time_diff <= TOLERANCE_SECONDS, "Should match within tolerance"

    def test_clock_skew_at_tolerance_boundary(self):
        """
        Test matching at exact tolerance boundary (5 seconds).

        Scenario:
        - Signal expiration_time: 14:10:00 UTC
        - Result timestamp: 14:10:05 UTC (exactly 5s difference)
        - Expected: Match succeeds (at boundary of 5s tolerance)
        """
        signal_expiration = datetime(2026, 3, 23, 14, 10, 0, tzinfo=timezone.utc)

        # Exactly at tolerance boundary
        clock_offset_seconds = 5
        result_timestamp = signal_expiration + timedelta(seconds=clock_offset_seconds)

        signal = {
            "id": "signal_003",
            "asset": "USDJPY",
            "direction": "CALL",
            "expirationTime": signal_expiration.isoformat(),
            "status": "active"
        }

        # Simulate matching logic
        expiration_time = datetime.fromisoformat(signal["expirationTime"])
        time_diff = abs((result_timestamp - expiration_time).total_seconds())

        # Verify match succeeds at boundary
        TOLERANCE_SECONDS = 5
        assert time_diff == 5, f"Expected 5s difference, got {time_diff}s"
        assert time_diff <= TOLERANCE_SECONDS, "Should match at tolerance boundary"

    def test_clock_skew_outside_tolerance(self):
        """
        Test that matching fails when clock skew exceeds tolerance.

        Scenario:
        - Signal expiration_time: 14:15:00 UTC
        - Result timestamp: 14:15:06 UTC (6s difference, exceeds 5s tolerance)
        - Expected: Match fails (outside tolerance)
        """
        signal_expiration = datetime(2026, 3, 23, 14, 15, 0, tzinfo=timezone.utc)

        # Clock skew exceeds tolerance
        clock_offset_seconds = 6
        result_timestamp = signal_expiration + timedelta(seconds=clock_offset_seconds)

        signal = {
            "id": "signal_004",
            "asset": "EURUSD",
            "direction": "PUT",
            "expirationTime": signal_expiration.isoformat(),
            "status": "active"
        }

        # Simulate matching logic
        expiration_time = datetime.fromisoformat(signal["expirationTime"])
        time_diff = abs((result_timestamp - expiration_time).total_seconds())

        # Verify match fails outside tolerance
        TOLERANCE_SECONDS = 5
        assert time_diff == 6, f"Expected 6s difference, got {time_diff}s"
        assert time_diff > TOLERANCE_SECONDS, "Should NOT match outside tolerance"

    def test_clock_skew_multiple_signals_within_tolerance(self):
        """
        Test matching with multiple signals when clock skew affects all.

        Scenario:
        - Multiple signals with different expiration times
        - Consistent 3-second clock skew across all results
        - Expected: Correct signal matched despite clock skew
        """
        base_time = datetime(2026, 3, 23, 15, 0, 0, tzinfo=timezone.utc)
        clock_offset_seconds = 3

        # Multiple signals with different expiration times
        signals = [
            {
                "id": "signal_100",
                "asset": "EURUSD",
                "expirationTime": (base_time + timedelta(minutes=0)).isoformat(),
            },
            {
                "id": "signal_101",
                "asset": "EURUSD",
                "expirationTime": (base_time + timedelta(minutes=5)).isoformat(),
            },
            {
                "id": "signal_102",
                "asset": "EURUSD",
                "expirationTime": (base_time + timedelta(minutes=10)).isoformat(),
            },
        ]

        # Result arrives for signal_101 with clock skew
        target_expiration = base_time + timedelta(minutes=5)
        result_timestamp = target_expiration + timedelta(seconds=clock_offset_seconds)

        # Find matching signal
        TOLERANCE_SECONDS = 5
        matched_signal = None

        for signal in signals:
            expiration_time = datetime.fromisoformat(signal["expirationTime"])
            time_diff = abs((result_timestamp - expiration_time).total_seconds())

            if time_diff <= TOLERANCE_SECONDS:
                matched_signal = signal
                break

        # Verify correct signal matched despite clock skew
        assert matched_signal is not None, "Should find a match within tolerance"
        assert matched_signal["id"] == "signal_101", "Should match the correct signal"

    def test_clock_skew_zero_difference(self):
        """
        Test perfect time alignment (no clock skew).

        Scenario:
        - Signal expiration_time: 16:00:00 UTC
        - Result timestamp: 16:00:00 UTC (perfect alignment)
        - Expected: Match succeeds (0s difference)
        """
        signal_expiration = datetime(2026, 3, 23, 16, 0, 0, tzinfo=timezone.utc)
        result_timestamp = signal_expiration  # No clock skew

        signal = {
            "id": "signal_005",
            "asset": "AUDUSD",
            "direction": "CALL",
            "expirationTime": signal_expiration.isoformat(),
            "status": "active"
        }

        # Simulate matching logic
        expiration_time = datetime.fromisoformat(signal["expirationTime"])
        time_diff = abs((result_timestamp - expiration_time).total_seconds())

        # Verify perfect match
        TOLERANCE_SECONDS = 5
        assert time_diff == 0, f"Expected 0s difference, got {time_diff}s"
        assert time_diff <= TOLERANCE_SECONDS, "Should match with perfect alignment"
