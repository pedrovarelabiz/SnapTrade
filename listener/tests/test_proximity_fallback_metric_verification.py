#!/usr/bin/env python3
"""
Integration test to verify proximity fallback metric increments.
Tests the actual code path in find_matching_signal.
"""

import os
import sys
from datetime import datetime, timezone
from prometheus_client import REGISTRY, generate_latest

# Set required env vars to allow listener import
os.environ['INTERNAL_API_KEY'] = 'test_key_1234567890123456789012345'
os.environ['TELEGRAM_BOT_TOKEN'] = 'test_token_12345'

# Add listener directory to path so we can import it as a module
listener_dir = os.path.dirname(os.path.abspath(__file__))
if listener_dir not in sys.path:
    sys.path.insert(0, listener_dir)

# Now we can import from listener
from listener import ChannelHandler

def test_proximity_fallback_integration():
    """Integration test for proximity fallback metric."""

    print("=" * 70)
    print("Integration Test: signal_matches_proximity_fallback_total")
    print("=" * 70)

    # Create a channel handler
    channel_config = {
        "id": "test-fallback",
        "slug": "test-fallback",
        "name": "Test Fallback",
        "timezone": "UTC",
        "sourceFormat": "blacklist_live",
        "maxGaleLevel": 1,
        "telegramId": "999999",
        "telegramName": "test_fallback"
    }
    handler = ChannelHandler(channel_config)

    # Get the metric from the listener module
    import listener.listener as lmod
    metric = lmod.signal_matches_proximity_fallback_total

    # Get initial value
    initial_value = metric.labels(asset="GBPUSD", reason="no_exact_match")._value._value

    print(f"\n[SETUP]")
    print(f"  Initial metric value: {initial_value}")

    # Create a signal WITHOUT expirationTime field
    # This will cause find_by_exact_expiration to return None, triggering fallback
    signal = {
        "id": "test-signal-001",
        "asset": "GBPUSD",
        "direction": "CALL",
        "entryTimeUtc": "2024-01-01T10:00:00Z",
        "expirationMinutes": 5,
        "status": "active",
        "timestamp": "2024-01-01T10:00:00Z"
        # NOTE: Missing expirationTime - will trigger fallback
    }

    handler.active_signals.append(signal)

    print(f"\n[TRIGGER]")
    print(f"  Signal without expirationTime: {signal['id']}")
    print(f"  Asset: {signal['asset']}")
    print(f"  Entry: {signal['entryTimeUtc']}")

    # Call find_matching_signal_proximity_only with a result timestamp
    # This should fail exact match and trigger proximity fallback
    result_time = datetime(2024, 1, 1, 10, 2, 0, tzinfo=timezone.utc)

    print(f"  Result timestamp: {result_time}")
    print(f"  Calling find_matching_signal_proximity_only...")

    result = handler.find_matching_signal_proximity_only(result_time, asset="GBPUSD")
    matched = result[0] if result else None

    # Get final value
    final_value = metric.labels(asset="GBPUSD", reason="no_exact_match")._value._value

    print(f"\n[RESULT]")
    print(f"  Matched signal: {matched['id'] if matched else 'None'}")
    print(f"  Metric before: {initial_value}")
    print(f"  Metric after: {final_value}")
    print(f"  Delta: +{final_value - initial_value}")

    # Show Prometheus output
    print(f"\n[PROMETHEUS OUTPUT]")
    metrics_output = generate_latest().decode('utf-8')
    for line in metrics_output.split('\n'):
        if 'signal_matches_proximity_fallback_total' in line and 'GBPUSD' in line:
            print(f"  {line}")

    # Verify
    print(f"\n" + "=" * 70)
    if final_value > initial_value:
        print("✅ VERIFICATION PASSED")
        print(f"   Proximity fallback metric incremented correctly")
        print(f"   reason='no_exact_match' was recorded")
        return True
    else:
        print("❌ VERIFICATION FAILED")
        print(f"   Metric did not increment")
        return False


if __name__ == "__main__":
    try:
        success = test_proximity_fallback_integration()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
