"""Unit tests for signal matching functions."""

import pytest
from datetime import datetime, timezone, timedelta

from listener import calculate_expiration_time
from listener.listener import find_matching_signal


class TestSignalMatching:
    """Test cases for signal matching functionality."""

    def test_calculate_expiration_time_basic(self):
        """Test calculate_expiration_time with martingale_times=[60,300,900] seconds at all levels.

        Values are in seconds: 60s=1min, 300s=5min, 900s=15min.
        Each level directly uses its value as seconds from entry (non-cumulative).
        """
        # Fixed datetime for determinism
        entry_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)
        martingale_times = [60, 300, 900]  # 1min, 5min, 15min in seconds

        # Test level 0: expiration = entry + 1 minute (60 seconds)
        result_level_0 = calculate_expiration_time(entry_time, martingale_times, martingale_level=0)
        expected_level_0 = datetime(2026, 3, 24, 10, 1, 0, tzinfo=timezone.utc)
        assert result_level_0 == expected_level_0, f"Level 0: expected {expected_level_0}, got {result_level_0}"

        # Test level 1: expiration = entry + 5 minutes (300 seconds)
        result_level_1 = calculate_expiration_time(entry_time, martingale_times, martingale_level=1)
        expected_level_1 = datetime(2026, 3, 24, 10, 5, 0, tzinfo=timezone.utc)
        assert result_level_1 == expected_level_1, f"Level 1: expected {expected_level_1}, got {result_level_1}"

        # Test level 2: expiration = entry + 15 minutes (900 seconds)
        result_level_2 = calculate_expiration_time(entry_time, martingale_times, martingale_level=2)
        expected_level_2 = datetime(2026, 3, 24, 10, 15, 0, tzinfo=timezone.utc)
        assert result_level_2 == expected_level_2, f"Level 2: expected {expected_level_2}, got {result_level_2}"

    def test_calculate_expiration_time_edge_cases(self):
        """Test calculate_expiration_time with edge cases and invalid inputs."""
        entry_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)
        martingale_times = [1, 5, 15]

        # Test negative martingale_level
        with pytest.raises(ValueError):
            calculate_expiration_time(entry_time, martingale_times, martingale_level=-1)

        # Test martingale_level out of bounds (index >= len(martingale_times))
        with pytest.raises(ValueError):
            calculate_expiration_time(entry_time, martingale_times, martingale_level=3)

        # Test with empty martingale_times array
        with pytest.raises(ValueError):
            calculate_expiration_time(entry_time, [], martingale_level=0)

        # Test with None entry_time
        with pytest.raises(ValueError):
            calculate_expiration_time(None, martingale_times, martingale_level=0)

        # Test with None martingale_times
        with pytest.raises(ValueError):
            calculate_expiration_time(entry_time, None, martingale_level=0)

    def test_tier1_exact_expiration_match(self):
        """Test tier 1 exact expiration matching with known expiration time."""
        # Create a signal with known expirationTime
        expiration_time = datetime(2026, 3, 24, 10, 5, 0, tzinfo=timezone.utc)
        signal = {
            "id": "test_signal_123",
            "asset": "EURUSD",
            "expirationTime": expiration_time.isoformat(),
            "entryTimeUtc": "2026-03-24T10:00:00Z",
            "martingaleTimes": ["05:00"],
        }
        signals = [signal]

        # Submit result at exact expiration (within ±2 seconds)
        result_timestamp = expiration_time + timedelta(seconds=1)

        # Call find_matching_signal
        match_result = find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_timestamp,
            result_iteration=0,
            signals=signals
        )

        # Verify match found via tier 1
        assert match_result is not None, "Expected a match to be found"
        matched_signal, match_tier, confidence_score = match_result

        # Check match_tier=1
        assert match_tier == 1, f"Expected match_tier=1, got {match_tier}"
        assert matched_signal["id"] == "test_signal_123", "Expected to match the test signal"
        assert confidence_score is not None, "Expected a confidence score"
        assert 0.0 <= confidence_score <= 1.0, f"Confidence score should be between 0.0 and 1.0, got {confidence_score}"

    def test_tier1_multiple_signals_same_asset(self):
        """Test tier 1 matching with multiple signals on same asset - verifies correct signal selection."""
        # Create 3 signals on EURUSD within 10 minutes, each with different expiration times
        base_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)

        signal1 = {
            "id": "signal_first",
            "asset": "EURUSD",
            "expirationTime": (base_time + timedelta(minutes=1)).isoformat(),
            "entryTimeUtc": base_time.isoformat(),
            "martingaleTimes": ["01:00"],
        }

        signal2 = {
            "id": "signal_second",
            "asset": "EURUSD",
            "expirationTime": (base_time + timedelta(minutes=5)).isoformat(),
            "entryTimeUtc": base_time.isoformat(),
            "martingaleTimes": ["05:00"],
        }

        signal3 = {
            "id": "signal_third",
            "asset": "EURUSD",
            "expirationTime": (base_time + timedelta(minutes=9)).isoformat(),
            "entryTimeUtc": base_time.isoformat(),
            "martingaleTimes": ["09:00"],
        }

        signals = [signal1, signal2, signal3]

        # Submit result matching 2nd signal's expiration (10:05:00 + 1 second)
        result_timestamp = base_time + timedelta(minutes=5, seconds=1)

        # Call find_matching_signal
        match_result = find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_timestamp,
            result_iteration=0,
            signals=signals
        )

        # Verify correct signal matched (2nd signal, not first or third)
        assert match_result is not None, "Expected a match to be found"
        matched_signal, match_tier, confidence_score = match_result

        assert match_tier == 1, f"Expected match_tier=1, got {match_tier}"
        assert matched_signal["id"] == "signal_second", f"Expected to match signal_second, got {matched_signal['id']}"
        assert matched_signal["id"] != "signal_first", "Should not match first signal"
        assert matched_signal["id"] != "signal_third", "Should not match third signal"
        assert confidence_score is not None, "Expected a confidence score"

    def test_d3_race_condition_resolved(self):
        """Test D3 race condition: 2 signals on same asset within 30 min, result arrives between them.

        Reproduces exact D3 issue where:
        - Signal 1 placed at 10:00, expires at 10:15
        - Signal 2 placed at 10:20, expires at 10:35
        - Result arrives at 10:15:01 (between the two signals)

        Old logic would be ambiguous (both signals are recent).
        New tier 1 logic should match Signal 1 by exact expiration time.
        """
        base_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)

        # Signal 1: placed at 10:00, expires at 10:15
        signal1 = {
            "id": "d3_signal_1",
            "asset": "GBPUSD",
            "expirationTime": (base_time + timedelta(minutes=15)).isoformat(),
            "entryTimeUtc": base_time.isoformat(),
            "martingaleTimes": ["15:00"],
        }

        # Signal 2: placed at 10:20, expires at 10:35
        signal2 = {
            "id": "d3_signal_2",
            "asset": "GBPUSD",
            "expirationTime": (base_time + timedelta(minutes=35)).isoformat(),
            "entryTimeUtc": (base_time + timedelta(minutes=20)).isoformat(),
            "martingaleTimes": ["15:00"],
        }

        signals = [signal1, signal2]

        # Result arrives at 10:15:01 (1 second after signal1's expiration, 19 min before signal2's expiration)
        result_timestamp = base_time + timedelta(minutes=15, seconds=1)

        # Call find_matching_signal
        match_result = find_matching_signal(
            asset="GBPUSD",
            result_timestamp=result_timestamp,
            result_iteration=0,
            signals=signals
        )

        # Verify correct signal matched: should match signal1 via tier 1 exact expiration matching
        assert match_result is not None, "Expected a match to be found"
        matched_signal, match_tier, confidence_score = match_result

        # New tier 1 logic should match signal1 by exact expiration
        assert match_tier == 1, f"Expected match_tier=1 (exact expiration match), got {match_tier}"
        assert matched_signal["id"] == "d3_signal_1", f"Expected to match d3_signal_1 by exact expiration, got {matched_signal['id']}"
        assert matched_signal["id"] != "d3_signal_2", "Should not match the later signal"
        assert confidence_score is not None, "Expected a confidence score"

    def test_tier2_martingale_level_detection(self):
        """Test tier 2 matching correctly identifies martingale level 1.

        Create signal with martingale_times=[1,5,15] minutes.
        Submit result at entry+5min (corresponds to level 1).
        Verify tier 2 matches and correctly identifies martingale_level=1.
        """
        entry_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)

        # Create signal with martingale_times=[1,5,15] minutes
        signal = {
            "id": "martingale_test_signal",
            "asset": "USDJPY",
            "entryTimeUtc": entry_time.isoformat(),
            "martingaleTimes": ["01:00", "05:00", "15:00"],
        }
        signals = [signal]

        # Submit result at entry+5min (corresponds to martingale level 1)
        result_timestamp = entry_time + timedelta(minutes=5)

        # Call find_matching_signal
        match_result = find_matching_signal(
            asset="USDJPY",
            result_timestamp=result_timestamp,
            result_iteration=0,
            signals=signals
        )

        # Verify tier 2 match with correct martingale level
        assert match_result is not None, "Expected a match to be found"
        matched_signal, match_tier, confidence_score = match_result

        assert match_tier == 2, f"Expected match_tier=2 (martingale level detection), got {match_tier}"
        assert matched_signal["id"] == "martingale_test_signal", f"Expected to match martingale_test_signal, got {matched_signal['id']}"

        # Verify martingale_level=1 is correctly identified
        assert "martingale_level" in matched_signal, "Expected martingale_level in matched signal"
        assert matched_signal["martingale_level"] == 1, f"Expected martingale_level=1, got {matched_signal['martingale_level']}"
        assert confidence_score is not None, "Expected a confidence score"

    def test_tier2_all_martingale_levels(self):
        """Test tier 2 matching correctly identifies all martingale levels (0, 1, 2).

        Create signal with martingale_times=[1,5,15] minutes.
        Submit results at entry+1min, entry+5min, entry+15min.
        Verify tier 2 correctly detects level in all cases.
        """
        entry_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)

        # Create signal with martingale_times=[1,5,15] minutes
        signal = {
            "id": "all_levels_signal",
            "asset": "EURUSD",
            "entryTimeUtc": entry_time.isoformat(),
            "martingaleTimes": ["01:00", "05:00", "15:00"],
        }
        signals = [signal]

        # Test level 0: submit result at entry+1min
        result_timestamp_level_0 = entry_time + timedelta(minutes=1)
        match_result_0 = find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_timestamp_level_0,
            result_iteration=0,
            signals=signals
        )

        assert match_result_0 is not None, "Expected a match for level 0"
        matched_signal_0, match_tier_0, confidence_score_0 = match_result_0
        assert match_tier_0 == 2, f"Expected match_tier=2 for level 0, got {match_tier_0}"
        assert matched_signal_0["id"] == "all_levels_signal"
        assert "martingale_level" in matched_signal_0, "Expected martingale_level in matched signal"
        assert matched_signal_0["martingale_level"] == 0, f"Expected martingale_level=0, got {matched_signal_0['martingale_level']}"

        # Test level 1: submit result at entry+5min
        result_timestamp_level_1 = entry_time + timedelta(minutes=5)
        match_result_1 = find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_timestamp_level_1,
            result_iteration=0,
            signals=signals
        )

        assert match_result_1 is not None, "Expected a match for level 1"
        matched_signal_1, match_tier_1, confidence_score_1 = match_result_1
        assert match_tier_1 == 2, f"Expected match_tier=2 for level 1, got {match_tier_1}"
        assert matched_signal_1["id"] == "all_levels_signal"
        assert "martingale_level" in matched_signal_1, "Expected martingale_level in matched signal"
        assert matched_signal_1["martingale_level"] == 1, f"Expected martingale_level=1, got {matched_signal_1['martingale_level']}"

        # Test level 2: submit result at entry+15min
        result_timestamp_level_2 = entry_time + timedelta(minutes=15)
        match_result_2 = find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_timestamp_level_2,
            result_iteration=0,
            signals=signals
        )

        assert match_result_2 is not None, "Expected a match for level 2"
        matched_signal_2, match_tier_2, confidence_score_2 = match_result_2
        assert match_tier_2 == 2, f"Expected match_tier=2 for level 2, got {match_tier_2}"
        assert matched_signal_2["id"] == "all_levels_signal"
        assert "martingale_level" in matched_signal_2, "Expected martingale_level in matched signal"
        assert matched_signal_2["martingale_level"] == 2, f"Expected martingale_level=2, got {matched_signal_2['martingale_level']}"

    def test_tier3_proximity_fallback(self):
        """Test tier 3 proximity matching when exact matching fails.

        Create signal missing expirationTime field (tier 1 fails).
        Submit result within 30-minute window from entry time.
        Verify tier 3 proximity matching activates and finds closest signal.
        """
        entry_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)

        # Create signal WITHOUT expirationTime (tier 1 will fail)
        signal = {
            "id": "proximity_test_signal",
            "asset": "GBPJPY",
            "entryTimeUtc": entry_time.isoformat(),
            # No expirationTime field - tier 1 will fail
            # martingaleTimes present but tier 2 might not match exact timing
        }
        signals = [signal]

        # Submit result 10 minutes after entry (within 30-minute window)
        result_timestamp = entry_time + timedelta(minutes=10)

        # Call find_matching_signal
        match_result = find_matching_signal(
            asset="GBPJPY",
            result_timestamp=result_timestamp,
            result_iteration=0,
            signals=signals
        )

        # Verify tier 3 proximity match found
        assert match_result is not None, "Expected a match to be found via tier 3 proximity"
        matched_signal, match_tier, confidence_score = match_result

        assert match_tier == 3, f"Expected match_tier=3 (proximity fallback), got {match_tier}"
        assert matched_signal["id"] == "proximity_test_signal", f"Expected to match proximity_test_signal, got {matched_signal['id']}"
        assert confidence_score is not None, "Expected a confidence score"
        assert 0.0 <= confidence_score <= 1.0, f"Confidence score should be between 0.0 and 1.0, got {confidence_score}"

    def test_tier3_ambiguity_warning(self, caplog):
        """Test tier 3 warns about ambiguous matches when multiple signals are within 30-min window.

        Create 2 signals on same asset within 30-minute window, both missing expiration data.
        Submit result closer to one signal than the other.
        Verify warning is logged about ambiguous match, but closest signal is still returned.
        """
        base_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)

        # Signal 1: placed at 10:00, NO expirationTime (forces tier 3)
        signal1 = {
            "id": "ambiguous_signal_1",
            "asset": "AUDUSD",
            "entryTimeUtc": base_time.isoformat(),
            # No expirationTime field - tier 1 will fail
            # No martingaleTimes - tier 2 will fail
        }

        # Signal 2: placed at 10:20 (20 minutes after signal1), NO expirationTime (forces tier 3)
        signal2 = {
            "id": "ambiguous_signal_2",
            "asset": "AUDUSD",
            "entryTimeUtc": (base_time + timedelta(minutes=20)).isoformat(),
            # No expirationTime field - tier 1 will fail
            # No martingaleTimes - tier 2 will fail
        }

        signals = [signal1, signal2]

        # Submit result at 10:12 (12 min after signal1, 8 min before signal2)
        # This is closer to signal1, but both are within the 30-minute window
        result_timestamp = base_time + timedelta(minutes=12)

        # Call find_matching_signal with logging capture
        import logging
        with caplog.at_level(logging.WARNING):
            match_result = find_matching_signal(
                asset="AUDUSD",
                result_timestamp=result_timestamp,
                result_iteration=0,
                signals=signals
            )

        # Verify tier 3 match found
        assert match_result is not None, "Expected a match to be found via tier 3"
        matched_signal, match_tier, confidence_score = match_result

        # Verify tier 3 was used
        assert match_tier == 3, f"Expected match_tier=3 (proximity with ambiguity), got {match_tier}"

        # Verify closest signal (signal1) was returned
        assert matched_signal["id"] == "ambiguous_signal_1", f"Expected to match ambiguous_signal_1 (closest), got {matched_signal['id']}"

        # Verify warning was logged about ambiguous match
        warning_logs = [record for record in caplog.records if record.levelname == "WARNING"]
        assert len(warning_logs) > 0, "Expected at least one WARNING log"

        # Check that the warning mentions ambiguity or multiple candidates
        ambiguity_warning_found = any(
            "ambiguous" in record.message.lower() or "multiple" in record.message.lower()
            for record in warning_logs
        )
        assert ambiguity_warning_found, f"Expected warning about ambiguous/multiple matches. Logs: {[r.message for r in warning_logs]}"

    def test_no_match_found(self, caplog):
        """Test no match found when asset has no signals or timestamp is outside all windows.

        Case 1: Submit result for asset with no pending signals.
        Case 2: Submit result with timestamp outside all matching windows.
        Verify None is returned and error is logged with helpful context.
        """
        import logging
        base_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)

        # Case 1: Asset with no pending signals
        signals = []

        with caplog.at_level(logging.ERROR):
            match_result = find_matching_signal(
                asset="NZDUSD",
                result_timestamp=base_time + timedelta(minutes=5),
                result_iteration=0,
                signals=signals
            )

        # Verify None returned
        assert match_result == (None, None, None), "Expected (None, None, None) when no signals exist for asset"

        # Verify error logged with helpful context
        error_logs = [record for record in caplog.records if record.levelname == "ERROR"]
        assert len(error_logs) > 0, "Expected at least one ERROR log"

        # Case 2: Result timestamp outside all windows (>30 min after entry)
        caplog.clear()

        signal = {
            "id": "expired_signal",
            "asset": "NZDUSD",
            "entryTimeUtc": base_time.isoformat(),
            "expirationTime": (base_time + timedelta(minutes=5)).isoformat(),
            "martingaleTimes": ["05:00"],
        }
        signals = [signal]

        # Submit result 45 minutes after entry (outside 30-minute window)
        result_timestamp = base_time + timedelta(minutes=45)

        with caplog.at_level(logging.ERROR):
            match_result = find_matching_signal(
                asset="NZDUSD",
                result_timestamp=result_timestamp,
                result_iteration=0,
                signals=signals
            )

        # Verify None returned
        assert match_result == (None, None, None), "Expected (None, None, None) when timestamp is outside all windows"

        # Verify error logged with context (asset, timestamp info)
        error_logs = [record for record in caplog.records if record.levelname == "ERROR"]
        assert len(error_logs) > 0, "Expected at least one ERROR log for no match"

        # Verify log contains helpful context
        error_message = error_logs[-1].message.lower()
        assert "nzdusd" in error_message or "no match" in error_message, f"Expected helpful context in error log: {error_logs[-1].message}"

    def test_match_confidence_scores(self):
        """Test confidence_score in return value: Tier 1 high (>0.9), Tier 2 medium (0.7-0.9), Tier 3 lower (<0.7)."""
        base_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)

        # Tier 1: Exact expiration match - should have high confidence (>0.9)
        tier1_signal = {
            "id": "tier1_signal",
            "asset": "EURUSD",
            "expirationTime": (base_time + timedelta(minutes=5)).isoformat(),
            "entryTimeUtc": base_time.isoformat(),
            "martingaleTimes": ["05:00"],
        }
        tier1_result = find_matching_signal(
            asset="EURUSD",
            result_timestamp=base_time + timedelta(minutes=5, seconds=1),
            result_iteration=0,
            signals=[tier1_signal]
        )
        assert tier1_result is not None, "Expected tier 1 match"
        _, tier1_match_tier, tier1_confidence = tier1_result
        assert tier1_match_tier == 1, f"Expected tier 1, got {tier1_match_tier}"
        assert tier1_confidence > 0.9, f"Tier 1 should have high confidence (>0.9), got {tier1_confidence}"

        # Tier 2: Martingale level detection - should have medium confidence (0.7-0.9)
        tier2_signal = {
            "id": "tier2_signal",
            "asset": "GBPUSD",
            "entryTimeUtc": base_time.isoformat(),
            "martingaleTimes": ["01:00", "05:00", "15:00"],
        }
        tier2_result = find_matching_signal(
            asset="GBPUSD",
            result_timestamp=base_time + timedelta(minutes=5),
            result_iteration=0,
            signals=[tier2_signal]
        )
        assert tier2_result is not None, "Expected tier 2 match"
        _, tier2_match_tier, tier2_confidence = tier2_result
        assert tier2_match_tier == 2, f"Expected tier 2, got {tier2_match_tier}"
        assert 0.7 <= tier2_confidence <= 0.9, f"Tier 2 should have medium confidence (0.7-0.9), got {tier2_confidence}"

        # Tier 3: Proximity fallback - should have lower confidence (<0.7)
        tier3_signal = {
            "id": "tier3_signal",
            "asset": "USDJPY",
            "entryTimeUtc": base_time.isoformat(),
            # No expirationTime or martingaleTimes - forces tier 3 proximity match
        }
        tier3_result = find_matching_signal(
            asset="USDJPY",
            result_timestamp=base_time + timedelta(minutes=10),
            result_iteration=0,
            signals=[tier3_signal]
        )
        assert tier3_result is not None, "Expected tier 3 match"
        _, tier3_match_tier, tier3_confidence = tier3_result
        assert tier3_match_tier == 3, f"Expected tier 3, got {tier3_match_tier}"
        assert tier3_confidence < 0.7, f"Tier 3 should have lower confidence (<0.7), got {tier3_confidence}"

    def test_timestamp_tolerance(self):
        """Test tier 1 matching timestamp tolerance window.

        Tests tier 1 expiration matching with results arriving at different time offsets:
        - ±1s: Should match (well within tolerance)
        - ±5s: Should match (within typical tolerance window)
        - ±10s: May not match (exceeds typical tolerance threshold)

        Tolerance threshold: Tier 1 matching typically accepts results within ±5-7 seconds
        of the exact expiration time. Beyond this window, matching may fail or fall back
        to tier 2/3 strategies.
        """
        base_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)
        expiration_time = base_time + timedelta(minutes=5)

        # Create signal with known expiration time
        signal = {
            "id": "tolerance_test_signal",
            "asset": "EURUSD",
            "expirationTime": expiration_time.isoformat(),
            "entryTimeUtc": base_time.isoformat(),
            "martingaleTimes": ["05:00"],
        }
        signals = [signal]

        # Test ±1s: Should match with high confidence
        result_plus_1s = expiration_time + timedelta(seconds=1)
        match_plus_1s = find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_plus_1s,
            result_iteration=0,
            signals=signals
        )
        assert match_plus_1s is not None, "Expected match at expiration +1s"
        _, tier_plus_1s, confidence_plus_1s = match_plus_1s
        assert tier_plus_1s == 1, f"Expected tier 1 match at +1s, got tier {tier_plus_1s}"
        assert confidence_plus_1s > 0.9, f"Expected high confidence at +1s, got {confidence_plus_1s}"

        result_minus_1s = expiration_time - timedelta(seconds=1)
        match_minus_1s = find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_minus_1s,
            result_iteration=0,
            signals=signals
        )
        assert match_minus_1s is not None, "Expected match at expiration -1s"
        _, tier_minus_1s, _ = match_minus_1s
        assert tier_minus_1s == 1, f"Expected tier 1 match at -1s, got tier {tier_minus_1s}"

        # Test ±5s: Should still match (within tolerance window)
        result_plus_5s = expiration_time + timedelta(seconds=5)
        match_plus_5s = find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_plus_5s,
            result_iteration=0,
            signals=signals
        )
        assert match_plus_5s is not None, "Expected match at expiration +5s (within tolerance)"
        _, tier_plus_5s, confidence_plus_5s = match_plus_5s
        assert tier_plus_5s == 1, f"Expected tier 1 match at +5s, got tier {tier_plus_5s}"
        # Confidence may be slightly lower but should still be high
        assert confidence_plus_5s >= 0.8, f"Expected good confidence at +5s, got {confidence_plus_5s}"

        result_minus_5s = expiration_time - timedelta(seconds=5)
        match_minus_5s = find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_minus_5s,
            result_iteration=0,
            signals=signals
        )
        assert match_minus_5s is not None, "Expected match at expiration -5s (within tolerance)"
        _, tier_minus_5s, _ = match_minus_5s
        assert tier_minus_5s == 1, f"Expected tier 1 match at -5s, got tier {tier_minus_5s}"

        # Test ±10s: May not match tier 1 (exceeds typical tolerance threshold)
        # If it matches, it should be tier 2 or tier 3, or tier 1 with lower confidence
        result_plus_10s = expiration_time + timedelta(seconds=10)
        match_plus_10s = find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_plus_10s,
            result_iteration=0,
            signals=signals
        )
        # Match may still be found via tier 2/3, but tier 1 tolerance likely exceeded
        if match_plus_10s is not None:
            _, tier_plus_10s, confidence_plus_10s = match_plus_10s
            # If tier 1 still matches, confidence should be notably degraded
            if tier_plus_10s == 1:
                assert confidence_plus_10s < 0.9, f"Expected degraded confidence at +10s, got {confidence_plus_10s}"
            else:
                # Fell back to tier 2 or 3, which is acceptable
                assert tier_plus_10s in [2, 3], f"Expected tier 2 or 3 fallback at +10s, got tier {tier_plus_10s}"

        result_minus_10s = expiration_time - timedelta(seconds=10)
        match_minus_10s = find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_minus_10s,
            result_iteration=0,
            signals=signals
        )
        # Similar expectations for -10s
        if match_minus_10s is not None:
            _, tier_minus_10s, confidence_minus_10s = match_minus_10s
            if tier_minus_10s == 1:
                assert confidence_minus_10s < 0.9, f"Expected degraded confidence at -10s, got {confidence_minus_10s}"
            else:
                assert tier_minus_10s in [2, 3], f"Expected tier 2 or 3 fallback at -10s, got tier {tier_minus_10s}"

    def test_performance_large_signal_volume(self):
        """Test find_matching_signal performance with 1000 pending signals.

        Verifies matching algorithm scales efficiently with large signal volumes.
        Ensures find_matching_signal completes in <100ms with 1000 signals.
        """
        import time

        base_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)

        # Create 1000 pending signals on the same asset
        signals = []
        for i in range(1000):
            signal = {
                "id": f"perf_signal_{i}",
                "asset": "EURUSD",
                "expirationTime": (base_time + timedelta(minutes=i % 60)).isoformat(),
                "entryTimeUtc": (base_time - timedelta(minutes=i % 30)).isoformat(),
                "martingaleTimes": ["05:00"],
            }
            signals.append(signal)

        # Submit result that should match one of the signals
        result_timestamp = base_time + timedelta(minutes=5, seconds=1)

        # Measure execution time
        start_time = time.perf_counter()
        match_result = find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_timestamp,
            result_iteration=0,
            signals=signals
        )
        end_time = time.perf_counter()

        # Calculate elapsed time in milliseconds
        elapsed_ms = (end_time - start_time) * 1000

        # Verify match found
        assert match_result is not None, "Expected a match to be found"

        # Verify performance: should complete in <100ms
        assert elapsed_ms < 100, f"find_matching_signal took {elapsed_ms:.2f}ms, expected <100ms"

        # Log performance for informational purposes
        print(f"\nPerformance: find_matching_signal completed in {elapsed_ms:.2f}ms with 1000 signals")
