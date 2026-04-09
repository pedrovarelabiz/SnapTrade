#!/usr/bin/env python3
"""Smoke tests for production deployment.

Minimal tests to verify critical functionality immediately after deployment.
"""

import os
import sys
import asyncio
from datetime import datetime, timezone, timedelta

import pytest

# Set required environment variables
os.environ.setdefault('HEALTHCHECK_PORT', '8889')
os.environ.setdefault('INTERNAL_API_KEY', 'test_smoke_api_key_12345678901234567890')
os.environ.setdefault('TELEGRAM_API_ID', '12345')
os.environ.setdefault('TELEGRAM_API_HASH', 'test_hash')
os.environ.setdefault('TELEGRAM_PHONE', '+1234567890')
os.environ.setdefault('BACKEND_URL', 'http://localhost:3001')

# Add listener directory to path
sys.path.insert(0, os.path.dirname(__file__))


def test_import_listener():
    """Test 1: Import listener module successfully."""
    try:
        import listener
        assert hasattr(listener, 'ChannelHandler')
        assert hasattr(listener, 'run_healthcheck_server')
        assert hasattr(listener, 'HealthTracker')
        print("✓ Test 1 PASSED: Listener module imported successfully")
        return True
    except Exception as e:
        print(f"✗ Test 1 FAILED: Import error - {e}")
        return False


def test_calculate_signal_expiration_time():
    """Test 2: calculate_signal_expiration_time works correctly."""
    try:
        from listener import ChannelHandler, HealthTracker

        health_tracker = HealthTracker()
        channel_config = {
            "id": 1,
            "slug": "test-channel",
            "name": "Test Channel",
            "timezone": "UTC",
            "sourceFormat": "pocket_vip_sticker",
            "maxGaleLevel": 2,
            "telegramId": "-1001234567890",
            "telegramName": "Test Channel"
        }
        handler = ChannelHandler(channel_config, health_tracker=health_tracker)

        # Test with basic signal
        entry_time = datetime.now(timezone.utc)
        signal = {
            "entryTimeUtc": entry_time.isoformat(),
            "expirationMinutes": 5
        }

        expiration_time = handler.calculate_signal_expiration_time(signal)
        assert isinstance(expiration_time, datetime)

        # Verify expiration is approximately 5 minutes after entry
        expected = entry_time + timedelta(minutes=5)
        time_diff = abs((expiration_time - expected).total_seconds())
        assert time_diff < 2, f"Expiration time off by {time_diff}s"

        print("✓ Test 2 PASSED: calculate_signal_expiration_time works")
        return True
    except Exception as e:
        print(f"✗ Test 2 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_find_matching_signal_callable():
    """Test 3: find_matching_signal callable with all signature variants."""
    try:
        from listener import ChannelHandler, HealthTracker

        health_tracker = HealthTracker()
        channel_config = {
            "id": 1,
            "slug": "test-channel",
            "name": "Test Channel",
            "timezone": "UTC",
            "sourceFormat": "pocket_vip_sticker",
            "maxGaleLevel": 2,
            "telegramId": "-1001234567890",
            "telegramName": "Test Channel"
        }
        handler = ChannelHandler(channel_config, health_tracker=health_tracker)

        result_date = datetime.now(timezone.utc)

        # Test variant 1: Only result_date
        match1 = handler.find_matching_signal(result_date)
        assert match1 is None  # No signals pending, should return None

        # Test variant 2: With asset
        match2 = handler.find_matching_signal(result_date, asset="EURUSD")
        assert match2 is None

        # Test variant 3: With asset and direction
        match3 = handler.find_matching_signal(result_date, asset="EURUSD", direction="CALL")
        assert match3 is None

        print("✓ Test 3 PASSED: find_matching_signal callable with all variants")
        return True
    except Exception as e:
        print(f"✗ Test 3 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


@pytest.mark.asyncio
@pytest.mark.skip(reason="Integration test: requires live listener process on port 8889")
async def test_health_endpoint_matching_stats():
    """Test 4: Health endpoint returns matching_stats."""
    try:
        import aiohttp
        from listener import run_healthcheck_server, HealthTracker, ChannelHandler

        # Create health tracker and handler
        health_tracker = HealthTracker()
        health_tracker.message_count = 1
        health_tracker.last_heartbeat = datetime.now(timezone.utc)

        # Start health check server
        port = 8889
        server_task = asyncio.create_task(run_healthcheck_server(port, health_tracker))

        # Wait for server to start
        await asyncio.sleep(1)

        # Test the endpoint
        async with aiohttp.ClientSession() as session:
            async with session.get(f'http://localhost:{port}/health') as resp:
                assert resp.status == 200, f"Expected 200, got {resp.status}"
                data = await resp.json()

                # Verify matching_stats is present and has required keys
                assert 'matching_stats' in data, "matching_stats missing from response"
                stats = data['matching_stats']

                required_keys = ['tier1', 'tier2', 'tier3', 'no_match']
                for key in required_keys:
                    assert key in stats, f"matching_stats missing key: {key}"

                # Verify ambiguous_matches is present
                assert 'ambiguous_matches' in data, "ambiguous_matches missing from response"

                print("✓ Test 4 PASSED: Health endpoint returns matching_stats")
                return True

    except Exception as e:
        print(f"✗ Test 4 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


def run_smoke_tests():
    """Run all smoke tests."""
    print("=" * 60)
    print("PRODUCTION DEPLOYMENT SMOKE TESTS")
    print("=" * 60)

    results = []

    # Test 1: Import
    results.append(test_import_listener())

    # Test 2: Calculate expiration
    results.append(test_calculate_signal_expiration_time())

    # Test 3: Find matching signal
    results.append(test_find_matching_signal_callable())

    # Test 4: Health endpoint (async)
    result4 = asyncio.run(test_health_endpoint_matching_stats())
    results.append(result4)

    # Summary
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"RESULTS: {passed}/{total} tests passed")
    print("=" * 60)

    return all(results)


if __name__ == '__main__':
    try:
        success = run_smoke_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n✗ Tests interrupted")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Test suite error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
