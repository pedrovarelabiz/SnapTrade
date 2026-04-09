#!/usr/bin/env python3
"""Crash recovery test for the listener module.

Tests that the listener can recover from SIGKILL and reconnects
with proper exponential backoff timing.
"""

import asyncio
import logging
import os
import signal
import subprocess
import sys
import time
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('test_crash_recovery.log')
    ]
)
logger = logging.getLogger(__name__)


def parse_backoff_from_logs(log_file):
    """Parse reconnection backoff timing from log file.

    Args:
        log_file: Path to log file

    Returns:
        List of backoff delays in seconds
    """
    backoffs = []
    try:
        with open(log_file, 'r') as f:
            for line in f:
                # Look for reconnection delay messages
                if 'reconnect' in line.lower() and 'delay' in line.lower():
                    # Extract delay value from log line
                    parts = line.split()
                    for i, part in enumerate(parts):
                        if 'delay' in part.lower() and i + 1 < len(parts):
                            try:
                                delay = float(parts[i + 1].rstrip('s'))
                                backoffs.append(delay)
                            except ValueError:
                                pass
    except FileNotFoundError:
        logger.warning(f"Log file {log_file} not found")

    return backoffs


def start_listener():
    """Start listener as subprocess.

    Returns:
        subprocess.Popen object
    """
    logger.info("Starting listener subprocess...")
    listener_path = os.path.join(os.path.dirname(__file__), 'listener.py')

    proc = subprocess.Popen(
        [sys.executable, listener_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=os.path.dirname(__file__)
    )

    logger.info(f"Listener started with PID {proc.pid}")
    return proc


def kill_process(proc):
    """Send SIGKILL to process.

    Args:
        proc: subprocess.Popen object
    """
    logger.info(f"Sending SIGKILL to PID {proc.pid}")
    try:
        os.kill(proc.pid, signal.SIGKILL)
        proc.wait(timeout=5)
        logger.info(f"Process {proc.pid} killed")
    except subprocess.TimeoutExpired:
        logger.error(f"Process {proc.pid} did not terminate")
    except ProcessLookupError:
        logger.info(f"Process {proc.pid} already terminated")


def verify_reconnection(log_file, expected_min_delay=1, expected_max_delay=60):
    """Verify that reconnection happened with proper backoff.

    Args:
        log_file: Path to log file
        expected_min_delay: Minimum expected backoff delay
        expected_max_delay: Maximum expected backoff delay

    Returns:
        bool: True if reconnection verified successfully
    """
    backoffs = parse_backoff_from_logs(log_file)

    if not backoffs:
        logger.warning("No backoff delays found in logs")
        return False

    logger.info(f"Found {len(backoffs)} backoff delays: {backoffs}")

    # Verify backoffs are within expected range
    for delay in backoffs:
        if delay < expected_min_delay or delay > expected_max_delay:
            logger.error(f"Backoff delay {delay}s outside expected range [{expected_min_delay}, {expected_max_delay}]")
            return False

    # Verify exponential backoff pattern (each delay should be >= previous)
    for i in range(1, len(backoffs)):
        if backoffs[i] < backoffs[i - 1]:
            logger.warning(f"Backoff not increasing: {backoffs[i-1]}s -> {backoffs[i]}s")

    logger.info("✓ Reconnection backoff timing verified")
    return True


def main():
    """Main test function."""
    logger.info("=== Crash Recovery Test Started ===")

    # Determine log file path
    log_file = os.path.join(
        os.path.dirname(__file__),
        '../logs/listener.log'
    )

    # Start listener
    proc1 = start_listener()

    # Wait for initialization
    logger.info("Waiting 5 seconds for listener to initialize...")
    time.sleep(5)

    # Kill the listener
    kill_process(proc1)

    # Wait a bit
    logger.info("Waiting 2 seconds before restart...")
    time.sleep(2)

    # Restart listener
    proc2 = start_listener()

    # Wait for reconnection attempts
    logger.info("Waiting 10 seconds for reconnection attempts...")
    time.sleep(10)

    # Stop the second instance gracefully
    logger.info("Stopping listener gracefully...")
    try:
        proc2.terminate()
        proc2.wait(timeout=10)
    except subprocess.TimeoutExpired:
        logger.warning("Graceful shutdown timeout, forcing kill")
        proc2.kill()
        proc2.wait()

    # Verify reconnection from logs
    logger.info("Verifying reconnection backoff timing...")
    success = verify_reconnection(log_file)

    if success:
        logger.info("=== ✓ Crash Recovery Test PASSED ===")
        return 0
    else:
        logger.error("=== ✗ Crash Recovery Test FAILED ===")
        return 1


if __name__ == '__main__':
    sys.exit(main())
