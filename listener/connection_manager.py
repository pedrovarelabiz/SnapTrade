"""Connection Manager with Sentry Integration.

Handles Telethon client connection/disconnection with error tracking and breadcrumbs.
"""

import logging
from enum import Enum
from typing import Optional

import sentry_sdk
from telethon import TelegramClient
from telethon.errors import FloodWaitError, AuthKeyError, PhoneNumberInvalidError


logger = logging.getLogger(__name__)


class ConnectionState(Enum):
    """Connection state enumeration."""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    FAILED = "failed"


class ConnectionManager:
    """Manages Telethon client connections with Sentry monitoring."""

    def __init__(self, client: TelegramClient):
        """Initialize connection manager.

        Args:
            client: TelegramClient instance to manage
        """
        self.client = client
        self.state = ConnectionState.DISCONNECTED

    async def connect(self) -> bool:
        """Connect to Telegram with Sentry error tracking.

        Returns:
            True if connection successful, False otherwise
        """
        try:
            self.state = ConnectionState.CONNECTING
            sentry_sdk.add_breadcrumb(
                category='connection',
                message='Attempting to connect to Telegram',
                level='info'
            )

            await self.client.connect()

            self.state = ConnectionState.CONNECTED
            sentry_sdk.add_breadcrumb(
                category='connection',
                message='Successfully connected to Telegram',
                level='info'
            )
            logger.info("Successfully connected to Telegram")
            return True

        except AuthKeyError as e:
            self.state = ConnectionState.FAILED
            sentry_sdk.add_breadcrumb(
                category='connection',
                message=f'Auth key error: {str(e)}',
                level='error'
            )
            sentry_sdk.capture_exception(e)
            logger.error(f"Auth key error during connection: {e}")
            return False

        except PhoneNumberInvalidError as e:
            self.state = ConnectionState.FAILED
            sentry_sdk.add_breadcrumb(
                category='connection',
                message=f'Invalid phone number: {str(e)}',
                level='error'
            )
            sentry_sdk.capture_exception(e)
            logger.error(f"Invalid phone number: {e}")
            return False

        except FloodWaitError as e:
            self.state = ConnectionState.FAILED
            sentry_sdk.add_breadcrumb(
                category='connection',
                message=f'Flood wait error: {e.seconds}s',
                level='warning'
            )
            sentry_sdk.capture_exception(e)
            logger.warning(f"Flood wait error: need to wait {e.seconds}s")
            return False

        except Exception as e:
            self.state = ConnectionState.FAILED
            sentry_sdk.add_breadcrumb(
                category='connection',
                message=f'Connection failed: {str(e)}',
                level='error'
            )
            sentry_sdk.capture_exception(e)
            logger.error(f"Connection failed: {e}", exc_info=True)
            return False

    async def disconnect(self) -> bool:
        """Disconnect from Telegram with Sentry error tracking.

        Returns:
            True if disconnection successful, False otherwise
        """
        try:
            sentry_sdk.add_breadcrumb(
                category='connection',
                message='Attempting to disconnect from Telegram',
                level='info'
            )

            if self.client.is_connected():
                await self.client.disconnect()
                self.state = ConnectionState.DISCONNECTED
                sentry_sdk.add_breadcrumb(
                    category='connection',
                    message='Successfully disconnected from Telegram',
                    level='info'
                )
                logger.info("Successfully disconnected from Telegram")
            else:
                logger.info("Client already disconnected")

            return True

        except Exception as e:
            sentry_sdk.add_breadcrumb(
                category='connection',
                message=f'Disconnection failed: {str(e)}',
                level='error'
            )
            sentry_sdk.capture_exception(e)
            logger.error(f"Disconnection failed: {e}", exc_info=True)
            return False

    async def reconnect(self) -> bool:
        """Reconnect to Telegram with Sentry error tracking.

        Returns:
            True if reconnection successful, False otherwise
        """
        try:
            self.state = ConnectionState.RECONNECTING
            sentry_sdk.add_breadcrumb(
                category='connection',
                message='Attempting to reconnect to Telegram',
                level='info'
            )

            # Disconnect first if connected
            if self.client.is_connected():
                await self.disconnect()

            # Attempt reconnection
            success = await self.connect()

            if success:
                sentry_sdk.add_breadcrumb(
                    category='connection',
                    message='Reconnection successful',
                    level='info'
                )
                logger.info("Reconnection successful")
            else:
                sentry_sdk.add_breadcrumb(
                    category='connection',
                    message='Reconnection failed',
                    level='error'
                )
                logger.error("Reconnection failed")

            return success

        except Exception as e:
            self.state = ConnectionState.FAILED
            sentry_sdk.add_breadcrumb(
                category='connection',
                message=f'Reconnection error: {str(e)}',
                level='error'
            )
            sentry_sdk.capture_exception(e)
            logger.error(f"Reconnection error: {e}", exc_info=True)
            return False

    def get_state(self) -> ConnectionState:
        """Get current connection state.

        Returns:
            Current ConnectionState
        """
        return self.state

    def is_connected(self) -> bool:
        """Check if client is connected.

        Returns:
            True if connected, False otherwise
        """
        return self.state == ConnectionState.CONNECTED and self.client.is_connected()
