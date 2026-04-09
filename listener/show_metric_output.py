#!/usr/bin/env python3
"""
Show sample metric output for signal_matching_duration_seconds
"""
import time
from prometheus_client import Histogram, generate_latest

# Create a test histogram
test_histogram = Histogram(
    'signal_matching_duration_seconds',
    'Duration of signal matching operations in seconds',
    ['method']
)

# Simulate some measurements
# Exact method: fast operations (1-5ms)
for _ in range(10):
    test_histogram.labels(method='exact').observe(0.002)  # 2ms
    test_histogram.labels(method='exact').observe(0.005)  # 5ms
    test_histogram.labels(method='exact').observe(0.001)  # 1ms

# Proximity method: slightly slower (5-15ms)
for _ in range(10):
    test_histogram.labels(method='proximity').observe(0.008)  # 8ms
    test_histogram.labels(method='proximity').observe(0.012)  # 12ms
    test_histogram.labels(method='proximity').observe(0.005)  # 5ms

# Generate metrics output
output = generate_latest().decode('utf-8')

# Filter for our metric
lines = [line for line in output.split('\n') if 'signal_matching_duration_seconds' in line]

print("Sample metrics output (as would appear at http://localhost:8000/metrics):")
print("=" * 80)
for line in lines[:15]:  # Show first 15 lines
    print(line)
print("...")
print("=" * 80)

# Show statistics
print("\nKey metrics:")
print("-" * 80)
for line in lines:
    if '_count{' in line or '_sum{' in line:
        print(line)
print("-" * 80)
