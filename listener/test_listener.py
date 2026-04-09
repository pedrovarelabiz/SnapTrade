import pytest
from datetime import datetime, timezone
from listener.listener import parse_martingale_time, calculate_expiration_time, find_matching_signal


def test_parse_martingale_time():
    """Test parse_martingale_time with valid and invalid inputs."""
    # Valid inputs
    assert parse_martingale_time("5m") == 300
    assert parse_martingale_time("10m") == 600
    assert parse_martingale_time("1h") == 3600

    # Invalid inputs should raise ValueError
    with pytest.raises(ValueError):
        parse_martingale_time("")

    with pytest.raises(ValueError):
        parse_martingale_time("invalid")

    with pytest.raises(ValueError):
        parse_martingale_time("5x")


def test_calculate_expiration_time_single():
    """Test calculate_expiration_time with single iteration."""
    # Signal at 10:00 + martingale_times=["5m"] (300 seconds) + iteration=0 should return 10:05
    signal_timestamp = datetime(2026, 3, 23, 10, 0, 0)
    martingale_times = [300]  # 5 minutes in seconds
    iteration = 0

    expected = datetime(2026, 3, 23, 10, 5, 0)
    result = calculate_expiration_time(signal_timestamp, martingale_times, iteration)

    assert result == expected


def test_calculate_expiration_time_multiple():
    """Test calculate_expiration_time with multiple iterations.

    Each element in martingale_times is the duration in seconds from entry for that level.
    Level 0 = 300s = 5 min, Level 1 = 600s = 10 min, Level 2 = 900s = 15 min.
    """
    signal_timestamp = datetime(2026, 3, 23, 10, 0, 0)
    martingale_times = [300, 600, 900]  # ["5m", "10m", "15m"] in seconds (non-cumulative)

    # iteration=1 uses martingale_times[1] = 600 seconds = 10 min -> 10:10
    expected_iteration_1 = datetime(2026, 3, 23, 10, 10, 0)
    result_iteration_1 = calculate_expiration_time(signal_timestamp, martingale_times, 1)
    assert result_iteration_1 == expected_iteration_1

    # iteration=2 uses martingale_times[2] = 900 seconds = 15 min -> 10:15
    expected_iteration_2 = datetime(2026, 3, 23, 10, 15, 0)
    result_iteration_2 = calculate_expiration_time(signal_timestamp, martingale_times, 2)
    assert result_iteration_2 == expected_iteration_2


def test_find_matching_signal_exact_single():
    """Test find_matching_signal with single signal and exact time match."""
    # Create signal: EURUSD at 10:00 with martingale_times=["5:00"] (5 minutes)
    signal = {
        "asset": "EURUSD",
        "direction": "CALL",
        "entryTimeUtc": "2026-03-23T10:00:00Z",
        "martingaleTimes": ["5:00"],
        "id": "test-signal-1"
    }
    signals = [signal]

    # Result arrives at exactly signal_time + 5min = 10:05:00
    result_timestamp = datetime(2026, 3, 23, 10, 5, 0, tzinfo=timezone.utc)

    # Call find_matching_signal with iteration=0 (first attempt)
    matched_signal, tier, _ = find_matching_signal("EURUSD", result_timestamp, 0, signals)

    # Verify it returns the correct signal using exact matching
    assert matched_signal is not None
    assert matched_signal["id"] == "test-signal-1"
    assert matched_signal["asset"] == "EURUSD"


def test_find_matching_signal_race_condition():
    """Test find_matching_signal with race condition: 2 signals on same asset within 10 minutes."""
    # Signal 1: EURUSD at 10:00 with martingale_times=["5:00"]
    signal1 = {
        "asset": "EURUSD",
        "direction": "CALL",
        "entryTimeUtc": "2026-03-23T10:00:00Z",
        "martingaleTimes": ["5:00"],
        "id": "test-signal-1"
    }

    # Signal 2: EURUSD at 10:02 (2 minutes later, within 10 min window) with martingale_times=["5:00"]
    signal2 = {
        "asset": "EURUSD",
        "direction": "CALL",
        "entryTimeUtc": "2026-03-23T10:02:00Z",
        "martingaleTimes": ["5:00"],
        "id": "test-signal-2"
    }
    signals = [signal1, signal2]

    # Result arrives at 10:05:30 - ambiguous time
    # Could be signal1 (expected 10:05) + 30s late
    # Or signal2 (expected 10:07) - 90s early
    result_timestamp = datetime(2026, 3, 23, 10, 5, 30, tzinfo=timezone.utc)

    # Call find_matching_signal - should detect race condition and fall back to proximity
    matched_signal, tier, _ = find_matching_signal("EURUSD", result_timestamp, 0, signals)

    # Verify it returns signal1 (closer in time: 30s vs 90s)
    assert matched_signal is not None
    assert matched_signal["id"] == "test-signal-1"


def test_find_matching_signal_proximity_fallback():
    """Test find_matching_signal falls back to proximity matching when martingaleTimes is missing."""
    # Signal without martingaleTimes field - should trigger proximity fallback
    signal = {
        "asset": "GBPUSD",
        "direction": "PUT",
        "entryTimeUtc": "2026-03-23T14:00:00Z",
        "id": "test-signal-no-martingale"
    }
    signals = [signal]

    # Result arrives at 14:05:00 (5 minutes after signal time)
    result_timestamp = datetime(2026, 3, 23, 14, 5, 0, tzinfo=timezone.utc)

    # Call find_matching_signal with iteration=0
    matched_signal, tier, _ = find_matching_signal("GBPUSD", result_timestamp, 0, signals)

    # Verify it returns the signal using proximity matching instead of failing
    assert matched_signal is not None
    assert matched_signal["id"] == "test-signal-no-martingale"
    assert matched_signal["asset"] == "GBPUSD"


def test_find_matching_signal_tolerance():
    """Test find_matching_signal with EXPIRATION_MATCH_TOLERANCE window."""
    # Signal at 10:00 with martingale_times=["5:00"] expires at 10:05:00
    signal = {
        "asset": "EURUSD",
        "direction": "CALL",
        "entryTimeUtc": "2026-03-23T10:00:00Z",
        "martingaleTimes": ["5:00"],
        "id": "test-signal-tolerance"
    }
    signals = [signal]

    # Result at 10:05:45 (45s late) - should match within EXPIRATION_MATCH_TOLERANCE=60s
    result_timestamp_45s = datetime(2026, 3, 23, 10, 5, 45, tzinfo=timezone.utc)
    matched_signal, tier, _ = find_matching_signal("EURUSD", result_timestamp_45s, 0, signals)
    assert matched_signal is not None
    assert matched_signal["id"] == "test-signal-tolerance"

    # Result at 10:06:30 (90s late) - still within TIER 3 30-min proximity window
    result_timestamp_90s = datetime(2026, 3, 23, 10, 6, 30, tzinfo=timezone.utc)
    matched_signal_90s, tier_90s, _ = find_matching_signal("EURUSD", result_timestamp_90s, 0, signals)
    assert tier_90s == 3  # proximity fallback, not an exact/martingale miss


def test_find_matching_signal_gale_iterations():
    """Test find_matching_signal with multiple martingale iterations."""
    # Signal at 10:00 with martingale_times=["5m", "10m", "15m"]
    signal = {
        "asset": "EURUSD",
        "direction": "CALL",
        "entryTimeUtc": "2026-03-23T10:00:00Z",
        "martingaleTimes": ["5:00", "10:00", "15:00"],
        "id": "test-signal-gale"
    }
    signals = [signal]

    # Result 1: arrives at 10:05 (+5min) - should match iteration=0
    result_timestamp_1 = datetime(2026, 3, 23, 10, 5, 0, tzinfo=timezone.utc)
    matched_signal_1, _, _ = find_matching_signal("EURUSD", result_timestamp_1, 0, signals)
    assert matched_signal_1 is not None
    assert matched_signal_1["id"] == "test-signal-gale"

    # Result 2: arrives at 10:15 (+5min+10min=15min) - should match iteration=1
    result_timestamp_2 = datetime(2026, 3, 23, 10, 15, 0, tzinfo=timezone.utc)
    matched_signal_2, _, _ = find_matching_signal("EURUSD", result_timestamp_2, 1, signals)
    assert matched_signal_2 is not None
    assert matched_signal_2["id"] == "test-signal-gale"

    # Result 3: arrives at 10:30 (+5min+10min+15min=30min) - should match iteration=2
    result_timestamp_3 = datetime(2026, 3, 23, 10, 30, 0, tzinfo=timezone.utc)
    matched_signal_3, _, _ = find_matching_signal("EURUSD", result_timestamp_3, 2, signals)
    assert matched_signal_3 is not None
    assert matched_signal_3["id"] == "test-signal-gale"


def test_find_matching_signal_timezone():
    """Test find_matching_signal handles different timezone representations correctly."""
    # Signal with UTC timezone in entryTimeUtc
    signal_utc = {
        "asset": "EURUSD",
        "direction": "CALL",
        "entryTimeUtc": "2026-03-23T10:00:00Z",
        "martingaleTimes": ["5:00"],
        "id": "test-signal-utc"
    }

    # Signal with explicit +00:00 UTC format
    signal_utc_explicit = {
        "asset": "GBPUSD",
        "direction": "PUT",
        "entryTimeUtc": "2026-03-23T10:00:00+00:00",
        "martingaleTimes": ["5:00"],
        "id": "test-signal-utc-explicit"
    }

    signals = [signal_utc, signal_utc_explicit]

    # Test with timezone-aware UTC datetime
    result_timestamp_aware = datetime(2026, 3, 23, 10, 5, 0, tzinfo=timezone.utc)
    matched_signal, _, _ = find_matching_signal("EURUSD", result_timestamp_aware, 0, signals)
    assert matched_signal is not None
    assert matched_signal["id"] == "test-signal-utc"

    # Test with naive datetime (no timezone) - should still work
    result_timestamp_naive = datetime(2026, 3, 23, 10, 5, 0)
    matched_signal_naive, _, _ = find_matching_signal("EURUSD", result_timestamp_naive, 0, signals)
    assert matched_signal_naive is not None
    assert matched_signal_naive["id"] == "test-signal-utc"

    # Test explicit +00:00 format signal matches correctly
    result_timestamp_gbp = datetime(2026, 3, 23, 10, 5, 0, tzinfo=timezone.utc)
    matched_signal_gbp, _, _ = find_matching_signal("GBPUSD", result_timestamp_gbp, 0, signals)
    assert matched_signal_gbp is not None
    assert matched_signal_gbp["id"] == "test-signal-utc-explicit"

    # Verify no crashes when comparing timezone-aware and naive datetimes
    # This should handle gracefully without raising TypeError
    mixed_signals = [signal_utc, signal_utc_explicit]
    result_signal, _, _ = find_matching_signal("EURUSD", result_timestamp_naive, 0, mixed_signals)
    assert result_signal is not None  # Function should handle mixed timezone representations
