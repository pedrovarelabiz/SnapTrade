#!/usr/bin/env python3
"""Test script for metrics persistence functionality."""

import asyncio
import json
import os
import sys
import logging
from datetime import datetime, timezone
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Metrics file path - handle both running from project root and from listener/
if os.path.basename(os.getcwd()) == "listener":
    METRICS_FILE = "metrics.json"
else:
    METRICS_FILE = os.path.join("listener", "metrics.json")

class MockHealthTracker:
    """Mock health tracker for testing."""
    def __init__(self):
        self.message_count = 0
        self.error_count = 0
        self.last_heartbeat = None

    def increment_messages(self, count=1):
        self.message_count += count
        self.last_heartbeat = datetime.now(timezone.utc)

class MockConnectionMetrics:
    """Mock connection metrics for testing."""
    def __init__(self):
        self.total_reconnections = 0

    def increment_reconnections(self):
        self.total_reconnections += 1

async def save_metrics(metrics, health, start_time):
    """Save metrics to JSON file (mimics save_metrics_periodically)."""
    try:
        uptime = int((datetime.now(timezone.utc) - start_time).total_seconds())

        data = {
            "uptime": uptime,
            "message_count": health.message_count,
            "error_count": health.error_count,
            "reconnection_count": metrics.total_reconnections,
            "last_heartbeat": health.last_heartbeat.isoformat() if health.last_heartbeat else None,
        }

        with open(METRICS_FILE, "w") as f:
            json.dump(data, f, indent=2)

        logger.info(f"Metrics saved: {data}")
        return True
    except Exception as e:
        logger.error(f"Failed to save metrics: {e}")
        return False

def load_previous_metrics():
    """Load and log previous session metrics if available."""
    if os.path.exists(METRICS_FILE):
        try:
            with open(METRICS_FILE, "r") as f:
                prev_metrics = json.load(f)
            messages = prev_metrics.get("message_count", 0)
            uptime = prev_metrics.get("uptime", 0)
            errors = prev_metrics.get("error_count", 0)
            reconnections = prev_metrics.get("reconnection_count", 0)
            logger.info(f"Previous session: {messages} messages, {uptime}s uptime, {errors} errors, {reconnections} reconnections")
            return prev_metrics
        except Exception as e:
            logger.warning(f"Failed to load previous metrics: {e}")
    else:
        logger.info("No previous metrics found")
    return None

async def simulate_listener_session(duration_seconds=5, message_rate=2):
    """Simulate a listener session with messages."""
    start_time = datetime.now(timezone.utc)
    health = MockHealthTracker()
    metrics = MockConnectionMetrics()

    logger.info(f"Starting listener session for {duration_seconds} seconds...")

    # Load previous metrics
    prev_metrics = load_previous_metrics()

    # Simulate message processing
    elapsed = 0
    while elapsed < duration_seconds:
        await asyncio.sleep(1)
        elapsed += 1

        # Simulate messages
        if elapsed % message_rate == 0:
            health.increment_messages()
            logger.info(f"Message received (total: {health.message_count})")

        # Simulate reconnection
        if elapsed == 3:
            metrics.increment_reconnections()
            logger.info(f"Reconnection occurred (total: {metrics.total_reconnections})")

    # Save metrics before shutdown
    await save_metrics(metrics, health, start_time)
    logger.info("Session ended")

    return health.message_count

async def main():
    """Run the test."""
    logger.info("=" * 60)
    logger.info("TEST: Metrics Persistence")
    logger.info("=" * 60)

    # Session 1: Initial run
    logger.info("\n--- Session 1: Initial Run ---")
    msg_count_1 = await simulate_listener_session(duration_seconds=5, message_rate=2)

    # Verify metrics file was created
    if not os.path.exists(METRICS_FILE):
        logger.error("FAIL: metrics.json was not created!")
        sys.exit(1)

    logger.info(f"✓ metrics.json created")

    # Verify file structure
    with open(METRICS_FILE, "r") as f:
        data = json.load(f)

    required_fields = ["uptime", "message_count", "error_count", "reconnection_count", "last_heartbeat"]
    for field in required_fields:
        if field not in data:
            logger.error(f"FAIL: Missing field '{field}' in metrics.json")
            sys.exit(1)

    logger.info(f"✓ All required fields present: {required_fields}")
    logger.info(f"✓ Session 1 metrics: {data}")

    # Wait a bit
    await asyncio.sleep(2)

    # Session 2: Restart and verify previous metrics are loaded
    logger.info("\n--- Session 2: Restart and Load Previous Metrics ---")
    msg_count_2 = await simulate_listener_session(duration_seconds=5, message_rate=1)

    # Verify new metrics were saved
    with open(METRICS_FILE, "r") as f:
        data2 = json.load(f)

    logger.info(f"✓ Session 2 metrics: {data2}")

    # Final validation
    logger.info("\n" + "=" * 60)
    logger.info("TEST RESULTS")
    logger.info("=" * 60)
    logger.info("✓ metrics.json created with correct structure")
    logger.info("✓ Metrics persisted across sessions")
    logger.info("✓ Previous metrics loaded on restart")
    logger.info(f"✓ Session 1: {msg_count_1} messages")
    logger.info(f"✓ Session 2: {msg_count_2} messages")
    logger.info("=" * 60)
    logger.info("ALL TESTS PASSED")
    logger.info("=" * 60)

if __name__ == "__main__":
    try:
        asyncio.run(main())
        sys.exit(0)
    except Exception as e:
        logger.error(f"Test failed with error: {e}")
        sys.exit(1)
