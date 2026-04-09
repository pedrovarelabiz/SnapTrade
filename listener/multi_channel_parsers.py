"""Live parsing functions for BLACKLIST and SINAIS MILIONARIOS channels.

Appended to multi_channel_parsers.py for real-time listener use.
"""

import logging
import re
from datetime import datetime, timedelta, timezone

UTC = timezone.utc

# A8 FIX: UTC offset for Brazilian channels (BRT = UTC-3, so +3 to convert to UTC)
# If channels change timezone, update this constant instead of hunting through code.
BRT_TO_UTC_HOURS = 3


def validate_martingale_times(martingale_times):
    """Validate and sanitize martingale_times array.

    Ensures all values are positive integers (minutes).
    Rejects invalid values like 0, negative numbers, or non-integers.

    Args:
        martingale_times: List or array to validate

    Returns:
        List of valid positive integers, or empty list if input is invalid
    """
    if not martingale_times:
        return []

    if not isinstance(martingale_times, (list, tuple)):
        logging.warning(f"martingale_times is not a list/tuple: {type(martingale_times)}")
        return []

    validated = []
    for i, val in enumerate(martingale_times):
        if not isinstance(val, int) or isinstance(val, bool):
            logging.warning(f"martingale_times[{i}] is not an integer: {val} (type={type(val).__name__})")
            continue
        if val <= 0:
            logging.warning(f"martingale_times[{i}] is not positive: {val}")
            continue
        validated.append(val)

    if len(validated) != len(martingale_times):
        logging.warning(f"martingale_times had {len(martingale_times) - len(validated)} invalid values removed")

    return validated

# Re-use patterns from multi_channel_parsers.py (they're module-level)
# These functions are designed to be added to that module.

_RESULT_ASSET_RE = re.compile(r'\b([A-Z]{3,8}(?:[/-][A-Z]{2,5})?(?:\s*OTC)?)\b', re.IGNORECASE)

# --- BLACKLIST live parser ---

_BL_LIVE_LINE_RE = re.compile(
    r"\U0001f4cd\s*"
    r"([A-Z]{3,8}[-/]?(?:OTC|[A-Z]{2,5})(?:\s*[-/]?\s*OTC)?)"
    r"\s*[-;]?\s*"
    r"(\d{1,2}:\d{2}(?::\d{2})?)"
    r"\s*[-;]?\s*"
    r"(CALL|PUT|BUY|SELL|COMPRA|VENDA|\u2b06\ufe0f|\u2b07\ufe0f|\u2191|\u2193)"
    r"(.*)",
    re.IGNORECASE,
)

_BL_LIVE_M5_RE = re.compile(
    r"M5\s*[;,]\s*"
    r"([A-Z]{3,8}[-]?(?:OTC|[A-Z]{2,5})(?:\s*-?\s*OTC)?)"
    r"\s*[;,]\s*"
    r"(\d{1,2}:\d{2}(?::\d{2})?)"
    r"\s*[;,]\s*"
    r"(CALL|PUT|BUY|SELL|COMPRA|VENDA)"
    r"(.*)",
    re.IGNORECASE,
)

_BL_RESULT_PATTERNS = {
    "direct_win": re.compile(r"\u2705(?!\s*G|\s*MG)"),
    "gale_win": re.compile(r"\u2705\s*G|\u2705G"),
    "loss": re.compile(r"\u26d4\ufe0f|\u26d4|\u274c"),
    "locked": re.compile(r"\U0001f510"),
}


def _bl_normalize_asset(raw):
    a = raw.strip().upper().replace("*", "").replace("\u200b", "")
    # Normalize "GBPUSD OTC" → "GBPUSD_OTC" before stripping spaces
    a = re.sub(r"\s+OTC\b", "_OTC", a)
    a = re.sub(r"\s+", "", a)
    if a.endswith("-OTC"):
        return f"{a[:-4]}_otc"
    if a.endswith("_OTC"):
        return f"{a[:-4]}_otc"
    if a.endswith("OTC") and len(a) >= 9:
        return f"{a[:-3]}_otc"
    if "/" in a:
        parts = a.split("/")
        base = parts[0].strip()
        rest = parts[1].strip()
        if "OTC" in rest:
            quote = rest.replace("OTC", "").replace("(", "").replace(")", "").strip()
            return f"{base}{quote}_otc"
        return f"{base}{rest}"
    return a


def _bl_normalize_dir(d):
    d = d.upper().strip()
    if d in ("CALL", "BUY", "COMPRA"):
        return "CALL"
    if d in ("PUT", "SELL", "VENDA"):
        return "PUT"
    if "\u2b06" in d or "\u2191" in d:
        return "CALL"
    if "\u2b07" in d or "\u2193" in d:
        return "PUT"
    return d


def parse_blacklist_live(text, msg_id, msg_date):
    """Parse BLACKLIST message. Returns list of parsed dicts.

    Handles:
    - Legacy format: 📍ASSET TIME DIR ✅/⛔ (inline, one line per signal)
    - Current format: • ASSET - DIR - TIME (bullet, separate result messages)
    - Informal result messages (Portuguese text)
    """
    try:
        results = []

        # --- Try legacy inline format (📍 lines with result emoji) ---
        lines = text.split("\n")
        for line in lines:
            line = line.strip()
            m = _BL_LIVE_LINE_RE.search(line)
            if not m:
                m = _BL_LIVE_M5_RE.search(line)
            if not m:
                continue

            raw_asset = m.group(1)
            time_str = m.group(2)
            raw_dir = m.group(3)
            rest = m.group(4).strip()

            asset = _bl_normalize_asset(raw_asset)
            direction = _bl_normalize_dir(raw_dir)
            if direction not in ("CALL", "PUT"):
                continue

            if _BL_RESULT_PATTERNS["locked"].search(rest):
                continue

            is_win = None
            gale_level = 0
            if _BL_RESULT_PATTERNS["gale_win"].search(rest):
                is_win = True
                gale_level = 1
            elif _BL_RESULT_PATTERNS["direct_win"].search(rest):
                is_win = True
                gale_level = 0
            elif _BL_RESULT_PATTERNS["loss"].search(rest):
                is_win = False
                gale_level = 2

            if is_win is None:
                continue

            try:
                parts = time_str.split(":")
                h, mi = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                continue
            entry_dt = msg_date.replace(hour=0, minute=0, second=0, microsecond=0)
            entry_dt += timedelta(hours=h + BRT_TO_UTC_HOURS, minutes=mi)

            diff_h = (entry_dt - msg_date).total_seconds() / 3600
            if diff_h > 18:
                entry_dt -= timedelta(days=1)
            elif diff_h < -18:
                entry_dt += timedelta(days=1)

            results.append({
                "type": "inline_signal",
                "asset": asset,
                "direction": direction,
                "entry_time_utc": entry_dt.isoformat(),
                "is_win": is_win,
                "gale_level": gale_level,
            })

        if results:
            return results

        # --- Try current format: • ASSET - DIR - TIME (signal only, no inline result) ---
        has_header = "SINAL BLACKLIST" in text or "SINAL" in text.upper()
        m_bullet = _SM_LIVE_SIGNAL_RE.search(text)

        if has_header and m_bullet:
            raw_asset = m_bullet.group(1)
            raw_dir = m_bullet.group(2)
            time_str = m_bullet.group(3)

            asset = _bl_normalize_asset(raw_asset)
            direction = _bl_normalize_dir(raw_dir)

            if direction in ("CALL", "PUT"):
                try:
                    h, mi = map(int, time_str.split(":"))
                except (ValueError, IndexError):
                    return []
                entry_dt = msg_date.replace(hour=0, minute=0, second=0, microsecond=0)
                entry_dt += timedelta(hours=h + BRT_TO_UTC_HOURS, minutes=mi)

                diff_h = (entry_dt - msg_date).total_seconds() / 3600
                if diff_h > 18:
                    entry_dt -= timedelta(days=1)
                elif diff_h < -18:
                    entry_dt += timedelta(days=1)

                expiration_time = entry_dt + timedelta(minutes=5)
                return [{
                    "type": "signal",
                    "asset": asset,
                    "direction": direction,
                    "entry_time_utc": entry_dt.isoformat(),
                    "expiration_time": expiration_time.isoformat(),
                    "expiration_minutes": 5,
                    "format_version": 99,
                    "martingale_times": validate_martingale_times([]),
                }]

        # --- Try informal result (Portuguese text, no signal pattern) ---
        informal = _parse_result_informal(text)
        if informal:
            return [informal]

        return results
    except Exception as e:
        logging.error(f"parse_blacklist_live failed: {e}")
        return None


# --- SINAIS MILIONARIOS live parser ---

_SM_LIVE_SIGNAL_RE = re.compile(
    r"[\u2022\u00b7]\s*"
    r"([A-Z]{3,8}(?:\s*/\s*[A-Z]{2,5})?(?:\s*\(?OTC\)?)?)"
    r"\s*[-\u2013\u2014]\s*"
    r"(CALL|PUT|BUY|SELL|COMPRA|VENDA)"
    r"\s*[-\u2013\u2014]?\s*"
    r"(\d{1,2}:\d{2})",
    re.IGNORECASE,
)

_SM_LIVE_WIN_GALE_RE = re.compile(
    r"\u2705\s*(?:Win|Vit\u00f3ria|Vitoria|V)?\s*(?:MG|G|Gale)\s*1?",
    re.IGNORECASE,
)
_SM_LIVE_LOSS_RE = re.compile(r"\U0001f4a2|\u274c|Loss|Perda", re.IGNORECASE)
_SM_LIVE_LOCKED_RE = re.compile(r"\U0001f510|Par fechado|fechado", re.IGNORECASE)
_SM_LIVE_DOJI_RE = re.compile(r"Empate|Doji", re.IGNORECASE)
_SM_LIVE_WIN_RE = re.compile(r"\u2705\s*(?:Win|Vit\u00f3ria|Vitoria|V)", re.IGNORECASE)
_SM_LIVE_WIN_SIMPLE = re.compile(r"\u2705\s*Win!?", re.IGNORECASE)


def _sm_normalize_asset(raw):
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


def _sm_normalize_dir(d):
    d = d.upper().strip()
    if d in ("CALL", "BUY", "COMPRA", "COMPRAR"):
        return "CALL"
    if d in ("PUT", "SELL", "VENDA", "VENDER"):
        return "PUT"
    return d


def _parse_result_informal(text):
    """Parse informal Portuguese result messages (BLACKLIST / SINAIS MIL).

    Returns {"type": "result", "result": "win"|"loss", "gale_level": int} or None.
    """
    try:
        if not text or len(text.strip()) < 3:
            return None
        t = text.lower()

        # Skip: signal messages, promos, commentary without result
        skip_kw = [
            'sinal', 'estratégia', 'expiração', 'corretora', 'pocketbr', 'cadastro',
            'youtube', 'telegram', 'ao vivo', 'link', 'ativem as notificações',
            'sigo analisando', 'em busca de', 'vou aguardar', 'bom dia', 'boa noite',
            'particip', 'sorteio', 'grupo',
        ]
        if any(k in t for k in skip_kw):
            return None

        # WIN patterns (from real channel messages)
        win_patterns = ['win', 'paga', 'pagou', 'paaaa', 'quem pegou', '\U0001f49a', '\U0001f525\U0001f525']
        # LOSS patterns
        loss_patterns = [
            'não respeitou', 'nao respeitou', 'infelizmente', 'loss',
            'perdeu', 'levou também', 'levou tambem', 'assaltou',
            'stop', '\U0001f92c', '\U0001f635',
        ]

        is_win = any(k in t or k in text for k in win_patterns)
        is_loss = any(k in t or k in text for k in loss_patterns)

        # "levou também" overrides win — it means gale also lost
        if 'levou também' in t or 'levou tambem' in t or 'levou tudo' in t:
            is_win = False
            is_loss = True

        if is_win == is_loss:
            return None  # Ambiguous or neither

        # Gale level
        gale_level = 0
        if any(k in t for k in ['no gale', 'no 1 gale', '1 gale', 'na segunda', 'segunda vela']):
            gale_level = 1
        elif any(k in t for k in ['no 2 gale', '2 gale', 'na terceira']):
            gale_level = 2
        elif any(k in t for k in ['de primeira', 'na primeira', 'direto', 'directo', 'primeira!']):
            gale_level = 0

        # Extract asset if mentioned (for Tier 2 matching)
        result_dict = {"type": "result", "result": "win" if is_win else "loss", "gale_level": gale_level}
        asset_match = _RESULT_ASSET_RE.search(text)
        if asset_match:
            result_dict["asset"] = _bl_normalize_asset(asset_match.group(1))
        return result_dict
    except Exception as e:
        logging.error(f"_parse_result_informal failed: {e}")
        return None


def parse_sinais_live(text, msg_id, msg_date):
    """Parse SINAIS MILIONARIOS message. Returns list with 0 or 1 item.

    Handles both signal messages (📊 SINAL VIP ...) and informal result messages.
    """
    try:
        # --- Result-only messages (no signal pattern, informal text) ---
        if "SINAL VIP" not in text and "\U0001f4ca" not in text:
            informal = _parse_result_informal(text)
            return [informal] if informal else []

        m = _SM_LIVE_SIGNAL_RE.search(text)
        if not m:
            # Has 📊 but no signal line — might be a promo or info message
            informal = _parse_result_informal(text)
            return [informal] if informal else []

        raw_asset = m.group(1)
        raw_dir = m.group(2)
        time_str = m.group(3)

        asset = _sm_normalize_asset(raw_asset)
        direction = _sm_normalize_dir(raw_dir)
        if direction not in ("CALL", "PUT"):
            return []

        # Check for locked/doji
        if _SM_LIVE_LOCKED_RE.search(text) or _SM_LIVE_DOJI_RE.search(text):
            return []

        # Parse entry time (UTC-3 -> UTC)
        try:
            h, mi = map(int, time_str.split(":"))
        except (ValueError, IndexError):
            return []
        entry_dt = msg_date.replace(hour=0, minute=0, second=0, microsecond=0)
        entry_dt += timedelta(hours=h + BRT_TO_UTC_HOURS, minutes=mi)

        diff_h = (entry_dt - msg_date).total_seconds() / 3600
        if diff_h > 18:
            entry_dt -= timedelta(days=1)
        elif diff_h < -18:
            entry_dt += timedelta(days=1)

        # Check for inline result (legacy format)
        is_win = None
        gale_level = 0
        if _SM_LIVE_WIN_GALE_RE.search(text):
            is_win = True
            gale_level = 1
        elif _SM_LIVE_LOSS_RE.search(text):
            is_win = False
            gale_level = 1
        elif _SM_LIVE_WIN_RE.search(text) or _SM_LIVE_WIN_SIMPLE.search(text):
            is_win = True
            gale_level = 0

        if is_win is not None:
            # Inline result present — return combined signal+result
            return [{
                "type": "inline_signal",
                "asset": asset,
                "direction": direction,
                "entry_time_utc": entry_dt.isoformat(),
                "is_win": is_win,
                "gale_level": gale_level,
            }]

        # Signal only — no inline result
        expiration_time = entry_dt + timedelta(minutes=5)
        return [{
            "type": "signal",
            "asset": asset,
            "direction": direction,
            "entry_time_utc": entry_dt.isoformat(),
            "expiration_time": expiration_time.isoformat(),
            "expiration_minutes": 5,
            "format_version": 99,
            "martingale_times": validate_martingale_times([]),
        }]
    except Exception as e:
        logging.error(f"parse_sinais_live failed: {e}")
        return None


# --- COLE CARTER / PRIVATE TEAM live parser (instant_ready format) ---

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


def _ir_normalize_asset(raw):
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


def parse_instant_ready_live(text, msg_id, msg_date):
    """Parse instant_ready format (Cole Carter / Private Team).

    These channels send signals as:
      Getting: PAIR ready
      Analysis: BUY/SELL
      Use within 1-2 minutes

    Returns a signal-only dict (no result) since results are not inline.
    """
    try:
        sig_m = _IR_SIGNAL_RE.search(text)
        dir_m = _IR_DIR_RE.search(text)

        if not sig_m or not dir_m:
            return []

        asset = _ir_normalize_asset(sig_m.group(1))
        direction = "CALL" if dir_m.group(1).upper() == "BUY" else "PUT"

        expiration_time = msg_date + timedelta(minutes=5)
        return [{
            "type": "signal",
            "asset": asset,
            "direction": direction,
            "entry_time_utc": msg_date.isoformat(),
            "expiration_time": expiration_time.isoformat(),
            "expiration_minutes": 5,
            "format_version": 100,
            "martingale_times": validate_martingale_times([]),
        }]
    except Exception as e:
        logging.error(f"parse_instant_ready_live failed: {e}")
        return None


# --- VIP SIGNALS OTC MARKET parser (M1 signals) ---

_VIP_OTC_SIGNAL_RE = re.compile(
    r'\*{0,2}"([A-Z]{2,5}/[A-Z]{2,6})\\?"\*{0,2}\s*\*{0,2}OTC\*{0,2}',
    re.IGNORECASE,
)
_VIP_OTC_DIR_RE = re.compile(
    r'\*{0,2}"(BUY|SELL)"\*{0,2}\s+on\s+the\s+next\s+Candle',
    re.IGNORECASE,
)
_VIP_OTC_GALE_RE = re.compile(r'prepared\s+Martin\*{0,2}\s*(\d+)', re.IGNORECASE)


def _vip_otc_normalize_asset(raw):
    a = raw.strip().upper().replace("*", "").replace("\\", "").replace('"', '')
    a = re.sub(r"\s+", "", a)
    if "/" in a:
        parts = a.split("/")
        return f"{parts[0]}{parts[1]}_otc"
    return f"{a}_otc"


def parse_vip_otc_market(text, msg_id, msg_date):
    """Parse VIP Signals OTC Market messages (M1 format).

    Signal:  **"ASSET"** **OTC** ... **"BUY/SELL"** on the next Candle
    Gale:    prepared Martin N
    Entry:   **Entered trade, prepare Martin if loss**

    Returns signal, gale, or empty list.
    """
    try:
        if not text or not text.strip():
            return []

        # Clean non-breaking spaces
        clean = text.replace("\xa0", " ")

        # Signal
        sm = _VIP_OTC_SIGNAL_RE.search(clean)
        dm = _VIP_OTC_DIR_RE.search(clean)
        if sm and dm:
            asset = _vip_otc_normalize_asset(sm.group(1))
            direction = "CALL" if dm.group(1).upper() == "BUY" else "PUT"
            # Entry = next candle = msg_date rounded up to next minute
            entry = msg_date.replace(second=0, microsecond=0) + timedelta(minutes=1)
            expiration_time = entry + timedelta(minutes=1)
            return [{
                "type": "signal",
                "asset": asset,
                "direction": direction,
                "entry_time_utc": entry.isoformat(),
                "expiration_time": expiration_time.isoformat(),
                "expiration_minutes": 1,
                "format_version": 4,
                "martingale_times": validate_martingale_times([]),
            }]

        # Gale: "prepared Martin N" — indicates trade at level N-1 lost
        gm = _VIP_OTC_GALE_RE.search(clean)
        if gm:
            try:
                level = int(gm.group(1))
            except ValueError:
                return []
            return [{"type": "gale", "level": level}]

        return []
    except Exception as e:
        logging.error(f"parse_vip_otc_market failed: {e}")
        return None
