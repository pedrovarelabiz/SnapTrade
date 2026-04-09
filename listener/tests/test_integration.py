"""Integration tests for signal matching with realistic concurrent scenarios."""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from listener.listener import find_matching_signal


class TestIntegration:
    """Integration tests for realistic signal matching scenarios."""

    @patch('listener.listener.sentry_sdk')
    @patch('listener.listener.logger')
    def test_multiple_concurrent_signals(self, mock_logger, mock_sentry):
        """
        Test realistic scenario with multiple concurrent signals.

        Simulates 6 signals across 3 assets (EURUSD, GBPUSD, USDJPY) within 1 hour,
        with results arriving out of order. Verifies all results are correctly
        attributed using the matching logic.

        Scenario:
        - Signal 1: EURUSD at 10:00, expires 10:05 (5min)
        - Signal 2: GBPUSD at 10:10, expires 10:15 (5min)
        - Signal 3: EURUSD at 10:15, expires 10:20 (5min)
        - Signal 4: USDJPY at 10:20, expires 10:25 (5min)
        - Signal 5: EURUSD at 10:30, expires 10:35 (5min)
        - Signal 6: GBPUSD at 10:40, expires 10:45 (5min)

        Results arrive out of order:
        - Result 4 arrives first (USDJPY 10:25)
        - Result 1 arrives second (EURUSD 10:05)
        - Result 6 arrives third (GBPUSD 10:45)
        - Result 2 arrives fourth (GBPUSD 10:15)
        - Result 5 arrives fifth (EURUSD 10:35)
        - Result 3 arrives sixth (EURUSD 10:20)
        """
        # Base time: 2026-03-24 10:00:00 UTC
        base_time = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)

        # ===== CREATE SIGNALS =====
        # Signal 1: EURUSD at 10:00, expires 10:05
        signal_1 = {
            'id': 'eurusd_signal_1',
            'asset': 'EURUSD',
            'entryTimeUtc': base_time.isoformat(),
            'martingaleTimes': ['05:00'],  # 5 minutes
        }

        # Signal 2: GBPUSD at 10:10, expires 10:15
        signal_2 = {
            'id': 'gbpusd_signal_1',
            'asset': 'GBPUSD',
            'entryTimeUtc': (base_time + timedelta(minutes=10)).isoformat(),
            'martingaleTimes': ['05:00'],
        }

        # Signal 3: EURUSD at 10:15, expires 10:20
        signal_3 = {
            'id': 'eurusd_signal_2',
            'asset': 'EURUSD',
            'entryTimeUtc': (base_time + timedelta(minutes=15)).isoformat(),
            'martingaleTimes': ['05:00'],
        }

        # Signal 4: USDJPY at 10:20, expires 10:25
        signal_4 = {
            'id': 'usdjpy_signal_1',
            'asset': 'USDJPY',
            'entryTimeUtc': (base_time + timedelta(minutes=20)).isoformat(),
            'martingaleTimes': ['05:00'],
        }

        # Signal 5: EURUSD at 10:30, expires 10:35
        signal_5 = {
            'id': 'eurusd_signal_3',
            'asset': 'EURUSD',
            'entryTimeUtc': (base_time + timedelta(minutes=30)).isoformat(),
            'martingaleTimes': ['05:00'],
        }

        # Signal 6: GBPUSD at 10:40, expires 10:45
        signal_6 = {
            'id': 'gbpusd_signal_2',
            'asset': 'GBPUSD',
            'entryTimeUtc': (base_time + timedelta(minutes=40)).isoformat(),
            'martingaleTimes': ['05:00'],
        }

        # Organize signals by asset
        eurusd_signals = [signal_1, signal_3, signal_5]
        gbpusd_signals = [signal_2, signal_6]
        usdjpy_signals = [signal_4]

        # ===== RESULTS ARRIVE OUT OF ORDER =====

        # Result 4: USDJPY at 10:25:01 (arrives first)
        result_4_time = base_time + timedelta(minutes=25, seconds=1)
        matched_4, tier_4, conf_4 = find_matching_signal('USDJPY', result_4_time, 0, usdjpy_signals)
        assert matched_4 is not None, "Result 4 should match USDJPY signal 1"
        assert matched_4['id'] == 'usdjpy_signal_1', "Should match correct USDJPY signal"

        # Result 1: EURUSD at 10:05:02 (arrives second)
        result_1_time = base_time + timedelta(minutes=5, seconds=2)
        matched_1, tier_1, conf_1 = find_matching_signal('EURUSD', result_1_time, 0, eurusd_signals)
        assert matched_1 is not None, "Result 1 should match EURUSD signal 1"
        assert matched_1['id'] == 'eurusd_signal_1', "Should match first EURUSD signal"

        # Result 6: GBPUSD at 10:44:59 (arrives third, slightly early)
        result_6_time = base_time + timedelta(minutes=44, seconds=59)
        matched_6, tier_6, conf_6 = find_matching_signal('GBPUSD', result_6_time, 0, gbpusd_signals)
        assert matched_6 is not None, "Result 6 should match GBPUSD signal 2"
        assert matched_6['id'] == 'gbpusd_signal_2', "Should match second GBPUSD signal"

        # Result 2: GBPUSD at 10:15:03 (arrives fourth)
        result_2_time = base_time + timedelta(minutes=15, seconds=3)
        matched_2, tier_2, conf_2 = find_matching_signal('GBPUSD', result_2_time, 0, gbpusd_signals)
        assert matched_2 is not None, "Result 2 should match GBPUSD signal 1"
        assert matched_2['id'] == 'gbpusd_signal_1', "Should match first GBPUSD signal"

        # Result 5: EURUSD at 10:35:01 (arrives fifth)
        result_5_time = base_time + timedelta(minutes=35, seconds=1)
        matched_5, tier_5, conf_5 = find_matching_signal('EURUSD', result_5_time, 0, eurusd_signals)
        assert matched_5 is not None, "Result 5 should match EURUSD signal 3"
        assert matched_5['id'] == 'eurusd_signal_3', "Should match third EURUSD signal"

        # Result 3: EURUSD at 10:20:00 (arrives last, exact match)
        result_3_time = base_time + timedelta(minutes=20)
        matched_3, tier_3, conf_3 = find_matching_signal('EURUSD', result_3_time, 0, eurusd_signals)
        assert matched_3 is not None, "Result 3 should match EURUSD signal 2"
        assert matched_3['id'] == 'eurusd_signal_2', "Should match second EURUSD signal"

        # ===== VERIFY ALL MATCHES ARE UNIQUE =====
        matched_ids = [
            matched_1['id'],
            matched_2['id'],
            matched_3['id'],
            matched_4['id'],
            matched_5['id'],
            matched_6['id']
        ]

        assert len(matched_ids) == len(set(matched_ids)), \
            "All matched signals should be unique (no duplicate attributions)"

        # Verify all expected signals were matched
        expected_ids = {
            'eurusd_signal_1', 'eurusd_signal_2', 'eurusd_signal_3',
            'gbpusd_signal_1', 'gbpusd_signal_2',
            'usdjpy_signal_1'
        }
        assert set(matched_ids) == expected_ids, \
            "All signals should be matched exactly once"

    @patch('listener.listener.sentry_sdk')
    @patch('listener.listener.logger')
    def test_martingale_sequence_attribution(self, mock_logger, mock_sentry):
        """
        Test martingale sequence with 3-level losing streak [1, 5, 15].

        Verifies that each consecutive loss in a martingale sequence is correctly
        attributed to its corresponding martingale level:
        - Loss 1: martingale level 0 (1 minute expiration)
        - Loss 2: martingale level 1 (5 minutes expiration)
        - Loss 3: martingale level 2 (15 minutes expiration)
        """
        # Base time: 2026-03-24 14:00:00 UTC
        base_time = datetime(2026, 3, 24, 14, 0, 0, tzinfo=timezone.utc)

        # Create signal with 3-level martingale [1, 5, 15]
        signal = {
            'id': 'eurusd_martingale_signal',
            'asset': 'EURUSD',
            'entryTimeUtc': base_time.isoformat(),
            'martingaleTimes': ['01:00', '05:00', '15:00'],  # 1min, 5min, 15min
        }

        signals = [signal]

        # ===== SIMULATE 3 CONSECUTIVE LOSSES =====

        # Loss 1: Level 0 at 14:01:00 (1 minute after entry)
        loss_1_time = base_time + timedelta(minutes=1)
        matched_1, tier_1, conf_1 = find_matching_signal('EURUSD', loss_1_time, 0, signals)
        assert matched_1 is not None, "Loss 1 should match at martingale level 0"
        assert matched_1['id'] == 'eurusd_martingale_signal', "Should match the martingale signal"
        # Save the level immediately as the signal dict is mutated by subsequent calls
        level_1 = matched_1.get('martingale_level')

        # Loss 2: Level 1 at 14:05:01 (5 minutes after entry)
        loss_2_time = base_time + timedelta(minutes=5, seconds=1)
        matched_2, tier_2, conf_2 = find_matching_signal('EURUSD', loss_2_time, 1, signals)
        assert matched_2 is not None, "Loss 2 should match at martingale level 1"
        assert matched_2['id'] == 'eurusd_martingale_signal', "Should match the martingale signal"
        # Save the level immediately as the signal dict is mutated by subsequent calls
        level_2 = matched_2.get('martingale_level')

        # Loss 3: Level 2 at 14:15:02 (15 minutes after entry)
        loss_3_time = base_time + timedelta(minutes=15, seconds=2)
        matched_3, tier_3, conf_3 = find_matching_signal('EURUSD', loss_3_time, 2, signals)
        assert matched_3 is not None, "Loss 3 should match at martingale level 2"
        assert matched_3['id'] == 'eurusd_martingale_signal', "Should match the martingale signal"
        level_3 = matched_3.get('martingale_level')

        # ===== VERIFY MARTINGALE LEVEL ATTRIBUTION =====
        # Note: result_iteration is currently unused in matching logic (reserved for future use).
        # The function checks ALL martingale levels and matches based on timestamp proximity.
        # Verify that the correct martingale level is attributed based on the timestamp.
        assert level_1 == 0, "Loss 1 should be attributed to level 0"
        assert level_2 == 1, "Loss 2 should be attributed to level 1"
        assert level_3 == 2, "Loss 3 should be attributed to level 2"
