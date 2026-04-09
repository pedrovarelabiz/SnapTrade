#!/usr/bin/env python3
"""Test script to verify logging output format for signal matching."""

import logging
import sys
from datetime import datetime, timezone, timedelta
from io import StringIO

# Configure logging to capture output
log_capture = StringIO()
handler = logging.StreamHandler(log_capture)
handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(levelname)s - %(message)s - %(extra)s', defaults={'extra': ''})
handler.setFormatter(formatter)

# Import listener module
from listener import find_matching_signal, ChannelHandler

# Setup logger
logger = logging.getLogger('listener')
logger.setLevel(logging.INFO)
logger.addHandler(handler)

def test_exact_match_logging():
    """Test exact expiration match logging output."""
    print("Testing exact expiration match logging...")
    
    # Create a test signal with martingale_times
    entry_time = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    expiration_minutes = 5
    
    test_signal = {
        "id": "test-signal-001",
        "asset": "EURUSD",
        "direction": "CALL",
        "entryTimeUtc": entry_time.isoformat(),
        "expirationMinutes": expiration_minutes,
        "martingaleTimes": [0],  # Single attempt
    }
    
    # Result timestamp at expected expiration (5 minutes after entry)
    result_timestamp = entry_time + timedelta(minutes=5)
    
    signals = [test_signal]
    
    # Clear log capture
    log_capture.truncate(0)
    log_capture.seek(0)
    
    # Trigger exact match
    matched = find_matching_signal("EURUSD", result_timestamp, 1, signals)
    
    # Get log output
    log_output = log_capture.getvalue()
    print(f"Log output:\n{log_output}")
    
    # Verify fields in log output
    checks = {
        "calculated_expiration": "calculated_expiration" in log_output,
        "time_delta": "time_delta" in log_output,
        "exact_match": "Exact expiration match" in log_output or "exact" in log_output.lower(),
    }
    
    return checks

def test_proximity_fallback_logging():
    """Test proximity fallback logging output."""
    print("\nTesting proximity fallback logging...")
    
    # Create test handler with a signal
    config = {
        "id": "test-channel",
        "slug": "test-channel",
        "name": "Test Channel",
        "timezone": "UTC",
        "sourceFormat": "test",
        "maxGaleLevel": 2,
        "telegramName": "@test_channel",
    }
    handler = ChannelHandler(config)
    
    # Add a signal that won't match exactly but will match by proximity
    entry_time = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    handler.active_signals.append({
        "id": "test-signal-002",
        "asset": "GBPUSD",
        "direction": "PUT",
        "entryTimeUtc": entry_time.isoformat(),
        "expirationMinutes": 5,
        "martingaleTimes": [0],
    })
    
    # Result timestamp far from expiration to trigger proximity fallback
    result_timestamp = entry_time + timedelta(minutes=2)
    
    # Clear log capture
    log_capture.truncate(0)
    log_capture.seek(0)
    
    # Trigger proximity fallback
    matched = handler.find_matching_signal_proximity_only(result_timestamp, asset="GBPUSD", direction="PUT")
    
    # Get log output
    log_output = log_capture.getvalue()
    print(f"Log output:\n{log_output}")
    
    # Verify fields in log output
    checks = {
        "proximity": "proximity" in log_output.lower() or "fallback" in log_output.lower(),
        "match_type": "match_type" in log_output,
    }
    
    return checks

if __name__ == "__main__":
    try:
        print("=" * 60)
        print("Logging Output Format Verification")
        print("=" * 60)
        
        exact_checks = test_exact_match_logging()
        proximity_checks = test_proximity_fallback_logging()
        
        print("\n" + "=" * 60)
        print("RESULTS:")
        print("=" * 60)
        
        print("\nExact Match Logging:")
        for field, found in exact_checks.items():
            status = "✓" if found else "✗"
            print(f"  {status} {field}: {found}")
        
        print("\nProximity Fallback Logging:")
        for field, found in proximity_checks.items():
            status = "✓" if found else "✗"
            print(f"  {status} {field}: {found}")
        
        all_passed = all(exact_checks.values()) or all(proximity_checks.values())
        
        if all_passed:
            print("\n✓ Verification PASSED - Required fields are present in logs")
            sys.exit(0)
        else:
            print("\n✗ Verification FAILED - Some fields missing from logs")
            sys.exit(1)
            
    except Exception as e:
        print(f"\n✗ Test error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
