#!/usr/bin/env python3
"""Test script for graceful shutdown behavior."""

import asyncio
import signal
import sys
import logging
import json
import os
from datetime import datetime, timezone

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Simulate global state
START_TIME = None
MESSAGE_COUNT = 0
shutdown_requested = False

class MockClient:
    """Mock Telegram client for testing."""
    def __init__(self):
        self._connected = True

    def is_connected(self):
        return self._connected

    async def disconnect(self):
        logger.info("client.disconnect() called")
        self._connected = False
        await asyncio.sleep(0.1)  # Simulate disconnect time

async def save_metrics(message_count, start_time):
    """Save shutdown metrics."""
    uptime = int((datetime.now(timezone.utc) - start_time).total_seconds())
    metrics = {
        "shutdown_time": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": uptime,
        "messages_processed": message_count,
    }
    metrics_file = "/tmp/test_listener_metrics.json"
    try:
        with open(metrics_file, "w") as f:
            json.dump(metrics, f, indent=2)
        logger.info(f"Metrics saved to {metrics_file}")
        return True
    except Exception as e:
        logger.error(f"Failed to save metrics: {e}")
        return False

async def handle_shutdown(sig, client):
    """Handle graceful shutdown of the listener."""
    global shutdown_requested, MESSAGE_COUNT, START_TIME
    shutdown_requested = True

    signal_name = 'SIGTERM' if sig == signal.SIGTERM else 'SIGINT'
    logger.info(f"Shutting Down - Received {signal_name}")

    # Disconnect client
    if client.is_connected():
        await client.disconnect()

    # Save metrics
    await save_metrics(MESSAGE_COUNT, START_TIME)

    logger.info("Shutdown complete")
    sys.exit(0)

async def main():
    """Main test function."""
    global START_TIME, MESSAGE_COUNT
    START_TIME = datetime.now(timezone.utc)
    MESSAGE_COUNT = 42  # Simulate some messages processed

    client = MockClient()

    logger.info("Listener started, waiting for signals...")

    # Simulate running until disconnected
    try:
        while not shutdown_requested:
            await asyncio.sleep(0.5)
    finally:
        # Cleanup on exit
        logger.info("Initiating cleanup...")
        if client.is_connected():
            await client.disconnect()
        await save_metrics(MESSAGE_COUNT, START_TIME)
        logger.info("Listener stopped cleanly")

def signal_handler(signum, frame):
    """Synchronous signal handler."""
    global shutdown_requested, MESSAGE_COUNT, START_TIME
    signal_name = 'SIGTERM' if signum == signal.SIGTERM else 'SIGINT'
    logger.info(f"Shutting Down - Received {signal_name}")
    shutdown_requested = True

if __name__ == "__main__":
    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    try:
        asyncio.run(main())
        sys.exit(0)
    except KeyboardInterrupt:
        sys.exit(0)
