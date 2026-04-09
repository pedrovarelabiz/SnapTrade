"""SnapTrade Listener — Connection management and reconnection logic."""

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

import sentry_sdk

import listener_constants as constants
from listener_constants import (
    MAX_RECONNECT_DELAY, INITIAL_RECONNECT_DELAY,
)

logger = logging.getLogger("signal_matching")

class ConnectionState(Enum):
    """Connection state enumeration."""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    FAILED = "failed"


def record_exception(exc: Exception) -> None:
    """Record an exception with timestamp to the global exception collector.

    Args:
        exc: The exception to record
    """
    timestamp = datetime.now(timezone.utc)
    constants.RECENT_EXCEPTIONS.append(
        {
            "timestamp": timestamp,
            "exception": exc,
            "type": type(exc).__name__,
            "message": str(exc),
        }
    )
    # Send exception to Sentry for tracking
    sentry_sdk.capture_exception(exc)


async def handle_shutdown(sig, client, alerter):
    """Handle graceful shutdown of the listener.

    Args:
        sig: Signal number received
        client: TelegramClient instance
        alerter: Alerter instance for sending notifications
    """
    constants.shutdown_requested = True

    signal_name = "SIGTERM" if sig == "SIGTERM" else "SIGINT"
    uptime = int((datetime.now(timezone.utc) - constants.START_TIME).total_seconds()) if constants.START_TIME else 0

    logging.info(f"Received signal {sig}, initiating graceful shutdown...")

    if alerter:
        await alerter.send_alert(
            f"🛑 Listener Shutting Down\n\nSignal: {signal_name}\nUptime: {uptime}s\nMessages processed: {constants.MESSAGE_COUNT}",
            "INFO",
        )

    await client.disconnect()
    logging.info("Shutdown complete")


@dataclass
class ReconnectionConfig:
    """Configuration for exponential backoff reconnection strategy."""

    initial_delay: float = INITIAL_RECONNECT_DELAY
    max_delay: float = MAX_RECONNECT_DELAY
    backoff_multiplier: float = 2
    max_retries: Optional[int] = None


@dataclass
class ConnectionMetrics:
    """Tracks connection metrics and statistics."""

    total_connections: int = 0
    successful_connections: int = 0
    failed_connections: int = 0
    total_reconnections: int = 0
    last_connected_at: Optional[datetime] = None
    total_uptime_seconds: float = 0.0
    total_downtime_seconds: float = 0.0

    def to_dict(self) -> dict:
        """Convert metrics to dictionary format."""
        return {
            "total_connections": self.total_connections,
            "successful_connections": self.successful_connections,
            "failed_connections": self.failed_connections,
            "total_reconnections": self.total_reconnections,
            "last_connected_at": (
                self.last_connected_at.isoformat() if self.last_connected_at else None
            ),
            "total_uptime_seconds": self.total_uptime_seconds,
            "total_downtime_seconds": self.total_downtime_seconds,
        }


class ReconnectionManager:
    """Manages reconnection attempts with exponential backoff."""

    def __init__(self, config: ReconnectionConfig):
        self.config = config
        self.attempt_count = 0
        self.current_delay = config.initial_delay
        self.state = ConnectionState.DISCONNECTED
        self.last_failure_time: Optional[datetime] = None

    def calculate_next_delay(self) -> float:
        """Calculate next delay using exponential backoff."""
        current_delay = min(
            self.config.initial_delay
            * (self.config.backoff_multiplier**self.attempt_count),
            self.config.max_delay,
        )
        return current_delay

    def should_retry(self) -> bool:
        """Check if reconnection should be attempted."""
        if self.config.max_retries is None:
            return True
        return self.attempt_count < self.config.max_retries

    def reset(self) -> None:
        """Reset reconnection state after successful connection."""
        # Track successful recovery in Sentry if we had failures
        if self.attempt_count > 0:
            sentry_sdk.capture_message(
                f"Listener recovered after {self.attempt_count} reconnection attempts",
                level="info",
            )
        self.attempt_count = 0
        self.current_delay = self.config.initial_delay
        self.last_failure_time = None

    def record_failure(self) -> None:
        """Record a connection failure and update state."""
        self.attempt_count += 1
        self.last_failure_time = datetime.now(timezone.utc)
        self.current_delay = self.calculate_next_delay()
        # Track failure attempt in Sentry
        sentry_sdk.capture_message(
            f"Reconnection attempt {self.attempt_count} failed, retrying with {self.current_delay:.1f}s backoff",
            level="warning",
        )


class HealthTracker:
    """Tracks health metrics for the listener service."""

    def __init__(self):
        self.last_heartbeat: Optional[datetime] = None
        self.message_count: int = 0
        self.error_count: int = 0

    def record_message(self) -> None:
        """Record a successfully processed message."""
        self.message_count += 1
        self.last_heartbeat = datetime.now(timezone.utc)

    def record_error(self) -> None:
        """Record an error occurrence."""
        self.error_count += 1

    def is_healthy(self, max_age_seconds: int = 300) -> bool:
        """Check if the service is healthy based on recent heartbeat.

        Args:
            max_age_seconds: Maximum allowed time since last heartbeat (default: 300s/5min)

        Returns:
            True if last heartbeat is within max_age_seconds, False otherwise
        """
        if self.last_heartbeat is None:
            return False
        age = (datetime.now(timezone.utc) - self.last_heartbeat).total_seconds()
        return age <= max_age_seconds


async def save_metrics_periodically(metrics, health, interval=300):
    """Save ConnectionMetrics and HealthTracker to JSON file periodically.

    Args:
        metrics: ConnectionMetrics instance
        health: HealthTracker instance
        interval: Save interval in seconds (default: 300 = 5 minutes)
    """
    while True:
        await asyncio.sleep(interval)
        try:
            # Calculate uptime from global START_TIME
            uptime = (
                int((datetime.now(timezone.utc) - constants.START_TIME).total_seconds())
                if constants.START_TIME
                else 0
            )

            data = {
                "uptime": uptime,
                "message_count": health.message_count,
                "error_count": health.error_count,
                "reconnection_count": metrics.total_reconnections,
                "last_heartbeat": (
                    health.last_heartbeat.isoformat() if health.last_heartbeat else None
                ),
            }
            metrics_file = os.path.join("listener", "metrics.json")
            with open(metrics_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except (IOError, OSError) as e:
            logging.error(f"Failed to save metrics: {e}")
            sentry_sdk.capture_exception(e)
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            logging.error(f"JSON error: {error}")
            sentry_sdk.capture_exception(error)




async def run_with_reconnection(
    client, reconnection_manager, alerter, health_tracker, connection_metrics
):
    """Run the listener with automatic reconnection on failure.

    Args:
        client: TelegramClient instance
        reconnection_manager: ReconnectionManager instance for backoff logic
        alerter: TelegramAlerter instance for sending alerts
        health_tracker: HealthTracker instance for monitoring health
        connection_metrics: ConnectionMetrics instance for tracking connection statistics
    """
    while reconnection_manager.should_retry():
        if constants.shutdown_requested:
            break
        try:
            reconnection_manager.state = ConnectionState.CONNECTING
            # Log successful connection and reset retry counter
            logger.info("Successfully connected to Telegram, monitoring for messages")

            # Send recovery alert if reconnection was successful
            if reconnection_manager.attempt_count > 0:
                attempt_count = reconnection_manager.attempt_count
                if reconnection_manager.last_failure_time:
                    downtime_seconds = int(
                        (
                            datetime.now(timezone.utc)
                            - reconnection_manager.last_failure_time
                        ).total_seconds()
                    )
                else:
                    downtime_seconds = 0
                await alerter.send_alert(
                    f"✅ Listener Recovered\n\nReconnected after {attempt_count} attempts\nDowntime: {downtime_seconds}s",
                    "INFO",
                )
                logger.info(
                    f"Reconnection successful after {attempt_count} attempts with {downtime_seconds}s downtime"
                )

                # Update connection metrics
                connection_metrics.total_reconnections += 1
                connection_metrics.total_downtime_seconds += downtime_seconds

                # Calculate statistics
                avg_downtime = (
                    connection_metrics.total_downtime_seconds
                    / connection_metrics.total_reconnections
                )
                total_attempts = (
                    connection_metrics.successful_connections
                    + connection_metrics.failed_connections
                )
                success_rate = (
                    (connection_metrics.successful_connections / total_attempts * 100)
                    if total_attempts > 0
                    else 0
                )

                # Log reconnection statistics
                logger.info(
                    f"Reconnection successful. Total reconnections: {connection_metrics.total_reconnections}, Average downtime: {avg_downtime:.1f}s, Success rate: {success_rate:.1f}%"
                )

            reconnection_manager.reset()
            reconnection_manager.state = ConnectionState.CONNECTED
            await client.run_until_disconnected()
            logger.info("Client disconnected normally")
            break
        except FloodWaitError as e:
            wait_time = e.seconds
            buffer = 5  # Add 5 second buffer
            total_wait = wait_time + buffer
            logger.warning(
                f"FloodWaitError: Telegram rate limit hit. Waiting {wait_time}s + {buffer}s buffer = {total_wait}s"
            )
            sentry_sdk.capture_message(
                "Rate limit exceeded", level="warning", extra={"wait_time": total_wait}
            )
            await alerter.send_alert(
                f"Telegram rate limit hit. Waiting {total_wait}s before retry.",
                "Rate Limit",
            )
            await asyncio.sleep(total_wait)
            # Continue without incrementing failure count - this is not a connection failure
        except ConnectionError as e:
            logger.error(f"Connection failure: {e}", exc_info=True)
            reconnection_manager.record_failure()
            reconnection_manager.state = ConnectionState.RECONNECTING
            record_exception(e)
            health_tracker.record_error()
            gc.collect()  # Clean up memory on connection error
            if not reconnection_manager.should_retry():
                reconnection_manager.state = ConnectionState.FAILED
                await alerter.send_alert(
                    "🛑 Listener Failed\n\nMax retries exceeded. Manual intervention required.",
                    "CRITICAL",
                )
                sys.exit(1)
            delay = reconnection_manager.calculate_next_delay()
            attempt_count = reconnection_manager.attempt_count
            logger.info(
                f"Sleeping for {delay:.1f}s before reconnection (attempt {attempt_count})"
            )
            await alerter.send_alert(
                f"🔌 Connection Lost\n\nAttempt: {attempt_count}\nNext retry in: {delay}s\n\nError: {str(e)}",
                "WARNING",
            )
            await asyncio.sleep(delay)
        except Exception as e:
            logger.error(f"Network error: {e}", exc_info=True)
            reconnection_manager.record_failure()
            reconnection_manager.state = ConnectionState.RECONNECTING
            record_exception(e)
            health_tracker.record_error()
            gc.collect()  # Clean up memory on network error
            if not reconnection_manager.should_retry():
                reconnection_manager.state = ConnectionState.FAILED
                await alerter.send_alert(
                    "🛑 Listener Failed\n\nMax retries exceeded. Manual intervention required.",
                    "CRITICAL",
                )
                sys.exit(1)
            delay = reconnection_manager.calculate_next_delay()
            logger.info(
                f"Sleeping for {delay:.1f}s before reconnection (attempt {reconnection_manager.attempt_count})"
            )
            await alerter.send_alert(
                f"Network error. Reconnecting in {delay:.1f}s (attempt {reconnection_manager.attempt_count})",
                "Network Error",
            )
            await asyncio.sleep(delay)
        except TimeoutError as e:
            logger.error(f"Timeout error: {e}", exc_info=True)
            reconnection_manager.record_failure()
            reconnection_manager.state = ConnectionState.RECONNECTING
            record_exception(e)
            health_tracker.record_error()
            gc.collect()  # Clean up memory on timeout error
            if not reconnection_manager.should_retry():
                reconnection_manager.state = ConnectionState.FAILED
                await alerter.send_alert(
                    "🛑 Listener Failed\n\nMax retries exceeded. Manual intervention required.",
                    "CRITICAL",
                )
                sys.exit(1)
            delay = reconnection_manager.calculate_next_delay()
            logger.info(
                f"Sleeping for {delay:.1f}s before reconnection (attempt {reconnection_manager.attempt_count})"
            )
            await alerter.send_alert(
                f"Timeout error. Reconnecting in {delay:.1f}s (attempt {reconnection_manager.attempt_count})",
                "Timeout",
            )
            await asyncio.sleep(delay)
        except OSError as e:
            logger.error(f"Network error: {e}", exc_info=True)
            reconnection_manager.record_failure()
            reconnection_manager.state = ConnectionState.RECONNECTING
            record_exception(e)
            health_tracker.record_error()
            gc.collect()  # Clean up memory on network error
            if not reconnection_manager.should_retry():
                reconnection_manager.state = ConnectionState.FAILED
                await alerter.send_alert(
                    "🛑 Listener Failed\n\nMax retries exceeded. Manual intervention required.",
                    "CRITICAL",
                )
                sys.exit(1)
            delay = reconnection_manager.calculate_next_delay()
            logger.info(
                f"Sleeping for {delay:.1f}s before reconnection (attempt {reconnection_manager.attempt_count})"
            )
            await alerter.send_alert(
                f"Network error. Reconnecting in {delay:.1f}s (attempt {reconnection_manager.attempt_count})",
                "Network Error",
            )
            await asyncio.sleep(delay)
        except Exception as e:
            logger.error(f"Connection error: {e}", exc_info=True)
            reconnection_manager.record_failure()
            reconnection_manager.state = ConnectionState.RECONNECTING
            record_exception(e)
            health_tracker.record_error()
            gc.collect()  # Clean up memory on critical error
            crash_report = format_crash_report(
                e,
                {
                    "attempt": reconnection_manager.attempt_count,
                    "state": reconnection_manager.state,
                },
            )
            await alerter.send_alert(crash_report, "CRITICAL")
            if not reconnection_manager.should_retry():
                reconnection_manager.state = ConnectionState.FAILED
                await alerter.send_alert(
                    "🛑 Listener Failed\n\nMax retries exceeded. Manual intervention required.",
                    "CRITICAL",
                )
                sys.exit(1)
            delay = reconnection_manager.calculate_next_delay()
            logger.info(
                f"Sleeping for {delay:.1f}s before reconnection (attempt {reconnection_manager.attempt_count})"
            )
            await alerter.send_alert(
                f"Connection lost. Reconnecting in {delay:.1f}s (attempt {reconnection_manager.attempt_count})",
                "warning",
            )
            await asyncio.sleep(delay)

    # If we exit the while loop, max retries have been exceeded
    if not reconnection_manager.should_retry():
        reconnection_manager.state = ConnectionState.FAILED
        await alerter.send_alert(
            "🛑 Listener Failed\n\nMax retries exceeded. Manual intervention required.",
            "CRITICAL",
        )
        sys.exit(1)

