"""SnapTrade Listener — Logging setup."""

import logging
import os
from logging.handlers import RotatingFileHandler

from config import LOGS_DIR


def setup_logging():
    """Configure and return the signal_matching logger with file and stream handlers."""
    os.makedirs(LOGS_DIR, exist_ok=True)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )

    _logger = logging.getLogger("signal_matching")
    _logger.setLevel(logging.INFO)

    try:
        file_handler = RotatingFileHandler(
            os.path.join(LOGS_DIR, "listener.log"),
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
        )
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )
        _logger.addHandler(file_handler)
    except (IOError, OSError) as e:
        logging.error(
            f"Failed to create log file handler: {e}. Continuing with console logging only."
        )

    try:
        crash_handler = RotatingFileHandler(
            os.path.join(LOGS_DIR, "listener_crashes.log"),
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
        )
        crash_handler.setLevel(logging.ERROR)
        crash_handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )
        _logger.addHandler(crash_handler)
    except (IOError, OSError) as e:
        logging.error(
            f"Failed to create crash log file handler: {e}. Continuing with console logging only."
        )

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    _logger.addHandler(stream_handler)

    return _logger
