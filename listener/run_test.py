#!/usr/bin/env python3
"""Run reconnection tests without pytest dependency."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class ReconnectionConfig:
    """Configuration for exponential backoff reconnection strategy."""
    initial_delay: float = 1
    max_delay: float = 60
    backoff_multiplier: float = 2
    max_retries: Optional[int] = None


class ReconnectionManager:
    """Manages reconnection attempts with exponential backoff."""

    def __init__(self, config: ReconnectionConfig):
        self.config = config
        self.attempt_count = 0

    def calculate_next_delay(self) -> float:
        """Calculate next delay using exponential backoff."""
        delay = min(
            self.config.initial_delay * (self.config.backoff_multiplier ** self.attempt_count),
            self.config.max_delay
        )
        return delay

    def reset(self):
        """Reset the backoff state after successful connection."""
        self.attempt_count = 0


def test_exponential_backoff():
    """Test exponential backoff timing with default configuration.

    Verifies that delays follow the expected sequence:
    1s, 2s, 4s, 8s, 16s, 32s, 60s (capped), 60s, 60s
    """
    # Create manager with default config (initial_delay=1, max_delay=60, backoff_multiplier=2)
    config = ReconnectionConfig()
    manager = ReconnectionManager(config)

    # Expected delays: exponential growth until capped at max_delay
    expected_delays = [1, 2, 4, 8, 16, 32, 60, 60, 60]
    actual_delays = []

    # Calculate delays for 9 attempts
    for i in range(9):
        delay = manager.calculate_next_delay()
        actual_delays.append(delay)
        manager.attempt_count += 1  # Simulate moving to next attempt

    assert actual_delays == expected_delays, (
        f"Backoff delays don't match expected sequence.\n"
        f"Expected: {expected_delays}\n"
        f"Actual: {actual_delays}"
    )

    # Verify backoff multiplier is working correctly
    assert actual_delays[1] == actual_delays[0] * config.backoff_multiplier
    assert actual_delays[2] == actual_delays[0] * (config.backoff_multiplier ** 2)
    assert actual_delays[3] == actual_delays[0] * (config.backoff_multiplier ** 3)

    # Verify capping at max_delay
    assert all(delay <= config.max_delay for delay in actual_delays)
    assert actual_delays[6] == config.max_delay
    assert actual_delays[7] == config.max_delay
    assert actual_delays[8] == config.max_delay


def test_exponential_backoff_custom_config():
    """Test exponential backoff with custom configuration."""
    config = ReconnectionConfig(
        initial_delay=2,
        max_delay=32,
        backoff_multiplier=3
    )
    manager = ReconnectionManager(config)

    # Expected: 2, 6, 18, 32 (capped), 32, 32
    expected_delays = [2, 6, 18, 32, 32, 32]
    actual_delays = []

    for i in range(6):
        delay = manager.calculate_next_delay()
        actual_delays.append(delay)
        manager.attempt_count += 1

    assert actual_delays == expected_delays


def test_reset_after_success():
    """Test that reset() properly resets the backoff state."""
    config = ReconnectionConfig()
    manager = ReconnectionManager(config)

    # Advance to several attempts
    for i in range(5):
        manager.calculate_next_delay()
        manager.attempt_count += 1

    # Should be at 32s delay now
    assert manager.calculate_next_delay() == 32

    # Reset after successful connection
    manager.reset()

    # Should be back to initial delay
    assert manager.attempt_count == 0
    assert manager.calculate_next_delay() == config.initial_delay


if __name__ == '__main__':
    try:
        test_exponential_backoff()
        print('✓ test_exponential_backoff PASSED')

        test_exponential_backoff_custom_config()
        print('✓ test_exponential_backoff_custom_config PASSED')

        test_reset_after_success()
        print('✓ test_reset_after_success PASSED')

        print('\n✓ All tests PASSED!')
        exit(0)
    except AssertionError as e:
        print(f'✗ Test FAILED: {e}')
        exit(1)
