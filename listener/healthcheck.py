"""SnapTrade Listener — Healthcheck server."""

import logging
from datetime import datetime, timezone

import sentry_sdk
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

import listener_constants as constants
from listener_constants import (
    START_TIME, ENABLE_CRASH_ALERTS, ALERT_BOT_TOKEN, ALERT_CHAT_ID,
    BACKEND_URL, HEALTHCHECK_PORT,
)
from config import TELEGRAM_API_ID

logger = logging.getLogger("signal_matching")

def validate_config() -> None:
    """Validate required environment variables on startup."""
    errors = []

    # Check TELEGRAM_API_ID
    if not TELEGRAM_API_ID or TELEGRAM_API_ID == "REDACTED":
        errors.append("TELEGRAM_API_ID is not configured")

    # Check BACKEND_URL
    if not BACKEND_URL or BACKEND_URL == "REDACTED":
        errors.append("BACKEND_URL is not configured")

    # Check crash alert configuration if enabled
    if ENABLE_CRASH_ALERTS:
        if not ALERT_BOT_TOKEN or ALERT_BOT_TOKEN == "REDACTED":
            errors.append("ALERT_BOT_TOKEN is required when ENABLE_CRASH_ALERTS=true")
        if not ALERT_CHAT_ID or ALERT_CHAT_ID == "REDACTED":
            errors.append("ALERT_CHAT_ID is required when ENABLE_CRASH_ALERTS=true")

    if errors:
        logger.error("Configuration validation failed:")
        for error in errors:
            logger.error(f"  - {error}")
        sys.exit(1)

    logger.info("Configuration validation passed")


async def run_healthcheck_server(port: int, health_tracker=None, handlers=None):
    """Run a simple HTTP healthcheck server on the specified port.

    Args:
        port: The port to listen on for healthcheck requests
        health_tracker: Optional HealthTracker instance for metrics
        handlers: Optional dict of ChannelHandler instances for matching stats
    """
    from aiohttp import web

    async def health_handler(request):
        """Handle /health endpoint requests."""
        uptime = (
            int((datetime.now(timezone.utc) - START_TIME).total_seconds())
            if START_TIME
            else 0
        )

        # Determine health status
        is_healthy = health_tracker.is_healthy() if health_tracker else True
        status = "healthy" if is_healthy else "unhealthy"

        # Aggregate matching stats from all handlers
        matching_stats = {
            "exact_match": 0,
            "proximity_fallback_count": 0,
            "tier1": 0,
            "tier2": 0,
            "tier3": 0,
            "no_match": 0,
        }
        ambiguous_matches = 0
        if handlers:
            for handler in handlers.values():
                for key in matching_stats:
                    matching_stats[key] += handler.matching_stats.get(key, 0)
                ambiguous_matches += handler.ambiguous_matches

        response = {
            "status": status,
            "uptime": uptime,
            "messages": health_tracker.message_count if health_tracker else 0,
            "last_heartbeat": (
                health_tracker.last_heartbeat.isoformat()
                if health_tracker and health_tracker.last_heartbeat
                else None
            ),
            "errors": health_tracker.error_count if health_tracker else 0,
            "matching_stats": matching_stats,
            "ambiguous_matches": ambiguous_matches,
        }

        # Send Sentry alert if unhealthy
        if not is_healthy:
            sentry_sdk.capture_message(
                "Listener unhealthy", level="warning", extra=response
            )

        return web.json_response(response)

    async def metrics_handler(request):
        """Handle /metrics endpoint requests for Prometheus."""
        return web.Response(body=generate_latest(), content_type=CONTENT_TYPE_LATEST)

    app = web.Application()
    app.router.add_get("/health", health_handler)
    app.router.add_get("/metrics", metrics_handler)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()

