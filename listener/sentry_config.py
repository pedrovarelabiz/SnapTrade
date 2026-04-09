import os
import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration


def init_sentry():
    """Initialize Sentry SDK for channel monitoring listener."""
    sentry_dsn = os.getenv("SENTRY_DSN")

    if not sentry_dsn:
        return

    sentry_sdk.init(
        dsn=sentry_dsn,
        traces_sample_rate=0.1,
        integrations=[
            LoggingIntegration(
                level=None,  # Capture all levels
                event_level=None  # Send all logs as breadcrumbs
            ),
        ],
        environment=os.getenv("ENVIRONMENT", "production"),
        release=os.getenv("RELEASE_VERSION"),
        before_send=_add_channel_context,
    )

    # Set default tags for channel monitoring context
    sentry_sdk.set_tag("service", "listener")
    sentry_sdk.set_tag("component", "telegram-listener")


def _add_channel_context(event, hint):
    """Add custom channel monitoring context to Sentry events."""
    # Filter out connection timeout errors (common with Telegram)
    if 'exception' in event:
        for exception in event.get('exception', {}).get('values', []):
            exc_type = exception.get('type', '')
            exc_value = exception.get('value', '')

            # Filter connection timeouts
            if 'timeout' in exc_value.lower() or 'ConnectionError' in exc_type:
                return None  # Drop event

    # Strip message content for privacy
    if 'extra' in event:
        if 'message_text' in event['extra']:
            event['extra']['message_text'] = '[REDACTED]'
        if 'message_content' in event['extra']:
            event['extra']['message_content'] = '[REDACTED]'

    # Custom fingerprinting for parser errors
    if 'exception' in event:
        for exception in event.get('exception', {}).get('values', []):
            exc_type = exception.get('type', '')
            exc_value = exception.get('value', '')

            # Group parser errors by type
            if 'parse' in exc_type.lower() or 'parse' in exc_value.lower():
                event['fingerprint'] = ['parser-error', exc_type]

    return event
