"""SnapTrade Listener — Channel handler."""

import gc
from collections import deque
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List

import sentry_sdk

from listener_constants import (
    UTC,
    EXACT_MATCH_TOLERANCE_SECONDS,
    PROXIMITY_MATCH_WINDOW_MINUTES,
    EXPIRATION_MATCH_TOLERANCE_SECONDS,
    EXPIRATION_MATCH_TOLERANCE,
    SIGNAL_MATCHING_DEBUG,
    exact_match_total,
    signal_matches_proximity_fallback_total,
    ambiguous_attribution_total,
    expiration_delta_seconds,
    signal_matches_exact_expiration_total,
    signal_race_conditions_detected_total,
    signal_matching_duration_seconds,
    tier1_matches, tier2_matches, tier3_matches,
)
from signal_matching_mod import (
    parse_martingale_time,
    calculate_expiration_time,
    find_matching_signal,
    find_matching_signal_proximity_only,
)

logger = logging.getLogger("signal_matching")

from parser import parse_message
from multi_channel_parsers import (
    parse_blacklist_live,
    parse_sinais_live,
    parse_instant_ready_live,
    parse_vip_otc_market,
)

class ChannelHandler:
    """Handles parsing and state for a single channel."""

    def __init__(self, channel_config: dict, health_tracker=None):
        self.channel_id = channel_config["id"]
        self.slug = channel_config["slug"]
        self.name = channel_config["name"]
        self.timezone = channel_config["timezone"]
        self.source_format = channel_config["sourceFormat"]
        self.max_gale = channel_config["maxGaleLevel"]
        self.telegram_id = (
            int(channel_config["telegramId"])
            if channel_config.get("telegramId")
            else None
        )
        self.telegram_name = channel_config["telegramName"]
        self.active_signals: list[dict] = []
        self.last_signal_at: datetime | None = None
        self._silence_alerted = False
        self.health_tracker = health_tracker
        self.matching_stats = {
            "exact_match": 0,
            "proximity_fallback_count": 0,
            "tier1": 0,
            "tier2": 0,
            "tier3": 0,
            "no_match": 0,
        }
        self.ambiguous_matches = 0
        self.recent_matches = deque(
            maxlen=100
        )  # Track last 100 matches for health stats
        self.pocket_vip_parser = None
        if self.source_format == "pocket_vip_sticker":
            try:
                from parser_pocket_vip import PocketVipParser

                self.pocket_vip_parser = PocketVipParser()
                logger.info(f"[{self.slug}] PocketVipParser initialized (OCR ready)")
            except ImportError:
                logger.warning(
                    f"[{self.slug}] parser_pocket_vip not available — OCR disabled"
                )

    def is_inline_format(self) -> bool:
        return self.source_format in ("blacklist_inline", "sinais_inline")

    def parse(self, text: str, msg_id: int, msg_date: datetime):
        """Route to correct parser. Returns list of parsed items."""
        if self.source_format == "blacklist_inline":
            try:
                sentry_sdk.set_tag("parser_type", "blacklist_live")
                return parse_blacklist_live(text, msg_id, msg_date)
            except Exception as e:
                logger.error(f"Failed to parse signal: {e}")
                sentry_sdk.capture_exception(e)
                if self.health_tracker:
                    self.health_tracker.record_error()
                gc.collect()
                return []
        elif self.source_format == "sinais_inline":
            try:
                sentry_sdk.set_tag("parser_type", "sinais_live")
                return parse_sinais_live(text, msg_id, msg_date)
            except Exception as e:
                logger.error(f"Failed to parse signal: {e}")
                sentry_sdk.capture_exception(e)
                if self.health_tracker:
                    self.health_tracker.record_error()
                gc.collect()
                return []
        elif self.source_format == "instant_ready":
            try:
                sentry_sdk.set_tag("parser_type", "instant_ready_live")
                return parse_instant_ready_live(text, msg_id, msg_date)
            except Exception as e:
                logger.error(f"Failed to parse signal: {e}")
                sentry_sdk.capture_exception(e)
                if self.health_tracker:
                    self.health_tracker.record_error()
                gc.collect()
                return []
        elif self.source_format == "pocket_vip_sticker":
            # Handled in handler_fn via pocket_vip_parser — text-only parse not supported
            sentry_sdk.set_tag("parser_type", "pocket_vip_sticker")
            return []
        elif self.source_format == "vip_otc_market":
            try:
                sentry_sdk.set_tag("parser_type", "vip_otc_market")
                return parse_vip_otc_market(text, msg_id, msg_date)
            except Exception as e:
                logger.error(f"Failed to parse signal: {e}")
                sentry_sdk.capture_exception(e)
                if self.health_tracker:
                    self.health_tracker.record_error()
                gc.collect()
                return []
        else:
            # Format 1+2 (TYL VIP/TRADING)
            try:
                sentry_sdk.set_tag("parser_type", "default_parser")
                f2_offset = 1 if "UTC+1" in self.timezone else -3
                result = parse_message(text, msg_id, msg_date, f2_utc_offset=f2_offset)
                return [result] if result else []
            except Exception as e:
                logger.error(f"Failed to parse signal: {e}")
                sentry_sdk.capture_exception(e)
                if self.health_tracker:
                    self.health_tracker.record_error()
                gc.collect()
                return []

    def calculate_signal_expiration_time(self, sig: dict) -> datetime:
        """Calculate the expected expiration time for a signal.

        Args:
            sig (dict): Signal dictionary with the following keys:
                - entryTimeUtc (str): ISO format entry time
                - expirationMinutes (int, optional): Minutes until expiration (default: 5)
                - martingaleTimes (list[str], optional): List of martingale times in "HH:MM" format

        Returns:
            datetime: Expected expiration time in UTC

        Logic:
            - If martingaleTimes is present and non-empty, uses the last martingale time (martingale_times[-1])
              by parsing it as HH:MM, adjusting for day boundaries, then adding expirationMinutes
            - Otherwise, uses entryTimeUtc as the base time and adds expirationMinutes
        """
        exp_min = sig.get("expirationMinutes", 5)
        entry = datetime.fromisoformat(sig["entryTimeUtc"].replace("Z", "+00:00"))
        if entry.tzinfo is None:
            entry = entry.replace(tzinfo=UTC)

        mg_times = sig.get("martingaleTimes", [])

        # If martingale_times is present and non-empty, use last martingale time
        if mg_times:
            # Last martingale time + expiration = latest expected end
            last_mg = mg_times[-1]
            h, m = map(int, last_mg.split(":"))
            mg_dt = entry.replace(hour=h, minute=m, second=0, microsecond=0)
            diff = (mg_dt - entry).total_seconds()
            if diff > 12 * 3600:
                mg_dt -= timedelta(days=1)
            elif diff < -12 * 3600:
                mg_dt += timedelta(days=1)
            return mg_dt + timedelta(minutes=exp_min)
        else:
            # Fall back to base expiration time (entry + expirationMinutes)
            return entry + timedelta(minutes=exp_min)

    def normalize_asset_for_matching(self, asset: str) -> str:
        """Normalize asset string for matching.

        All OTC variants (``_otc``, ``-otc``, ``OTC``, ``/OTC`` etc.) are
        canonicalised to the ``<BASE>OTC`` form so that OTC and non-OTC assets
        are treated as distinct instruments while different OTC spellings still
        match each other.

        Args:
            asset (str): Asset symbol to normalize

        Returns:
            str: Normalized asset symbol (uppercase, no separators).
                 OTC variants become ``<BASE>OTC`` (e.g. ``"EURUSDOTC"``).

        Examples:
            "eurusd"       -> "EURUSD"
            " EURUSD "     -> "EURUSD"
            "EURUSD_otc"   -> "EURUSDOTC"
            "EURUSDOTC"    -> "EURUSDOTC"
            "EUR/USD OTC"  -> "EURUSDOTC"
            "eurusd-otc"   -> "EURUSDOTC"
        """
        if not asset:
            return ""

        # Strip and uppercase
        normalized = asset.strip().upper()

        # Detect OTC presence before stripping separators
        is_otc = (
            "_OTC" in normalized
            or "-OTC" in normalized
            or " OTC" in normalized
            or normalized.endswith("OTC")
        )

        # Remove separators and OTC tokens
        for token in ("_OTC", "-OTC", " OTC"):
            normalized = normalized.replace(token, "")
        normalized = normalized.replace(" ", "").replace("/", "")

        # Strip bare OTC suffix that may remain (e.g. "EURUSDOTC" after slash removal)
        if normalized.endswith("OTC"):
            normalized = normalized[:-3]

        # Re-append canonical OTC suffix when the asset is an OTC instrument
        if is_otc:
            normalized = normalized + "OTC"

        return normalized

    def calculate_match_confidence(
        self, signal: dict, result: dict, match_type: str
    ) -> int:
        """Calculate confidence score for signal-result attribution match.

        Args:
            signal: The matched signal dictionary
            result: The result message dictionary
            match_type: Type of match ("exact_expiration", "proximity", "tier1", "tier2", "tier3")

        Returns:
            int: Confidence score from 0-100
        """
        # Base confidence scores by match type
        if match_type == "exact_expiration":
            base_score = 95
        elif match_type in ("proximity", "tier1"):
            base_score = 70
        elif match_type == "tier2":
            base_score = 60
        elif match_type == "tier3":
            base_score = 50
        else:
            base_score = 50

        # Check for multiple candidates scenario
        # If there were multiple active signals within the time window, reduce confidence
        has_multiple_candidates = result.get("multiple_candidates", False)
        if has_multiple_candidates:
            base_score = max(0, base_score - 20)

        return min(100, max(0, base_score))

    def get_matching_health_stats(self) -> dict:
        """Calculate health statistics for signal matching quality.

        Returns:
            dict: Health statistics with:
                - exact_match_percentage: Percentage of exact matches in last 100 matches
                - avg_confidence_score: Average confidence score of last 100 matches
                - ambiguous_count: Total count of ambiguous matches
        """
        if not self.recent_matches:
            return {
                "exact_match_percentage": 0.0,
                "avg_confidence_score": 0.0,
                "ambiguous_count": self.ambiguous_matches,
            }

        exact_count = sum(1 for m in self.recent_matches if m["is_exact"])
        total_count = len(self.recent_matches)
        exact_match_percentage = (
            (exact_count / total_count * 100) if total_count > 0 else 0.0
        )

        total_confidence = sum(m["confidence"] for m in self.recent_matches)
        avg_confidence_score = (
            total_confidence / total_count if total_count > 0 else 0.0
        )

        return {
            "exact_match_percentage": round(exact_match_percentage, 2),
            "avg_confidence_score": round(avg_confidence_score, 2),
            "ambiguous_count": self.ambiguous_matches,
        }

    def find_matching_signal_legacy(self, result_date: datetime) -> dict | None:
        """Match a result message to the best pending signal (LEGACY IMPLEMENTATION).

        Uses proximity to expected trade end time (entry + expiration or
        last martingale + expiration) instead of first-match. This avoids
        mis-attribution when multiple signals are active within 30 min.

        NOTE: This is the legacy implementation preserved for comparison and fallback testing.
        """
        fmt1_delay = 7.0  # typical posting delay for format 1 results
        fmt2_delay = 0.5  # typical posting delay for format 2 results

        best_sig = None
        best_score = float("inf")

        for sig in self.active_signals:
            if sig.get("status") in ("resolved", "expired"):
                continue
            entry = datetime.fromisoformat(sig["entryTimeUtc"].replace("Z", "+00:00"))
            if entry.tzinfo is None:
                entry = entry.replace(tzinfo=UTC)
            delta_min = (result_date - entry).total_seconds() / 60
            if not 1 <= delta_min <= 30:
                continue

            # Compute expected end time for the highest gale level
            exp_min = sig.get("expirationMinutes", 5)
            mg_times = sig.get("martingaleTimes", [])
            if mg_times:
                # Last martingale time + expiration = latest expected end
                last_mg = mg_times[-1]
                h, m = map(int, last_mg.split(":"))
                mg_dt = entry.replace(hour=h, minute=m, second=0, microsecond=0)
                diff = (mg_dt - entry).total_seconds()
                if diff > 12 * 3600:
                    mg_dt -= timedelta(days=1)
                elif diff < -12 * 3600:
                    mg_dt += timedelta(days=1)
                end_time = mg_dt + timedelta(minutes=exp_min)
            else:
                end_time = entry + timedelta(minutes=exp_min)

            fmt = sig.get("formatVersion", 1)
            typical_delay = fmt1_delay if fmt == 1 else fmt2_delay
            score = abs((result_date - end_time).total_seconds() / 60 - typical_delay)
            if score < best_score:
                best_score = score
                best_sig = sig

        return best_sig

    # Legacy proximity-only matching - used as fallback
    def find_matching_signal_proximity_only(
        self,
        result_date: datetime,
        asset: Optional[str] = None,
        direction: Optional[str] = None,
    ) -> tuple[dict, float] | None:
        """Match a result message to the best pending signal using two-phase matching.

        This method solves the D3 race condition issue by implementing intelligent signal matching
        when result messages may arrive before their corresponding signals due to async processing.

        Two-Phase Matching Algorithm:
            Phase 1 (Exact Expiration): When asset is provided, searches for signals with exact expiration
                match within 5 seconds of result_date. Uses martingale timing data to precisely match
                the signal's expected expiration time. This is the most accurate match for normal operations.

            Phase 2 (Proximity Fallback): If no exact expiration match is found, falls back to proximity
                matching within a 30-minute window. Evaluates candidates using a scoring algorithm that
                considers asset match, direction match, temporal proximity, and expected delays.

        The algorithm prioritizes exact expiration matching over proximity, ensuring the most accurate
        signal is selected when multiple candidates exist.

        Args:
            result_date: The datetime of the result message to match against pending signals
            asset: Optional asset symbol/identifier for exact expiration and proximity matching (e.g., "AAPL")
            direction: Optional trade direction for enhanced proximity matching (e.g., "BUY", "SELL")

        Returns:
            Tuple of (signal_dict, confidence_score) if match found, None otherwise.
            Confidence score is 1.0 for exact expiration matches, variable for proximity matches.
        """
        # Priority: Check for exact expiration match first
        if asset is not None:
            exact_match = find_by_exact_expiration(
                asset, result_date, self.active_signals
            )
            if exact_match:
                # Calculate time delta for structured logging
                entry_time = datetime.fromisoformat(
                    exact_match["entryTimeUtc"].replace("Z", "+00:00")
                )
                if entry_time.tzinfo is None:
                    entry_time = entry_time.replace(tzinfo=UTC)
                time_delta_seconds = (result_date - entry_time).total_seconds()

                logger.info(
                    "Exact expiration match found",
                    extra={
                        "match_type": "exact",
                        "asset": asset,
                        "signal_id": exact_match.get("id", "unknown"),
                        "confidence": 1.0,
                        "delta_seconds": time_delta_seconds,
                    },
                )
                self.matching_stats["exact_match"] += 1
                exact_match_total.inc()
                self.recent_matches.append({"is_exact": True, "confidence": 1.0})
                return exact_match
            else:
                logger.info(
                    "Falling back to proximity matching",
                    extra={
                        "match_type": "proximity_fallback",
                        "asset": asset,
                        "signal_id": None,
                        "confidence": None,
                        "delta_seconds": None,
                    },
                )
                sentry_sdk.set_tag("race_condition_detected", "true")
                sentry_sdk.add_breadcrumb(
                    level="warning",
                    category="matching",
                    message="Proximity fallback",
                    data={"asset": asset, "reason": "no_exact_match"},
                )
                self.matching_stats["proximity_fallback_count"] += 1
                signal_matches_proximity_fallback_total.labels(
                    asset=asset, reason="no_exact_match"
                ).inc()

        # Initialize tier candidate lists
        tier1_candidates: list[dict[str, Any]] = []
        tier2_candidates: list[dict[str, Any]] = []
        tier3_candidates: list[dict[str, Any]] = []
        # Initialize scoring constants
        EXACT_MATCH_TOLERANCE_MINUTES = 2.0
        typical_delay_fmt1 = 7.0
        typical_delay_fmt2 = 0.5
        # Iterate through active signals
        for sig in self.active_signals:
            try:
                # Skip resolved or expired signals
                if sig.get("status") in ("resolved", "expired"):
                    continue

                # Parse entryTimeUtc and ensure timezone
                entry = datetime.fromisoformat(
                    sig["entryTimeUtc"].replace("Z", "+00:00")
                )
                if entry.tzinfo is None:
                    entry = entry.replace(tzinfo=UTC)

                # Time window filter: skip signals outside 0-35 minute window
                delta_min = (result_date - entry).total_seconds() / 60
                if not 0 <= delta_min <= 35:
                    continue

                # Calculate expected expiration time using martingale_times if available
                expected_exp_time = self.calculate_signal_expiration_time(sig)
            except (KeyError, ValueError, AttributeError) as e:
                logger.error(
                    f"Error processing signal {sig.get('id', 'unknown')} in find_matching_signal: {e}",
                    extra={
                        "match_type": "error_processing",
                        "asset": asset,
                        "signal_id": sig.get("id", "unknown"),
                        "confidence": None,
                        "delta_seconds": None,
                    },
                )
                sentry_sdk.capture_exception(e)
                continue

            # Tier 1: Exact match (asset + direction + time)
            try:
                if asset is not None:
                    normalized_sig_asset = self.normalize_asset_for_matching(
                        sig["asset"]
                    )
                    normalized_provided_asset = self.normalize_asset_for_matching(asset)

                    if normalized_sig_asset == normalized_provided_asset:
                        time_diff = abs(
                            (result_date - expected_exp_time).total_seconds() / 60
                        )
                        if time_diff < EXACT_MATCH_TOLERANCE_MINUTES:
                            expiration_delta_seconds.observe(time_diff * 60)
                            tier1_candidates.append({"signal": sig, "score": time_diff})
                        # Tier 2: Asset-only match (asset + proximity, direction bonus)
                        else:
                            # Calculate proximity score using typical_delay (same as legacy)
                            signal_format = sig.get("format", "fmt1")
                            typical_delay = (
                                typical_delay_fmt2
                                if signal_format == "fmt2"
                                else typical_delay_fmt1
                            )
                            proximity_score = abs(time_diff - typical_delay)

                            # If direction also provided, add bonus scoring for direction match
                            score = proximity_score
                            if direction is not None:
                                normalized_sig_direction = sig.get(
                                    "direction", ""
                                ).upper()
                                normalized_provided_direction = direction.upper()
                                if (
                                    normalized_sig_direction
                                    == normalized_provided_direction
                                ):
                                    score -= 0.5  # Bonus for direction match (lower score is better)

                            tier2_candidates.append({"signal": sig, "score": score})

                # Tier 3: Backward compatibility - legacy proximity matching when asset is None
                else:
                    # Calculate proximity score using typical_delay (same as legacy)
                    signal_format = sig.get("format", "fmt1")
                    typical_delay = (
                        typical_delay_fmt2
                        if signal_format == "fmt2"
                        else typical_delay_fmt1
                    )
                    time_diff = abs(
                        (result_date - expected_exp_time).total_seconds() / 60
                    )
                    proximity_score = abs(time_diff - typical_delay)
                    # Use tuple for score: (proximity_score, time_diff) to break ties by preferring closer expiration
                    tier3_score = (proximity_score, time_diff)
                    tier3_candidates.append({"signal": sig, "score": tier3_score})
            except (KeyError, AttributeError, TypeError) as e:
                logger.error(
                    f"Error matching signal {sig.get('id', 'unknown')} to tiers: {e}",
                    extra={
                        "match_type": "error_matching_tiers",
                        "asset": asset,
                        "signal_id": sig.get("id", "unknown"),
                        "confidence": None,
                        "delta_seconds": None,
                    },
                )
                sentry_sdk.capture_exception(e)
                continue
        # Select best match using tier hierarchy
        best_match = None
        tier_used = None
        if tier1_candidates:
            best_match = min(tier1_candidates, key=lambda x: x["score"])
            tier_used = "tier1"
            self.matching_stats["tier1"] += 1
            global tier1_matches
            tier1_matches += 1
        elif tier2_candidates:
            best_match = min(tier2_candidates, key=lambda x: x["score"])
            tier_used = "tier2"
            self.matching_stats["tier2"] += 1
            global tier2_matches
            tier2_matches += 1
        elif tier3_candidates:
            best_match = min(tier3_candidates, key=lambda x: x["score"])
            tier_used = "tier3"
            self.matching_stats["tier3"] += 1
            global tier3_matches
            tier3_matches += 1
        if best_match and (len(tier1_candidates) > 1 or len(tier2_candidates) > 3):
            self.ambiguous_matches += 1
            ambiguous_attribution_total.inc()
            logger.warning(
                f"Ambiguous signal match: {len(tier1_candidates)} tier1, "
                f"{len(tier2_candidates)} tier2 candidates. "
                f"Selected {best_match['signal'].get('id', 'unknown')}",
                extra={
                    "match_type": "ambiguous",
                    "asset": asset,
                    "signal_id": best_match["signal"].get("id", "unknown"),
                    "confidence": (
                        best_match["score"][0]
                        if isinstance(best_match["score"], tuple)
                        else best_match["score"]
                    ),
                    "delta_seconds": None,
                },
            )
            # Capture Sentry event for each ambiguous case
            signal_ids = [
                c["signal"].get("id", "unknown")
                for c in tier1_candidates + tier2_candidates
            ]
            expiration_time = best_match["signal"].get("expirationTimeUtc", "unknown")
            sentry_sdk.set_tag("ambiguous_match", "true")
            try:
                sentry_sdk.capture_message(
                    "Ambiguous signal attribution",
                    level="warning",
                    extra={
                        "signal_ids": signal_ids,
                        "asset": asset,
                        "expiration_time": expiration_time,
                    },
                )
            except TypeError:
                # Older sentry-sdk versions do not accept the `extra` kwarg on
                # capture_message; fall back to a plain call without it.
                sentry_sdk.capture_message(
                    "Ambiguous signal attribution",
                    level="warning",
                )
        # Detailed debug logging when SIGNAL_MATCHING_DEBUG is enabled
        if SIGNAL_MATCHING_DEBUG:
            logger.info(
                f"Signal matching for result_date={result_date}, asset={asset}, direction={direction}",
                extra={
                    "match_type": "matching_started",
                    "asset": asset,
                    "signal_id": None,
                    "confidence": None,
                    "delta_seconds": None,
                },
            )
            logger.info(
                f"Tier 1 candidates: {len(tier1_candidates)} | "
                f"Tier 2 candidates: {len(tier2_candidates)} | "
                f"Tier 3 candidates: {len(tier3_candidates)}",
                extra={
                    "match_type": "tier_summary",
                    "asset": asset,
                    "signal_id": None,
                    "confidence": None,
                    "delta_seconds": None,
                },
            )
            if tier1_candidates:
                logger.info(
                    f"Tier 1 details: {[(c['signal'].get('id'), c['signal']['asset'], c['score']) for c in tier1_candidates]}",
                    extra={
                        "match_type": "tier1_details",
                        "asset": asset,
                        "signal_id": None,
                        "confidence": None,
                        "delta_seconds": None,
                    },
                )
            if tier2_candidates:
                logger.info(
                    f"Tier 2 details: {[(c['signal'].get('id'), c['signal']['asset'], c['score']) for c in tier2_candidates]}",
                    extra={
                        "match_type": "tier2_details",
                        "asset": asset,
                        "signal_id": None,
                        "confidence": None,
                        "delta_seconds": None,
                    },
                )
            if tier3_candidates:
                logger.info(
                    f"Tier 3 details: {[(c['signal'].get('id'), c['signal']['asset'], c['score']) for c in tier3_candidates]}",
                    extra={
                        "match_type": "tier3_details",
                        "asset": asset,
                        "signal_id": None,
                        "confidence": None,
                        "delta_seconds": None,
                    },
                )

        if best_match:
            score = best_match["score"]
            signal = best_match["signal"]
            # Extract numeric confidence score (tier3 uses tuple, others use float)
            confidence_score = score[0] if isinstance(score, tuple) else score

            # Calculate time delta for structured logging
            entry_time = datetime.fromisoformat(
                signal["entryTimeUtc"].replace("Z", "+00:00")
            )
            if entry_time.tzinfo is None:
                entry_time = entry_time.replace(tzinfo=UTC)
            time_delta_seconds = (result_date - entry_time).total_seconds()

            logger.debug(
                f"Matched signal {signal.get('id', 'unknown')} "
                f"(asset={signal['asset']}, tier={tier_used}, score={score}, "
                f"confidence={confidence_score:.2f})",
                extra={
                    "match_type": tier_used,
                    "asset": signal.get("asset"),
                    "signal_id": signal.get("id", "unknown"),
                    "confidence": confidence_score,
                    "delta_seconds": time_delta_seconds,
                },
            )
            if SIGNAL_MATCHING_DEBUG:
                logger.info(
                    f"Matched signal {signal.get('id', 'unknown')} "
                    f"(asset={signal['asset']}, tier={tier_used}, score={score}, "
                    f"confidence={confidence_score:.2f})",
                    extra={
                        "match_type": tier_used,
                        "asset": signal.get("asset"),
                        "signal_id": signal.get("id", "unknown"),
                        "confidence": confidence_score,
                        "delta_seconds": time_delta_seconds,
                    },
                )
            sentry_sdk.add_breadcrumb(
                category="signal_matching",
                message=f"Matched signal using {tier_used}",
                level="info",
                data={
                    "candidates_tier1": len(tier1_candidates),
                    "candidates_tier2": len(tier2_candidates),
                    "result_date": result_date.isoformat(),
                },
            )
            self.recent_matches.append(
                {"is_exact": False, "confidence": confidence_score}
            )
            return (signal, confidence_score)
        else:
            self.matching_stats["no_match"] += 1
            logger.debug(
                f"No matching signal for result at {result_date}",
                extra={
                    "match_type": "no_match",
                    "asset": asset,
                    "signal_id": None,
                    "confidence": None,
                    "delta_seconds": None,
                },
            )
            if SIGNAL_MATCHING_DEBUG:
                logger.info(
                    f"No matching signal for result at {result_date}",
                    extra={
                        "match_type": "no_match",
                        "asset": asset,
                        "signal_id": None,
                        "confidence": None,
                        "delta_seconds": None,
                    },
                )
            return None

    def find_matching_signal(
        self,
        result_date: datetime,
        asset: str | None = None,
        direction: str | None = None,
        iteration: int = 0,
    ) -> dict | None:
        """Find the best matching signal for a result message.

        Implements the same 3-tier algorithm used by
        ``find_matching_signal_proximity_only`` but as a lightweight path
        suitable for high-frequency calling (no Sentry / Prometheus overhead).

        Tier 1 – exact expiration match: asset matches *and* result_date is
            within ±2 minutes of the signal's calculated expiration time.
            Selects the candidate with the smallest time delta.

        Tier 2 – proximity match: asset matches but result is outside the
            exact window; selects the best score using typical posting delay.
            An optional *direction* hint provides a 0.5-point tie-breaking
            bonus for a matching direction.

        Tier 3 – backward-compatibility / time-only match (``asset=None``):
            ignores the asset field and selects the best time-proximity
            candidate.  Preserves legacy behaviour for callers that do not
            supply an asset.

        Args:
            result_date: Timezone-aware datetime of the received result.
            asset: Asset symbol for asset-aware matching (e.g. ``"EURUSD"``).
                   Pass ``None`` to fall back to legacy time-only matching
                   (Tier 3 / backward-compat).
            direction: Optional trade direction used as a Tier-2 tie-breaker
                       (e.g. ``"CALL"`` or ``"PUT"``).
            iteration: Martingale iteration number (reserved for future use).

        Returns:
            The matched signal dict, or ``None`` if no match was found across
            all tiers.
        """
        EXACT_MATCH_TOLERANCE_MINUTES = 2.0
        typical_delay_fmt1 = 7.0
        typical_delay_fmt2 = 0.5

        tier1_candidates: list[dict] = []
        tier2_candidates: list[dict] = []
        tier3_candidates: list[dict] = []

        norm_asset = self.normalize_asset_for_matching(asset) if asset is not None else None
        norm_direction = direction.upper() if direction is not None else None

        for sig in self.active_signals:
            if sig.get("status") in ("resolved", "expired"):
                continue
            try:
                entry = datetime.fromisoformat(
                    sig["entryTimeUtc"].replace("Z", "+00:00")
                )
                if entry.tzinfo is None:
                    entry = entry.replace(tzinfo=UTC)
                delta_min = (result_date - entry).total_seconds() / 60
                if not 0 <= delta_min <= 35:
                    continue
                expected_exp_time = self.calculate_signal_expiration_time(sig)
            except (KeyError, ValueError, AttributeError):
                continue

            try:
                if norm_asset is not None:
                    # Asset-aware: Tier 1 or Tier 2
                    if self.normalize_asset_for_matching(sig.get("asset", "")) != norm_asset:
                        continue
                    time_diff = abs(
                        (result_date - expected_exp_time).total_seconds() / 60
                    )
                    if time_diff < EXACT_MATCH_TOLERANCE_MINUTES:
                        # Tier 1 candidate
                        tier1_candidates.append({"signal": sig, "score": time_diff})
                    else:
                        # Tier 2 candidate — direction hint lowers score (better match)
                        fmt = sig.get("format", "fmt1")
                        typical_delay = (
                            typical_delay_fmt2 if fmt == "fmt2" else typical_delay_fmt1
                        )
                        score = abs(time_diff - typical_delay)
                        if norm_direction is not None:
                            if sig.get("direction", "").upper() == norm_direction:
                                score -= 0.5
                        tier2_candidates.append({"signal": sig, "score": score})
                else:
                    # Tier 3: time-only / backward-compat
                    fmt = sig.get("format", "fmt1")
                    typical_delay = (
                        typical_delay_fmt2 if fmt == "fmt2" else typical_delay_fmt1
                    )
                    time_diff = abs(
                        (result_date - expected_exp_time).total_seconds() / 60
                    )
                    proximity_score = abs(time_diff - typical_delay)
                    tier3_candidates.append(
                        {"signal": sig, "score": (proximity_score, time_diff)}
                    )
            except (KeyError, AttributeError, TypeError):
                continue

        # Select best match by tier priority
        if tier1_candidates:
            best = min(tier1_candidates, key=lambda x: x["score"])
            self.matching_stats["tier1"] += 1
            return best["signal"]
        if tier2_candidates:
            best = min(tier2_candidates, key=lambda x: x["score"])
            self.matching_stats["tier2"] += 1
            return best["signal"]
        if tier3_candidates:
            best = min(tier3_candidates, key=lambda x: x["score"])
            self.matching_stats["tier3"] += 1
            return best["signal"]

        self.matching_stats["no_match"] += 1
        return None


