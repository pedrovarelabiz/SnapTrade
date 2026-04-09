#!/usr/bin/env python3
"""
Verification script for Sentry breadcrumbs in signal matching.
This script tests that breadcrumbs are added with the correct fields:
- asset
- result_timestamp
- candidate_signals_count
"""

import sys
import os
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from listener.listener import find_matching_signal


def verify_breadcrumb_fields():
    """Verify that Sentry breadcrumbs contain the required fields."""

    # Mock sentry_sdk
    with patch('listener.listener.sentry_sdk') as mock_sentry:
        # Create test signals
        signals = [
            {
                "asset": "EURUSD",
                "direction": "CALL",
                "entryTimeUtc": "2024-01-01T10:00:00Z",
                "expirationMinutes": 5,
                "martingaleTimes": [],
                "id": "test-signal-1"
            },
            {
                "asset": "GBPUSD",
                "direction": "PUT",
                "entryTimeUtc": "2024-01-01T10:00:00Z",
                "expirationMinutes": 5,
                "martingaleTimes": [],
                "id": "test-signal-2"
            }
        ]

        # Call find_matching_signal
        result_timestamp = datetime(2024, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
        find_matching_signal(
            asset="EURUSD",
            result_timestamp=result_timestamp,
            result_iteration=1,
            signals=signals
        )

        # Verify add_breadcrumb was called
        assert mock_sentry.add_breadcrumb.called, "sentry_sdk.add_breadcrumb should be called"

        # Get the call arguments
        call_args = mock_sentry.add_breadcrumb.call_args

        # Verify the breadcrumb has the required structure
        assert 'category' in call_args.kwargs, "Breadcrumb should have 'category'"
        assert call_args.kwargs['category'] == 'matching', f"Category should be 'matching', got {call_args.kwargs['category']}"

        assert 'message' in call_args.kwargs, "Breadcrumb should have 'message'"

        assert 'level' in call_args.kwargs, "Breadcrumb should have 'level'"
        assert call_args.kwargs['level'] == 'info', f"Level should be 'info', got {call_args.kwargs['level']}"

        assert 'data' in call_args.kwargs, "Breadcrumb should have 'data'"

        # Verify the required fields in data
        data = call_args.kwargs['data']

        assert 'asset' in data, "Breadcrumb data should contain 'asset'"
        assert data['asset'] == 'EURUSD', f"Asset should be 'EURUSD', got {data['asset']}"

        assert 'result_timestamp' in data, "Breadcrumb data should contain 'result_timestamp'"
        assert isinstance(data['result_timestamp'], str), "result_timestamp should be a string (ISO format)"
        assert '2024-01-01T10:05:00' in data['result_timestamp'], f"result_timestamp should contain '2024-01-01T10:05:00', got {data['result_timestamp']}"

        assert 'candidate_signals_count' in data, "Breadcrumb data should contain 'candidate_signals_count'"
        assert data['candidate_signals_count'] == 1, f"candidate_signals_count should be 1 (one EURUSD signal), got {data['candidate_signals_count']}"

        print("✓ All breadcrumb fields verified successfully!")
        print(f"  - category: {call_args.kwargs['category']}")
        print(f"  - message: {call_args.kwargs['message']}")
        print(f"  - level: {call_args.kwargs['level']}")
        print(f"  - data.asset: {data['asset']}")
        print(f"  - data.result_timestamp: {data['result_timestamp']}")
        print(f"  - data.candidate_signals_count: {data['candidate_signals_count']}")

        return True


if __name__ == '__main__':
    try:
        verify_breadcrumb_fields()
        print("\n✓ Verification complete: Sentry breadcrumbs are correctly configured")
        print("  with asset, result_timestamp, and candidate_signals_count fields.")
        sys.exit(0)
    except AssertionError as e:
        print(f"\n✗ Verification failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
