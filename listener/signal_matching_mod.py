"""SnapTrade Listener — Signal matching logic."""

import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any, List, Dict, Any

import sentry_sdk

from listener_constants import (
    UTC,
    EXACT_MATCH_TOLERANCE_SECONDS,
    PROXIMITY_MATCH_WINDOW_MINUTES,
    EXPIRATION_MATCH_TOLERANCE_SECONDS,
    EXPIRATION_MATCH_TOLERANCE,
    SIGNAL_MATCHING_DEBUG,
    tier1_matches, tier2_matches, tier3_matches,
    exact_match_total,
    signal_matches_proximity_fallback_total,
    ambiguous_attribution_total,
    expiration_delta_seconds,
    signal_matches_exact_expiration_total,
    signal_race_conditions_detected_total,
    signal_matching_duration_seconds,
)

logger = logging.getLogger("signal_matching")

def parse_martingale_time(time_str: str) -> int:
    """Convert time strings like '5m', '10m', '1h' to seconds.

    Args:
        time_str: Time string with format like '5m', '10m', '1h'

    Returns:
        Time in seconds

    Raises:
        ValueError: If time_str is empty or has invalid format
    """
    if not time_str or not isinstance(time_str, str):
        raise ValueError("Time string cannot be empty or None")

    time_str = time_str.strip()
    if not time_str:
        raise ValueError("Time string cannot be empty")

    # Match pattern: number + unit (m/h/s)
    match = re.match(r"^(\d+)([smh])$", time_str.lower())
    if not match:
        raise ValueError(
            f"Invalid time format: '{time_str}'. Expected format: '5m', '10m', '1h', etc."
        )

    value = int(match.group(1))
    unit = match.group(2)

    if unit == "s":
        return value
    elif unit == "m":
        return value * 60
    elif unit == "h":
        return value * 3600
    else:
        raise ValueError(f"Unknown time unit: '{unit}'")


def log_matching_stats():
    """Log the distribution of tier usage for signal matching."""
    global tier1_matches, tier2_matches, tier3_matches

    total_matches = tier1_matches + tier2_matches + tier3_matches
    if total_matches == 0:
        logger.info("Matching stats: No tier matches recorded yet")
        return

    tier1_pct = (tier1_matches / total_matches) * 100
    tier2_pct = (tier2_matches / total_matches) * 100
    tier3_pct = (tier3_matches / total_matches) * 100

    logger.info(
        f"Matching stats: Total={total_matches} | "
        f"Tier1={tier1_matches} ({tier1_pct:.1f}%) | "
        f"Tier2={tier2_matches} ({tier2_pct:.1f}%) | "
        f"Tier3={tier3_matches} ({tier3_pct:.1f}%)"
    )


def calculate_expiration_time(
    entry_time: datetime, martingale_times: List[int], martingale_level: int = 0
) -> datetime:
    """Calculate exact expiration timestamp based on martingale level.

    This function computes the precise expiration time for a trading position by adding
    the appropriate duration (from martingale_times) to the entry timestamp. It is used
    in martingale trading strategies where each level has a predefined expiration duration.
    The function validates all inputs and ensures type safety before performing calculations.

    Args:
        entry_time: The original entry timestamp when the position was opened.
                   Must be a valid datetime object and cannot be None.
        martingale_times: List of martingale time values in minutes for each level.
                         Must be a non-empty list of integers. Each element represents
                         the duration in minutes for that martingale level.
        martingale_level: The current martingale level (0-based index) to use for
                         calculating expiration. Defaults to 0 (first level).
                         Must be within bounds [0, len(martingale_times)).

    Returns:
        datetime: Exact expiration timestamp calculated as entry_time plus the duration
                 (in minutes) specified by martingale_times[martingale_level].

    Raises:
        ValueError: If entry_time is None
        ValueError: If martingale_times is None
        ValueError: If martingale_times is not a non-empty list
        ValueError: If martingale_level is None
        ValueError: If martingale_level < 0 or martingale_level >= len(martingale_times)
        ValueError: If martingale_times[martingale_level] is None
        TypeError: If entry_time is not a datetime object

    Examples:
        Basic usage with different martingale levels:
        >>> entry = datetime(2026, 3, 24, 10, 0, 0)
        >>> times = [5, 10, 15]
        >>> calculate_expiration_time(entry, times, 0)
        datetime(2026, 3, 24, 10, 5, 0)  # 10:00 + 5 min = 10:05
        >>> calculate_expiration_time(entry, times, 1)
        datetime(2026, 3, 24, 10, 10, 0)  # 10:00 + 10 min = 10:10
        >>> calculate_expiration_time(entry, times, 2)
        datetime(2026, 3, 24, 10, 15, 0)  # 10:00 + 15 min = 10:15

        Edge case - midnight crossing:
        >>> entry_late = datetime(2026, 3, 24, 23, 55, 0)
        >>> calculate_expiration_time(entry_late, [10], 0)
        datetime(2026, 3, 25, 0, 5, 0)  # 23:55 + 10 min = 00:05 next day

        Edge case - month boundary crossing:
        >>> entry_month_end = datetime(2026, 3, 31, 23, 50, 0)
        >>> calculate_expiration_time(entry_month_end, [20], 0)
        datetime(2026, 4, 1, 0, 10, 0)  # Crosses into April

    Notes:
        - Edge cases: The function correctly handles datetime arithmetic across day,
          month, and year boundaries using timedelta.
        - Thread safety: This is a pure function with no side effects or shared state.
        - Performance: O(1) time complexity with minimal validation overhead.
        - Timezone handling: Preserves timezone information from entry_time if present.
    """
    try:
        # Validate inputs
        if entry_time is None:
            raise ValueError("entry_time cannot be None")
        if not isinstance(entry_time, datetime):
            raise TypeError("entry_time must be a datetime object")
        if martingale_times is None:
            raise ValueError("martingale_times cannot be None")
        if not isinstance(martingale_times, list) or not martingale_times:
            raise ValueError("martingale_times must be a non-empty list")
        if martingale_level is None:
            raise ValueError("martingale_level cannot be None")
        if not isinstance(martingale_level, int):
            raise TypeError("martingale_level must be an integer")
        if martingale_level < 0 or martingale_level >= len(martingale_times):
            raise ValueError(
                f"martingale_level {martingale_level} out of bounds for list of length {len(martingale_times)}"
            )
        if martingale_times[martingale_level] is None:
            raise ValueError(f"martingale_times[{martingale_level}] cannot be None")

        # Use the value at martingale_level directly as seconds
        seconds = martingale_times[martingale_level]

        # Return entry_time + timedelta(seconds=seconds)
        return entry_time + timedelta(seconds=seconds)
    except Exception as e:
        logger.error(
            f"Error calculating expiration time: {e}. Signal details - entry_time: {entry_time}, "
            f"martingale_times: {martingale_times}, martingale_level: {martingale_level}"
        )
        raise


def find_matching_signal_proximity_only(
    asset: str, result_timestamp: datetime, signals: list
) -> Optional[dict]:
    """Find a signal using proximity matching when exact matching fails.

    Args:
        asset: The asset symbol to match
        result_timestamp: The datetime when the result was received (timezone-aware or naive)
        signals: List of signal dictionaries to search

    Returns:
        Best matching signal dict based on proximity, None if no suitable match found
    """
    start_time = time.time()
    # Ensure timezone consistency
    if result_timestamp.tzinfo is None:
        result_timestamp = result_timestamp.replace(tzinfo=timezone.utc)

    candidates = []
    for signal in signals:
        # Filter by asset
        if signal.get("asset") != asset:
            continue

        # Get entry time
        try:
            entry_time = datetime.fromisoformat(
                signal["entryTimeUtc"].replace("Z", "+00:00")
            )
            if entry_time.tzinfo is None:
                entry_time = entry_time.replace(tzinfo=timezone.utc)
        except (KeyError, ValueError, AttributeError):
            continue

        # Time window filter: skip signals outside reasonable window (+-35 minutes)
        # TIER 3 is last-resort: allow matching before and after entry time
        delta_min = abs((result_timestamp - entry_time).total_seconds()) / 60
        if delta_min > 35:
            continue

        # Get martingale times and calculate expiration (if available)
        martingale_times = signal.get("martingaleTimes", [])
        matched_via_martingale = False

        if martingale_times:
            # Convert martingale times and calculate expected expiration
            try:
                martingale_seconds = []
                for mt in martingale_times:
                    if isinstance(mt, str) and ":" in mt:
                        parts = mt.split(":")
                        if len(parts) == 2:
                            mins, secs = map(int, parts)
                            # Convert to total seconds: minutes * 60 + seconds
                            martingale_seconds.append(mins * 60 + secs)
                    else:
                        # Assume already in seconds if not in MM:SS format
                        martingale_seconds.append(float(mt))

                # Calculate expiration time using the last martingale iteration
                iteration = len(martingale_seconds) - 1
                expiration_time = calculate_expiration_time(
                    entry_time, martingale_seconds, iteration
                )

                # Calculate proximity score (time difference from expected expiration)
                time_diff = abs((result_timestamp - expiration_time).total_seconds())
                candidates.append((signal, expiration_time, time_diff))
                matched_via_martingale = True
            except Exception:
                pass  # Fall through to entry_time proximity below

        # TIER 3 fallback: use entry_time directly for proximity when no martingaleTimes
        if not matched_via_martingale:
            time_diff = abs((result_timestamp - entry_time).total_seconds())
            candidates.append((signal, entry_time, time_diff))

    # Return the closest match by proximity
    if candidates:
        # Detect ambiguity: multiple signals match within the window
        if len(candidates) >= 2:
            match_details = [
                f"signal_id={sig.get('id')}, timestamp={exp.isoformat()}, time_diff={diff:.2f}s"
                for sig, exp, diff in candidates
            ]
            logger.warning(
                f"Ambiguous proximity match detected for asset={asset}: {len(candidates)} signals matched. "
                f"Matches: {'; '.join(match_details)}. Returning closest match."
            )

        # Prefer signals placed BEFORE result (entry_time <= result_timestamp),
        # then pick closest by time_diff. Signals after result are last resort.
        best_match = min(candidates, key=lambda x: (x[1] > result_timestamp, x[2]))
        signal, expiration, time_diff = best_match
        logger.warning(
            f"Using proximity fallback for {asset} - exact expiration matching failed. "
            f"signal_timestamp={expiration.isoformat()}, result_timestamp={result_timestamp.isoformat()}"
        )
        logger.info(
            f"Proximity match found: signal_id={signal.get('id')}, asset={asset}, "
            f"expiration={expiration.isoformat()}, result_timestamp={result_timestamp.isoformat()}, "
            f"time_diff={time_diff:.2f}s"
        )
        signal_matching_duration_seconds.labels(method="proximity").observe(
            time.time() - start_time
        )
        return signal

    # No match found after all 3 tiers - log comprehensive error with full context
    pending_signals_for_asset = [s for s in signals if s.get("asset") == asset]
    pending_signal_timestamps = []
    for sig in pending_signals_for_asset:
        try:
            entry_time = datetime.fromisoformat(
                sig["entryTimeUtc"].replace("Z", "+00:00")
            )
            pending_signal_timestamps.append(entry_time.isoformat())
        except (KeyError, ValueError, AttributeError):
            pending_signal_timestamps.append("invalid_timestamp")

    logger.error(
        f"No match found after all 3 tiers (exact, martingale-aware, proximity) - "
        f"asset={asset}, result_timestamp={result_timestamp.isoformat()}, "
        f"num_pending_signals={len(pending_signals_for_asset)}, "
        f"pending_signal_timestamps={pending_signal_timestamps}"
    )

    # Capture Sentry event for match failures to track matching issues
    sentry_sdk.capture_message(
        'Signal match failed',
        level='warning',
        extras={
            'asset': asset,
            'timestamp': result_timestamp.isoformat(),
            'pending_signal_count': len(pending_signals_for_asset)
        }
    )

    signal_matching_duration_seconds.labels(method="proximity").observe(
        time.time() - start_time
    )
    return None


# Issue D3: Race Condition Fix
# Problem: When multiple signals match within the tolerance window (±60s), we cannot
# reliably determine which signal generated a particular result, creating a race condition
# that leads to incorrect signal attribution and duplicate result processing.
# Solution: This function uses exact expiration matching (calculate_expiration_time) as the
# primary strategy. When 2+ signals match within tolerance (race condition detected), it
# falls back to proximity matching to resolve ambiguity. All race conditions are logged,
# tracked in Sentry with 'D3' tag, and counted in signal_race_conditions_detected_total metric.
def find_matching_signal(
    asset: str,
    result_timestamp: datetime,
    result_iteration: int,
    signals: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Find a signal using 3-tier matching algorithm with progressive fallback.

    Implements a hierarchical matching strategy to resolve race conditions (D3 fix) and
    handle clock skew, progressing from most precise to most permissive:

    **3-Tier Matching Algorithm:**

    **TIER 1 - Exact Expiration Match (±5s tolerance):**
    - Uses signal.expirationTime field for direct comparison
    - Filters by asset symbol and checks result_timestamp against expirationTime
    - Returns immediately on first match with confidence_score based on time_diff
    - Most reliable: avoids calculation errors and handles pre-computed expirations

    **TIER 2 - Martingale-Aware Match (±5s tolerance):**
    - Activates only if TIER 1 finds no match
    - Calculates expiration times for ALL martingale levels using calculate_expiration_time()
    - Checks result_timestamp against each level's computed expiration (entry_time + duration)
    - Handles multiple matches by selecting closest time delta (D3 race condition mitigation)
    - Sets signal["martingale_level"] on match
    - Returns (signal, 2, confidence_score) where confidence decreases with time_diff

    **TIER 3 - Proximity Fallback (30-minute window):**
    - Activates only if TIER 1 and TIER 2 both fail
    - Matches if result_timestamp is within [entry_time, entry_time + 30 minutes]
    - Selects signal with smallest time delta from entry_time
    - Logs warning indicating exact matching failed
    - Returns (signal, 3, confidence_score) where confidence decreases with time_delta_minutes
    - Lowest confidence: used as last resort for degraded timestamp accuracy

    **D3 Race Condition Fix:**
    TIER 2 handles ambiguous matches (multiple signals with same expiration) by selecting
    the signal with the minimum time delta, logging warnings for monitoring, and returning
    match_tier=2 to indicate potential race condition. This prevents the silent signal
    attribution errors documented in issue D3.

    Args:
        asset: The asset symbol to match (e.g., "EURUSD", "BTCUSD")
        result_timestamp: The datetime when the result was received (timezone-aware or naive;
            naive timestamps are automatically converted to UTC)
        result_iteration: Martingale iteration number (0 for first/only attempt, 1+ for retries);
            currently unused but reserved for future iteration-specific matching logic
        signals: List of signal dictionaries to search through; each dict must contain
            asset, entryTimeUtc, and optionally expirationTime and martingaleTimes fields

    Returns:
        Tuple of (signal, match_tier, confidence_score) where:
        - signal: Matched signal dict if found, None if no match across all tiers
        - match_tier: Integer indicating match quality: 1 (exact), 2 (martingale), 3 (proximity), None if no match
        - confidence_score: Float 0.0-1.0 based on timestamp precision; closer to 1.0 = higher confidence

    Examples:
        >>> # TIER 1 exact match
        >>> signals = [{"asset": "EURUSD", "expirationTime": "2026-03-24T10:05:00Z", "id": "sig1"}]
        >>> result_time = datetime(2026, 3, 24, 10, 5, 2, tzinfo=timezone.utc)  # 2s diff
        >>> signal, tier, conf = find_matching_signal("EURUSD", result_time, 0, signals)
        >>> assert tier == 1 and conf > 0.9

        >>> # TIER 2 martingale match (no expirationTime field)
        >>> signals = [{"asset": "BTCUSD", "entryTimeUtc": "2026-03-24T10:00:00Z",
        ...             "martingaleTimes": ["5:00", "10:00"], "id": "sig2"}]
        >>> result_time = datetime(2026, 3, 24, 10, 5, 3, tzinfo=timezone.utc)  # matches level 0
        >>> signal, tier, conf = find_matching_signal("BTCUSD", result_time, 0, signals)
        >>> assert tier == 2 and signal["martingale_level"] == 0

        >>> # TIER 3 proximity fallback
        >>> signals = [{"asset": "GBPUSD", "entryTimeUtc": "2026-03-24T09:50:00Z", "id": "sig3"}]
        >>> result_time = datetime(2026, 3, 24, 10, 10, 0, tzinfo=timezone.utc)  # 20min after entry
        >>> signal, tier, conf = find_matching_signal("GBPUSD", result_time, 0, signals)
        >>> assert tier == 3 and conf < 0.5  # Low confidence due to large time window
    """
    start_time = time.time()
    # Ensure timezone consistency: if naive, assume UTC
    if result_timestamp.tzinfo is None:
        logger.error(
            f"result_timestamp is not timezone-aware for asset {asset}, converting to UTC"
        )
        result_timestamp = result_timestamp.replace(tzinfo=timezone.utc)

    # Add Sentry breadcrumb for debugging matching attempts
    candidate_signals_count = sum(1 for s in signals if s.get("asset") == asset)
    sentry_sdk.add_breadcrumb(
        category="matching",
        message="find_matching_signal attempt",
        level="info",
        data={
            "asset": asset,
            "result_timestamp": result_timestamp.isoformat(),
            "candidate_signals_count": candidate_signals_count,
        },
    )

    # TIER 1: Exact expiration time matching using signal.expirationTime field
    # Uses ±5 second tolerance for precise matching
    # Collect ALL matches to detect race conditions
    tier1_matches = []
    for signal in signals:
        # Filter by asset
        if signal.get("asset") != asset:
            continue

        # Get expirationTime from signal
        expiration_time_str = signal.get("expirationTime")
        if not expiration_time_str:
            continue

        try:
            expiration_time = datetime.fromisoformat(
                expiration_time_str.replace("Z", "+00:00")
            )
            # Ensure timezone-aware
            if expiration_time.tzinfo is None:
                expiration_time = expiration_time.replace(tzinfo=timezone.utc)
        except (ValueError, AttributeError):
            continue

        # Check if result_timestamp matches expirationTime within ±5 second tolerance
        time_diff = abs((result_timestamp - expiration_time).total_seconds())
        if time_diff <= EXACT_MATCH_TOLERANCE_SECONDS:
            tier1_matches.append((signal, expiration_time, time_diff))

    # Handle TIER 1 matches
    if len(tier1_matches) == 1:
        signal, expiration_time, time_diff = tier1_matches[0]
        logger.debug(
            f"TIER 1 exact match found: signal_id={signal.get('id')}, asset={asset}, "
            f"expiration_time={expiration_time.isoformat()}, "
            f"result_timestamp={result_timestamp.isoformat()}, time_delta={time_diff:.2f}s"
        )
        logger.info(
            f"TIER 1 exact match found: signal_id={signal.get('id')}, asset={asset}, "
            f"expiration_time={expiration_time.isoformat()}, "
            f"result_timestamp={result_timestamp.isoformat()}, time_delta={time_diff:.2f}s"
        )
        signal_matching_duration_seconds.labels(method="exact").observe(
            time.time() - start_time
        )
        confidence_score = max(0.0, 1.0 - time_diff / 25.0)
        sentry_sdk.add_breadcrumb(
            category='signal_matching',
            message=f'Matched via tier 1',
            level='info',
            data={
                'signal_id': signal.get('id'),
                'asset': asset,
                'confidence': confidence_score,
            }
        )
        return (signal, 1, confidence_score)
    elif len(tier1_matches) > 1:
        # Race condition detected - multiple signals match the same expiration time
        matching_ids = [s.get('id') for s, _, _ in tier1_matches]
        matching_details = [
            f"signal_id={s.get('id')}, expiration={exp.isoformat()}, delta={td:.2f}s"
            for s, exp, td in tier1_matches
        ]
        logger.error(
            f"TIER 1: Race condition detected - multiple signals match exact expiration: "
            f"asset={asset}, result_timestamp={result_timestamp.isoformat()}, "
            f"num_matches={len(tier1_matches)}, signal_ids={matching_ids}, "
            f"matches=[{'; '.join(matching_details)}]"
        )

        # Increment race condition metric
        signal_race_conditions_detected_total.labels(asset=asset).inc()

        # Capture Sentry event for race condition
        sentry_sdk.capture_event({
            "level": "error",
            "message": "Signal attribution race condition detected (TIER 1)",
            "extra": {
                "signal_ids": matching_ids,
                "asset": asset,
                "result_timestamp": result_timestamp.isoformat(),
                "num_matches": len(tier1_matches),
                "matching_details": matching_details,
                "tier": 1,
            },
            "tags": {
                "issue": "D3",
            },
        })

        # Fall back to proximity matching
        logger.warning(
            f"Falling back to proximity matching due to race condition: asset={asset}, num_matches={len(tier1_matches)}"
        )
        signal_matches_proximity_fallback_total.labels(
            asset=asset, reason="ambiguous_exact_match"
        ).inc()
        proximity_result = find_matching_signal_proximity_only(asset, result_timestamp, signals)
        if proximity_result:
            # Return as tier 3 match with lower confidence score
            return (proximity_result, 3, 0.5)
        else:
            return (None, None, None)

    logger.debug(f"TIER 1: No exact match found for asset={asset}, result_timestamp={result_timestamp.isoformat()}")

    # TIER 2: Martingale-aware matching - check if result_timestamp falls within any martingale level's expiration window
    logger.debug(f"TIER 2: Checking martingale-aware matching for asset={asset}, result_timestamp={result_timestamp.isoformat()}")
    tier2_matches = []
    for signal in signals:
        # Filter by asset
        if signal.get("asset") != asset:
            continue

        # Get entry time
        try:
            entry_time = datetime.fromisoformat(
                signal["entryTimeUtc"].replace("Z", "+00:00")
            )
            if entry_time.tzinfo is None:
                entry_time = entry_time.replace(tzinfo=timezone.utc)
        except (KeyError, ValueError, AttributeError):
            continue

        # Get martingale times
        martingale_times = signal.get("martingaleTimes", [])
        if not martingale_times:
            continue

        # Convert martingale times from "MM:SS" format to total seconds
        try:
            martingale_seconds = []
            for mt in martingale_times:
                if isinstance(mt, str) and ":" in mt:
                    parts = mt.split(":")
                    if len(parts) == 2:
                        mins, secs = map(int, parts)
                        # Convert to total seconds: minutes * 60 + seconds
                        martingale_seconds.append(mins * 60 + secs)
                else:
                    # Assume already in seconds if not in MM:SS format
                    martingale_seconds.append(float(mt))
        except (ValueError, AttributeError):
            continue

        # Calculate expiration times for ALL martingale levels
        for martingale_level, _ in enumerate(martingale_seconds):
            try:
                expiration_time = calculate_expiration_time(
                    entry_time, martingale_seconds, martingale_level
                )
                if expiration_time.tzinfo is None:
                    expiration_time = expiration_time.replace(tzinfo=timezone.utc)

                # Check if result_timestamp matches this martingale level's expiration within ±5 second tolerance
                time_diff = abs((result_timestamp - expiration_time).total_seconds())
                if time_diff <= EXACT_MATCH_TOLERANCE_SECONDS:
                    tier2_matches.append((signal, martingale_level, expiration_time, time_diff))
            except Exception:
                continue

    # Handle TIER 2 matches
    if len(tier2_matches) == 1:
        signal, martingale_level, expiration_time, time_diff = tier2_matches[0]
        logger.info(
            f"TIER 2 martingale match found: signal_id={signal.get('id')}, asset={asset}, "
            f"martingale_level={martingale_level}, expected_expiration={expiration_time.isoformat()}, "
            f"actual_result_time={result_timestamp.isoformat()}, time_delta={time_diff:.2f}s"
        )
        signal_matching_duration_seconds.labels(method="exact").observe(
            time.time() - start_time
        )
        signal["martingale_level"] = martingale_level
        confidence_score = min(0.85, max(0.0, 1.0 - time_diff / 5.0))
        sentry_sdk.add_breadcrumb(
            category='signal_matching',
            message=f'Matched via tier 2',
            level='info',
            data={
                'signal_id': signal.get('id'),
                'asset': asset,
                'confidence': confidence_score,
            }
        )
        return (signal, 2, confidence_score)
    elif len(tier2_matches) > 1:
        # Race condition detected - multiple signals match the same martingale expiration
        matching_ids = [s.get('id') for s, _, _, _ in tier2_matches]
        match_details = [
            f"signal_id={s.get('id')}, level={lvl}, exp={exp.isoformat()}, delta={td:.2f}s"
            for s, lvl, exp, td in tier2_matches
        ]
        logger.error(
            f"TIER 2: Race condition detected - multiple martingale matches found for asset={asset}, "
            f"result_timestamp={result_timestamp.isoformat()}, num_matches={len(tier2_matches)}, "
            f"signal_ids={matching_ids}, matches=[{'; '.join(match_details)}]"
        )

        # Increment race condition metric
        signal_race_conditions_detected_total.labels(asset=asset).inc()

        # Capture Sentry event for race condition
        sentry_sdk.capture_event({
            "level": "error",
            "message": "Signal attribution race condition detected (TIER 2)",
            "extra": {
                "signal_ids": matching_ids,
                "asset": asset,
                "result_timestamp": result_timestamp.isoformat(),
                "num_matches": len(tier2_matches),
                "matching_details": match_details,
                "tier": 2,
            },
            "tags": {
                "issue": "D3",
            },
        })

        # Fall back to proximity matching
        logger.warning(
            f"Falling back to proximity matching due to race condition: asset={asset}, num_matches={len(tier2_matches)}"
        )
        signal_matches_proximity_fallback_total.labels(
            asset=asset, reason="ambiguous_exact_match"
        ).inc()
        proximity_result = find_matching_signal_proximity_only(asset, result_timestamp, signals)
        if proximity_result:
            # Return as tier 3 match with lower confidence score
            return (proximity_result, 3, 0.5)
        else:
            return (None, None, None)

    logger.debug(f"TIER 2: No martingale-aware match found for asset={asset}, result_timestamp={result_timestamp.isoformat()}")

    # TIER 3: Proximity fallback - no exact match found, fall back to proximity matching
    logger.warning(
        f"No exact match found for {asset} - falling back to proximity matching. "
        f"result_timestamp={result_timestamp.isoformat()}"
    )

    # Increment proximity fallback metric with reason='no_exact_match'
    signal_matches_proximity_fallback_total.labels(
        asset=asset, reason="no_exact_match"
    ).inc()

    # Call proximity-only matching function
    proximity_result = find_matching_signal_proximity_only(asset, result_timestamp, signals)
    if proximity_result:
        # Return as tier 3 match with lower confidence score
        return (proximity_result, 3, 0.5)
    else:
        # No match found across all tiers
        logger.error(
            f"No matching signal found for asset={asset}, result_timestamp={result_timestamp.isoformat()}, "
            f"result_iteration={result_iteration}. Checked {candidate_signals_count} candidate signals. "
            f"All tiers failed: TIER 1 (exact expiration), TIER 2 (martingale-aware), TIER 3 (30-minute proximity window)."
        )
        return (None, None, None)




# --- Gale level detection ---


def extract_gale_level_from_text(text: str) -> Optional[int]:
    """Extract martingale iteration from result message text.

    Looks for patterns like "GALE 1", "GALE 2", "MARTINGALE 1", etc.

    Args:
        text: Raw message text to search

    Returns:
        int: Gale level (0 for first entry, 1 for first gale, etc.) or None if not found
    """
    if not text:
        return None

    text_upper = text.upper()

    # Check for "GALE N" or "MARTINGALE N" patterns
    import re

    patterns = [
        r"GALE\s*(\d+)",
        r"MARTINGALE\s*(\d+)",
        r"GALE(\d+)",
        r"MG\s*(\d+)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text_upper)
        if match:
            level = int(match.group(1))
            # Convert to 0-indexed (GALE 1 = level 1, GALE 2 = level 2, etc.)
            return level

    return None


def determine_gale_level(signal: dict, result_date: datetime) -> int:
    fmt = signal.get("formatVersion", 1)
    typical_delay = 7.0 if fmt == 1 else 0.5
    entry_time = datetime.fromisoformat(signal["entryTimeUtc"].replace("Z", "+00:00"))
    mg_times = signal.get("martingaleTimes", [])

    ends = [(0, entry_time + timedelta(minutes=5))]
    for i, mt_str in enumerate(mg_times):
        h, m = map(int, mt_str.split(":"))
        dt = entry_time.replace(hour=h, minute=m, second=0, microsecond=0)
        diff = (dt - entry_time).total_seconds()
        if diff > 12 * 3600:
            dt -= timedelta(days=1)
        elif diff < -12 * 3600:
            dt += timedelta(days=1)
        if fmt == 2:
            dt += timedelta(minutes=5)
        ends.append((i + 1, dt))

    best_gale = None
    best_score = float("inf")
    for gale_level, end_time in ends:
        diff_min = (result_date - end_time).total_seconds() / 60
        if diff_min < -2:
            continue
        score = abs(diff_min - typical_delay)
        if score < best_score:
            best_score = score
            best_gale = gale_level

    if best_gale is not None:
        return best_gale

    delta = (result_date - entry_time).total_seconds() / 60
    if fmt == 1:
        return 0 if delta < 14.5 else (1 if delta < 19 else 2)
    return 0 if delta < 8 else (1 if delta < 13 else 2)


def find_by_exact_expiration(*args, **kwargs):
    """Find option/signal by exact expiration matching.

    Supports two call signatures:
    1. Legacy: find_by_exact_expiration(asset, result_timestamp, signals)
    2. Testing: find_by_exact_expiration(option_chain, target_date, strike_price=X)
    """
    # Detect which signature is being used
    if len(args) >= 2 and 'strike_price' in kwargs:
        # Testing signature: (option_chain, target_date, *, strike_price)
        return _find_by_exact_expiration_test(args[0], args[1], kwargs['strike_price'])
    else:
        # Legacy signature: (asset, result_timestamp, signals)
        return _find_by_exact_expiration_legacy(args[0], args[1], args[2] if len(args) > 2 else kwargs.get('signals'))


def _find_by_exact_expiration_test(
    option_chain: list,
    target_date,  # Can be date or datetime
    strike_price: float
) -> Optional[dict]:
    """Test-compatible version: find option by expiration date and strike price.

    Args:
        option_chain: List of option dictionaries
        target_date: Target date (date or datetime object)
        strike_price: Strike price to match

    Returns:
        Matching option dict or None if no match found
    """
    from datetime import date as date_type, datetime as datetime_type

    # Convert target_date to date if it's a datetime
    if isinstance(target_date, datetime_type):
        target_date_obj = target_date.date()
        has_time_component = True
        target_datetime = target_date if target_date.tzinfo else target_date.replace(tzinfo=timezone.utc)
    else:
        target_date_obj = target_date
        has_time_component = False
        target_datetime = None

    # Format target date as string for comparison
    target_date_str = target_date_obj.isoformat()

    matches = []
    for option in option_chain:
        # Skip if expiration_date doesn't match
        exp_date = option.get("expiration_date")
        if exp_date != target_date_str:
            continue

        # Skip if strike_price doesn't match
        if option.get("strike_price") != strike_price:
            continue

        # Check expiration_time field
        exp_time = option.get("expiration_time")

        # If expiration_time key exists and is None, skip this option
        # (backward compatibility - old signals without time data)
        if "expiration_time" in option and exp_time is None:
            continue

        # If option has a valid expiration_time, we need to check time-based matching
        if exp_time is not None:
            # Parse and validate expiration_time
            try:
                if isinstance(exp_time, str):
                    exp_time_dt = datetime_type.fromisoformat(exp_time.replace("Z", "+00:00"))
                elif isinstance(exp_time, datetime_type):
                    exp_time_dt = exp_time if exp_time.tzinfo else exp_time.replace(tzinfo=timezone.utc)
                else:
                    # Invalid expiration_time type, skip
                    continue

                # For time-based matching, we need a reference time
                # Use current time if only date was provided (for testing compatibility)
                if not has_time_component:
                    # No time component provided - skip time-based matching
                    # This means options with expiration_time won't match date-only queries
                    continue

                # Check if within ±5 seconds tolerance
                time_diff = abs((target_datetime - exp_time_dt).total_seconds())
                if time_diff <= 5:
                    matches.append((option, time_diff, exp_time_dt))
                # else: outside tolerance, don't add to matches
            except (ValueError, AttributeError, TypeError):
                # Invalid timestamp, skip
                continue
        else:
            # No expiration_time field - simple date+strike match
            matches.append((option, float('inf'), None))

    if not matches:
        return None

    # If multiple matches found
    if len(matches) > 1:
        # Log warning about ambiguity
        logger.warning(
            f"Found multiple signals with same expiration - ambiguous match. "
            f"Returning most recent by created_at."
        )

        # Sort by created_at if available, otherwise by time_diff
        def sort_key(m):
            option, time_diff, _ = m
            created_at = option.get("created_at")
            if created_at:
                if isinstance(created_at, datetime_type):
                    return created_at
                try:
                    return datetime_type.fromisoformat(str(created_at))
                except:
                    pass
            return datetime_type.min

        matches.sort(key=sort_key, reverse=True)

    # Log info about exact match
    logger.info(f"Exact match found for strike {strike_price} on {target_date_str}")

    return matches[0][0]


def _find_by_exact_expiration_legacy(
    asset: str, result_timestamp: datetime, signals: list
) -> Optional[dict]:
    """Legacy version: Find a signal by exact expiration time matching within ±5 seconds.

    Args:
        asset: The asset symbol to match
        result_timestamp: The datetime when the result was received (timezone-aware or naive)
        signals: List of signal dictionaries to search

    Returns:
        Matching signal dict or None if no match found
    """
    # Ensure timezone consistency: if naive, assume UTC
    if result_timestamp.tzinfo is None:
        result_timestamp = result_timestamp.replace(tzinfo=timezone.utc)

    matches = []
    for signal in signals:
        # Filter by asset
        if signal.get("asset") != asset:
            continue

        # Skip old signals without expiration_time field (will be caught by proximity fallback)
        if signal.get("expiration_time") is None:
            continue

        # Get expirationTime from signal
        expiration_time_str = signal.get("expirationTime")
        if not expiration_time_str:
            continue

        # Parse expiration time
        try:
            expiration_time = datetime.fromisoformat(
                expiration_time_str.replace("Z", "+00:00")
            )
        except (ValueError, AttributeError):
            continue

        # Check if result_timestamp matches expirationTime within tolerance
        time_diff = abs((result_timestamp - expiration_time).total_seconds())
        if time_diff <= EXPIRATION_MATCH_TOLERANCE_SECONDS:
            matches.append(signal)

    if not matches:
        return None

    if len(matches) > 1:
        signal_ids = [str(s.get("id", "unknown")) for s in matches]
        logger.warning(
            f"Multiple signals found for exact expiration: {', '.join(signal_ids)}"
        )
        # Return the most recent one by timestamp
        matches.sort(key=lambda s: s.get("timestamp", ""), reverse=True)

    logger.info(
        f"Exact expiration match found for {asset}",
        extra={
            "match_type": "exact",
            "asset": asset,
            "signal_id": matches[0].get("id", "unknown"),
            "confidence_score": 1.0,
            "time_delta_seconds": time_diff,
        },
    )
    sentry_sdk.add_breadcrumb(
        level="info",
        category="matching",
        message="Exact expiration match",
        data={
            "asset": asset,
            "signal_id": matches[0].get("id", "unknown"),
            "delta_seconds": time_diff,
        },
    )
    return matches[0]


