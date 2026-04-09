"""Production parser for POCKET VIP SIGNALS sticker-based protocol."""

import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

try:
    import pytesseract
    from PIL import Image, ImageEnhance, ImageOps
    HAS_OCR = True
except ImportError:
    HAS_OCR = False

FLAG_TO_CURRENCY = {
    '\U0001f1ec\U0001f1e7': 'GBP', '\U0001f1ea\U0001f1fa': 'EUR',
    '\U0001f1fa\U0001f1f8': 'USD', '\U0001f1ef\U0001f1f5': 'JPY',
    '\U0001f1e6\U0001f1fa': 'AUD', '\U0001f1e8\U0001f1e6': 'CAD',
    '\U0001f1e8\U0001f1ed': 'CHF', '\U0001f1f3\U0001f1ff': 'NZD',
    '\U0001f1f3\U0001f1f4': 'NOK', '\U0001f1f8\U0001f1ea': 'SEK',
    '\U0001f1e9\U0001f1f0': 'DKK', '\U0001f1f8\U0001f1ec': 'SGD',
    '\U0001f1ff\U0001f1e6': 'ZAR', '\U0001f1f2\U0001f1fd': 'MXN',
    '\U0001f1e7\U0001f1f7': 'BRL', '\U0001f1f9\U0001f1f7': 'TRY',
    '\U0001f1ee\U0001f1f3': 'INR', '\U0001f1e8\U0001f1f3': 'CNY',
    '\U0001f1f7\U0001f1fa': 'RUB', '\U0001f1ed\U0001f1f0': 'HKD',
    '\U0001f1f0\U0001f1f7': 'KRW', '\U0001f1f5\U0001f1f1': 'PLN',
    '\U0001f1ed\U0001f1fa': 'HUF',
}

DEFAULT_QUOTES = {
    'GBP': 'AUD', 'EUR': 'USD', 'AUD': 'USD', 'USD': 'JPY',
    'CAD': 'JPY', 'NZD': 'USD', 'CHF': 'JPY',
}

CURRENCIES = {'EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD',
              'NOK', 'SEK', 'DKK', 'SGD', 'HKD', 'MXN', 'BRL', 'TRY',
              'ZAR', 'PLN', 'HUF', 'INR', 'CNY', 'RUB', 'KRW'}


def ocr_extract_pair(photo_path):
    """Extract currency pair from chart screenshot using OCR."""
    if not HAS_OCR or not photo_path or not os.path.exists(photo_path):
        return None
    try:
        img = Image.open(photo_path)
        if img.mode != 'RGB':
            img = img.convert('RGB')

        for fn in [
            lambda i: i,
            lambda i: ImageOps.invert(ImageEnhance.Contrast(i.convert('L')).enhance(3.0)),
            lambda i: i.resize((i.width * 2, i.height * 2), Image.LANCZOS),
        ]:
            processed = fn(img)
            try:
                text = pytesseract.image_to_string(processed).upper()
            except (pytesseract.TesseractError, OSError, IOError) as e:
                logger.error(f"OCR failed: {e}")
                return None
            pair_match = re.search(r'([A-Z]{3})\s*/\s*([A-Z]{3})', text)
            if pair_match:
                b, q = pair_match.group(1), pair_match.group(2)
                if b in CURRENCIES and q in CURRENCIES:
                    return (b, q)
            for c1 in CURRENCIES:
                for c2 in CURRENCIES:
                    if c1 != c2 and c1 + c2 in text.replace(' ', ''):
                        return (c1, c2)
        return None
    except Exception as e:
        logger.error(f"OCR failed: {e}")
        return None


@dataclass
class StickerBuffer:
    pair_base: Optional[str] = None
    pair_quote: Optional[str] = None
    timeframe: int = 5
    direction: Optional[str] = None
    first_time: Optional[datetime] = None
    last_time: Optional[datetime] = None
    msg_ids: list = field(default_factory=list)
    WINDOW_SECONDS: int = 30

    def add(self, name, value, ts, mid=0):
        setattr(self, name, value)
        if self.first_time is None:
            self.first_time = ts
        self.last_time = ts
        if mid:
            self.msg_ids.append(mid)

    def is_complete(self):
        return self.pair_base is not None and self.direction is not None

    def is_expired(self, now):
        if self.first_time is None:
            return False
        return (now - self.first_time).total_seconds() > self.WINDOW_SECONDS

    def get_asset(self):
        quote = self.pair_quote or DEFAULT_QUOTES.get(self.pair_base, 'USD')
        return self.pair_base + '/' + quote

    def reset(self):
        self.pair_base = None
        self.pair_quote = None
        self.timeframe = 5
        self.direction = None
        self.first_time = None
        self.last_time = None
        self.msg_ids = []


class PocketVipParser:
    def __init__(self, temp_dir='/tmp/pocket_vip_photos'):
        self.buffer = StickerBuffer()
        self.last_signal_id = None
        self.last_signal_asset = None
        self.awaiting_gale = False
        self.temp_dir = temp_dir
        os.makedirs(temp_dir, exist_ok=True)

    async def process_message(self, msg):
        """Process a Telethon message. Returns dict or None."""
        msg_date = msg.date

        if self.buffer.is_expired(msg_date):
            self.buffer.reset()

        # PHOTO
        if msg.photo:
            photo_path = os.path.join(self.temp_dir, 'photo_' + str(msg.id) + '.jpg')
            await msg.download_media(photo_path)
            pair = ocr_extract_pair(photo_path)
            if pair:
                self.buffer.add('pair_base', pair[0], msg_date, msg.id)
                self.buffer.add('pair_quote', pair[1], msg_date)
            try:
                files = sorted([f for f in os.listdir(self.temp_dir) if f.startswith('photo_')])
                for f in files[:-5]:
                    os.remove(os.path.join(self.temp_dir, f))
            except Exception:
                pass
            return self._check_complete(msg.id, msg_date)

        # STICKER
        if msg.sticker:
            emoji = None
            if msg.sticker.attributes:
                for attr in msg.sticker.attributes:
                    if hasattr(attr, 'alt') and attr.alt:
                        emoji = attr.alt
                        break
            if not emoji:
                return None

            currency = FLAG_TO_CURRENCY.get(emoji)
            if currency:
                if self.buffer.pair_base is None:
                    self.buffer.add('pair_base', currency, msg_date, msg.id)
                elif self.buffer.pair_quote is None and currency != self.buffer.pair_base:
                    self.buffer.add('pair_quote', currency, msg_date, msg.id)
                return self._check_complete(msg.id, msg_date)

            if emoji in ('\u2b06\ufe0f', '\u2b06', '\u2191'):
                self.buffer.add('direction', 'CALL', msg_date, msg.id)
                return self._check_complete(msg.id, msg_date)
            if emoji in ('\u2b07\ufe0f', '\u2b07', '\u2193'):
                self.buffer.add('direction', 'PUT', msg_date, msg.id)
                return self._check_complete(msg.id, msg_date)

            if emoji == '5\ufe0f\u20e3':
                self.buffer.add('timeframe', 5, msg_date, msg.id)
                return None
            if emoji == '3\ufe0f\u20e3':
                self.buffer.add('timeframe', 3, msg_date, msg.id)
                return None
            if emoji == '1\ufe0f\u20e3':
                if self.awaiting_gale:
                    self.awaiting_gale = False
                    return None
                self.buffer.add('timeframe', 1, msg_date, msg.id)
                return None

            if emoji == '\U0001f3c6':  # trophy
                self.awaiting_gale = False
                if self.last_signal_id:
                    return {
                        'type': 'result',
                        'result_type': 'direct_victory',
                        'is_win': True,
                        'gale_level': 0,
                    }
                return None

            if emoji in ('\u274e', '\u274c', '\U0001f7e5'):  # cross mark, X, red square
                if self.last_signal_id:
                    self.awaiting_gale = True
                    return {
                        'type': 'result',
                        'result_type': 'loss',
                        'is_win': False,
                        'gale_level': 0,
                    }
                return None

        # TEXT
        if msg.text:
            upper = (msg.text or '').upper()
            if 'MARTINGALE' in upper or 'GALE' in upper:
                self.awaiting_gale = True
                return None

        return None

    def _check_complete(self, msg_id, msg_date):
        if self.buffer.is_complete():
            asset = self.buffer.get_asset()
            signal = {
                'type': 'signal',
                'asset': asset,
                'direction': self.buffer.direction,
                'entry_time_utc': msg_date.isoformat() if msg_date else None,
                'expiration_minutes': self.buffer.timeframe,
                'format_version': 99,
                'martingale_times': [],
                'signal_type': 'instant',
            }
            self.last_signal_id = msg_id
            self.last_signal_asset = asset
            self.awaiting_gale = False
            self.buffer.reset()
            return signal
        return None
