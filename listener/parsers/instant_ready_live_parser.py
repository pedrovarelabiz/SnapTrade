"""Instant Ready Live Parser for Cole Carter / Private Team signals."""

import logging
import re
from datetime import datetime
from typing import Optional, List, Dict, Any

import sentry_sdk


# Regex patterns for instant_ready format
_IR_SIGNAL_RE = re.compile(
    r"Getting:\s*"
    r"([A-Z]{2,8}\s*/\s*[A-Z]{2,8}(?:\s*OTC)?)"
    r"\s*\n?\s*ready",
    re.IGNORECASE,
)

_IR_DIR_RE = re.compile(
    r"Analysis:\s*(BUY|SELL)\s*",
    re.IGNORECASE,
)


def _ir_normalize_asset(raw: str) -> str:
    """Normalize asset name from instant_ready format."""
    a = raw.strip().upper().replace("*", "").replace("\u200b", "")
    a = re.sub(r"\s+", "", a)
    if "/" in a:
        parts = a.split("/")
        base = parts[0].strip()
        rest = parts[1].strip()
        if "OTC" in rest:
            quote = rest.replace("OTC", "").replace("(", "").replace(")", "").strip()
            return f"{base}{quote}_otc"
        return f"{base}{rest}"
    return a


def parse_instant_ready_live(text: str, msg_id: int, msg_date: datetime) -> Optional[List[Dict[str, Any]]]:
    """Parse instant_ready format (Cole Carter / Private Team).

    These channels send signals as:
      Getting: PAIR ready
      Analysis: BUY/SELL
      Use within 1-2 minutes

    Args:
        text: Raw message text
        msg_id: Message ID
        msg_date: Message datetime

    Returns:
        A signal-only dict list (no result) since results are not inline, or None on failure.
    """
    try:
        sig_m = _IR_SIGNAL_RE.search(text)
        dir_m = _IR_DIR_RE.search(text)

        if not sig_m or not dir_m:
            return []

        asset = _ir_normalize_asset(sig_m.group(1))
        direction = "CALL" if dir_m.group(1).upper() == "BUY" else "PUT"

        return [{
            "type": "signal",
            "asset": asset,
            "direction": direction,
            "entry_time_utc": msg_date.isoformat(),
            "expiration_minutes": 5,
            "format_version": 100,
            "martingale_times": [],
        }]
    except Exception as e:
        # Capture exception with Sentry
        with sentry_sdk.push_scope() as scope:
            scope.set_context("parsing_context", {
                "raw_message_preview": text[:500] if text else "",
                "message_id": msg_id,
                "message_date": str(msg_date),
                "message_length": len(text) if text else 0,
                "parser": "instant_ready_live_parser"
            })
            scope.set_tag("parser_type", "instant_ready")
            scope.set_tag("error_type", type(e).__name__)

            sentry_sdk.capture_exception(e)

        logging.error(f"parse_instant_ready_live failed: {e}")
        return None
