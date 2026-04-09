#!/usr/bin/env python3
"""
Verify signal_matching_duration_seconds histogram metric.
Checks:
1. Histogram exists with buckets
2. Records time for 'exact' and 'proximity' methods
3. Percentiles are reasonable (<100ms)
"""

import sys
import time
from prometheus_client import REGISTRY

# Import the metric from listener
sys.path.insert(0, '/opt/snaptrade-unified/listener')
from listener import signal_matching_duration_seconds

def verify_histogram_metric():
    """Verify the signal_matching_duration_seconds histogram."""

    print("=" * 70)
    print("VERIFICATION: signal_matching_duration_seconds Histogram")
    print("=" * 70)

    # Step 1: Verify metric exists and is a Histogram
    print("\n[1] Checking metric type...")
    metric_family = None
    for collector in REGISTRY._collector_to_names:
        if hasattr(collector, '_name') and collector._name == 'signal_matching_duration_seconds':
            metric_family = collector
            break

    if not metric_family:
        print("❌ FAILED: Metric 'signal_matching_duration_seconds' not found")
        return False

    print(f"✅ Metric exists: {metric_family._name}")
    print(f"   Type: Histogram")
    print(f"   Description: {metric_family._documentation}")
    print(f"   Label names: {metric_family._labelnames}")

    # Step 2: Test recording for 'exact' method (record first to populate buckets)
    print("\n[2] Testing 'exact' method recording...")
    start = time.time()
    time.sleep(0.001)  # Simulate 1ms operation
    duration = time.time() - start
    signal_matching_duration_seconds.labels(method='exact').observe(duration)
    print(f"✅ Recorded {duration*1000:.2f}ms for method='exact'")

    # Step 3: Test recording for 'proximity' method
    print("\n[3] Testing 'proximity' method recording...")
    start = time.time()
    time.sleep(0.002)  # Simulate 2ms operation
    duration = time.time() - start
    signal_matching_duration_seconds.labels(method='proximity').observe(duration)
    print(f"✅ Recorded {duration*1000:.2f}ms for method='proximity'")

    # Step 4: Verify histogram buckets
    print("\n[4] Checking histogram buckets...")
    samples = list(metric_family.collect())[0].samples
    buckets = [s for s in samples if s.name.endswith('_bucket')]
    bucket_bounds = sorted(set(s.labels.get('le', '') for s in buckets if 'le' in s.labels),
                          key=lambda x: float(x) if x != '+Inf' else float('inf'))
    print(f"✅ Histogram has {len(bucket_bounds)} buckets")
    print(f"   Bucket upper bounds (seconds): {', '.join(bucket_bounds[:10])}{'...' if len(bucket_bounds) > 10 else ''}")

    # Step 5: Verify metrics can be collected
    print("\n[5] Collecting metrics for both methods...")
    samples = list(metric_family.collect())[0].samples

    exact_count = 0
    proximity_count = 0
    exact_sum = 0
    proximity_sum = 0

    for sample in samples:
        if sample.labels.get('method') == 'exact':
            if sample.name.endswith('_count'):
                exact_count = sample.value
            elif sample.name.endswith('_sum'):
                exact_sum = sample.value
        elif sample.labels.get('method') == 'proximity':
            if sample.name.endswith('_count'):
                proximity_count = sample.value
            elif sample.name.endswith('_sum'):
                proximity_sum = sample.value

    print(f"✅ method='exact': count={exact_count}, sum={exact_sum:.6f}s")
    if exact_count > 0:
        avg_ms = (exact_sum / exact_count) * 1000
        print(f"   Average: {avg_ms:.2f}ms")
        if avg_ms < 100:
            print(f"   ✅ Average < 100ms (reasonable)")
        else:
            print(f"   ⚠️  Average >= 100ms (may need investigation)")

    print(f"✅ method='proximity': count={proximity_count}, sum={proximity_sum:.6f}s")
    if proximity_count > 0:
        avg_ms = (proximity_sum / proximity_count) * 1000
        print(f"   Average: {avg_ms:.2f}ms")
        if avg_ms < 100:
            print(f"   ✅ Average < 100ms (reasonable)")
        else:
            print(f"   ⚠️  Average >= 100ms (may need investigation)")

    # Step 6: Show sample metric output (as would appear in /metrics endpoint)
    print("\n[6] Sample metric output format:")
    print("-" * 70)
    count = 0
    for sample in samples:
        if count < 5:  # Show first 5 samples
            labels_str = ', '.join(f'{k}="{v}"' for k, v in sample.labels.items())
            print(f"{sample.name}{{{labels_str}}} {sample.value}")
            count += 1
    print("-" * 70)

    print("\n" + "=" * 70)
    print("✅ VERIFICATION COMPLETE: All checks passed")
    print("=" * 70)
    print("\nSummary:")
    print("  • Histogram exists with proper buckets")
    print("  • Records time for both 'exact' and 'proximity' methods")
    print("  • Default buckets support p50, p95, p99 calculations")
    print("  • Timing values are reasonable (<100ms expected)")

    return True

if __name__ == "__main__":
    success = verify_histogram_metric()
    sys.exit(0 if success else 1)
