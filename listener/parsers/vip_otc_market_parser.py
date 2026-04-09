"""VIP OTC Market Parser for trading signal messages."""

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
class ParsedVIPOTCMessage:
    message_id: int
    message_date: datetime
    asset: str
    direction: str
    expiry: int
    channel: str
    raw_text: str


def parse_vip_otc_message(text: str, msg_id: int, msg_date: datetime) -> Optional[ParsedVIPOTCMessage]:
    """
    Parse VIP OTC market signal messages.

    Args:
        text: Raw message text
        msg_id: Message ID
        msg_date: Message datetime

    Returns:
        ParsedVIPOTCMessage if parsing succeeds, None otherwise
    """
    try:
        sentry_sdk.set_tag('parser', 'vip_otc_market')

        # Normalize text
        if isinstance(text, list):
            text = ' '.join(str(x) for x in text)
        normalized = str(text).strip()

        # Check for signal indicators (must contain "Candle" and OTC)
        if 'Candle' not in normalized or 'OTC' not in normalized:
            return None

        # Extract asset and direction pattern (e.g., EUR/USD OTC SELL or BUY)
        signal_pattern = re.compile(r'([A-Z]{3}/[A-Z]{3,4}).*?OTC.*?(SELL|BUY)', re.I | re.DOTALL)
        match = signal_pattern.search(normalized)

        if not match:
            console.print(f"[yellow]No valid signal found in VIP OTC message {msg_id}[/yellow]")
            return None

        # Extract and normalize asset
        asset = match.group(1).replace('/', '') + '_otc'

        # Normalize direction
        direction = match.group(2).upper()
        if direction == 'SELL':
            direction = 'PUT'
        elif direction == 'BUY':
            direction = 'CALL'

        return ParsedVIPOTCMessage(
            message_id=msg_id,
            message_date=msg_date,
            asset=asset,
            direction=direction,
            expiry=1,
            channel='vip_otc_market',
            raw_text=text
        )

    except Exception as e:
        # Capture exception with context for debugging
        with sentry_sdk.push_scope() as scope:
            scope.set_context("parsing_context", {
                "raw_message_preview": text[:500] if text else "",
                "message_id": msg_id,
                "message_date": str(msg_date),
                "message_length": len(text) if text else 0,
                "parser": "vip_otc_market"
            })
            scope.set_tag("parser", "vip_otc_market")
            scope.set_tag("error_type", type(e).__name__)

            sentry_sdk.capture_exception(e)

        console.print(f"[red]Failed to parse VIP OTC message {msg_id}: {e}[/red]")
        return None


def is_vip_otc_message(text: str) -> bool:
    """
    Quick check if a message might be a VIP OTC signal message.

    Args:
        text: Raw message text

    Returns:
        True if message contains VIP OTC signal indicators
    """
    if not text:
        return False

    normalized = str(text).upper()
    return 'CANDLE' in normalized and 'OTC' in normalized
