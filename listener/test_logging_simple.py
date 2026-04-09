#!/usr/bin/env python3
"""Simple test to verify logging output format."""

import sys
import os
from datetime import datetime, timezone, timedelta

# Import listener functions
from listener import find_matching_signal, calculate_expiration_time

def test_exact_match():
    """Test exact match logging."""
    print("=" * 60)
    print("Testing Exact Expiration Match Logging")
    print("=" * 60)
    
    entry_time = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    
    # Create signal with martingale times in MM:SS format
    test_signal = {
        "id": "test-signal-001",
        "asset": "EURUSD",
        "direction": "CALL",
        "entryTimeUtc": entry_time.isoformat(),
        "expirationMinutes": 5,
        "martingaleTimes": ["05:00"],  # 5 minutes in MM:SS format
    }

    # Result at exact expiration time (5 minutes after entry)
    result_timestamp = entry_time + timedelta(minutes=5)
    
    signals = [test_signal]
    
    expected_expiration = entry_time + timedelta(minutes=5)
    print(f"\nTest Signal:")
    print(f"  ID: {test_signal['id']}")
    print(f"  Asset: {test_signal['asset']}")
    print(f"  Entry Time: {entry_time}")
    print(f"  Expected Expiration: {expected_expiration}")
    print(f"\nResult Timestamp: {result_timestamp}")
    print(f"Time Difference: {(result_timestamp - expected_expiration).total_seconds()}s")
    
    print("\n" + "-" * 60)
    print("Matching signal (watch for log output)...")
    print("-" * 60)
    
    matched_signal, _, _ = find_matching_signal("EURUSD", result_timestamp, 1, signals)

    if matched_signal:
        print(f"\n✓ Signal matched: {matched_signal['id']}")
    else:
        print("\n✗ No signal matched")

    return matched_signal is not None

def test_proximity_fallback():
    """Test proximity fallback logging."""
    print("\n" + "=" * 60)
    print("Testing Proximity Fallback Logging")
    print("=" * 60)
    
    entry_time = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    
    # Create signal with martingale times in MM:SS format
    test_signal = {
        "id": "test-signal-002",
        "asset": "GBPUSD",
        "direction": "PUT",
        "entryTimeUtc": entry_time.isoformat(),
        "expirationMinutes": 5,
        "martingaleTimes": ["05:00"],  # 5 minutes in MM:SS format
    }

    # Expected expiration is 5 minutes after entry
    expiration_time = entry_time + timedelta(minutes=5)

    # Result timestamp way off from expiration (triggers fallback)
    result_timestamp = entry_time + timedelta(minutes=2)
    
    signals = [test_signal]
    
    print(f"\nTest Signal:")
    print(f"  ID: {test_signal['id']}")
    print(f"  Asset: {test_signal['asset']}")
    print(f"  Entry Time: {entry_time}")
    print(f"  Expiration Time: {expiration_time}")
    print(f"\nResult Timestamp: {result_timestamp}")
    print(f"Time Difference from expiration: {(result_timestamp - expiration_time).total_seconds()}s")
    
    print("\n" + "-" * 60)
    print("Matching signal (should trigger proximity fallback)...")
    print("-" * 60)
    
    matched_signal, _, _ = find_matching_signal("GBPUSD", result_timestamp, 1, signals)

    if matched_signal:
        print(f"\n✓ Signal matched via fallback: {matched_signal['id']}")
    else:
        print("\n✗ No signal matched")

    return matched_signal is not None

if __name__ == "__main__":
    try:
        exact_matched = test_exact_match()
        proximity_matched = test_proximity_fallback()
        
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"Exact Match Test: {'✓ PASS' if exact_matched else '✗ FAIL'}")
        print(f"Proximity Fallback Test: {'✓ PASS' if proximity_matched else '✗ FAIL'}")
        
        print("\n" + "-" * 60)
        print("Now run the grep verification command:")
        print("python3 test_logging_simple.py 2>&1 | grep -E \"exact.*match|proximity.*fallback|calculated_expiration\"")
        print("-" * 60)
        
        sys.exit(0 if (exact_matched or proximity_matched) else 1)
        
    except Exception as e:
        print(f"\n✗ Test error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
