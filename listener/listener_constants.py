"""SnapTrade Listener — Constants, metrics, and global state."""

import os
import sys
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Deque

from prometheus_client import Counter, Histogram

VERSION = "2.1.0"  # Fixed signal attribution race condition (D3)

# Prometheus metrics
exact_match_total = Counter(
    "exact_match_total", "Total number of exact expiration matches"
)
signal_matches_proximity_fallback_total = Counter(
    "signal_matches_proximity_fallback_total",
    "Total number of proximity fallback matches",
    ["asset", "reason"],
)
ambiguous_attribution_total = Counter(
    "ambiguous_attribution_total", "Total number of ambiguous signal attributions"
)
expiration_delta_seconds = Histogram(
    "expiration_delta_seconds",
    "Time difference between result and expected expiration in seconds",
)
signal_matches_exact_expiration_total = Counter(
    "signal_matches_exact_expiration_total",
    "Total exact expiration matches by asset and outcome",
    ["asset", "outcome"],
)
signal_race_conditions_detected_total = Counter(
    "signal_race_conditions_detected_total",
    "Total number of race conditions detected when 2+ signals match exact expiration",
    ["asset"],
)
signal_matching_duration_seconds = Histogram(
    "signal_matching_duration_seconds",
    "Duration of signal matching operations in seconds",
    ["method"],
)

# Global tier match counters
tier1_matches = 0
tier2_matches = 0
tier3_matches = 0

# Debug mode for signal matching
SIGNAL_MATCHING_DEBUG = os.getenv("SIGNAL_MATCHING_DEBUG", "false").lower() == "true"

# Tolerance for exact expiration match (in seconds)
EXACT_MATCH_TOLERANCE_SECONDS = int(os.getenv('EXACT_MATCH_TOLERANCE_SECONDS', '5'))
PROXIMITY_MATCH_WINDOW_MINUTES = int(os.getenv('PROXIMITY_MATCH_WINDOW_MINUTES', '30'))
EXPIRATION_MATCH_TOLERANCE_SECONDS = 5
EXPIRATION_MATCH_TOLERANCE = 60  # +/-60s tolerance for clock skew

# --- Configuration ---

BACKEND_URL = os.getenv("BACKEND_URL") or os.getenv("API_BASE", "http://127.0.0.1:3001")
API_BASE = BACKEND_URL  # Alias for backward compatibility
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")
if not INTERNAL_API_KEY or len(INTERNAL_API_KEY) < 20:
    raise SystemExit(
        "FATAL: INTERNAL_API_KEY env var must be set (min 20 chars). "
        "Add it to .env or export it before starting the listener."
    )
SIGNAL_ACTIVATE_DELAY_SEC = 10
SIGNAL_TIMEOUT_MIN = 35
HEALTH_CHECK_INTERVAL_SEC = 300
ALERT_BOT_TOKEN = os.getenv("ALERT_BOT_TOKEN")
ALERT_CHAT_ID = os.getenv("ALERT_CHAT_ID")
ENABLE_CRASH_ALERTS = os.getenv("ENABLE_CRASH_ALERTS", "true").lower() == "true"

UTC = timezone.utc

# Reconnection configuration from environment
MAX_RECONNECT_DELAY = int(os.getenv("MAX_RECONNECT_DELAY_SECONDS", "60"))
INITIAL_RECONNECT_DELAY = int(os.getenv("INITIAL_RECONNECT_DELAY_SECONDS", "1"))
HEALTHCHECK_PORT = int(os.getenv("HEALTHCHECK_PORT", "0"))

# --- Global mutable state ---

MESSAGE_COUNT = 0
START_TIME = None
SHUTDOWN_ALERTER = None
shutdown_requested = False
RECENT_EXCEPTIONS: Deque[Dict[str, Any]] = deque(maxlen=50)
