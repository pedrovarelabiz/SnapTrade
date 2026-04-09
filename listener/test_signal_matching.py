import json
import os
import unittest
from datetime import datetime, timezone

from listener import ChannelHandler
from listener.listener import determine_gale_level, format_crash_report, record_exception
from multi_channel_parsers import _parse_result_informal


class TestSignalMatching(unittest.TestCase):
    """Test cases for signal matching functionality."""

    def setUp(self):
        """Set up test fixtures."""
        # Create a minimal channel config for testing
        self.channel_config = {
            "id": "test-channel-id",
            "slug": "test-channel",
            "name": "Test Channel",
            "timezone": "UTC",
            "sourceFormat": "blacklist_inline",
            "maxGaleLevel": 2,
            "telegramId": "123456",
            "telegramName": "test_channel"
        }

    def tearDown(self):
        """Clean up after tests."""
        pass

    def test_calculate_expiration_no_martingale(self):
        """Test calculate_signal_expiration_time with empty martingaleTimes."""
        handler = ChannelHandler(self.channel_config)
        signal = {
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }
        result = handler.calculate_signal_expiration_time(signal)
        expected = datetime(2024, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
        self.assertEqual(result, expected)

    def test_calculate_expiration_with_martingale(self):
        """Test calculate_signal_expiration_time with martingaleTimes."""
        handler = ChannelHandler(self.channel_config)
        signal = {
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["10:05", "10:10"]
        }
        result = handler.calculate_signal_expiration_time(signal)
        expected = datetime(2024, 1, 1, 10, 15, 0, tzinfo=timezone.utc)
        self.assertEqual(result, expected)

    def test_normalize_asset(self):
        """Test normalize_asset_for_matching with various OTC formats."""
        handler = ChannelHandler(self.channel_config)

        # Test various OTC format variations
        result1 = handler.normalize_asset_for_matching("EURUSD_otc")
        result2 = handler.normalize_asset_for_matching("EURUSDOTC")
        result3 = handler.normalize_asset_for_matching("EUR/USD OTC")
        result4 = handler.normalize_asset_for_matching("eurusd-otc")

        # Assert all normalize to same value
        self.assertEqual(result1, "EURUSDOTC")
        self.assertEqual(result2, "EURUSDOTC")
        self.assertEqual(result3, "EURUSDOTC")
        self.assertEqual(result4, "EURUSDOTC")

    def test_tier1_exact_match(self):
        """Test Tier 1 exact match: signal matches asset and is active."""
        handler = ChannelHandler(self.channel_config)

        # Create signal: EURUSD CALL, entry 10:00, expiration 5min, martingale ["10:05"]
        signal = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["10:05"]
        }
        handler.active_signals = [signal]

        # Call find_matching_signal with result_date=10:10:30, asset="EURUSD"
        result_date = datetime(2024, 1, 1, 10, 10, 30, tzinfo=timezone.utc)
        matched_signal = handler.find_matching_signal(result_date, "EURUSD")

        # Assert returns the signal (Tier 1 match)
        self.assertIsNotNone(matched_signal)
        self.assertEqual(matched_signal, signal)

    def test_tier1_multiple_signals_same_asset(self):
        """Test Tier 1 matching with multiple signals for the same asset."""
        handler = ChannelHandler(self.channel_config)

        # Create first signal: EURUSD CALL, entry 10:00, expiration 5min -> expires at 10:05
        signal1 = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }

        # Create second signal: EURUSD CALL, entry 10:03, expiration 5min -> expires at 10:08
        signal2 = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:03:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }

        handler.active_signals = [signal1, signal2]

        # Result arrives at 10:08 - should match signal2 (exact expiration match)
        result_date = datetime(2024, 1, 1, 10, 8, 0, tzinfo=timezone.utc)
        matched_signal = handler.find_matching_signal(result_date, "EURUSD")

        # Assert signal2 is matched based on exact expiration time proximity
        self.assertIsNotNone(matched_signal)
        self.assertEqual(matched_signal, signal2)

    def test_tier2_proximity_match(self):
        """Test Tier 2 proximity match: result outside Tier 1 but within 30min window."""
        handler = ChannelHandler(self.channel_config)

        # Create signal: GBPUSD PUT, entry 10:00, expiration 5min -> expires at 10:05
        signal = {
            "asset": "GBPUSD",
            "direction": "PUT",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }
        handler.active_signals = [signal]

        # Result arrives at 10:07 (2 minutes after expiration, outside Tier 1 tolerance but within 30min window)
        result_date = datetime(2024, 1, 1, 10, 7, 0, tzinfo=timezone.utc)
        matched_signal = handler.find_matching_signal(result_date, "GBPUSD")

        # Assert matches via Tier 2 (proximity + asset)
        self.assertIsNotNone(matched_signal)
        self.assertEqual(matched_signal, signal)

    def test_tier3_fallback_no_asset(self):
        """Test Tier 3 fallback: result matches by time only when asset=None (backward compatibility)."""
        handler = ChannelHandler(self.channel_config)

        # Create signal with any asset: EURUSD CALL, entry 10:00, expiration 5min -> expires at 10:05
        signal = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }
        handler.active_signals = [signal]

        # Call find_matching_signal with asset=None (backward compatibility mode)
        result_date = datetime(2024, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
        matched_signal = handler.find_matching_signal(result_date, asset=None)

        # Assert still matches via Tier 3 (time-only matching for backward compatibility)
        self.assertIsNotNone(matched_signal)
        self.assertEqual(matched_signal, signal)

    def test_no_match_outside_window(self):
        """Test no match when result arrives outside the time window."""
        handler = ChannelHandler(self.channel_config)

        # Create signal: EURUSD CALL, entry 10:00, expiration 5min -> expires at 10:05
        signal = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }
        handler.active_signals = [signal]

        # Result arrives at 11:00 (60 minutes after entry, 55 minutes after expiration - outside 35min window)
        result_date = datetime(2024, 1, 1, 11, 0, 0, tzinfo=timezone.utc)
        matched_signal = handler.find_matching_signal(result_date, "EURUSD")

        # Assert no match (outside time window)
        self.assertIsNone(matched_signal)

    def test_no_match_different_asset(self):
        """Test no match when result asset differs from signal asset."""
        handler = ChannelHandler(self.channel_config)

        # Create signal: EURUSD CALL, entry 10:00, expiration 5min -> expires at 10:05
        signal = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }
        handler.active_signals = [signal]

        # Result for GBPUSD arrives at 10:07 (within time window but different asset)
        result_date = datetime(2024, 1, 1, 10, 7, 0, tzinfo=timezone.utc)
        matched_signal = handler.find_matching_signal(result_date, "GBPUSD")

        # Assert no match (asset mismatch prevents match)
        self.assertIsNone(matched_signal)

    def test_skip_resolved_signal(self):
        """Test that resolved signals are excluded from matching."""
        handler = ChannelHandler(self.channel_config)

        # Create signal with status="resolved": EURUSD CALL, entry 10:00, expiration 5min -> expires at 10:05
        signal = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": [],
            "status": "resolved"
        }
        handler.active_signals = [signal]

        # Result arrives at 10:05 (within time window)
        result_date = datetime(2024, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
        matched_signal = handler.find_matching_signal(result_date, "EURUSD")

        # Assert no match (resolved signals are excluded)
        self.assertIsNone(matched_signal)

    def test_skip_expired_signal(self):
        """Test that expired signals are excluded from matching."""
        handler = ChannelHandler(self.channel_config)

        # Create signal with status="expired": EURUSD CALL, entry 10:00, expiration 5min -> expires at 10:05
        signal = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": [],
            "status": "expired"
        }
        handler.active_signals = [signal]

        # Result arrives at 10:05 (within time window)
        result_date = datetime(2024, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
        matched_signal = handler.find_matching_signal(result_date, "EURUSD")

        # Assert no match (expired signals are excluded)
        self.assertIsNone(matched_signal)

    def test_race_condition_d3_scenario(self):
        """Test race condition fix: EURUSD result at 10:07 matches EURUSD signal (not GBPUSD)."""
        handler = ChannelHandler(self.channel_config)

        # Create first signal: EURUSD CALL, entry 10:00, expiration 5min -> expires at 10:05
        signal_eurusd = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }

        # Create second signal: GBPUSD PUT, entry 10:15, expiration 5min -> expires at 10:20
        signal_gbpusd = {
            "asset": "GBPUSD",
            "direction": "PUT",
            "entryTimeUtc": "2024-01-01T10:15:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }

        handler.active_signals = [signal_eurusd, signal_gbpusd]

        # Result for EURUSD arrives at 10:07 (2 minutes after EURUSD expiration, 8 minutes before GBPUSD entry)
        result_date = datetime(2024, 1, 1, 10, 7, 0, tzinfo=timezone.utc)
        matched_signal = handler.find_matching_signal(result_date, "EURUSD")

        # Assert matches EURUSD (not GBPUSD), proving race condition is fixed
        self.assertIsNotNone(matched_signal)
        self.assertEqual(matched_signal, signal_eurusd)
        self.assertNotEqual(matched_signal, signal_gbpusd)

    def test_martingale_gale_result(self):
        """Test result matching with martingale times - result arrives after last gale."""
        handler = ChannelHandler(self.channel_config)

        # Create signal: EURUSD CALL, entry 10:00, expiration 5min, martingale ["10:05", "10:10"]
        # Last gale at 10:10, so signal expires at 10:15
        signal = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["10:05", "10:10"]
        }
        handler.active_signals = [signal]

        # Result arrives at 10:17 (7 minutes after last gale at 10:10, 2 minutes after expiration at 10:15)
        result_date = datetime(2024, 1, 1, 10, 17, 0, tzinfo=timezone.utc)
        matched_signal = handler.find_matching_signal(result_date, "EURUSD")

        # Assert matches the signal using last martingale time as reference
        self.assertIsNotNone(matched_signal)
        self.assertEqual(matched_signal, signal)

    def test_day_boundary_crossing(self):
        """Test edge case: signal with entry at 23:55:00 and martingale crossing midnight at 00:05:00."""
        handler = ChannelHandler(self.channel_config)

        # Create signal: EURUSD CALL, entry 23:55:00 on day1, martingale at 00:05 (crosses midnight)
        # Last gale at 00:05 on day2, so signal expires at 00:10:00 on day2
        signal = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T23:55:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["00:05"]
        }
        handler.active_signals = [signal]

        # Result arrives at 00:12:00 on day2 (2 minutes after expiration at 00:10:00, within tolerance)
        result_date = datetime(2024, 1, 2, 0, 12, 0, tzinfo=timezone.utc)
        matched_signal = handler.find_matching_signal(result_date, "EURUSD")

        # Assert matches the signal - day boundary crossing handled correctly
        self.assertIsNotNone(matched_signal)
        self.assertEqual(matched_signal, signal)

    def test_direction_matching_bonus(self):
        """Test direction matching bonus: CALL result matches CALL signal when both directions exist."""
        handler = ChannelHandler(self.channel_config)

        # Create first signal: EURUSD CALL, entry 10:00, expiration 5min -> expires at 10:05
        signal_call = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }

        # Create second signal: EURUSD PUT, entry 10:00, expiration 5min -> expires at 10:05
        signal_put = {
            "asset": "EURUSD",
            "direction": "PUT",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }

        handler.active_signals = [signal_call, signal_put]

        # Result for CALL arrives at 10:05 (exact expiration time)
        result_date = datetime(2024, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
        matched_signal = handler.find_matching_signal(result_date, "EURUSD", direction="CALL")

        # Assert matches CALL signal (direction provides tie-breaking bonus)
        self.assertIsNotNone(matched_signal)
        self.assertEqual(matched_signal, signal_call)
        self.assertNotEqual(matched_signal, signal_put)

    def test_asset_extraction_informal_result(self):
        """Test asset extraction from informal result messages."""
        text = "EURUSD win no gale 🔥🔥"
        result = _parse_result_informal(text)

        # Assert result is a dict and contains the asset
        self.assertIsNotNone(result)
        self.assertIn("asset", result)
        self.assertEqual(result["asset"], "EURUSD")

    def test_matching_performance(self):
        """Benchmark test for find_matching_signal performance."""
        import time

        handler = ChannelHandler(self.channel_config)

        # Create 100 active signals with various assets and times
        base_time = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        assets = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "EURJPY"]
        directions = ["CALL", "PUT"]

        for i in range(100):
            signal = {
                "asset": assets[i % len(assets)],
                "direction": directions[i % len(directions)],
                "entryTimeUtc": (base_time.replace(minute=i % 60)).isoformat(),
                "expirationMinutes": 5,
                "martingaleTimes": []
            }
            handler.active_signals.append(signal)

        # Measure execution time for 1000 calls
        test_date = datetime(2024, 1, 1, 10, 30, 0, tzinfo=timezone.utc)
        test_asset = "EURUSD"

        start_time = time.time()
        for _ in range(1000):
            handler.find_matching_signal(test_date, test_asset)
        end_time = time.time()

        # Calculate average time per call in milliseconds
        total_time_ms = (end_time - start_time) * 1000
        avg_time_per_call_ms = total_time_ms / 1000

        # Assert average time per call < 5ms
        self.assertLess(avg_time_per_call_ms, 5.0,
                        f"Performance degraded: avg time {avg_time_per_call_ms:.2f}ms > 5ms threshold")

    def test_performance_regression(self):
        """Regression test comparing current performance against baseline."""
        import time

        # Load baseline from benchmark_results_baseline.json
        baseline_path = os.path.join(os.path.dirname(__file__), "benchmark_results_baseline.json")

        if not os.path.exists(baseline_path):
            self.skipTest(f"Baseline file not found: {baseline_path}")

        with open(baseline_path, 'r') as f:
            baseline_data = json.load(f)

        baseline_avg_ms = baseline_data.get("avg_time_per_call_ms")
        if baseline_avg_ms is None:
            self.skipTest("Baseline does not contain 'avg_time_per_call_ms'")

        # Run current performance test
        handler = ChannelHandler(self.channel_config)

        # Create 100 active signals with various assets and times
        base_time = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        assets = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "EURJPY"]
        directions = ["CALL", "PUT"]

        for i in range(100):
            signal = {
                "asset": assets[i % len(assets)],
                "direction": directions[i % len(directions)],
                "entryTimeUtc": (base_time.replace(minute=i % 60)).isoformat(),
                "expirationMinutes": 5,
                "martingaleTimes": []
            }
            handler.active_signals.append(signal)

        # Measure execution time for 1000 calls
        test_date = datetime(2024, 1, 1, 10, 30, 0, tzinfo=timezone.utc)
        test_asset = "EURUSD"

        start_time = time.time()
        for _ in range(1000):
            handler.find_matching_signal(test_date, test_asset)
        end_time = time.time()

        # Calculate average time per call in milliseconds
        total_time_ms = (end_time - start_time) * 1000
        current_avg_ms = total_time_ms / 1000

        # Assert current average time <= baseline * 1.2 (allow 20% variance)
        threshold_ms = baseline_avg_ms * 1.2
        self.assertLessEqual(current_avg_ms, threshold_ms,
                            f"Performance regression detected: current {current_avg_ms:.2f}ms > "
                            f"baseline {baseline_avg_ms:.2f}ms * 1.2 = {threshold_ms:.2f}ms")

    def test_backward_compatibility(self):
        """Test backward compatibility: legacy time-only matching with asset=None."""
        handler = ChannelHandler(self.channel_config)

        # Create sample signals that worked with legacy algorithm (time-based only)
        # Signal 1: EURUSD CALL, entry 10:00, expiration 5min -> expires at 10:05
        signal1 = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }

        # Signal 2: GBPUSD PUT, entry 10:10, expiration 5min, martingale -> expires at 10:20
        signal2 = {
            "asset": "GBPUSD",
            "direction": "PUT",
            "entryTimeUtc": "2024-01-01T10:10:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["10:15"]
        }

        # Signal 3: USDJPY CALL, entry 10:25, expiration 5min -> expires at 10:30
        signal3 = {
            "asset": "USDJPY",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:25:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }

        handler.active_signals = [signal1, signal2, signal3]

        # Test 1: Result at 10:05 matches signal1 (legacy time-only matching)
        result_date1 = datetime(2024, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
        matched1 = handler.find_matching_signal(result_date1, asset=None)
        self.assertIsNotNone(matched1, "Legacy mode should match signal1 at 10:05")
        self.assertEqual(matched1, signal1, "Should match signal1 by expiration time")

        # Test 2: Result at 10:20 matches signal2 (with martingale)
        result_date2 = datetime(2024, 1, 1, 10, 20, 0, tzinfo=timezone.utc)
        matched2 = handler.find_matching_signal(result_date2, asset=None)
        self.assertIsNotNone(matched2, "Legacy mode should match signal2 at 10:20")
        self.assertEqual(matched2, signal2, "Should match signal2 by martingale expiration time")

        # Test 3: Result at 10:32 matches signal3 (2 minutes after expiration, within tolerance)
        result_date3 = datetime(2024, 1, 1, 10, 32, 0, tzinfo=timezone.utc)
        matched3 = handler.find_matching_signal(result_date3, asset=None)
        self.assertIsNotNone(matched3, "Legacy mode should match signal3 at 10:32")
        self.assertEqual(matched3, signal3, "Should match signal3 within time tolerance")

        # Test 4: Verify legacy mode ignores asset mismatch (critical for backward compatibility)
        result_date4 = datetime(2024, 1, 1, 10, 5, 30, tzinfo=timezone.utc)
        matched4 = handler.find_matching_signal(result_date4, asset=None)
        self.assertIsNotNone(matched4, "Legacy mode should match regardless of asset")
        self.assertEqual(matched4, signal1, "Should match signal1 even without asset specified")

    def test_matching_stats_tracking(self):
        """Test matching_stats tracking for all three tiers and no_match."""
        handler = ChannelHandler(self.channel_config)

        # Initialize matching_stats if not present
        if not hasattr(handler, 'matching_stats'):
            handler.matching_stats = {"tier1": 0, "tier2": 0, "tier3": 0, "no_match": 0}

        # Create signals for testing different tier matches
        signal1 = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }

        signal2 = {
            "asset": "GBPUSD",
            "direction": "PUT",
            "entryTimeUtc": "2024-01-01T10:10:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }

        signal3 = {
            "asset": "USDJPY",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:20:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": []
        }

        handler.active_signals = [signal1, signal2, signal3]

        # Tier 1 match #1: EURUSD at 10:05 (exact expiration match)
        result_date1 = datetime(2024, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
        handler.find_matching_signal(result_date1, "EURUSD")

        # Tier 1 match #2: GBPUSD at 10:15 (exact expiration match)
        result_date2 = datetime(2024, 1, 1, 10, 15, 0, tzinfo=timezone.utc)
        handler.find_matching_signal(result_date2, "GBPUSD")

        # Tier 2 match: USDJPY at 10:27 (2 min after expiration, proximity match)
        result_date3 = datetime(2024, 1, 1, 10, 27, 0, tzinfo=timezone.utc)
        handler.find_matching_signal(result_date3, "USDJPY")

        # Tier 3 match: asset=None at 10:25 (time-only fallback matching)
        result_date4 = datetime(2024, 1, 1, 10, 25, 0, tzinfo=timezone.utc)
        handler.find_matching_signal(result_date4, asset=None)

        # No match: AUDUSD at 11:00 (no signal for this asset, outside window)
        result_date5 = datetime(2024, 1, 1, 11, 0, 0, tzinfo=timezone.utc)
        handler.find_matching_signal(result_date5, "AUDUSD")

        # Verify matching_stats counters are incremented correctly
        self.assertEqual(handler.matching_stats["tier1"], 2, "Expected 2 tier1 matches")
        self.assertEqual(handler.matching_stats["tier2"], 1, "Expected 1 tier2 match")
        self.assertEqual(handler.matching_stats["tier3"], 1, "Expected 1 tier3 match")
        self.assertEqual(handler.matching_stats["no_match"], 1, "Expected 1 no_match")


if __name__ == '__main__':
    unittest.main()
