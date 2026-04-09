"""Pytest fixtures for listener tests."""

import pytest
from datetime import datetime, timezone
from typing import List, Dict, Any
from listener import calculate_expiration_time


@pytest.fixture
def create_signal_with_expiration():
    """Factory fixture for creating test signals with auto-calculated expiration times.

    This fixture reduces test boilerplate by automatically calculating expirationTime
    based on entry_time and martingale_times using calculate_expiration_time.

    Args:
        asset: Trading asset (e.g., "EURUSD", "GBPUSD")
        entry_time: Entry datetime (should be timezone-aware)
        martingale_times: List of martingale durations in minutes (e.g., [1, 5, 15])
        martingale_level: Which martingale level to use for expiration (default: 0)
        signal_id: Optional custom signal ID (auto-generated if not provided)

    Returns:
        Factory function that creates signal dictionaries

    Example:
        def test_example(create_signal_with_expiration):
            entry_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)
            signal = create_signal_with_expiration(
                asset="EURUSD",
                entry_time=entry_time,
                martingale_times=[1, 5, 15]
            )
            # signal will have expirationTime auto-calculated as entry_time + 1 minute
    """
    _signal_counter = {"count": 0}

    def _create_signal(
        asset: str,
        entry_time: datetime,
        martingale_times: List[int],
        martingale_level: int = 0,
        signal_id: str = None
    ) -> Dict[str, Any]:
        """Create a signal dict with auto-calculated expiration time.

        Args:
            asset: Trading asset
            entry_time: Entry datetime (timezone-aware)
            martingale_times: List of martingale durations in minutes
            martingale_level: Martingale level for expiration calculation (default: 0)
            signal_id: Optional signal ID (auto-generated if None)

        Returns:
            Signal dictionary with expirationTime, entryTimeUtc, martingaleTimes, etc.
        """
        # Auto-generate signal ID if not provided
        if signal_id is None:
            _signal_counter["count"] += 1
            signal_id = f"test_signal_{_signal_counter['count']}"

        # Calculate expiration time using the listener function
        expiration_time = calculate_expiration_time(
            entry_time=entry_time,
            martingale_times=martingale_times,
            martingale_level=martingale_level
        )

        # Convert martingale_times from minutes to "MM:SS" format for signal structure
        martingale_times_formatted = [f"{minutes:02d}:00" for minutes in martingale_times]

        return {
            "id": signal_id,
            "asset": asset,
            "expirationTime": expiration_time.isoformat(),
            "entryTimeUtc": entry_time.isoformat(),
            "martingaleTimes": martingale_times_formatted,
        }

    return _create_signal
