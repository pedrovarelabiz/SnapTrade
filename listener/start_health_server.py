#!/usr/bin/env python3
"""Start just the health check server for testing."""

import os
import sys
import asyncio
from datetime import datetime, timezone

# Set environment variables before importing listener
os.environ['HEALTHCHECK_PORT'] = '8888'
os.environ.setdefault('INTERNAL_API_KEY', 'test-key-local-only-not-for-production')
os.environ['TELEGRAM_API_ID'] = '12345'
os.environ['TELEGRAM_API_HASH'] = 'test_hash_for_testing'
os.environ['TELEGRAM_PHONE'] = '+1234567890'
os.environ['BACKEND_URL'] = 'http://localhost:3001'

# Add listener directory to path
sys.path.insert(0, os.path.dirname(__file__))

# Import after setting env vars
from listener import run_healthcheck_server, HealthTracker

async def main():
    """Start health check server and keep it running."""
    # Create a health tracker with some test data
    health_tracker = HealthTracker()
    health_tracker.message_count = 10
    health_tracker.error_count = 0
    health_tracker.last_heartbeat = datetime.now(timezone.utc)

    port = 8888
    print(f"Starting healthcheck server on port {port}...")
    await run_healthcheck_server(port, health_tracker)

    # Keep running
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...")

if __name__ == '__main__':
    asyncio.run(main())
