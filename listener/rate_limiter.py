"""Rate limiter module with Sentry monitoring for Telegram API throttling."""
import asyncio
import logging
import sentry_sdk
from telethon.errors import FloodWaitError

logger = logging.getLogger(__name__)


async def handle_rate_limit(error: FloodWaitError, alerter=None):
    """
    Handle Telegram rate limiting with Sentry monitoring.

    Args:
        error: FloodWaitError exception from Telegram
        alerter: Optional alerter instance for notifications
    """
    wait_seconds = error.seconds
    buffer = 5  # Add 5 second buffer
    total_wait = wait_seconds + buffer

    logger.warning(
        f"FloodWaitError: Telegram rate limit hit. "
        f"Waiting {wait_seconds}s + {buffer}s buffer = {total_wait}s"
    )

    # Monitor rate limiting with Sentry
    sentry_sdk.capture_message(
        'Rate limit exceeded',
        level='warning',
        extra={'wait_time': wait_seconds}
    )

    if alerter:
        await alerter.send_alert(
            f"Telegram rate limit hit. Waiting {total_wait}s before retry.",
            "Rate Limit"
        )

    await asyncio.sleep(total_wait)
