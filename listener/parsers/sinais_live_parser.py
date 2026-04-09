"""Sinais Live Parser for trading signal messages."""

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
class ParsedSinaisMessage:
    message_id: int
    message_date: datetime
    asset: str
    action: str
    timeframe: Optional[str]
    entry_price: Optional[str]
    raw_text: str


def parse_sinais_message(text: str, msg_id: int, msg_date: datetime) -> Optional[ParsedSinaisMessage]:
    """
    Parse sinais (signal) messages from the trading channel.

    Args:
        text: Raw message text
        msg_id: Message ID
        msg_date: Message datetime

    Returns:
        ParsedSinaisMessage if parsing succeeds, None otherwise
    """
    try:
        sentry_sdk.set_tag('parser', 'sinais_live')

        # Normalize text
        normalized = text.strip()

        # Check for signal indicators
        if not any(keyword in normalized.upper() for keyword in ["SINAL", "SIGNAL", "ENTRY", "ENTRADA"]):
            return None

        # Extract asset pattern (e.g., EUR/USD, EURUSD_otc)
        asset_pattern = r"([A-Z]{3,}[/_]?[A-Z]{0,3}(?:_otc)?)"
        asset_match = re.search(asset_pattern, normalized, re.IGNORECASE)

        if not asset_match:
            console.print(f"[yellow]No asset found in sinais message {msg_id}[/yellow]")
            return None

        asset = asset_match.group(1).upper()

        # Extract action (CALL/PUT, BUY/SELL)
        action_pattern = r"\b(CALL|PUT|BUY|SELL|COMPRA|VENDA)\b"
        action_match = re.search(action_pattern, normalized, re.IGNORECASE)
        action = action_match.group(1).upper() if action_match else "UNKNOWN"

        # Extract timeframe (e.g., M1, M5, M15, H1)
        timeframe_pattern = r"\b(M\d+|H\d+)\b"
        timeframe_match = re.search(timeframe_pattern, normalized, re.IGNORECASE)
        timeframe = timeframe_match.group(1).upper() if timeframe_match else None

        # Extract entry price
        price_pattern = r"(?:ENTRY|ENTRADA|@)[\s:]*(\d+\.?\d*)"
        price_match = re.search(price_pattern, normalized, re.IGNORECASE)
        entry_price = price_match.group(1) if price_match else None

        return ParsedSinaisMessage(
            message_id=msg_id,
            message_date=msg_date,
            asset=asset,
            action=action,
            timeframe=timeframe,
            entry_price=entry_price,
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
                "parser": "sinais_live"
            })
            scope.set_tag("parser", "sinais_live")
            scope.set_tag("error_type", type(e).__name__)

            sentry_sdk.capture_exception(e)

        console.print(f"[red]Failed to parse sinais message {msg_id}: {e}[/red]")
        return None


def is_sinais_message(text: str) -> bool:
    """
    Quick check if a message might be a sinais message.

    Args:
        text: Raw message text

    Returns:
        True if message contains signal indicators
    """
    if not text:
        return False

    normalized = text.upper()
    return any(keyword in normalized for keyword in ["SINAL", "SIGNAL", "ENTRY", "ENTRADA"])
