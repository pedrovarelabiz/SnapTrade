"""SnapTrade — Multi-Channel Telegram Listener.

Listens to all configured channels simultaneously, routes messages
to the correct parser, and forwards signals/results to the backend API.
"""

import os as _os, sys as _sys
import listener_constants as _lc
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

# Re-export all symbols that tests and other modules import
from listener_constants import *  # noqa: F401,F403
from listener_constants import (
    VERSION, UTC, BACKEND_URL, API_BASE, INTERNAL_API_KEY,
    SIGNAL_ACTIVATE_DELAY_SEC, SIGNAL_TIMEOUT_MIN,
    ALERT_BOT_TOKEN, ALERT_CHAT_ID, ENABLE_CRASH_ALERTS,
    HEALTHCHECK_PORT, MAX_RECONNECT_DELAY, INITIAL_RECONNECT_DELAY,
    exact_match_total, signal_matches_proximity_fallback_total,
    ambiguous_attribution_total, expiration_delta_seconds,
    signal_matches_exact_expiration_total, signal_race_conditions_detected_total,
    signal_matching_duration_seconds,
    tier1_matches, tier2_matches, tier3_matches,
    SIGNAL_MATCHING_DEBUG, EXACT_MATCH_TOLERANCE_SECONDS,
    PROXIMITY_MATCH_WINDOW_MINUTES, EXPIRATION_MATCH_TOLERANCE_SECONDS,
    EXPIRATION_MATCH_TOLERANCE, HEALTH_CHECK_INTERVAL_SEC,
    RECENT_EXCEPTIONS, MESSAGE_COUNT, START_TIME, SHUTDOWN_ALERTER,
    shutdown_requested,
)
from logging_setup import setup_logging
from alerting import TelegramAlerter, send_alert, format_crash_report
from connection import (
    ConnectionState, ReconnectionConfig, ConnectionMetrics,
    ReconnectionManager, HealthTracker, handle_shutdown,
    run_with_reconnection, record_exception, save_metrics_periodically,
)
from signal_matching_mod import (
    parse_martingale_time, calculate_expiration_time,
    find_matching_signal, find_matching_signal_proximity_only,
    find_by_exact_expiration, extract_gale_level_from_text,
    determine_gale_level, log_matching_stats,
    _find_by_exact_expiration_test, _find_by_exact_expiration_legacy,
)
from api_client_mod import api_post, api_patch, api_get
from channel_handler import ChannelHandler
from listener_tasks import signal_activator, timeout_checker
from healthcheck import validate_config, run_healthcheck_server

import asyncio
import gc
import json
import logging
import os
import signal
import sys
import time
from datetime import datetime, timezone
from typing import Dict

import aiohttp
import sentry_sdk
from telethon import TelegramClient, events
from telethon.errors import FloodWaitError, AuthKeyError, PhoneNumberInvalidError

sys.path.insert(0, os.path.dirname(__file__))

from config import (
    TELEGRAM_API_ID,
    TELEGRAM_API_HASH,
    TELEGRAM_PHONE,
    SESSION_NAME,
    LOGS_DIR,
)
from sentry_config import init_sentry

# Setup logging
logger = setup_logging()



async def main():
    logger.info("Starting SnapTrade Multi-Channel Listener...")

    # Load and log previous session metrics if available
    metrics_file = os.path.join("listener", "metrics.json")
    if os.path.exists(metrics_file):
        try:
            with open(metrics_file, "r", encoding="utf-8") as f:
                prev_metrics = json.load(f)
            messages = prev_metrics.get("message_count", 0)
            uptime = prev_metrics.get("uptime", 0)
            errors = prev_metrics.get("error_count", 0)
            logger.info(
                f"Previous session: {messages} messages, {uptime}s uptime, {errors} errors"
            )
        except (IOError, OSError, json.JSONDecodeError) as e:
            sentry_sdk.capture_exception(e)
            logger.warning(f"Failed to load previous metrics: {e}")

    # Validate configuration on startup
    validate_config()

    try:
        client = TelegramClient(
            os.path.join(os.path.dirname(__file__), SESSION_NAME),
            TELEGRAM_API_ID,
            TELEGRAM_API_HASH,
        )

        # Register SIGTERM handler for graceful shutdown
        alerter = _lc.SHUTDOWN_ALERTER
        loop = asyncio.get_running_loop()
        loop.add_signal_handler(
            signal.SIGTERM,
            lambda: asyncio.ensure_future(
                handle_shutdown("SIGTERM", client, alerter)
            ),
        )
        loop.add_signal_handler(
            signal.SIGINT,
            lambda: asyncio.ensure_future(
                handle_shutdown("SIGINT", client, alerter)
            ),
        )

        await client.start(phone=TELEGRAM_PHONE)
        logger.info("Telegram client connected")
    except (ValueError, AuthKeyError, PhoneNumberInvalidError) as e:
        sentry_sdk.capture_exception(e)
        logger.error(f"Authentication failed: {type(e).__name__}: {e}")
        logger.error(
            "Please check your Telegram credentials (API_ID, API_HASH, PHONE) and session file."
        )
        sys.exit(1)

    async with aiohttp.ClientSession() as session:
        # Initialize health tracker and metrics
        health_tracker = HealthTracker()
        connection_metrics = ConnectionMetrics()

        # Load channel configs from API (retry up to 5 times for API startup race)
        channels_data = None
        for attempt in range(5):
            channels_data = await api_get(session, "/channels")
            if channels_data:
                break
            wait = 5 * (attempt + 1)
            logger.warning(
                f"API not ready (attempt {attempt + 1}/5), retrying in {wait}s..."
            )
            await asyncio.sleep(wait)
        if not channels_data:
            logger.error("Failed to load channels from API after 5 attempts.")
            channels_data = []

        # Build handlers and resolve Telegram entities
        handlers: dict[int, ChannelHandler] = {}
        channel_entities = []

        # Build dialog index for name matching
        dialog_index = {}
        async for dialog in client.iter_dialogs():
            dialog_index[dialog.name] = dialog
            if dialog.entity and hasattr(dialog.entity, "id"):
                dialog_index[str(dialog.entity.id)] = dialog

        for ch_config in channels_data:
            try:
                if not ch_config.get("isActive", True):
                    continue

                handler = ChannelHandler(ch_config, health_tracker)

                # Resolve Telegram entity
                entity = None
                if handler.telegram_id:
                    # Try by numeric ID
                    tg_key = str(handler.telegram_id)
                    if tg_key in dialog_index:
                        entity = dialog_index[tg_key].entity

                if not entity:
                    # Try by name
                    if handler.telegram_name in dialog_index:
                        entity = dialog_index[handler.telegram_name].entity

                if not entity:
                    # Fuzzy match
                    for dname, dialog in dialog_index.items():
                        if (
                            isinstance(dname, str)
                            and handler.telegram_name.lower() in dname.lower()
                        ):
                            entity = dialog.entity
                            break

                if entity:
                    entity_id = entity.id
                    handlers[entity_id] = handler
                    channel_entities.append(entity)
                    logger.info(
                        f"Channel [{handler.slug}] -> entity {entity_id} ({handler.telegram_name})"
                    )
                else:
                    logger.warning(
                        f"Channel [{handler.slug}] could not resolve Telegram entity for '{handler.telegram_name}'"
                    )
            except Exception as e:
                sentry_sdk.capture_exception(e)
                channel_name = ch_config.get("slug", ch_config.get("name", "unknown"))
                logger.error(
                    f"Failed to process channel [{channel_name}]: {e}", exc_info=True
                )
                # Cleanup memory after channel processing errors
                gc.collect()
                continue

        if not handlers:
            logger.error("No channels resolved. Exiting.")
            return

        logger.info(f"Listening on {len(handlers)} channels")

        # Set Sentry context for telethon channels
        channel_list = [h.slug for h in handlers.values()]
        sentry_sdk.set_context("telethon", {"channels": channel_list})

        await alerter.send_alert(
            f"🚀 Listener Started\n\nVersion: {VERSION}\nChannels: {len(handlers)}\nCrash recovery: Enabled",
            "INFO",
        )

        # Recover active signals
        active_data = await api_get(session, "/signals/active")
        if active_data and isinstance(active_data, list):
            for sig in active_data:
                ch_id = sig.get("channelId")
                for handler in handlers.values():
                    try:
                        if handler.channel_id == ch_id:
                            handler.active_signals.append(sig)
                            break
                    except Exception as e:
                        sentry_sdk.capture_exception(e)
                        logger.error(
                            f"Failed to recover signal for channel [{handler.slug}]: {e}"
                        )
            logger.info(f"Recovered {len(active_data)} active signals")

        # Start background tasks
        asyncio.create_task(signal_activator(handlers, session))
        asyncio.create_task(timeout_checker(handlers, session))
        asyncio.create_task(
            save_metrics_periodically(connection_metrics, health_tracker)
        )

        # Build ID lookup for all registered channels (positive and -100-prefixed)
        handler_lookup: dict[int, ChannelHandler] = {}
        for eid, h in handlers.items():
            try:
                handler_lookup[eid] = h
                handler_lookup[-eid] = h
                # Telegram channels use -100 prefix: -100XXXXXXXXXX
                handler_lookup[int(f"-100{eid}")] = h
            except Exception as e:
                sentry_sdk.capture_exception(e)
                logger.error(f"Failed to build ID lookup for channel [{h.slug}]: {e}")

        @client.on(events.NewMessage())
        async def handler_fn(event):
            try:
                health_tracker.record_message()
                chat_id = event.chat_id
                handler = handler_lookup.get(chat_id)
                if not handler:
                    return

                sentry_sdk.add_breadcrumb(
                    category="telegram",
                    message="Message received",
                    data={"channel": handler.channel_id},
                )
                text = event.message.message

                # Pocket VIP: handle all messages (stickers, photos, text) via OCR parser
                if (
                    handler.source_format == "pocket_vip_sticker"
                    and handler.pocket_vip_parser
                ):
                    msg_id = event.message.id
                    msg_date = event.message.date
                    if msg_date.tzinfo is None:
                        msg_date = msg_date.replace(tzinfo=UTC)
                    msg_date = msg_date.astimezone(UTC)
                    try:
                        parsed = await handler.pocket_vip_parser.process_message(
                            event.message
                        )
                    except Exception as e:
                        sentry_sdk.capture_exception(e)
                        logger.error(f"Failed to parse signal: {e}")
                        health_tracker.record_error()
                        # Cleanup memory after processing errors
                        if "parsed" in locals():
                            del parsed
                        gc.collect()
                        return
                    if not parsed:
                        return
                    handler.last_signal_at = datetime.now(UTC)
                    handler._silence_alerted = False
                    if parsed.get("type") == "signal":
                        raw_text = (
                            text[:500]
                            if text
                            else f"[PV] {parsed['asset']} {parsed['direction']}"
                        )
                        martingale_times = parsed.get("martingale_times", [])
                        expiration_minutes = (
                            martingale_times[0]
                            if martingale_times
                            else parsed.get("expiration_minutes", 5)
                        )
                        expiration_time = calculate_expiration_time(
                            msg_date, [expiration_minutes * 60]
                        )
                        logger.info(
                            f"Sending signal for {parsed['asset']} expiring at {expiration_time}"
                        )
                        api_result = await api_post(
                            session,
                            "/signals",
                            {
                                "telegramMsgId": msg_id,
                                "channelId": handler.channel_id,
                                "asset": parsed["asset"],
                                "direction": parsed["direction"],
                                "entryTimeUtc": parsed["entry_time_utc"],
                                "expirationMinutes": parsed.get(
                                    "expiration_minutes", 5
                                ),
                                "expirationTime": expiration_time.isoformat(),
                                "formatVersion": 99,
                                "martingaleTimes": parsed.get("martingale_times", []),
                                "rawText": raw_text,
                            },
                        )
                        if api_result:
                            api_result["expiration_time"] = expiration_time
                            handler.active_signals.append(api_result)
                            logger.info(
                                f"[{handler.slug}] PV Signal: {parsed['asset']} "
                                f"{parsed['direction']} (tf={parsed.get('expiration_minutes', 5)}m) "
                                f"Expires: {expiration_time.strftime('%H:%M:%S')}"
                            )
                    elif parsed.get("type") == "result":
                        # PV results don't include asset info, rely on time-only matching.
                        # Extract iteration for matching
                        result_iteration = parsed.get("gale_level")
                        if result_iteration is None:
                            result_iteration = (
                                extract_gale_level_from_text(text) if text else None
                            )
                        if result_iteration is None:
                            result_iteration = 0
                            logger.warning(
                                f"[{handler.slug}] Could not determine iteration for result #{msg_id}, defaulting to 0"
                            )
                        _raw_result = handler.find_matching_signal_proximity_only(
                            msg_date,
                            asset=parsed.get("asset"),
                            direction=parsed.get("direction"),
                        )
                        if _raw_result is not None:
                            if isinstance(_raw_result, tuple):
                                matching, confidence = _raw_result
                                match_tier = 2
                            else:
                                matching, confidence = _raw_result, 1.0
                                match_tier = 1
                            is_win = parsed.get("is_win", False)
                            # Detect gale level: first from parser, then from text, finally default to 0
                            gale_level = parsed.get("gale_level")
                            if gale_level is None:
                                gale_level = (
                                    extract_gale_level_from_text(text) if text else None
                                )
                            if gale_level is None:
                                gale_level = 0
                            outcome = "win" if is_win else "loss"
                            logger.info(
                                f"[{handler.slug}] Signal matched with tier={match_tier}, confidence={confidence:.2f}, "
                                f"signal_id={matching.get('id')}, asset={matching.get('asset')}"
                            )
                            if confidence == 1.0:
                                signal_matches_exact_expiration_total.labels(
                                    asset=matching.get("asset", "unknown"),
                                    outcome=outcome,
                                ).inc()
                            api_result = await api_patch(
                                session,
                                f"/signals/{matching['id']}/result",
                                {
                                    "result": outcome,
                                    "galeLevel": gale_level,
                                    "resultMsgId": msg_id,
                                    "matchTier": match_tier,
                                    "matchConfidence": confidence,
                                },
                            )
                            if api_result:
                                matching["status"] = "resolved"
                                logger.info(
                                    f"[{handler.slug}] PV Result: "
                                    f"{'WIN' if is_win else 'LOSS'} (g{gale_level}) [confidence={confidence:.2f}]"
                                )
                        else:
                            logger.warning(
                                f"[{handler.slug}] PV no match for result #{msg_id}",
                                extra={
                                    "match_type": "pv_no_match",
                                    "asset": None,
                                    "signal_id": None,
                                    "confidence": None,
                                    "delta_seconds": None,
                                },
                            )
                    # Cleanup memory after processing large images
                    del parsed
                    gc.collect()
                    return  # Pocket VIP handled — do not fall through to text-based parsing

                if not text:
                    return

                msg_id = event.message.id
                msg_date = event.message.date
                if msg_date.tzinfo is None:
                    msg_date = msg_date.replace(tzinfo=UTC)
                msg_date = msg_date.astimezone(UTC)

                logger.info(f"[{handler.slug}] #{msg_id}: {text[:80]}...")

                parsed_items = None
                try:
                    parsed_items = handler.parse(text, msg_id, msg_date)
                except Exception as e:
                    sentry_sdk.capture_exception(e)
                    logger.error(f"Failed to parse signal: {e}")
                    health_tracker.record_error()
                    # Cleanup memory after processing errors
                    gc.collect()
                    return
                if not parsed_items:
                    return

                handler.last_signal_at = datetime.now(UTC)
                handler._silence_alerted = False

                for parsed in parsed_items:
                    if parsed is None:
                        continue

                    if handler.is_inline_format():
                        # Inline format: combined or separate signal/result
                        if parsed.get("type") == "inline_signal":
                            expiration_time = calculate_expiration_time(
                                msg_date, [5 * 60]
                            )
                            logger.info(
                                f"Sending signal for {parsed['asset']} expiring at {expiration_time}"
                            )
                            api_result = await api_post(
                                session,
                                "/signals",
                                {
                                    "telegramMsgId": msg_id,
                                    "channelId": handler.channel_id,
                                    "asset": parsed["asset"],
                                    "direction": parsed["direction"],
                                    "entryTimeUtc": parsed["entry_time_utc"],
                                    "expirationMinutes": 5,
                                    "expirationTime": expiration_time.isoformat(),
                                    "formatVersion": 99,
                                    "martingaleTimes": [],
                                    "rawText": text[:500],
                                    "status": "resolved",
                                    "result": "win" if parsed["is_win"] else "loss",
                                    "galeLevel": parsed["gale_level"],
                                },
                            )
                            if api_result:
                                logger.info(
                                    f"[{handler.slug}] Inline signal+result: "
                                    f"{parsed['asset']} {parsed['direction']} -> "
                                    f"{'WIN' if parsed['is_win'] else 'LOSS'}"
                                )
                        elif parsed.get("type") == "signal":
                            # Signal-only (current format: separate result message)
                            martingale_times = parsed.get("martingale_times", [])
                            expiration_minutes = (
                                martingale_times[0]
                                if martingale_times
                                else parsed.get("expiration_minutes", 5)
                            )
                            expiration_time = calculate_expiration_time(
                                msg_date, [expiration_minutes * 60]
                            )
                            logger.info(
                                f"Sending signal for {parsed['asset']} expiring at {expiration_time}"
                            )
                            api_result = await api_post(
                                session,
                                "/signals",
                                {
                                    "telegramMsgId": msg_id,
                                    "channelId": handler.channel_id,
                                    "asset": parsed["asset"],
                                    "direction": parsed["direction"],
                                    "entryTimeUtc": parsed["entry_time_utc"],
                                    "expirationMinutes": parsed.get(
                                        "expiration_minutes", 5
                                    ),
                                    "expirationTime": expiration_time.isoformat(),
                                    "formatVersion": parsed.get("format_version", 99),
                                    "martingaleTimes": parsed.get(
                                        "martingale_times", []
                                    ),
                                    "rawText": text[:500],
                                },
                            )
                            if api_result:
                                api_result["expiration_time"] = expiration_time
                                handler.active_signals.append(api_result)
                                logger.info(
                                    f"[{handler.slug}] Signal (pending): "
                                    f"{parsed['asset']} {parsed['direction']}"
                                )
                        elif parsed.get("type") == "result":
                            # Informal result message — match to active signal
                            # Extract iteration for matching
                            result_iteration = parsed.get("gale_level")
                            if result_iteration is None:
                                result_iteration = (
                                    extract_gale_level_from_text(text) if text else None
                                )
                            if result_iteration is None:
                                result_iteration = 0
                                logger.warning(
                                    f"[{handler.slug}] Could not determine iteration for result #{msg_id}, defaulting to 0"
                                )
                            _raw_result = handler.find_matching_signal_proximity_only(
                                msg_date,
                                asset=parsed.get("asset"),
                                direction=parsed.get("direction"),
                            )
                            if _raw_result is not None:
                                if isinstance(_raw_result, tuple):
                                    matching, confidence = _raw_result
                                    match_tier = 2
                                else:
                                    matching, confidence = _raw_result, 1.0
                                    match_tier = 1
                                # Detect gale level: first from parser, then from text, finally default to 0
                                gale_level = parsed.get("gale_level")
                                if gale_level is None:
                                    gale_level = extract_gale_level_from_text(text)
                                if gale_level is None:
                                    gale_level = 0
                                logger.info(
                                    f"[{handler.slug}] Signal matched with tier={match_tier}, confidence={confidence:.2f}, "
                                    f"signal_id={matching.get('id')}, asset={matching.get('asset')}"
                                )
                                if confidence == 1.0:
                                    signal_matches_exact_expiration_total.labels(
                                        asset=matching.get("asset", "unknown"),
                                        outcome=parsed["result"],
                                    ).inc()
                                api_result = await api_patch(
                                    session,
                                    f"/signals/{matching['id']}/result",
                                    {
                                        "result": parsed["result"],
                                        "galeLevel": gale_level,
                                        "resultMsgId": msg_id,
                                        "matchTier": match_tier,
                                        "matchConfidence": confidence,
                                    },
                                )
                                if api_result:
                                    matching["status"] = "resolved"
                                    logger.info(
                                        f"[{handler.slug}] Informal result: "
                                        f"{matching['asset']} -> {parsed['result'].upper()} "
                                        f"(g{parsed.get('gale_level', 0)}) [confidence={confidence:.2f}]"
                                    )
                            else:
                                logger.warning(
                                    f"[{handler.slug}] Result but no match: "
                                    f"'{text[:80]}'"
                                )
                    else:
                        # Non-inline: separate signal and result messages
                        if parsed.get("type") == "signal":
                            martingale_times = parsed["martingale_times"]
                            expiration_minutes = (
                                martingale_times[0]
                                if martingale_times
                                else parsed["expiration_minutes"]
                            )
                            expiration_time = calculate_expiration_time(
                                msg_date, [expiration_minutes * 60]
                            )
                            logger.info(
                                f"Sending signal for {parsed['asset']} expiring at {expiration_time}"
                            )
                            api_result = await api_post(
                                session,
                                "/signals",
                                {
                                    "telegramMsgId": msg_id,
                                    "channelId": handler.channel_id,
                                    "asset": parsed["asset"],
                                    "direction": parsed["direction"],
                                    "entryTimeUtc": parsed["entry_time_utc"],
                                    "expirationMinutes": parsed["expiration_minutes"],
                                    "expirationTime": expiration_time.isoformat(),
                                    "formatVersion": parsed["format_version"],
                                    "martingaleTimes": parsed["martingale_times"],
                                    "rawText": text[:500],
                                },
                            )
                            if api_result:
                                api_result["expiration_time"] = expiration_time
                                handler.active_signals.append(api_result)
                                logger.info(
                                    f"[{handler.slug}] Signal: {parsed['asset']} "
                                    f"{parsed['direction']} at {parsed['entry_time_utc']} "
                                    f"Expires: {expiration_time.strftime('%H:%M:%S')}"
                                )

                        elif parsed.get("type") == "gale":
                            # Gale message (VIP OTC Market): "prepared Martin N"
                            # Means trade at level N-2 lost, now entering level N-1
                            # We don't resolve yet — wait for next signal or final result
                            logger.info(
                                f"[{handler.slug}] Gale step {parsed.get('level', '?')}"
                            )

                        elif parsed.get("type") == "result":
                            # Extract iteration for matching
                            result_iteration = parsed.get("gale_level")
                            if result_iteration is None:
                                result_iteration = (
                                    extract_gale_level_from_text(text) if text else None
                                )
                            if result_iteration is None:
                                result_iteration = 0
                                logger.warning(
                                    f"[{handler.slug}] Could not determine iteration for result #{msg_id}, defaulting to 0"
                                )
                            _raw_result = handler.find_matching_signal_proximity_only(
                                msg_date,
                                asset=parsed.get("asset"),
                                direction=parsed.get("direction"),
                            )
                            if not _raw_result:
                                logger.warning(
                                    f"[{handler.slug}] No match for result #{msg_id}"
                                )
                                continue

                            if isinstance(_raw_result, tuple):
                                matching, confidence = _raw_result
                                match_tier = 2
                            else:
                                matching, confidence = _raw_result, 1.0
                                match_tier = 1
                            is_win = parsed["result_type"] != "loss"
                            outcome = "win" if is_win else "loss"
                            logger.info(
                                f"[{handler.slug}] Signal matched with tier={match_tier}, confidence={confidence:.2f}, "
                                f"signal_id={matching.get('id')}, asset={matching.get('asset')}"
                            )
                            if confidence == 1.0:
                                signal_matches_exact_expiration_total.labels(
                                    asset=matching.get("asset", "unknown"),
                                    outcome=outcome,
                                ).inc()
                            # Detect gale level: parser -> text -> time-based -> victory check
                            gale_level = parsed.get("gale_level")
                            if gale_level is None:
                                gale_level = extract_gale_level_from_text(text)
                            if gale_level is None:
                                gale_level = determine_gale_level(matching, msg_date)
                                if (
                                    parsed["result_type"] == "victory_at_gale"
                                    and gale_level == 0
                                ):
                                    gale_level = 1

                            api_result = await api_patch(
                                session,
                                f"/signals/{matching['id']}/result",
                                {
                                    "result": outcome,
                                    "galeLevel": gale_level,
                                    "resultMsgId": msg_id,
                                    "matchTier": match_tier,
                                    "matchConfidence": confidence,
                                },
                            )
                            if api_result:
                                matching["status"] = "resolved"
                                logger.info(
                                    f"[{handler.slug}] Resolved {matching['id']}: "
                                    f"{'WIN' if is_win else 'LOSS'} (gale {gale_level}) [confidence={confidence:.2f}]"
                                )
            except Exception as e:
                sentry_sdk.capture_exception(e)
                health_tracker.record_error()
                logger.error(
                    f"Message handler error (chat_id={event.chat_id if event else 'unknown'}): {e}",
                    exc_info=True,
                )
                # Cleanup memory after message processing errors
                gc.collect()
                attempt_count = 0
                state = "MESSAGE_HANDLER"
                crash_report = format_crash_report(
                    e, {"attempt": attempt_count, "state": state}
                )
                await alerter.send_alert(crash_report, "CRITICAL")
                return

        logger.info(f"Handler lookup IDs: {list(handler_lookup.keys())}")
        logger.info("Multi-channel listener running. Catching up missed messages...")

        # Start healthcheck server if configured
        if HEALTHCHECK_PORT > 0:
            asyncio.create_task(
                run_healthcheck_server(HEALTHCHECK_PORT, health_tracker, handlers)
            )

        try:
            await client.catch_up()
            logger.info("Catch-up complete. Waiting for new messages...")

            # Record successful connection
            connection_metrics.successful_connections += 1
            connection_metrics.last_connected_at = datetime.now(timezone.utc)
            logger.info(
                f"Successfully connected to Telegram (total successful connections: {connection_metrics.successful_connections})"
            )

            await client.run_until_disconnected()
        finally:
            # Cleanup on exit
            logger.info("Initiating cleanup...")

            # Disconnect Telegram client
            if client.is_connected():
                await client.disconnect()
                logger.info("Telegram client disconnected")

            # Save metrics to file
            # mutable globals via _lc
            if _lc.START_TIME:
                uptime = int((datetime.now(timezone.utc) - _lc.START_TIME).total_seconds())
                metrics = {
                    "shutdown_time": datetime.now(timezone.utc).isoformat(),
                    "uptime_seconds": uptime,
                    "messages_processed": _lc.MESSAGE_COUNT,
                    "handlers_count": len(handlers) if handlers else 0,
                }
                metrics_file = os.path.join(LOGS_DIR, "listener_metrics.json")
                try:
                    with open(metrics_file, "w", encoding="utf-8") as f:
                        json.dump(metrics, f, indent=2)
                    logger.info(f"Metrics saved to {metrics_file}")
                except (IOError, TypeError, ValueError, json.JSONDecodeError) as error:
                    logger.error(f"JSON error: {error}")
                    sentry_sdk.capture_exception(error)

            # Note: aiohttp session auto-closes via context manager

            logger.info("Listener stopped cleanly")


if __name__ == "__main__":
    # Initialize Sentry error tracking
    init_sentry()
    sentry_sdk.set_tag("component", "telegram-listener")
    sentry_sdk.set_tag("version", VERSION)

    # Initialize global tracking
    _lc.START_TIME = datetime.now(timezone.utc)
    if ALERT_BOT_TOKEN and ALERT_CHAT_ID:
        _lc.SHUTDOWN_ALERTER = TelegramAlerter(ALERT_BOT_TOKEN, ALERT_CHAT_ID)

    # Signal handler for graceful shutdown
    def signal_handler(signum, _frame):
        # mutable globals via _lc
        signal_name = "SIGTERM" if signum == signal.SIGTERM else "SIGINT"
        uptime = int((datetime.now(timezone.utc) - _lc.START_TIME).total_seconds())

        logger.info(f"Received {signal_name}, initiating graceful shutdown...")

        # Send shutdown alert
        if _lc.SHUTDOWN_ALERTER:
            try:
                asyncio.run(
                    _lc.SHUTDOWN_ALERTER.send_alert(
                        f"🛑 Listener Shutting Down\n\nSignal: {signal_name}\nUptime: {uptime}s\nMessages processed: {_lc.MESSAGE_COUNT}",
                        "INFO",
                    )
                )
            except Exception as e:
                logger.error(f"Failed to send shutdown alert: {e}")

        sys.exit(0)

    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    retry_count = 0
    MAX_RETRIES = 5
    BASE_DELAY = 5

    while retry_count < MAX_RETRIES:
        try:
            asyncio.run(main())
            break  # Exit if successful
        except KeyboardInterrupt:
            # SIGINT is handled by signal_handler above, but this catches Ctrl+C in some cases
            signal_handler(signal.SIGINT, None)
            break
        except Exception as e:
            sentry_sdk.capture_exception(e)
            # Log full traceback
            logger.error(f"Critical unhandled exception in main: {e}", exc_info=True)

            # Record in RECENT_EXCEPTIONS
            record_exception(e)

            # Cleanup memory on critical errors
            gc.collect()

            # Format crash report and send alert
            attempt_count = retry_count + 1
            state = "FAILED"
            crash_report = format_crash_report(
                e, {"attempt": attempt_count, "state": state}
            )
            logger.critical(crash_report)

            # Send alert with CRITICAL severity
            if ALERT_BOT_TOKEN and ALERT_CHAT_ID and ENABLE_CRASH_ALERTS:
                alerter = TelegramAlerter(ALERT_BOT_TOKEN, ALERT_CHAT_ID)
                try:
                    asyncio.run(alerter.send_alert(crash_report, "CRITICAL"))
                except Exception:
                    pass  # Fail silently on alert error

            retry_count += 1

            if retry_count < MAX_RETRIES:
                # Apply exponential backoff
                delay = BASE_DELAY * (2 ** (retry_count - 1))
                logger.warning(
                    f"Restarting in {delay}s (attempt {retry_count + 1}/{MAX_RETRIES})..."
                )
                time.sleep(delay)
            else:
                logger.critical("Max retries reached. Exiting.")
                sys.exit(1)
