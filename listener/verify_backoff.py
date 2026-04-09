#!/usr/bin/env python3
"""Standalone verification of exponential backoff timing."""

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


if __name__ == '__main__':
    rm = ReconnectionManager(ReconnectionConfig())
    delays = []
    for i in range(9):
        delays.append(rm.calculate_next_delay())
        rm.attempt_count += 1

    print('Actual delays:', delays)
    expected = [1, 2, 4, 8, 16, 32, 60, 60, 60]
    print('Expected delays:', expected)
    print('Match:', delays == expected)

    if delays == expected:
        print('✓ Exponential backoff timing verified!')
        exit(0)
    else:
        print('✗ Backoff delays do not match expected sequence')
        exit(1)
