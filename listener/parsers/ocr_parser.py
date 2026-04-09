"""OCR parser with Sentry error tracking."""

import logging
import os
import re
from typing import Optional, Tuple

import sentry_sdk

logger = logging.getLogger(__name__)

try:
    import pytesseract
    from PIL import Image, ImageEnhance, ImageOps
    HAS_OCR = True
except ImportError:
    HAS_OCR = False

CURRENCIES = {'EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD',
              'NOK', 'SEK', 'DKK', 'SGD', 'HKD', 'MXN', 'BRL', 'TRY',
              'ZAR', 'PLN', 'HUF', 'INR', 'CNY', 'RUB', 'KRW'}


def ocr_extract_pair(photo_path: str) -> Optional[Tuple[str, str]]:
    """Extract currency pair from chart screenshot using OCR.

    Args:
        photo_path: Path to the image file

    Returns:
        Tuple of (base_currency, quote_currency) or None if extraction fails
    """
    if not HAS_OCR or not photo_path or not os.path.exists(photo_path):
        return None

    try:
        # Get image metadata for debugging
        image_metadata = {
            'file_path': photo_path,
            'file_size': os.path.getsize(photo_path),
            'file_exists': os.path.exists(photo_path),
        }

        img = Image.open(photo_path)
        image_metadata.update({
            'image_mode': img.mode,
            'image_size': img.size,
            'image_format': img.format,
        })

        if img.mode != 'RGB':
            img = img.convert('RGB')

        # Try multiple OCR strategies
        for strategy_idx, fn in enumerate([
            lambda i: i,
            lambda i: ImageOps.invert(ImageEnhance.Contrast(i.convert('L')).enhance(3.0)),
            lambda i: i.resize((i.width * 2, i.height * 2), Image.LANCZOS),
        ]):
            try:
                processed = fn(img)
                text = pytesseract.image_to_string(processed).upper()
            except (pytesseract.TesseractError, OSError, IOError) as e:
                # Capture OCR-specific errors with metadata
                with sentry_sdk.push_scope() as scope:
                    scope.set_context("image_metadata", image_metadata)
                    scope.set_context("ocr_strategy", {
                        'strategy_index': strategy_idx,
                        'error_type': type(e).__name__,
                    })
                    scope.set_tag("ocr_error", "tesseract_failure")
                    sentry_sdk.capture_exception(e)
                logger.error(f"OCR tesseract failed on {photo_path}: {e}")
                return None

            # Try to find currency pair in format "XXX/YYY"
            pair_match = re.search(r'([A-Z]{3})\s*/\s*([A-Z]{3})', text)
            if pair_match:
                base, quote = pair_match.group(1), pair_match.group(2)
                if base in CURRENCIES and quote in CURRENCIES:
                    return (base, quote)

            # Try to find currencies concatenated
            for c1 in CURRENCIES:
                for c2 in CURRENCIES:
                    if c1 != c2 and c1 + c2 in text.replace(' ', ''):
                        return (c1, c2)

        return None

    except Exception as e:
        # Capture any unexpected errors with full metadata
        with sentry_sdk.push_scope() as scope:
            scope.set_context("image_metadata", {
                'file_path': photo_path,
                'file_size': os.path.getsize(photo_path) if os.path.exists(photo_path) else None,
                'file_exists': os.path.exists(photo_path),
            })
            scope.set_tag("ocr_error", "unexpected_failure")
            sentry_sdk.capture_exception(e)
        logger.error(f"OCR extraction failed for {photo_path}: {e}")
        return None


def ocr_image_full(filepath: str) -> Tuple[str, list]:
    """Try multiple OCR approaches, return combined uppercase text and raw results.

    Args:
        filepath: Path to the image file

    Returns:
        Tuple of (combined_text, list_of_raw_texts)
    """
    try:
        # Get image metadata for debugging
        image_metadata = {
            'file_path': filepath,
            'file_size': os.path.getsize(filepath),
            'file_exists': os.path.exists(filepath),
        }

        img = Image.open(filepath)
        image_metadata.update({
            'image_mode': img.mode,
            'image_size': img.size,
            'image_format': img.format,
        })

        # Convert to RGB
        if img.mode in ('RGBA', 'P', 'LA'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'RGBA':
                bg.paste(img, mask=img.split()[3])
            else:
                bg.paste(img)
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        texts = []

        # Strategy 1: Direct OCR
        try:
            texts.append(pytesseract.image_to_string(img, config='--psm 6').strip())
        except (pytesseract.TesseractError, OSError, IOError) as e:
            with sentry_sdk.push_scope() as scope:
                scope.set_context("image_metadata", image_metadata)
                scope.set_context("ocr_strategy", {'strategy': 'direct', 'psm': 6})
                scope.set_tag("ocr_error", "strategy_failure")
                sentry_sdk.capture_exception(e)
            logger.error(f"OCR strategy 'direct' failed: {e}")

        # Strategy 2: Grayscale high contrast
        try:
            gray = img.convert('L')
            enh = ImageEnhance.Contrast(gray).enhance(3.0)
            texts.append(pytesseract.image_to_string(enh, config='--psm 6').strip())
        except (pytesseract.TesseractError, OSError, IOError) as e:
            with sentry_sdk.push_scope() as scope:
                scope.set_context("image_metadata", image_metadata)
                scope.set_context("ocr_strategy", {'strategy': 'grayscale_contrast', 'psm': 6})
                scope.set_tag("ocr_error", "strategy_failure")
                sentry_sdk.capture_exception(e)
            logger.error(f"OCR strategy 'grayscale_contrast' failed: {e}")

        # Strategy 3: Inverted
        try:
            gray = img.convert('L')
            enh = ImageEnhance.Contrast(gray).enhance(3.0)
            inv = ImageOps.invert(enh)
            texts.append(pytesseract.image_to_string(inv, config='--psm 6').strip())
        except (pytesseract.TesseractError, OSError, IOError) as e:
            with sentry_sdk.push_scope() as scope:
                scope.set_context("image_metadata", image_metadata)
                scope.set_context("ocr_strategy", {'strategy': 'inverted', 'psm': 6})
                scope.set_tag("ocr_error", "strategy_failure")
                sentry_sdk.capture_exception(e)
            logger.error(f"OCR strategy 'inverted' failed: {e}")

        # Strategy 4: Scaled 3x + sharpened
        try:
            w, h = img.size
            from PIL import ImageFilter
            sc = img.resize((w*3, h*3), Image.LANCZOS)
            sh = sc.filter(ImageFilter.SHARPEN)
            texts.append(pytesseract.image_to_string(sh, config='--psm 6').strip())
        except (pytesseract.TesseractError, OSError, IOError) as e:
            with sentry_sdk.push_scope() as scope:
                scope.set_context("image_metadata", image_metadata)
                scope.set_context("ocr_strategy", {'strategy': 'scaled_sharpened', 'psm': 6})
                scope.set_tag("ocr_error", "strategy_failure")
                sentry_sdk.capture_exception(e)
            logger.error(f"OCR strategy 'scaled_sharpened' failed: {e}")

        # Strategy 5: Scaled inverted
        try:
            w, h = img.size
            sc = img.resize((w*3, h*3), Image.LANCZOS)
            sc_g = sc.convert('L')
            sc_inv = ImageOps.invert(ImageEnhance.Contrast(sc_g).enhance(3.0))
            texts.append(pytesseract.image_to_string(sc_inv, config='--psm 6').strip())
        except (pytesseract.TesseractError, OSError, IOError) as e:
            with sentry_sdk.push_scope() as scope:
                scope.set_context("image_metadata", image_metadata)
                scope.set_context("ocr_strategy", {'strategy': 'scaled_inverted', 'psm': 6})
                scope.set_tag("ocr_error", "strategy_failure")
                sentry_sdk.capture_exception(e)
            logger.error(f"OCR strategy 'scaled_inverted' failed: {e}")

        combined = ' '.join(texts).upper()
        return combined, texts

    except Exception as e:
        # Capture any unexpected errors with full metadata
        with sentry_sdk.push_scope() as scope:
            scope.set_context("image_metadata", {
                'file_path': filepath,
                'file_size': os.path.getsize(filepath) if os.path.exists(filepath) else None,
                'file_exists': os.path.exists(filepath),
            })
            scope.set_tag("ocr_error", "full_ocr_failure")
            sentry_sdk.capture_exception(e)
        logger.error(f"Full OCR processing failed for {filepath}: {e}")
        return str(e), []
