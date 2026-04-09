#!/usr/bin/env python3
"""
Standalone script to verify signal_race_conditions_detected_total metric increment.
Creates a race condition scenario and verifies the metric increments with correct asset label.
"""

from datetime import datetime, timezone
from prometheus_client import generate_latest
import sys
import os

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from listener import find_matching_signal, signal_race_conditions_detected_total

def test_race_condition_metric():
    """Create race condition scenario and verify metric increments."""

    print("=" * 60)
    print("Testing signal_race_conditions_detected_total metric")
    print("=" * 60)

    # Test with EURUSD
    asset = "EURUSD"

    print(f"\n[BEFORE] Checking initial metric value for {asset}")
    initial_value = signal_race_conditions_detected_total.labels(asset=asset)._value._value
    print(f"  Initial value: {initial_value}")

    # Create 2 signals with overlapping expiration (race condition)
    print(f"\n[SETUP] Creating race condition scenario with 2 signals for {asset}")

    signal_1 = {
        'id': 'signal_race_test_1',
        'asset': asset,
        'entryTimeUtc': '2026-03-23T14:00:00+00:00',
        'martingaleTimes': ['05:00'],  # expires at 14:05:00
    }

    signal_2 = {
        'id': 'signal_race_test_2',
        'asset': asset,
        'entryTimeUtc': '2026-03-23T14:00:30+00:00',  # 30 seconds later
        'martingaleTimes': ['04:30'],  # expires at 14:05:00 (same time!)
    }

    signals = [signal_1, signal_2]

    print(f"  Signal 1: ID={signal_1['id']}, expires at 14:05:00")
    print(f"  Signal 2: ID={signal_2['id']}, expires at 14:05:00")
    print(f"  Both signals expire at the same time - race condition!")

    # Result timestamp that matches both signals
    result_timestamp = datetime(2026, 3, 23, 14, 5, 2, tzinfo=timezone.utc)
    result_iteration = 0

    print(f"\n[EXECUTE] Calling find_matching_signal with result at {result_timestamp.isoformat()}")

    # This should trigger race condition detection
    result = find_matching_signal(asset, result_timestamp, result_iteration, signals)

    print(f"\n[AFTER] Checking metric value after race condition")
    final_value = signal_race_conditions_detected_total.labels(asset=asset)._value._value
    print(f"  Final value: {final_value}")
    print(f"  Delta: +{final_value - initial_value}")

    # Verify increment
    if final_value == initial_value + 1:
        print(f"\n✅ SUCCESS: Metric incremented correctly!")
    else:
        print(f"\n❌ FAILURE: Expected increment of 1, got {final_value - initial_value}")
        return False

    # Generate Prometheus metrics output
    print("\n" + "=" * 60)
    print("Prometheus Metrics Output")
    print("=" * 60)

    metrics_output = generate_latest().decode('utf-8')

    # Filter to show only race condition metric
    found_metric = False
    for line in metrics_output.split('\n'):
        if 'signal_race_conditions_detected_total' in line:
            print(line)
            found_metric = True

    if not found_metric:
        print("⚠️  Metric not found in output")

    print("\n" + "=" * 60)
    print("✅ Verification Complete")
    print("=" * 60)
    print(f"\nRace condition metric correctly increments with asset label:")
    print(f"  - signal_race_conditions_detected_total{{asset=\"{asset}\"}} = {final_value}")

    return True

if __name__ == "__main__":
    success = test_race_condition_metric()
    sys.exit(0 if success else 1)
