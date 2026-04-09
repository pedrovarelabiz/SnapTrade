"""Signal & Result Parser for TYL VIP trading channel."""

import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from rich.console import Console

from config import RAW_MESSAGES_PATH

console = Console()
UTC = timezone.utc

NOISE_PATTERNS = re.compile(
    r"VIP SESSION STARTING|SESSION STARTED|SESSION HAS STARTED|"
    r"SESSION HAS ENDED|OPERATIONS REPORT|Attention traders|"
    r"Set Your Alarms|We will stop|market is bad|"
    r"The session has started|The session has ended|"
    r"SESSION STARTING IN|HIGH-QUALITY SIGNALS",
    re.IGNORECASE,
)

COIN_EMOJI = "\U0001fa99"
GREEN_CIRCLE = "\U0001f7e2"
RED_CIRCLE = "\U0001f534"
EM_DASH = "\u2014"


@dataclass(frozen=True)
class ParsedSignal:
    message_id: int
    message_date: datetime
    asset: str
    direction: str
    signal_type: str
    entry_time_utc: datetime
    expiration_minutes: int
    martingale_times: tuple
    raw_text: str
    format_version: int


@dataclass(frozen=True)
class ParsedResult:
    message_id: int
    message_date: datetime
    result_type: str
    gale_level: Optional[int]
    raw_text: str


def _normalize_asset(raw):
    a = raw.strip().upper().replace("*", "").replace("\u200b", "")
    if "/" in a:
        parts = a.split("/")
        base = parts[0].strip()
        rest = parts[1].strip()
        if "OTC" in rest:
            quote = rest.replace("OTC", "").strip()
            return f"{base}{quote}_otc"
        return f"{base}{rest}"
    # Normalize _OTC to _otc for consistency
    if a.endswith("_OTC"):
        a = a[:-4] + "_otc"
    elif not a.endswith("_otc") and "_OTC" in a:
        a = a.replace("_OTC", "_otc")
    return a


def _time_to_utc(time_str, msg_date, utc_offset_hours=0):
    try:
        h, m = map(int, time_str.strip().split(":"))
    except (ValueError, AttributeError) as e:
        console.print(f"[red]Failed to parse time: {time_str}[/red]")
        return None
    dt = msg_date.replace(hour=h, minute=m, second=0, microsecond=0)
    diff = (dt - msg_date).total_seconds()
    if diff > 12 * 3600:
        dt -= timedelta(days=1)
    elif diff < -12 * 3600:
        dt += timedelta(days=1)
    if utc_offset_hours != 0:
        dt += timedelta(hours=-utc_offset_hours)
    return dt


def _parse_format1(text, msg_id, msg_date):
    if "OPPORTUNITY FOUND" not in text.upper():
        return None
    pattern = r"([A-Za-z_]+)\s*" + EM_DASH + r"\s*(\d{1,2}:\d{2}):\s*(CALL|PUT)"
    try:
        m = re.search(pattern, text, re.IGNORECASE)
    except re.error as error:
        console.print(f"[red]Regex error in parsing: {error}[/red]")
        return None
    if not m:
        return None
    raw_asset, entry_str, direction = m.group(1), m.group(2), m.group(3).upper()
    asset = _normalize_asset(raw_asset)
    entry_utc = _time_to_utc(entry_str, msg_date, utc_offset_hours=-3)
    if entry_utc is None:
        return None
    mg_times = []
    prot_pattern = (
        r"(?:PROTECTION|MARTINGALE)\s*[-\u2013\u2014]?\s*"
        r"(?:ENDS\s+AT\s*)?(\d{1,2}:\d{2})"
    )
    try:
        mg_matches = re.findall(prot_pattern, text, re.IGNORECASE)
    except re.error as error:
        console.print(f"[red]Regex error in parsing: {error}[/red]")
        return None
    for t in mg_matches:
        mg_utc = _time_to_utc(t, msg_date, utc_offset_hours=-3)
        if mg_utc is not None:
            mg_times.append(mg_utc.strftime("%H:%M"))
    return ParsedSignal(
        message_id=msg_id,
        message_date=msg_date,
        asset=asset,
        direction=direction,
        signal_type="scheduled",
        entry_time_utc=entry_utc,
        expiration_minutes=5,
        martingale_times=tuple(mg_times),
        raw_text=text,
        format_version=1,
    )


def _parse_format2(text, msg_id, msg_date, utc_offset=0):
    if COIN_EMOJI not in text:
        return None
    try:
        am = re.search(
            COIN_EMOJI
            + r"\s*\*{0,2}\s*([A-Z]{2,4}\s*/\s*[A-Z]{2,4}(?:\s+OTC)?)\s*\*{0,2}",
            text,
            re.IGNORECASE,
        )
    except re.error as error:
        console.print(f"[red]Regex error in parsing: {error}[/red]")
        return None
    if not am:
        return None
    asset = _normalize_asset(am.group(1))
    direction = None
    try:
        if re.search(r"\bBUY\b", text, re.IGNORECASE) or GREEN_CIRCLE in text:
            direction = "CALL"
        elif re.search(r"\bSELL\b", text, re.IGNORECASE) or RED_CIRCLE in text:
            direction = "PUT"
    except re.error as error:
        console.print(f"[red]Regex error in parsing: {error}[/red]")
        return None
    if not direction:
        try:
            dm = re.search(r"\b(CALL|PUT)\b", text, re.IGNORECASE)
        except re.error as error:
            console.print(f"[red]Regex error in parsing: {error}[/red]")
            return None
        if dm:
            direction = dm.group(1).upper()
    if not direction:
        return None
    try:
        em = re.search(r"Entry\s+at\s+(\d{1,2}:\d{2})", text, re.IGNORECASE)
    except re.error as error:
        console.print(f"[red]Regex error in parsing: {error}[/red]")
        return None
    if not em:
        return None
    entry_utc = _time_to_utc(em.group(1), msg_date, utc_offset_hours=utc_offset)
    if entry_utc is None:
        return None
    mg_times = []
    try:
        mg_matches = re.findall(r"MARTINGALE\s+AT\s+(\d{1,2}:\d{2})", text, re.IGNORECASE)
    except re.error as error:
        console.print(f"[red]Regex error in parsing: {error}[/red]")
        return None
    for t in mg_matches:
        mg_utc = _time_to_utc(t, msg_date, utc_offset_hours=utc_offset)
        if mg_utc is not None:
            mg_times.append(mg_utc.strftime("%H:%M"))
    return ParsedSignal(
        message_id=msg_id,
        message_date=msg_date,
        asset=asset,
        direction=direction,
        signal_type="scheduled",
        entry_time_utc=entry_utc,
        expiration_minutes=5,
        martingale_times=tuple(mg_times),
        raw_text=text,
        format_version=2,
    )


def _parse_result(text, msg_id, msg_date):
    upper = text.upper().strip()
    if "DIRECT VICTORY" in upper or "DIRECT WIN" in upper:
        return ParsedResult(msg_id, msg_date, "direct_victory", 0, text)
    try:
        pm = re.search(r"VICTORY\s+(\d)\s*[\xba\xaa\xb0]\s*PROTECTION", upper)
    except re.error as error:
        console.print(f"[red]Regex error in parsing: {error}[/red]")
        return None
    if pm:
        return ParsedResult(
            msg_id, msg_date, "victory_at_gale", int(pm.group(1)), text
        )
    if "VICTORY" in upper and "GALE" in upper:
        return ParsedResult(msg_id, msg_date, "victory_at_gale", None, text)
    if "LOSS" in upper and len(text.strip()) < 60:
        return ParsedResult(msg_id, msg_date, "loss", 2, text)
    return None


def _is_noise(text):
    stripped = text.strip()
    if len(stripped) < 20:
        upper = stripped.upper()
        if any(w in upper for w in ("VICTORY", "LOSS", "WIN")):
            return False
        return True
    try:
        return bool(NOISE_PATTERNS.search(text))
    except re.error as error:
        console.print(f"[red]Regex error in parsing: {error}[/red]")
        return None


def verify_timezone_f2(messages, signals):
    """Detect Format 2 timezone by comparing entry times to message timestamps.

    Tests offsets 0, +1, -1, -3 and picks the one where entry_time_utc
    is closest to (but slightly after) message_date.
    """
    f2_sigs = [s for s in signals if s.format_version == 2]
    if not f2_sigs:
        console.print("  [yellow]No F2 signals for TZ verification.[/yellow]")
        return 0

    # For each signal, the entry time (with offset 0) vs message time
    # tells us: entry_time(offset=0) - msg_time = raw_delta
    # The correct offset makes raw_delta - offset*60 ~ 2-5 min
    import re as _re
    test_offsets = [0, 1, -1, -3]
    deltas = {o: [] for o in test_offsets}

    for sig in f2_sigs[:200]:
        try:
            em = _re.search(r"Entry\s+at\s+(\d{1,2}:\d{2})", sig.raw_text, _re.IGNORECASE)
        except _re.error as error:
            console.print(f"[red]Regex error in parsing: {error}[/red]")
            continue
        if not em:
            continue
        try:
            h, mi = map(int, em.group(1).split(":"))
        except ValueError:
            console.print(f"[red]Failed to parse time: {em.group(1)}[/red]")
            continue
        for offset in test_offsets:
            entry_h = (h - offset) % 24
            entry_dt = sig.message_date.replace(
                hour=entry_h, minute=mi, second=0, microsecond=0
            )
            diff = (entry_dt - sig.message_date).total_seconds() / 60
            if diff > 720:
                diff -= 1440
            elif diff < -720:
                diff += 1440
            deltas[offset].append(diff)

    console.print("  TZ offset candidates (entry_utc - msg_time):")
    best_offset = 0
    best_avg = 999
    for offset in test_offsets:
        d = deltas[offset]
        if not d:
            continue
        avg = sum(d) / len(d)
        console.print(f"    offset={offset:+d}: avg delta={avg:+.1f}min")
        if 0 <= avg <= 10 and abs(avg - 3) < abs(best_avg - 3):
            best_avg = avg
            best_offset = offset

    console.print(f"  [green]-> Best offset: UTC{best_offset:+d} (avg delta {best_avg:+.1f}min)[/green]")
    return best_offset


def parse_all(messages=None):
    """Parse all messages into signals and results."""
    if messages is None:
        with open(RAW_MESSAGES_PATH, "r", encoding="utf-8") as f:
            messages = json.load(f)
    console.print(f"[bold]Parsing {len(messages)} messages...[/bold]")
    signals, results = [], []
    noise_count = 0
    f1_count = f2_count = 0

    for msg in messages:
        try:
            text = msg.get("text", "")
            if not text:
                continue
            msg_id = msg["id"]
            try:
                msg_date = datetime.fromisoformat(msg["date"])
            except ValueError:
                console.print(f"[red]Failed to parse time: {msg['date']}[/red]")
                continue
            if msg_date.tzinfo is None:
                msg_date = msg_date.replace(tzinfo=UTC)
            msg_date = msg_date.astimezone(UTC)

            if _is_noise(text):
                noise_count += 1
                continue
            s = _parse_format1(text, msg_id, msg_date)
            if s:
                signals.append(s)
                f1_count += 1
                continue
            s = _parse_format2(text, msg_id, msg_date, utc_offset=0)
            if s:
                signals.append(s)
                f2_count += 1
                continue
            r = _parse_result(text, msg_id, msg_date)
            if r:
                results.append(r)
                continue
            noise_count += 1
        except Exception as e:
            console.print(f"[red]Parse error for msg {msg.get('id', 'unknown')}: {e}[/red]")
            continue

    console.print("[bold]Timezone verification (Format 2):[/bold]")
    tz_off = verify_timezone_f2(messages, signals)

    if tz_off != 0:
        console.print(f"[yellow]Re-parsing F2 with offset {tz_off}...[/yellow]")
        new_signals = [s for s in signals if s.format_version == 1]
        f2_count = 0
        for msg in messages:
            try:
                text = msg.get("text", "")
                if not text or COIN_EMOJI not in text:
                    continue
                msg_id = msg["id"]
                try:
                    msg_date = datetime.fromisoformat(msg["date"])
                except ValueError:
                    console.print(f"[red]Failed to parse time: {msg['date']}[/red]")
                    continue
                if msg_date.tzinfo is None:
                    msg_date = msg_date.replace(tzinfo=UTC)
                msg_date = msg_date.astimezone(UTC)
                s = _parse_format2(text, msg_id, msg_date, utc_offset=tz_off)
                if s:
                    new_signals.append(s)
                    f2_count += 1
            except Exception as e:
                console.print(f"[red]Parse error in F2 re-parse for msg {msg.get('id', 'unknown')}: {e}[/red]")
                continue
        signals = sorted(new_signals, key=lambda x: x.message_date)

    result_types = {}
    for r in results:
        result_types[r.result_type] = result_types.get(r.result_type, 0) + 1

    stats = {
        "total_messages": len(messages),
        "signals_parsed": len(signals),
        "format1_signals": f1_count,
        "format2_signals": f2_count,
        "results_parsed": len(results),
        "noise_filtered": noise_count,
        "tz_offset_format2": tz_off,
        "result_types": result_types,
    }
    return signals, results, stats


def _validate_signal(signal_dict, msg_id):
    """Validate that required fields are present in parsed signal.

    Required fields: asset (symbol), entry_time_utc (time), direction.
    Returns True if valid, False otherwise.
    """
    required_fields = ["asset", "entry_time_utc", "direction"]
    missing = [field for field in required_fields if not signal_dict.get(field)]

    if missing:
        console.print(
            f"[yellow]Warning: Signal validation failed for msg {msg_id}. "
            f"Missing required fields: {', '.join(missing)}[/yellow]"
        )
        return False
    return True


def parse_message(text, msg_id, msg_date, f2_utc_offset=1):
    """Parse a single message. Returns dict with type='signal'|'result' or None.

    This wraps the existing private helpers for use by the real-time listener.
    Hardcoded offsets: Format 1 = UTC-3, Format 2 = configurable (default +1).
    """
    try:
        if not text or not text.strip():
            return None

        if _is_noise(text):
            return None

        # Try Format 1 (UTC-3 offset)
        try:
            sig = _parse_format1(text, msg_id, msg_date)
            if sig:
                try:
                    signal_dict = {
                        "type": "signal",
                        "asset": sig.asset,
                        "direction": sig.direction,
                        "entry_time_utc": sig.entry_time_utc.isoformat(),
                        "expiration_minutes": sig.expiration_minutes,
                        "format_version": sig.format_version,
                        "martingale_times": list(sig.martingale_times),
                    }
                    if not _validate_signal(signal_dict, msg_id):
                        return None
                    return signal_dict
                except (AttributeError, ValueError, TypeError) as e:
                    console.print(f"[red]Format 1 data extraction error for msg {msg_id}: {e}[/red]")
                    return None
        except Exception as e:
            console.print(f"[red]Format 1 parse error for msg {msg_id}: {e}[/red]")
            # Continue to try Format 2

        # Try Format 2 (configurable offset)
        try:
            sig = _parse_format2(text, msg_id, msg_date, utc_offset=f2_utc_offset)
            if sig:
                try:
                    signal_dict = {
                        "type": "signal",
                        "asset": sig.asset,
                        "direction": sig.direction,
                        "entry_time_utc": sig.entry_time_utc.isoformat(),
                        "expiration_minutes": sig.expiration_minutes,
                        "format_version": sig.format_version,
                        "martingale_times": list(sig.martingale_times),
                    }
                    if not _validate_signal(signal_dict, msg_id):
                        return None
                    return signal_dict
                except (AttributeError, ValueError, TypeError) as e:
                    console.print(f"[red]Format 2 data extraction error for msg {msg_id}: {e}[/red]")
                    return None
        except Exception as e:
            console.print(f"[red]Format 2 parse error for msg {msg_id}: {e}[/red]")
            # Continue to try result parsing

        # Try result
        try:
            result = _parse_result(text, msg_id, msg_date)
            if result:
                try:
                    return {
                        "type": "result",
                        "result_type": result.result_type,
                        "gale_level": result.gale_level,
                    }
                except (AttributeError, ValueError, TypeError) as e:
                    console.print(f"[red]Result data extraction error for msg {msg_id}: {e}[/red]")
                    return None
        except Exception as e:
            console.print(f"[red]Result parse error for msg {msg_id}: {e}[/red]")
            return None

        return None
    except Exception as e:
        console.print(f"[red]Parse error for msg {msg_id}: {e}[/red]")
        return None
