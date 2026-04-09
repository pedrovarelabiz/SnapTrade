"""Metrics persistence module for SnapTrade Listener.

Handles saving and loading of metrics data to/from disk.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone

import sentry_sdk


async def save_metrics_periodically(metrics, health, start_time, interval=300):
    """Save ConnectionMetrics and HealthTracker to JSON file periodically.

    Args:
        metrics: ConnectionMetrics instance
        health: HealthTracker instance
        start_time: Application start time for uptime calculation
        interval: Save interval in seconds (default: 300 = 5 minutes)
    """
    while True:
        await asyncio.sleep(interval)
        try:
            # Calculate uptime from start_time
            uptime = int((datetime.now(timezone.utc) - start_time).total_seconds()) if start_time else 0

            data = {
                "uptime": uptime,
                "message_count": health.message_count,
                "error_count": health.error_count,
                "reconnection_count": metrics.total_reconnections,
                "last_heartbeat": health.last_heartbeat.isoformat() if health.last_heartbeat else None,
            }

            metrics_file = os.path.join("listener", "metrics.json")
            with open(metrics_file, "w") as f:
                json.dump(data, f, indent=2)

        except (IOError, OSError) as e:
            logging.error(f"Failed to save metrics: {e}")
            sentry_sdk.capture_exception(e)
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            logging.error(f"JSON error: {error}")
            sentry_sdk.capture_exception(error)


def load_previous_metrics(metrics_file="listener/metrics.json"):
    """Load previous session metrics if available.

    Args:
        metrics_file: Path to metrics JSON file

    Returns:
        dict: Previous metrics data or None if not available
    """
    if os.path.exists(metrics_file):
        try:
            with open(metrics_file, "r") as f:
                prev_metrics = json.load(f)
            logging.info(
                f"Previous session: {prev_metrics.get('message_count', 0)} messages, "
                f"{prev_metrics.get('uptime', 0)}s uptime, "
                f"{prev_metrics.get('error_count', 0)} errors, "
                f"{prev_metrics.get('reconnection_count', 0)} reconnections"
            )
            return prev_metrics
        except Exception as e:
            logging.warning(f"Failed to load previous metrics: {e}")
    else:
        logging.info("No previous metrics found")
    return None
