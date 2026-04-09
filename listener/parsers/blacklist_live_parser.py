"""Blacklist Live Parser for trading channel messages."""

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import sentry_sdk
from rich.console import Console

console = Console()
UTC = timezone.utc


@dataclass(frozen=True)
class ParsedBlacklistMessage:
    message_id: int
    message_date: datetime
    asset: str
    reason: str
    raw_text: str


def parse_blacklist_message(text: str, msg_id: int, msg_date: datetime) -> Optional[ParsedBlacklistMessage]:
    """
    Parse blacklist messages from the trading channel.

    Args:
        text: Raw message text
        msg_id: Message ID
        msg_date: Message datetime

    Returns:
        ParsedBlacklistMessage if parsing succeeds, None otherwise
    """
    try:
        # Normalize text
        normalized = text.strip()

        # Check for blacklist indicators
        if not any(keyword in normalized.upper() for keyword in ["BLACKLIST", "AVOID", "DO NOT TRADE"]):
            return None

        # Extract asset pattern (e.g., EUR/USD, EURUSD_otc)
        asset_pattern = r"([A-Z]{3,}[/_]?[A-Z]{0,3}(?:_otc)?)"
        asset_match = re.search(asset_pattern, normalized, re.IGNORECASE)

        if not asset_match:
            console.print(f"[yellow]No asset found in blacklist message {msg_id}[/yellow]")
            return None

        asset = asset_match.group(1).upper()

        # Extract reason (everything after asset or blacklist keyword)
        reason_pattern = r"(?:BLACKLIST|AVOID|DO NOT TRADE)[\s:]*(.+?)(?:\n|$)"
        reason_match = re.search(reason_pattern, normalized, re.IGNORECASE)
        reason = reason_match.group(1).strip() if reason_match else "Unknown"

        return ParsedBlacklistMessage(
            message_id=msg_id,
            message_date=msg_date,
            asset=asset,
            reason=reason,
            raw_text=text
        )

    except Exception as e:
        # Capture exception with context for debugging
        with sentry_sdk.push_scope() as scope:
            # Add truncated raw message for debugging (first 500 chars)
            scope.set_context("parsing_context", {
                "raw_message_preview": text[:500] if text else "",
                "message_id": msg_id,
                "message_date": str(msg_date),
                "message_length": len(text) if text else 0,
                "parser": "blacklist_live_parser"
            })
            scope.set_tag("parser_type", "blacklist")
            scope.set_tag("error_type", type(e).__name__)

            sentry_sdk.capture_exception(e)

        console.print(f"[red]Failed to parse blacklist message {msg_id}: {e}[/red]")
        return None


def is_blacklist_message(text: str) -> bool:
    """
    Quick check if a message might be a blacklist message.

    Args:
        text: Raw message text

    Returns:
        True if message contains blacklist indicators
    """
    if not text:
        return False

    normalized = text.upper()
    return any(keyword in normalized for keyword in ["BLACKLIST", "AVOID", "DO NOT TRADE"])
