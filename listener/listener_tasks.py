"""SnapTrade Listener — Background tasks (signal_activator, timeout_checker)."""

import asyncio
import gc
import logging
from datetime import datetime, timedelta

import sentry_sdk

from listener_constants import UTC, SIGNAL_ACTIVATE_DELAY_SEC, SIGNAL_TIMEOUT_MIN
from api_client_mod import api_post, api_patch
from alerting import send_alert

logger = logging.getLogger("signal_matching")

async def signal_activator(handlers: dict, session):
    while True:
        try:
            now = datetime.now(UTC)
            for handler in handlers.values():
                try:
                    for sig in handler.active_signals:
                        if sig.get("status") != "pending":
                            continue
                        entry = datetime.fromisoformat(
                            sig["entryTimeUtc"].replace("Z", "+00:00")
                        )
                        if entry.tzinfo is None:
                            entry = entry.replace(tzinfo=UTC)
                        if (entry - now).total_seconds() <= 30:
                            result = await api_post(
                                session, f"/signals/{sig['id']}/activate", {}
                            )
                            if result:
                                sig["status"] = "active"
                                logger.info(
                                    f"[{handler.slug}] Activated {sig['id']} "
                                    f"({sig['asset']} {sig['direction']})"
                                )
                except Exception as e:
                    logger.error(
                        f"Signal activator error for channel [{handler.slug}]: {e}"
                    )
                    sentry_sdk.capture_exception(e)
                    gc.collect()
        except Exception as e:
            logger.error(f"Signal activator error: {e}")
            sentry_sdk.capture_exception(e)
            gc.collect()
        await asyncio.sleep(SIGNAL_ACTIVATE_DELAY_SEC)


async def timeout_checker(handlers: dict, session):
    while True:
        try:
            now = datetime.now(UTC)
            for handler in handlers.values():
                try:
                    to_expire = []
                    for sig in handler.active_signals:
                        if sig.get("status") in ("resolved", "expired"):
                            continue
                        entry = datetime.fromisoformat(
                            sig["entryTimeUtc"].replace("Z", "+00:00")
                        )
                        if entry.tzinfo is None:
                            entry = entry.replace(tzinfo=UTC)
                        if (now - entry).total_seconds() / 60 > SIGNAL_TIMEOUT_MIN:
                            to_expire.append(sig)

                    for sig in to_expire:
                        result = await api_patch(
                            session,
                            f"/signals/{sig['id']}/status",
                            {"status": "expired"},
                        )
                        if result:
                            sig["status"] = "expired"
                            logger.info(f"[{handler.slug}] Expired {sig['id']}")

                    # Cleanup old entries
                    cutoff = now - timedelta(hours=1)
                    handler.active_signals[:] = [
                        s
                        for s in handler.active_signals
                        if s.get("status") not in ("resolved", "expired")
                        or datetime.fromisoformat(
                            s["entryTimeUtc"].replace("Z", "+00:00")
                        ).replace(tzinfo=UTC)
                        > cutoff
                    ]

                    # Alert if channel silent >4h during active hours (08-22 UTC)
                    if handler.last_signal_at and 8 <= now.hour <= 22:
                        silent_h = (now - handler.last_signal_at).total_seconds() / 3600
                        if silent_h > 4 and not handler._silence_alerted:
                            handler._silence_alerted = True
                            await send_alert(
                                session,
                                f"Channel {handler.slug} silent for {silent_h:.1f}h",
                            )
                except Exception as e:
                    logger.error(
                        f"Timeout checker error for channel [{handler.slug}]: {e}"
                    )
                    sentry_sdk.capture_exception(e)
                    gc.collect()
        except Exception as e:
            logger.error(f"Timeout checker error: {e}")
            sentry_sdk.capture_exception(e)
            gc.collect()
        await asyncio.sleep(60)


# --- Main ---
