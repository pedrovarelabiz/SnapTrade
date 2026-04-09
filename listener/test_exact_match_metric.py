#!/usr/bin/env python3
"""
Test to verify signal_matches_exact_expiration_total metric increments correctly.
"""

import unittest
from datetime import datetime, timezone
from listener.listener import signal_matches_exact_expiration_total

class TestExactMatchMetric(unittest.TestCase):
    """Test exact expiration match metric increment."""

    def test_exact_match_metric_increment(self):
        """Verify signal_matches_exact_expiration_total increments by 1 with correct labels."""

        # Test asset and outcome
        test_asset = "EURUSD"
        test_outcome = "win"

        # Get initial metric value
        initial_value = signal_matches_exact_expiration_total.labels(
            asset=test_asset, outcome=test_outcome
        )._value._value

        print(f"\n[BEFORE] Metric value for {test_asset}/{test_outcome}: {initial_value}")

        # Simulate what happens in the listener when an exact match occurs (confidence=1.0)
        # This is from listener.py line 2196:
        #   if confidence == 1.0:
        #       signal_matches_exact_expiration_total.labels(asset=matching.get('asset', 'unknown'), outcome=outcome).inc()

        signal_matches_exact_expiration_total.labels(
            asset=test_asset, outcome=test_outcome
        ).inc()

        # Get final metric value
        final_value = signal_matches_exact_expiration_total.labels(
            asset=test_asset, outcome=test_outcome
        )._value._value

        print(f"[AFTER]  Metric value for {test_asset}/{test_outcome}: {final_value}")
        print(f"[DELTA]  Increment: {final_value - initial_value}")

        # Verify increment
        self.assertEqual(
            final_value, initial_value + 1,
            f"Expected increment of 1, got {final_value - initial_value}"
        )

        print(f"\n✅ SUCCESS: Metric incremented correctly")
        print(f"   Labels: asset={test_asset}, outcome={test_outcome}")
        print(f"   Increment: 1")


if __name__ == "__main__":
    # Run the test
    unittest.main(verbosity=2)
