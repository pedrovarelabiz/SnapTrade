"""Crash recovery module with exponential backoff and Sentry tracking.

This module provides crash recovery functionality for the listener service,
including exponential backoff logic and comprehensive Sentry tracking of
recovery attempts and failures.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

import sentry_sdk


class ConnectionState(Enum):
    """Connection state enumeration."""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    FAILED = "failed"


class ReconnectionConfig:
    """Configuration for exponential backoff reconnection strategy."""

    def __init__(
        self,
        initial_delay: float = 1,
        max_delay: float = 60,
        backoff_multiplier: float = 2,
        max_retries: Optional[int] = None
    ):
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.backoff_multiplier = backoff_multiplier
        self.max_retries = max_retries


class ReconnectionManager:
    """Manages reconnection attempts with exponential backoff and Sentry tracking."""

    def __init__(self, config: ReconnectionConfig):
        """Initialize the reconnection manager.

        Args:
            config: ReconnectionConfig instance with backoff parameters
        """
        self.config = config
        self.attempt_count = 0
        self.current_delay = config.initial_delay
        self.state = ConnectionState.DISCONNECTED
        self.last_failure_time: Optional[datetime] = None

        # Track recovery session in Sentry
        sentry_sdk.set_tag("recovery_manager", "initialized")

    def calculate_next_delay(self) -> float:
        """Calculate next delay using exponential backoff.

        Returns:
            float: The calculated delay in seconds, capped at max_delay
        """
        current_delay = min(
            self.config.initial_delay * (self.config.backoff_multiplier ** self.attempt_count),
            self.config.max_delay
        )

        # Track backoff calculation in Sentry
        sentry_sdk.add_breadcrumb(
            category="recovery",
            message=f"Calculated backoff delay: {current_delay:.1f}s",
            level="info",
            data={
                "attempt": self.attempt_count,
                "delay": current_delay,
                "multiplier": self.config.backoff_multiplier
            }
        )

        return current_delay

    def should_retry(self) -> bool:
        """Check if reconnection should be attempted.

        Returns:
            bool: True if retry should be attempted, False otherwise
        """
        if self.config.max_retries is None:
            return True

        should_continue = self.attempt_count < self.config.max_retries

        if not should_continue:
            # Track max retries reached in Sentry as fatal error - manual intervention required
            error = RuntimeError(
                f"Maximum reconnection attempts reached: {self.attempt_count}/{self.config.max_retries}. "
                "Listener is unable to recover and requires manual intervention."
            )
            sentry_sdk.capture_exception(error, {'level': 'fatal'})

        return should_continue

    def reset(self) -> None:
        """Reset reconnection state after successful connection.

        Tracks successful recovery in Sentry with detailed metrics.
        """
        # Track successful recovery in Sentry if we had failures
        if self.attempt_count > 0:
            downtime_seconds = 0
            if self.last_failure_time:
                downtime_seconds = int(
                    (datetime.now(timezone.utc) - self.last_failure_time).total_seconds()
                )

            # Capture successful recovery with metrics
            sentry_sdk.capture_message(
                f"Listener recovered after {self.attempt_count} reconnection attempts",
                level="info"
            )

            # Track recovery metrics in Sentry
            sentry_sdk.set_context("recovery_success", {
                "attempts": self.attempt_count,
                "downtime_seconds": downtime_seconds,
                "final_delay": self.current_delay,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            # Add breadcrumb for recovery event
            sentry_sdk.add_breadcrumb(
                category="recovery",
                message="Connection recovered successfully",
                level="info",
                data={
                    "attempts": self.attempt_count,
                    "downtime_seconds": downtime_seconds
                }
            )

        # Reset state
        self.attempt_count = 0
        self.current_delay = self.config.initial_delay
        self.last_failure_time = None
        self.state = ConnectionState.CONNECTED

    def record_failure(self) -> None:
        """Record a connection failure and update state.

        Tracks each failure attempt in Sentry with detailed context.
        """
        # Capture crash detection before initiating recovery
        sentry_sdk.capture_message(
            'Crash detected, initiating recovery',
            level='warning'
        )
        sentry_sdk.set_context("crash_cause", {
            "previous_attempts": self.attempt_count,
            "last_failure": self.last_failure_time.isoformat() if self.last_failure_time else None,
            "current_state": self.state.value,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

        self.attempt_count += 1
        self.last_failure_time = datetime.now(timezone.utc)
        self.current_delay = self.calculate_next_delay()

        # Track failure attempt in Sentry with detailed context
        sentry_sdk.capture_message(
            f"Reconnection attempt {self.attempt_count} failed, retrying with {self.current_delay:.1f}s backoff",
            level="warning"
        )

        # Add failure context to Sentry
        sentry_sdk.set_context("recovery_attempt", {
            "attempt_number": self.attempt_count,
            "next_delay_seconds": self.current_delay,
            "backoff_multiplier": self.config.backoff_multiplier,
            "max_delay": self.config.max_delay,
            "state": self.state.value,
            "timestamp": self.last_failure_time.isoformat()
        })

        # Add breadcrumb for failure
        sentry_sdk.add_breadcrumb(
            category="recovery",
            message=f"Connection attempt {self.attempt_count} failed",
            level="warning",
            data={
                "attempt": self.attempt_count,
                "next_delay": self.current_delay,
                "state": self.state.value
            }
        )

        # Update state tag in Sentry
        sentry_sdk.set_tag("connection_state", self.state.value)
        sentry_sdk.set_tag("recovery_attempt", self.attempt_count)
