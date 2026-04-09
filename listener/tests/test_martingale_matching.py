"""Test martingale M1, M2, M3 attribution for signals with multiple expiration times."""

import unittest
from datetime import datetime, timezone
from listener import ChannelHandler, find_matching_signal


class TestMartingaleMatching(unittest.TestCase):
    """Test suite for martingale level attribution (M1, M2, M3)."""

    def setUp(self):
        """Set up test fixtures."""
        self.channel_config = {
            "id": "test-martingale-channel",
            "slug": "test-martingale",
            "name": "Test Martingale Channel",
            "timezone": "UTC",
            "sourceFormat": "blacklist_live",
            "maxGaleLevel": 3,
            "telegramId": "999999",
            "telegramName": "test_martingale_channel"
        }
        self.handler = ChannelHandler(self.channel_config)

    def test_martingale_three_levels_correct_attribution(self):
        """Test signal with martingale_times=[1,2,5] creating 3 expirations.

        Verifies that 3 separate results correctly attribute to their respective
        expiration times (M1, M2, M3).
        """
        # Create signal with entry at 14:00, expiration 5 minutes
        # Martingale times at 14:01, 14:02, 14:05
        # Expected expirations: M1=14:06, M2=14:07, M3=14:10
        base_time = datetime(2026, 3, 23, 14, 0, 0, tzinfo=timezone.utc)

        signal = {
            "id": "martingale-test-signal-1",
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2026-03-23T14:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["14:01", "14:02", "14:05"],
            "status": "active",
            "timestamp": "2026-03-23T14:00:00Z",
            "expirationTime": "2026-03-23T14:10:00Z"  # Last martingale (14:05) + 5 min
        }

        # Add signal to active signals
        self.handler.active_signals = [signal]

        # Test M1: Result arrives at 14:06:02 (within 5 seconds of M1 expiration 14:06:00)
        result_m1_time = datetime(2026, 3, 23, 14, 6, 2, tzinfo=timezone.utc)

        # Manually create expected M1 expiration for matching
        # M1 should be at martingale_time[0] (14:01) + expiration_minutes (5) = 14:06
        signal_m1 = signal.copy()
        signal_m1["martingaleTimes"] = ["14:01"]
        signal_m1["expirationTime"] = "2026-03-23T14:06:00Z"
        signal_m1["id"] = "martingale-test-signal-m1"

        # Test M2: Result arrives at 14:07:03 (within 5 seconds of M2 expiration 14:07:00)
        result_m2_time = datetime(2026, 3, 23, 14, 7, 3, tzinfo=timezone.utc)

        # M2 should be at martingale_time[1] (14:02) + expiration_minutes (5) = 14:07
        signal_m2 = signal.copy()
        signal_m2["martingaleTimes"] = ["14:02"]
        signal_m2["expirationTime"] = "2026-03-23T14:07:00Z"
        signal_m2["id"] = "martingale-test-signal-m2"

        # Test M3: Result arrives at 14:10:01 (within 5 seconds of M3 expiration 14:10:00)
        result_m3_time = datetime(2026, 3, 23, 14, 10, 1, tzinfo=timezone.utc)

        # M3 should be at martingale_time[2] (14:05) + expiration_minutes (5) = 14:10
        signal_m3 = signal.copy()
        signal_m3["martingaleTimes"] = ["14:05"]
        signal_m3["expirationTime"] = "2026-03-23T14:10:00Z"
        signal_m3["id"] = "martingale-test-signal-m3"

        # Add all three martingale signals to active signals
        self.handler.active_signals = [signal_m1, signal_m2, signal_m3]

        # Match M1 result
        matched_m1, tier, conf = find_matching_signal("EURUSD", result_m1_time, 0, self.handler.active_signals)
        self.assertIsNotNone(matched_m1, "M1 result should match M1 signal")
        self.assertEqual(matched_m1["id"], "martingale-test-signal-m1")
        self.assertEqual(matched_m1["expirationTime"], "2026-03-23T14:06:00Z")

        # Match M2 result
        matched_m2, tier, conf = find_matching_signal("EURUSD", result_m2_time, 0, self.handler.active_signals)
        self.assertIsNotNone(matched_m2, "M2 result should match M2 signal")
        self.assertEqual(matched_m2["id"], "martingale-test-signal-m2")
        self.assertEqual(matched_m2["expirationTime"], "2026-03-23T14:07:00Z")

        # Match M3 result
        matched_m3, tier, conf = find_matching_signal("EURUSD", result_m3_time, 0, self.handler.active_signals)
        self.assertIsNotNone(matched_m3, "M3 result should match M3 signal")
        self.assertEqual(matched_m3["id"], "martingale-test-signal-m3")
        self.assertEqual(matched_m3["expirationTime"], "2026-03-23T14:10:00Z")

        # Verify each result matched to different signals (no cross-attribution)
        self.assertNotEqual(matched_m1["id"], matched_m2["id"])
        self.assertNotEqual(matched_m2["id"], matched_m3["id"])
        self.assertNotEqual(matched_m1["id"], matched_m3["id"])

    def test_martingale_times_calculation(self):
        """Test that martingale_times array creates correct expiration times."""
        # Signal with martingale_times=[1,2,5] means times at T+1min, T+2min, T+5min
        signal = {
            "entryTimeUtc": "2026-03-23T14:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["14:01", "14:02", "14:05"]
        }

        # The last martingale time should be used for overall expiration
        result = self.handler.calculate_signal_expiration_time(signal)
        expected = datetime(2026, 3, 23, 14, 10, 0, tzinfo=timezone.utc)  # 14:05 + 5 min

        self.assertEqual(result, expected)

    def test_martingale_no_cross_matching(self):
        """Test that M1 results don't incorrectly match M2 or M3 expirations."""
        # Create 3 separate signals for M1, M2, M3
        signal_m1 = {
            "id": "m1-only",
            "asset": "GBPUSD",
            "direction": "PUT",
            "entryTimeUtc": "2026-03-23T15:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["15:01"],
            "expirationTime": "2026-03-23T15:06:00Z",
            "status": "active"
        }

        signal_m2 = {
            "id": "m2-only",
            "asset": "GBPUSD",
            "direction": "PUT",
            "entryTimeUtc": "2026-03-23T15:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["15:02"],
            "expirationTime": "2026-03-23T15:07:00Z",
            "status": "active"
        }

        signal_m3 = {
            "id": "m3-only",
            "asset": "GBPUSD",
            "direction": "PUT",
            "entryTimeUtc": "2026-03-23T15:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["15:05"],
            "expirationTime": "2026-03-23T15:10:00Z",
            "status": "active"
        }

        self.handler.active_signals = [signal_m1, signal_m2, signal_m3]

        # Result at M2 expiration time should NOT match M1 or M3
        result_m2_time = datetime(2026, 3, 23, 15, 7, 2, tzinfo=timezone.utc)
        matched, tier, conf = find_matching_signal("GBPUSD", result_m2_time, 0, self.handler.active_signals)

        self.assertIsNotNone(matched)
        self.assertEqual(matched["id"], "m2-only", "Should match M2 only, not M1 or M3")

    def test_martingale_iteration_zero_only(self):
        """Test iteration 0 (M1 only, no subsequent martingales)."""
        signal = {
            "id": "iteration-0-signal",
            "asset": "USDJPY",
            "direction": "CALL",
            "entryTimeUtc": "2026-03-23T16:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["16:01"],
            "expirationTime": "2026-03-23T16:06:00Z",
            "status": "active"
        }

        self.handler.active_signals = [signal]

        # Result at M1 expiration
        result_time = datetime(2026, 3, 23, 16, 6, 1, tzinfo=timezone.utc)
        matched, tier, conf = find_matching_signal("USDJPY", result_time, 0, self.handler.active_signals)

        self.assertIsNotNone(matched, "Iteration 0 (M1) should match")
        self.assertEqual(matched["id"], "iteration-0-signal")
        self.assertEqual(len(matched["martingaleTimes"]), 1, "Should have exactly 1 martingale time")

    def test_martingale_edge_cases_invalid_iterations(self):
        """Test edge cases: empty martingale_times, exceeding maxGaleLevel."""
        # Edge case 1: Empty martingale_times array
        signal_empty = {
            "id": "empty-martingale",
            "asset": "EURJPY",
            "direction": "PUT",
            "entryTimeUtc": "2026-03-23T17:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": [],
            "expirationTime": "2026-03-23T17:05:00Z",
            "status": "active"
        }

        # Edge case 2: Exceeding maxGaleLevel (4 iterations when max is 3)
        signal_excess = {
            "id": "excess-iterations",
            "asset": "GBPJPY",
            "direction": "CALL",
            "entryTimeUtc": "2026-03-23T17:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["17:01", "17:02", "17:03", "17:04"],  # 4 iterations
            "expirationTime": "2026-03-23T17:09:00Z",
            "status": "active"
        }

        # Test empty martingale_times
        result_empty = self.handler.calculate_signal_expiration_time(signal_empty)
        expected_empty = datetime(2026, 3, 23, 17, 5, 0, tzinfo=timezone.utc)
        self.assertEqual(result_empty, expected_empty, "Empty martingale_times should use base expiration")

        # Test excess iterations (should handle gracefully, using last time)
        result_excess = self.handler.calculate_signal_expiration_time(signal_excess)
        expected_excess = datetime(2026, 3, 23, 17, 9, 0, tzinfo=timezone.utc)  # 17:04 + 5 min
        self.assertEqual(result_excess, expected_excess, "Should calculate using last martingale time")

    def test_martingale_iterations_two_plus(self):
        """Test iteration 2+ (M3 and beyond) with multiple levels."""
        # Test with exactly 3 iterations (M1, M2, M3)
        signal_three = {
            "id": "three-iterations",
            "asset": "AUDUSD",
            "direction": "CALL",
            "entryTimeUtc": "2026-03-23T18:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": ["18:01", "18:02", "18:05"],
            "expirationTime": "2026-03-23T18:10:00Z",
            "status": "active"
        }

        self.handler.active_signals = [signal_three]

        # Result at M3 (iteration 2) expiration
        result_time = datetime(2026, 3, 23, 18, 10, 2, tzinfo=timezone.utc)
        matched, tier, conf = find_matching_signal("AUDUSD", result_time, 0, self.handler.active_signals)

        self.assertIsNotNone(matched, "Iteration 2 (M3) should match")
        self.assertEqual(matched["id"], "three-iterations")
        self.assertEqual(len(matched["martingaleTimes"]), 3, "Should have 3 martingale times")


if __name__ == '__main__':
    unittest.main()
