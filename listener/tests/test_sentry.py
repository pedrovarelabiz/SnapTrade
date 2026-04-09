import os
import sys
import pytest
from unittest.mock import patch, MagicMock
import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sentry_config import init_sentry, _add_channel_context


class TestSentryInitialization:
    """Test Sentry SDK initialization."""

    @patch.dict(os.environ, {
        "SENTRY_DSN": "https://test_key@test.ingest.sentry.io/123456",
        "ENVIRONMENT": "test",
        "RELEASE_VERSION": "v1.0.0-test"
    })
    def test_init_sentry_with_dsn(self):
        """Test that init_sentry() initializes Sentry with correct options."""
        # Clear any existing Sentry client
        sentry_sdk.Hub.main.bind_client(None)
        sentry_sdk.Hub.current.bind_client(None)

        # Call init_sentry
        init_sentry()

        # Verify client is initialized
        client = sentry_sdk.Hub.current.client
        assert client is not None, "Sentry client should be initialized"

        # Verify DSN (client.dsn returns the full DSN including the key)
        assert str(client.dsn) == "https://test_key@test.ingest.sentry.io/123456"

        # Verify options
        assert client.options["traces_sample_rate"] == 0.1
        assert client.options["environment"] == "test"
        assert client.options["release"] == "v1.0.0-test"

        # Verify integrations
        integrations = client.integrations
        assert any(isinstance(integration, LoggingIntegration) for integration in integrations.values())

        # Verify before_send callback is set
        assert client.options["before_send"] is _add_channel_context

        # Verify default tags are set
        scope = sentry_sdk.Hub.current.scope
        assert scope._tags.get("service") == "listener"
        assert scope._tags.get("component") == "telegram-listener"

    @patch.dict(os.environ, {}, clear=True)
    def test_init_sentry_without_dsn(self):
        """Test that init_sentry() does nothing when SENTRY_DSN is not set."""
        # Clear any existing Sentry client
        sentry_sdk.Hub.main.bind_client(None)
        sentry_sdk.Hub.current.bind_client(None)

        # Call init_sentry
        init_sentry()

        # Verify client is not initialized
        client = sentry_sdk.Hub.current.client
        assert client is None, "Sentry client should not be initialized without DSN"

    @patch.dict(os.environ, {
        "SENTRY_DSN": "https://test_key@test.ingest.sentry.io/123456"
    })
    def test_init_sentry_default_environment(self):
        """Test that init_sentry() uses default environment when not set."""
        # Clear any existing Sentry client
        sentry_sdk.Hub.main.bind_client(None)
        sentry_sdk.Hub.current.bind_client(None)

        # Call init_sentry
        init_sentry()

        # Verify default environment
        client = sentry_sdk.Hub.current.client
        assert client is not None
        assert client.options["environment"] == "production"


class TestAddChannelContext:
    """Test the _add_channel_context before_send callback."""

    def test_filter_timeout_errors(self):
        """Test that timeout errors are filtered out."""
        event = {
            'exception': {
                'values': [
                    {
                        'type': 'TimeoutError',
                        'value': 'Connection timeout occurred'
                    }
                ]
            }
        }
        result = _add_channel_context(event, None)
        assert result is None, "Timeout errors should be filtered"

    def test_filter_connection_errors(self):
        """Test that connection errors are filtered out."""
        event = {
            'exception': {
                'values': [
                    {
                        'type': 'ConnectionError',
                        'value': 'Failed to connect'
                    }
                ]
            }
        }
        result = _add_channel_context(event, None)
        assert result is None, "Connection errors should be filtered"

    def test_redact_message_text(self):
        """Test that message content is redacted for privacy."""
        event = {
            'extra': {
                'message_text': 'Sensitive user message',
                'message_content': 'Another sensitive content'
            }
        }
        result = _add_channel_context(event, None)
        assert result['extra']['message_text'] == '[REDACTED]'
        assert result['extra']['message_content'] == '[REDACTED]'

    def test_fingerprint_parser_errors(self):
        """Test that parser errors get custom fingerprinting."""
        event = {
            'exception': {
                'values': [
                    {
                        'type': 'ParseError',
                        'value': 'Failed to parse message'
                    }
                ]
            }
        }
        result = _add_channel_context(event, None)
        assert 'fingerprint' in result
        assert result['fingerprint'] == ['parser-error', 'ParseError']

    def test_normal_event_passes_through(self):
        """Test that normal events pass through unchanged."""
        event = {
            'message': 'Normal log message',
            'level': 'error'
        }
        result = _add_channel_context(event, None)
        assert result == event, "Normal events should pass through"
