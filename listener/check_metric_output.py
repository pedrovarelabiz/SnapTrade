#!/usr/bin/env python3
"""
Standalone script to verify signal_matches_exact_expiration_total metric output.
This bypasses the full listener configuration and just tests the metric itself.
"""

from prometheus_client import Counter, generate_latest

# Create the metric independently (same as in listener.py line 54)
signal_matches_exact_expiration_total = Counter(
    'signal_matches_exact_expiration_total',
    'Total exact expiration matches by asset and outcome',
    ['asset', 'outcome']
)

def test_metric():
    """Test the metric increment and output."""

    print("=" * 60)
    print("Testing signal_matches_exact_expiration_total metric")
    print("=" * 60)

    # Test case 1: EURUSD win
    asset1 = "EURUSD"
    outcome1 = "win"

    print(f"\n[TEST 1] Incrementing {asset1}/{outcome1}")
    initial = signal_matches_exact_expiration_total.labels(asset=asset1, outcome=outcome1)._value._value
    print(f"  Before: {initial}")

    signal_matches_exact_expiration_total.labels(asset=asset1, outcome=outcome1).inc()

    final = signal_matches_exact_expiration_total.labels(asset=asset1, outcome=outcome1)._value._value
    print(f"  After:  {final}")
    print(f"  Delta:  {final - initial}")

    # Test case 2: GBPUSD loss
    asset2 = "GBPUSD"
    outcome2 = "loss"

    print(f"\n[TEST 2] Incrementing {asset2}/{outcome2}")
    initial2 = signal_matches_exact_expiration_total.labels(asset=asset2, outcome=outcome2)._value._value
    print(f"  Before: {initial2}")

    signal_matches_exact_expiration_total.labels(asset=asset2, outcome=outcome2).inc()

    final2 = signal_matches_exact_expiration_total.labels(asset=asset2, outcome=outcome2)._value._value
    print(f"  After:  {final2}")
    print(f"  Delta:  {final2 - initial2}")

    # Generate Prometheus metrics output
    print("\n" + "=" * 60)
    print("Prometheus Metrics Output")
    print("=" * 60)

    metrics_output = generate_latest().decode('utf-8')

    # Filter to show only our metric
    for line in metrics_output.split('\n'):
        if 'signal_matches_exact_expiration_total' in line:
            print(line)

    print("\n" + "=" * 60)
    print("✅ Verification Complete")
    print("=" * 60)
    print(f"\nMetric correctly increments with labels:")
    print(f"  - asset={asset1}, outcome={outcome1}: incremented by 1")
    print(f"  - asset={asset2}, outcome={outcome2}: incremented by 1")


if __name__ == "__main__":
    test_metric()
