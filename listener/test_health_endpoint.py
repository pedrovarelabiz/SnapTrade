#!/usr/bin/env python3
"""Test the health endpoint."""

import os
import sys
import time
import json
import asyncio
import signal
from datetime import datetime, timezone
import aiohttp
from aiohttp import web

# Set environment variables before importing listener
os.environ['HEALTHCHECK_PORT'] = '8888'
os.environ.setdefault('INTERNAL_API_KEY', os.environ.get('INTERNAL_API_KEY', ''))
os.environ['TELEGRAM_API_ID'] = '12345'
os.environ['TELEGRAM_API_HASH'] = 'test_hash_for_testing'
os.environ['TELEGRAM_PHONE'] = '+1234567890'
os.environ['BACKEND_URL'] = 'http://localhost:3001'

# Add listener directory to path
sys.path.insert(0, os.path.dirname(__file__))

# Import after setting env vars
from listener import run_healthcheck_server, HealthTracker, START_TIME

async def test_health_endpoint():
    """Test the health endpoint."""

    # Create a health tracker
    health_tracker = HealthTracker()
    health_tracker.message_count = 5
    health_tracker.error_count = 0
    health_tracker.last_heartbeat = datetime.now(timezone.utc)

    # Start health check server
    port = 8888
    print(f"Starting healthcheck server on port {port}...")
    asyncio.create_task(run_healthcheck_server(port, health_tracker))

    # Wait for server to start
    await asyncio.sleep(2)

    # Test the endpoint
    print(f"Testing http://localhost:{port}/health")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f'http://localhost:{port}/health') as resp:
                if resp.status == 200:
                    data = await resp.json()
                    print(f"\n✓ Health endpoint responded with status 200")
                    print(f"\nResponse JSON:")
                    print(json.dumps(data, indent=2))

                    # Verify required fields
                    required_fields = ['status', 'uptime', 'last_heartbeat']
                    missing_fields = [f for f in required_fields if f not in data]

                    # Check for message_count (might be 'messages' in response)
                    has_message_count = 'message_count' in data or 'messages' in data

                    if missing_fields:
                        print(f"\n✗ Missing required fields: {missing_fields}")
                        return False

                    if not has_message_count:
                        print(f"\n✗ Missing message_count or messages field")
                        return False

                    # Verify status is healthy
                    if data.get('status') != 'healthy':
                        print(f"\n✗ Status is not 'healthy': {data.get('status')}")
                        return False

                    print(f"\n✓ All required fields present:")
                    print(f"  - status: {data.get('status')}")
                    print(f"  - uptime: {data.get('uptime')}")
                    print(f"  - messages: {data.get('messages', data.get('message_count'))}")
                    print(f"  - last_heartbeat: {data.get('last_heartbeat')}")

                    return True
                else:
                    print(f"\n✗ Health endpoint returned status {resp.status}")
                    return False

    except Exception as e:
        print(f"\n✗ Error testing endpoint: {e}")
        return False

if __name__ == '__main__':
    try:
        result = asyncio.run(test_health_endpoint())
        if result:
            print("\n✓ Health endpoint test PASSED")
            sys.exit(0)
        else:
            print("\n✗ Health endpoint test FAILED")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\nTest interrupted")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Test error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
