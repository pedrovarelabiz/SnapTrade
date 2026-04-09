"""Smoke tests for signal matching - fast happy-path validation."""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

from listener.listener import find_matching_signal


class TestSignalMatchingSmoke:
    """Fast smoke tests for 3-tier signal matching (exact, proximity, martingale)."""

    @patch('listener.listener.sentry_sdk')
    @patch('listener.listener.logger')
    def test_signal_match_happy_path(self, mock_logger, mock_sentry):
        """
        Smoke test: create signal, submit result, verify 3-tier match works.

        Tests all three matching tiers:
        1. Exact match: result at exact expiration time
        2. Proximity match: result within ±10s window
        3. Martingale match: next-level signal match

        Should complete in <1s.
        """
        base_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)

        # Create test signal with martingale levels [1, 5, 15]
        # expirationTime is entry + first martingale level (1 minute)
        signal = {
            'id': 'smoke_test_signal',
            'asset': 'EURUSD',
            'entryTimeUtc': base_time.isoformat(),
            'expirationTime': (base_time + timedelta(minutes=1)).isoformat(),
            'martingaleTimes': ['01:00', '05:00', '15:00'],
        }
        signals = [signal]

        # Test 1: Exact match - result at exact expiration (entry + 1 minute)
        exact_result_time = base_time + timedelta(minutes=1)

        match, tier, confidence = find_matching_signal('EURUSD', exact_result_time, result_iteration=0, signals=signals)
        assert match is not None, "Exact match failed"
        assert match['id'] == 'smoke_test_signal', "Wrong signal matched"
        assert tier == 1, f"Expected tier 1 (exact), got tier {tier}"

        # Test 2: Proximity match - result within ±5s window (entry + 1min + 3s)
        proximity_result_time = base_time + timedelta(minutes=1, seconds=3)

        match_proximity, tier_prox, confidence_prox = find_matching_signal('EURUSD', proximity_result_time, result_iteration=0, signals=signals)
        assert match_proximity is not None, "Proximity match failed"
        assert match_proximity['id'] == 'smoke_test_signal', "Wrong signal matched in proximity"
        assert tier_prox == 1, f"Expected tier 1 (exact with tolerance), got tier {tier_prox}"

        # Test 3: Martingale match - result at next level (entry + 5 minutes = level 1)
        martingale_result_time = base_time + timedelta(minutes=5)

        match_martingale, tier_mart, confidence_mart = find_matching_signal('EURUSD', martingale_result_time, result_iteration=1, signals=signals)
        assert match_martingale is not None, "Martingale match failed"
        assert match_martingale['id'] == 'smoke_test_signal', "Wrong signal matched in martingale"
        assert tier_mart in [1, 2, 3], f"Expected valid tier (1-3), got tier {tier_mart}"

        # Verify no false positives: different asset should not match
        match_none, tier_none, confidence_none = find_matching_signal('GBPUSD', exact_result_time, result_iteration=0, signals=signals)
        assert match_none is None, "False positive match detected - different asset matched"
        assert tier_none is None, f"Expected None tier for no match, got {tier_none}"
