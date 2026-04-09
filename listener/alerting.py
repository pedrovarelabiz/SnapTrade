"""SnapTrade Listener — Telegram alerting."""

import logging
import traceback
from datetime import datetime, timezone
from typing import Dict

import aiohttp

logger = logging.getLogger("signal_matching")


async def send_alert(session: aiohttp.ClientSession, message: str) -> None:
    """Send alert to Telegram admin chat. Fails silently if not configured."""
    from listener_constants import ALERT_BOT_TOKEN, ALERT_CHAT_ID

    if not ALERT_BOT_TOKEN or not ALERT_CHAT_ID:
        return
    try:
        url = f"https://api.telegram.org/bot{ALERT_BOT_TOKEN}/sendMessage"
        await session.post(
            url,
            json={"chat_id": ALERT_CHAT_ID, "text": message},
            timeout=aiohttp.ClientTimeout(total=5),
        )
    except Exception:
        pass


def format_crash_report(exception: Exception, context: dict) -> str:
    """Format exception details into a readable crash report."""
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    exc_type = type(exception).__name__
    exc_message = str(exception)
    tb_lines = traceback.format_tb(exception.__traceback__)

    critical_exceptions = (
        "SystemExit",
        "KeyboardInterrupt",
        "MemoryError",
        "RuntimeError",
    )
    severity_emoji = "CRITICAL" if exc_type in critical_exceptions else "WARNING"

    tb_first_5 = "".join(tb_lines[:5])

    context_str = (
        "\n".join(f"  {k}: {v}" for k, v in context.items()) if context else "  (none)"
    )

    report = f"""<b>Listener Crash Alert</b>

{severity_emoji}
<b>Timestamp:</b> {timestamp}
<b>Exception:</b> {exc_type}
<b>Message:</b> {exc_message}

<b>Traceback:</b>
{tb_first_5}

<b>Context:</b>
{context_str}
"""

    if len(report) > 4096:
        report = report[:4093] + "..."

    return report


class TelegramAlerter:
    """Telegram alerter for sending formatted alerts via Bot API."""

    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.last_alert_time: Dict[str, datetime] = {}

    async def send_alert(self, message: str, severity: str) -> None:
        """Send alert message to Telegram with severity level."""
        severity_emojis = {
            "info": "INFO",
            "warning": "WARNING",
            "error": "ERROR",
            "critical": "CRITICAL",
        }

        emoji = severity_emojis.get(severity.lower(), "INFO")
        formatted_message = f"<b>{emoji}</b>\n{message}"

        alert_key = f"{severity}:{message}"
        now = datetime.now(timezone.utc)

        if alert_key in self.last_alert_time:
            time_since_last = (now - self.last_alert_time[alert_key]).total_seconds()
            if time_since_last < 60:
                logger.info("Alert suppressed (rate limit)")
                return

        try:
            async with aiohttp.ClientSession() as session:
                url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
                print(f"Posting to {url}")
                await session.post(
                    url,
                    json={
                        "chat_id": self.chat_id,
                        "text": formatted_message,
                        "parse_mode": "HTML",
                    },
                )
            self.last_alert_time[alert_key] = now
        except Exception as e:
            print(f"Failed to send alert: {e}")
