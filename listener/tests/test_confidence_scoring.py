"""Tests for confidence scoring logic."""

import unittest
from datetime import datetime, timezone

from listener import ChannelHandler


class TestConfidenceScoring(unittest.TestCase):
    """Tests for calculate_match_confidence function."""

    def setUp(self):
        """Set up test fixtures."""
        self.channel_config = {
            "id": "test-channel",
            "slug": "test-channel",
            "name": "Test Channel",
            "timezone": "UTC",
            "sourceFormat": "blacklist_live",
            "maxGaleLevel": 2,
            "telegramId": "123456",
            "telegramName": "test_channel"
        }
        self.handler = ChannelHandler(self.channel_config)

        # Sample signal and result for testing
        self.sample_signal = {
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": "2024-01-01T10:00:00Z",
            "expirationMinutes": 5,
            "martingaleTimes": [],
            "status": "pending"
        }
        self.sample_result = {
            "asset": "EURUSD",
            "direction": "CALL",
            "resultTimeUtc": "2024-01-01T10:05:00Z",
            "outcome": "WIN"
        }

    def test_exact_match_confidence(self):
        """Test exact expiration match returns ~95 confidence."""
        confidence = self.handler.calculate_match_confidence(
            signal=self.sample_signal,
            result=self.sample_result,
            match_type="exact_expiration"
        )
        self.assertEqual(confidence, 95)

    def test_proximity_match_confidence(self):
        """Test proximity match returns ~70 confidence."""
        confidence = self.handler.calculate_match_confidence(
            signal=self.sample_signal,
            result=self.sample_result,
            match_type="proximity"
        )
        self.assertEqual(confidence, 70)

    def test_tier1_match_confidence(self):
        """Test tier1 match returns ~70 confidence (same as proximity)."""
        confidence = self.handler.calculate_match_confidence(
            signal=self.sample_signal,
            result=self.sample_result,
            match_type="tier1"
        )
        self.assertEqual(confidence, 70)

    def test_tier2_match_confidence(self):
        """Test tier2 match returns ~60 confidence."""
        confidence = self.handler.calculate_match_confidence(
            signal=self.sample_signal,
            result=self.sample_result,
            match_type="tier2"
        )
        self.assertEqual(confidence, 60)

    def test_tier3_match_confidence(self):
        """Test tier3 match returns ~50 confidence."""
        confidence = self.handler.calculate_match_confidence(
            signal=self.sample_signal,
            result=self.sample_result,
            match_type="tier3"
        )
        self.assertEqual(confidence, 50)

    def test_multiple_candidates_penalty_exact(self):
        """Test multiple candidates reduces exact match confidence by 20."""
        result_with_multiple = self.sample_result.copy()
        result_with_multiple["multiple_candidates"] = True

        confidence = self.handler.calculate_match_confidence(
            signal=self.sample_signal,
            result=result_with_multiple,
            match_type="exact_expiration"
        )
        # 95 - 20 = 75
        self.assertEqual(confidence, 75)

    def test_multiple_candidates_penalty_proximity(self):
        """Test multiple candidates reduces proximity match confidence by 20."""
        result_with_multiple = self.sample_result.copy()
        result_with_multiple["multiple_candidates"] = True

        confidence = self.handler.calculate_match_confidence(
            signal=self.sample_signal,
            result=result_with_multiple,
            match_type="proximity"
        )
        # 70 - 20 = 50
        self.assertEqual(confidence, 50)

    def test_multiple_candidates_penalty_tier2(self):
        """Test multiple candidates reduces tier2 match confidence by 20."""
        result_with_multiple = self.sample_result.copy()
        result_with_multiple["multiple_candidates"] = True

        confidence = self.handler.calculate_match_confidence(
            signal=self.sample_signal,
            result=result_with_multiple,
            match_type="tier2"
        )
        # 60 - 20 = 40
        self.assertEqual(confidence, 40)

    def test_confidence_score_bounds_upper(self):
        """Test confidence score cannot exceed 100."""
        # Even if base score is high, should be clamped to 100
        confidence = self.handler.calculate_match_confidence(
            signal=self.sample_signal,
            result=self.sample_result,
            match_type="exact_expiration"
        )
        self.assertLessEqual(confidence, 100)

    def test_confidence_score_bounds_lower(self):
        """Test confidence score cannot go below 0."""
        result_with_multiple = self.sample_result.copy()
        result_with_multiple["multiple_candidates"] = True

        # tier3 (50) - 20 = 30, should not go below 0
        confidence = self.handler.calculate_match_confidence(
            signal=self.sample_signal,
            result=result_with_multiple,
            match_type="tier3"
        )
        self.assertGreaterEqual(confidence, 0)
        self.assertEqual(confidence, 30)

    def test_unknown_match_type_defaults_to_50(self):
        """Test unknown match type defaults to base score of 50."""
        confidence = self.handler.calculate_match_confidence(
            signal=self.sample_signal,
            result=self.sample_result,
            match_type="unknown_type"
        )
        self.assertEqual(confidence, 50)


if __name__ == '__main__':
    unittest.main()
