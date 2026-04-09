import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

collect_ignore_glob = ["_archive/*.py"]

import pytest
from unittest.mock import patch


@pytest.fixture(autouse=True)
def mock_sentry():
    """Mock Sentry SDK to prevent test failures when Sentry isn't configured."""
    with patch('sentry_sdk.capture_event') as mock_capture, \
         patch('sentry_sdk.add_breadcrumb') as mock_breadcrumb:
        yield {
            'capture_event': mock_capture,
            'add_breadcrumb': mock_breadcrumb
        }


@pytest.fixture
def mock_prometheus():
    """Mock Prometheus Counter to verify metrics are incremented correctly."""
    with patch('prometheus_client.Counter') as mock_counter_class:
        mock_counter = mock_counter_class.return_value
        mock_counter.inc = pytest.Mock()
        yield mock_counter
