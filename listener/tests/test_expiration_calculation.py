"""Unit tests for calculate_expiration_time function.

The calculate_expiration_time function accepts martingale_times as a list of
values in SECONDS (not minutes). It computes the cumulative sum of elements
up to and including martingale_level, then adds that many seconds to entry_time.

Production usage: [expiration_minutes * 60] i.e. [300] for 5-minute signals.
"""

import pytest
from datetime import datetime, timedelta, timezone

from listener import calculate_expiration_time


class TestCalculateExpirationTime:
    """Test cases for the calculate_expiration_time function."""

    def test_basic_calculation(self):
        """Test basic calculation: time + 5 minutes (300 seconds)."""
        signal_timestamp = datetime(2026, 3, 23, 10, 0, 0, tzinfo=timezone.utc)
        martingale_seconds = 300  # 5 minutes in seconds

        result = calculate_expiration_time(signal_timestamp, [martingale_seconds])

        expected = datetime(2026, 3, 23, 10, 5, 0, tzinfo=timezone.utc)
        assert result == expected
        assert result.tzinfo is not None

    def test_timezone_preservation(self):
        """Test that timezone is preserved in the output."""
        # Test with UTC timezone: 10 minutes = 600 seconds
        utc_timestamp = datetime(2026, 3, 23, 10, 0, 0, tzinfo=timezone.utc)
        result_utc = calculate_expiration_time(utc_timestamp, [600])
        assert result_utc.tzinfo == timezone.utc
        assert result_utc == datetime(2026, 3, 23, 10, 10, 0, tzinfo=timezone.utc)

        # Test with different timezone: 10 minutes = 600 seconds
        eastern_tz = timezone(timedelta(hours=-5))
        eastern_timestamp = datetime(2026, 3, 23, 10, 0, 0, tzinfo=eastern_tz)
        result_eastern = calculate_expiration_time(eastern_timestamp, [600])
        assert result_eastern.tzinfo == eastern_tz
        assert result_eastern == datetime(2026, 3, 23, 10, 10, 0, tzinfo=eastern_tz)

        # Test with naive datetime (remains naive): 10 minutes = 600 seconds
        naive_timestamp = datetime(2026, 3, 23, 10, 0, 0)
        result_naive = calculate_expiration_time(naive_timestamp, [600])
        assert result_naive.tzinfo is None
        assert result_naive == datetime(2026, 3, 23, 10, 10, 0)

    def test_invalid_negative_minutes(self):
        """Test that negative values in list are handled (subtracts time)."""
        signal_timestamp = datetime(2026, 3, 23, 10, 0, 0, tzinfo=timezone.utc)

        # Negative 5 minutes = -300 seconds
        result = calculate_expiration_time(signal_timestamp, [-300])
        expected = datetime(2026, 3, 23, 9, 55, 0, tzinfo=timezone.utc)
        assert result == expected

    def test_invalid_zero_minutes(self):
        """Test that zero seconds returns same timestamp."""
        signal_timestamp = datetime(2026, 3, 23, 10, 0, 0, tzinfo=timezone.utc)

        result = calculate_expiration_time(signal_timestamp, [0])
        assert result == signal_timestamp

    def test_invalid_none_minutes(self):
        """Test that None value for martingale_times raises ValueError."""
        signal_timestamp = datetime(2026, 3, 23, 10, 0, 0, tzinfo=timezone.utc)

        with pytest.raises(ValueError, match="martingale_times cannot be None"):
            calculate_expiration_time(signal_timestamp, None)

    def test_invalid_float_minutes(self):
        """Test that float value for seconds is accepted (5.5 seconds)."""
        signal_timestamp = datetime(2026, 3, 23, 10, 0, 0, tzinfo=timezone.utc)

        # 5.5 seconds added to timestamp
        result = calculate_expiration_time(signal_timestamp, [5.5])
        expected = signal_timestamp + timedelta(seconds=5.5)
        assert result == expected

    def test_large_minute_values(self):
        """Test calculation with large second values (24 hours = 86400 seconds)."""
        signal_timestamp = datetime(2026, 3, 23, 10, 0, 0, tzinfo=timezone.utc)
        martingale_seconds = 86400  # 24 hours in seconds

        result = calculate_expiration_time(signal_timestamp, [martingale_seconds])

        expected = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)
        assert result == expected

    def test_calculate_expiration_time_invalid_iteration(self):
        """Test that out-of-bounds martingale_level raises ValueError."""
        signal_timestamp = datetime(2026, 3, 23, 10, 0, 0, tzinfo=timezone.utc)
        martingale_times = [300, 600, 900]  # 3 elements: 5min, 10min, 15min in seconds

        # Test with martingale_level=5 when list only has 3 elements (indices 0, 1, 2)
        with pytest.raises(ValueError, match="martingale_level 5 out of bounds for list of length 3"):
            calculate_expiration_time(signal_timestamp, martingale_times, martingale_level=5)

    def test_calculate_expiration_time_empty_array(self):
        """Test that empty martingale_times array raises ValueError."""
        signal_timestamp = datetime(2026, 3, 23, 10, 0, 0, tzinfo=timezone.utc)
        martingale_times = []  # Empty array

        # With empty array, should raise ValueError as list must be non-empty
        with pytest.raises(ValueError, match="martingale_times must be a non-empty list"):
            calculate_expiration_time(signal_timestamp, martingale_times, martingale_level=0)
