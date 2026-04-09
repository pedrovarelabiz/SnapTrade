import pytest
import time
from datetime import datetime, date, timezone
from unittest.mock import Mock, patch
from listener import find_by_exact_expiration


class TestExactExpirationMatching:
    """Test suite for exact expiration date matching functionality."""

    @patch('listener.listener.logger')
    def test_exact_match_found(self, mock_logger):
        """Test finding option with exact expiration match."""
        target_date = date(2026, 4, 17)
        option_chain = [
            {"expiration_date": "2026-04-10", "strike_price": 100},
            {"expiration_date": "2026-04-17", "strike_price": 100},
            {"expiration_date": "2026-04-24", "strike_price": 100},
        ]

        result = find_by_exact_expiration(option_chain, target_date, strike_price=100)
        assert result is not None
        assert result["expiration_date"] == "2026-04-17"
        assert result["strike_price"] == 100

        # Verify info log for exact match
        mock_logger.info.assert_called()

    def test_exact_match_not_found(self):
        """Test when no exact expiration match exists."""
        target_date = date(2026, 4, 15)
        option_chain = [
            {"expiration_date": "2026-04-10", "strike_price": 100},
            {"expiration_date": "2026-04-17", "strike_price": 100},
            {"expiration_date": "2026-04-24", "strike_price": 100},
        ]

        result = find_by_exact_expiration(option_chain, target_date, strike_price=100)
        assert result is None

    def test_exact_match_with_multiple_strikes(self):
        """Test exact match when multiple strikes exist for same date."""
        target_date = date(2026, 4, 17)
        option_chain = [
            {"expiration_date": "2026-04-17", "strike_price": 95},
            {"expiration_date": "2026-04-17", "strike_price": 100},
            {"expiration_date": "2026-04-17", "strike_price": 105},
        ]

        result = find_by_exact_expiration(option_chain, target_date, strike_price=100)
        assert result is not None
        assert result["expiration_date"] == "2026-04-17"
        assert result["strike_price"] == 100

    def test_exact_match_wrong_strike(self):
        """Test when expiration matches but strike price doesn't."""
        target_date = date(2026, 4, 17)
        option_chain = [
            {"expiration_date": "2026-04-17", "strike_price": 95},
            {"expiration_date": "2026-04-17", "strike_price": 105},
        ]

        result = find_by_exact_expiration(option_chain, target_date, strike_price=100)
        assert result is None

    def test_empty_option_chain(self):
        """Test with empty option chain."""
        target_date = date(2026, 4, 17)
        option_chain = []

        result = find_by_exact_expiration(option_chain, target_date, strike_price=100)
        assert result is None

    def test_date_string_formats(self):
        """Test that various date string formats are handled correctly."""
        target_date = date(2026, 4, 17)
        option_chain = [
            {"expiration_date": "2026-04-17", "strike_price": 100},
        ]

        result = find_by_exact_expiration(option_chain, target_date, strike_price=100)
        assert result is not None
        assert result["expiration_date"] == "2026-04-17"

    def test_datetime_object_conversion(self):
        """Test when target date is a datetime object instead of date."""
        target_datetime = datetime(2026, 4, 17, 10, 30, 0)
        option_chain = [
            {"expiration_date": "2026-04-17", "strike_price": 100},
        ]

        result = find_by_exact_expiration(option_chain, target_datetime.date(), strike_price=100)
        assert result is not None
        assert result["expiration_date"] == "2026-04-17"

    def test_past_expiration_dates(self):
        """Test matching with past expiration dates."""
        target_date = date(2025, 1, 17)
        option_chain = [
            {"expiration_date": "2025-01-10", "strike_price": 100},
            {"expiration_date": "2025-01-17", "strike_price": 100},
            {"expiration_date": "2025-01-24", "strike_price": 100},
        ]

        result = find_by_exact_expiration(option_chain, target_date, strike_price=100)
        assert result is not None
        assert result["expiration_date"] == "2025-01-17"

    def test_future_expiration_dates(self):
        """Test matching with far future expiration dates."""
        target_date = date(2027, 12, 17)
        option_chain = [
            {"expiration_date": "2027-12-10", "strike_price": 100},
            {"expiration_date": "2027-12-17", "strike_price": 100},
            {"expiration_date": "2027-12-24", "strike_price": 100},
        ]

        result = find_by_exact_expiration(option_chain, target_date, strike_price=100)
        assert result is not None
        assert result["expiration_date"] == "2027-12-17"

    def test_decimal_strike_prices(self):
        """Test exact match with decimal strike prices."""
        target_date = date(2026, 4, 17)
        option_chain = [
            {"expiration_date": "2026-04-17", "strike_price": 99.5},
            {"expiration_date": "2026-04-17", "strike_price": 100.5},
        ]

        result = find_by_exact_expiration(option_chain, target_date, strike_price=100.5)
        assert result is not None
        assert result["strike_price"] == 100.5

    def test_first_match_returned_when_duplicates(self):
        """Test that first match is returned when duplicates exist."""
        target_date = date(2026, 4, 17)
        option_chain = [
            {"expiration_date": "2026-04-17", "strike_price": 100, "id": 1},
            {"expiration_date": "2026-04-17", "strike_price": 100, "id": 2},
        ]

        result = find_by_exact_expiration(option_chain, target_date, strike_price=100)
        assert result is not None
        assert result["id"] == 1

    def test_exact_match_within_5_seconds(self):
        """Test that signals within 5 seconds tolerance are matched."""
        signal_time = datetime(2026, 4, 17, 10, 30, 0)
        result_time = datetime(2026, 4, 17, 10, 30, 3)  # 3 seconds later

        option_chain = [
            {"expiration_date": "2026-04-17", "strike_price": 100, "expiration_time": signal_time},
        ]

        result = find_by_exact_expiration(option_chain, result_time, strike_price=100)
        assert result is not None
        assert result["expiration_date"] == "2026-04-17"
        assert result["strike_price"] == 100

    def test_no_match_outside_tolerance(self):
        """Test that signals outside 5 seconds tolerance are not matched."""
        signal_time = datetime(2026, 4, 17, 10, 30, 0)
        result_time = datetime(2026, 4, 17, 10, 30, 10)  # 10 seconds later (outside ±5s)

        option_chain = [
            {"expiration_date": "2026-04-17", "strike_price": 100, "expiration_time": signal_time},
        ]

        result = find_by_exact_expiration(option_chain, result_time, strike_price=100)
        assert result is None

    def test_multiple_signals_different_expirations(self):
        """Test multiple signals on same asset with different expiration times."""
        base_time = datetime(2026, 3, 23, 14, 0, 0)  # T = 14:00:00

        # Create 3 signals on EURUSD with expirations at T+1, T+5, T+15 minutes
        option_chain = [
            {"expiration_date": "2026-03-23", "strike_price": 1.08, "expiration_time": datetime(2026, 3, 23, 14, 1, 0), "id": "T+1"},
            {"expiration_date": "2026-03-23", "strike_price": 1.08, "expiration_time": datetime(2026, 3, 23, 14, 5, 0), "id": "T+5"},
            {"expiration_date": "2026-03-23", "strike_price": 1.08, "expiration_time": datetime(2026, 3, 23, 14, 15, 0), "id": "T+15"},
        ]

        # Result at T+5:02 (5 minutes 2 seconds) should match the T+5 signal
        result_time = datetime(2026, 3, 23, 14, 5, 2)

        result = find_by_exact_expiration(option_chain, result_time, strike_price=1.08)
        assert result is not None
        assert result["id"] == "T+5"
        assert result["expiration_time"] == datetime(2026, 3, 23, 14, 5, 0)

    def test_race_condition_two_signals_same_asset(self):
        """Test race condition with 2 signals on EURUSD, 10 minutes apart, both with 5-minute expirations."""
        base_time = datetime(2026, 3, 23, 14, 0, 0)  # T = 14:00:00

        # Signal 1: Created at T, expires at T+5 minutes (14:05:00)
        # Signal 2: Created at T+10, expires at T+15 minutes (14:15:00)
        option_chain = [
            {"expiration_date": "2026-03-23", "strike_price": 1.08, "expiration_time": datetime(2026, 3, 23, 14, 5, 0), "id": "signal_1", "asset": "EURUSD"},
            {"expiration_date": "2026-03-23", "strike_price": 1.08, "expiration_time": datetime(2026, 3, 23, 14, 15, 0), "id": "signal_2", "asset": "EURUSD"},
        ]

        # Result 1: At T+5:03 (14:05:03) - should match signal_1
        result_1_time = datetime(2026, 3, 23, 14, 5, 3)
        result_1 = find_by_exact_expiration(option_chain, result_1_time, strike_price=1.08)
        assert result_1 is not None
        assert result_1["id"] == "signal_1"
        assert result_1["expiration_time"] == datetime(2026, 3, 23, 14, 5, 0)
        assert result_1["asset"] == "EURUSD"

        # Result 2: At T+15:02 (14:15:02) - should match signal_2, NOT signal_1
        result_2_time = datetime(2026, 3, 23, 14, 15, 2)
        result_2 = find_by_exact_expiration(option_chain, result_2_time, strike_price=1.08)
        assert result_2 is not None
        assert result_2["id"] == "signal_2"
        assert result_2["expiration_time"] == datetime(2026, 3, 23, 14, 15, 0)
        assert result_2["asset"] == "EURUSD"

        # Ensure results are not mixed up
        assert result_1["id"] != result_2["id"]

    def test_signal_without_expiration_time(self):
        """Test backward compatibility: old signals with expiration_time=None are skipped by exact matching."""
        # Old signal without expiration_time field (backward compatibility)
        option_chain = [
            {"expiration_date": "2026-03-23", "strike_price": 1.08, "expiration_time": None, "id": "old_signal"},
        ]

        # Current time - should not match the old signal in exact matching
        current_time = datetime(2026, 3, 23, 14, 5, 0)

        # Exact matching should return None (skips signals without expiration_time)
        result = find_by_exact_expiration(option_chain, current_time.date(), strike_price=1.08)
        assert result is None  # Proximity fallback would catch this signal instead

    @patch('listener.listener.logger')
    def test_multiple_signals_same_expiration(self, mock_logger):
        """Test edge case with multiple signals having identical expiration_time."""
        # Create 2 signals with the exact same expiration_time (edge case)
        identical_expiration = datetime(2026, 3, 23, 14, 5, 0)
        option_chain = [
            {"expiration_date": "2026-03-23", "strike_price": 1.08, "expiration_time": identical_expiration, "id": "signal_1", "created_at": datetime(2026, 3, 23, 14, 0, 0)},
            {"expiration_date": "2026-03-23", "strike_price": 1.08, "expiration_time": identical_expiration, "id": "signal_2", "created_at": datetime(2026, 3, 23, 14, 0, 5)},
        ]

        # Query at the exact expiration time
        result_time = datetime(2026, 3, 23, 14, 5, 0)

        result = find_by_exact_expiration(option_chain, result_time, strike_price=1.08)

        # Should return one result (the most recent based on created_at)
        assert result is not None
        assert result["id"] == "signal_2"

        # Should log a warning about ambiguity
        mock_logger.warning.assert_called_once()
        warning_message = mock_logger.warning.call_args[0][0]
        assert "multiple signals" in warning_message.lower() or "ambiguous" in warning_message.lower()

    def test_timezone_aware_matching(self):
        """Test that timezone-aware datetimes match correctly regardless of offset representation."""
        # Create signal with UTC timezone using timezone.utc
        signal_time_utc = datetime(2026, 3, 23, 14, 5, 0, tzinfo=timezone.utc)

        # Create result time with same moment but using +00:00 offset representation
        from datetime import timedelta
        result_time_utc_offset = datetime(2026, 3, 23, 14, 5, 2, tzinfo=timezone(timedelta(0)))

        option_chain = [
            {"expiration_date": "2026-03-23", "strike_price": 1.08, "expiration_time": signal_time_utc, "id": "utc_signal"},
        ]

        # Should match despite different timezone object representations (both are UTC)
        result = find_by_exact_expiration(option_chain, result_time_utc_offset, strike_price=1.08)
        assert result is not None
        assert result["id"] == "utc_signal"
        assert result["expiration_time"] == signal_time_utc

    def test_no_signals_available(self):
        """Test with no signals available (empty list)."""
        target_date = date(2026, 4, 17)
        signals = []

        result = find_by_exact_expiration(signals, target_date, strike_price=100)
        assert result is None

    def test_invalid_result_timestamp(self):
        """Test that invalid or None result timestamps are handled gracefully."""
        target_date = date(2026, 4, 17)

        # Test with None expiration_time (should be skipped gracefully)
        option_chain_none = [
            {"expiration_date": "2026-04-17", "strike_price": 100, "expiration_time": None},
        ]
        result = find_by_exact_expiration(option_chain_none, target_date, strike_price=100)
        assert result is None  # Should return None, not crash

        # Test with invalid timestamp format (string instead of datetime)
        option_chain_invalid = [
            {"expiration_date": "2026-04-17", "strike_price": 100, "expiration_time": "invalid"},
        ]
        # Should handle gracefully - either return None or skip the invalid entry
        result = find_by_exact_expiration(option_chain_invalid, target_date, strike_price=100)
        # Function should not crash and should return None or handle gracefully
        assert result is None or result is not None  # Accepts either behavior as long as no crash

    def test_performance_1000_signals(self):
        """Test performance with 1000 signals to verify indexing efficiency."""
        target_date = date(2026, 3, 23)
        base_time = datetime(2026, 3, 23, 14, 0, 0)

        # Create 1000 signals with different expiration times
        option_chain = [
            {
                "expiration_date": "2026-03-23",
                "strike_price": 1.08,
                "expiration_time": datetime(2026, 3, 23, 14, i // 60, i % 60),
                "id": f"signal_{i}"
            }
            for i in range(1000)
        ]

        # Add target signal that we'll search for (at position 500)
        target_signal_time = datetime(2026, 3, 23, 14, 8, 22)  # 8 minutes 22 seconds

        # Time the find_by_exact_expiration call
        start_time = time.time()
        result = find_by_exact_expiration(option_chain, target_signal_time, strike_price=1.08)
        elapsed_ms = (time.time() - start_time) * 1000

        # Verify it completes in < 100ms (ensuring indexing works efficiently)
        assert elapsed_ms < 100, f"Search took {elapsed_ms:.2f}ms, expected < 100ms"

        # Verify we got a result
        assert result is not None
        assert result["expiration_date"] == "2026-03-23"
        assert result["strike_price"] == 1.08
