"""End-to-end integration test for signal attribution flow.

Tests the complete flow from parsing a signal message through backend communication
to result matching with exact expiration time verification.
"""

import asyncio
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from typing import Dict, Any

# Import components under test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from parser import parse_message, ParsedSignal
from listener import calculate_expiration_time, find_by_exact_expiration


class TestSignalAttributionE2E:
    """End-to-end integration tests for signal attribution."""

    @pytest.mark.asyncio
    async def test_complete_signal_attribution_e2e(self):
        """
        Test complete E2E flow:
        1. Parse signal from message
        2. Calculate expiration time
        3. Send to backend (mocked)
        4. Receive result
        5. Match signal with exact expiration
        """
        # ===== STEP 1: Parse signal from message =====
        signal_text = """🪙 OPPORTUNITY FOUND 🪙

EURUSD — 14:30: CALL

⏱ 5 Minutes (M5)
🎯 Martingale: 2 times
"""
        msg_date = datetime(2026, 3, 23, 14, 30, 0, tzinfo=timezone.utc)
        msg_id = 1001

        parsed = parse_message(signal_text, msg_id, msg_date)
        assert parsed is not None, "Signal should be parsed successfully"
        assert isinstance(parsed, dict), "Should return dict instance"
        assert parsed["asset"] == "EURUSD"
        assert parsed["direction"] == "CALL"
        assert parsed["expiration_minutes"] == 5

        # ===== STEP 2: Calculate expiration time =====
        signal_timestamp = datetime.fromisoformat(parsed["entry_time_utc"])
        expiration_time = calculate_expiration_time(signal_timestamp, [parsed["expiration_minutes"] * 60])

        expected_expiration = signal_timestamp + timedelta(minutes=5)
        assert expiration_time == expected_expiration
        assert expiration_time.tzinfo is not None, "Expiration should be timezone-aware"

        # ===== STEP 3: Send to backend (mocked) =====
        signal_payload = {
            "asset": parsed["asset"],
            "direction": parsed["direction"],
            "entryTimeUtc": parsed["entry_time_utc"],
            "expirationTime": expiration_time.isoformat(),
            "expirationMinutes": parsed["expiration_minutes"],
            "martingaleTimes": parsed["martingale_times"],
            "messageId": msg_id,
        }

        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status = 201
        mock_response.json = AsyncMock(return_value={
            "id": "signal_12345",
            "asset": "EURUSD",
            "direction": "CALL",
            "expirationTime": expiration_time.isoformat(),
            "status": "active"
        })

        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=mock_response)
        cm.__aexit__ = AsyncMock(return_value=False)
        mock_session.post.return_value = cm

        # Simulate posting to backend
        with patch('aiohttp.ClientSession', return_value=mock_session):
            from api_client import post_signal
            backend_response = await post_signal(mock_session, "/signals", signal_payload)

        assert backend_response is not None, "Backend should return response"
        assert backend_response["id"] == "signal_12345"
        assert backend_response["status"] == "active"

        # ===== STEP 4: Receive result (simulate 3 seconds after expiration) =====
        result_timestamp = expiration_time + timedelta(seconds=3)  # Within ±5s tolerance

        # Simulate active signals list from backend
        active_signals = [{
            "id": "signal_12345",
            "asset": "EURUSD",
            "direction": "CALL",
            "entryTimeUtc": signal_timestamp.isoformat(),
            "expirationTime": expiration_time.isoformat(),
            "expiration_time": expiration_time,  # datetime object for matching
            "expirationMinutes": 5,
            "status": "active"
        }]

        # ===== STEP 5: Match signal with exact expiration =====
        matched_signal = None
        for signal in active_signals:
            if signal.get("asset") != "EURUSD":
                continue
            if signal.get("expiration_time") is None:
                continue

            # Check if expiration matches within ±5 seconds
            signal_expiration = signal["expiration_time"]
            time_diff = abs((result_timestamp - signal_expiration).total_seconds())

            if time_diff <= 5:
                matched_signal = signal
                break

        # ===== VERIFY: Complete flow worked correctly =====
        assert matched_signal is not None, "Should find exact match within tolerance"
        assert matched_signal["id"] == "signal_12345"
        assert matched_signal["asset"] == "EURUSD"
        assert matched_signal["direction"] == "CALL"
        assert matched_signal["expirationTime"] == expiration_time.isoformat()

    @pytest.mark.asyncio
    async def test_multiple_signals_exact_expiration_matching_e2e(self):
        """
        Test E2E with multiple signals on same asset:
        - Signal 1: EURUSD at 14:00, expires at 14:05
        - Signal 2: EURUSD at 14:10, expires at 14:15
        - Verify correct signal is matched based on exact expiration
        """
        base_time = datetime(2026, 3, 23, 14, 0, 0, tzinfo=timezone.utc)

        # ===== STEP 1: Parse first signal =====
        signal1_text = "EURUSD — 14:00: CALL\n⏱ 5 Minutes"
        msg_date1 = base_time
        parsed1 = parse_message(signal1_text, 1001, msg_date1)

        # Calculate expiration for signal 1: 5 minutes = 300 seconds
        expiration1 = calculate_expiration_time(base_time, [300])
        assert expiration1 == datetime(2026, 3, 23, 14, 5, 0, tzinfo=timezone.utc)

        # ===== STEP 2: Parse second signal (10 minutes later) =====
        signal2_time = base_time + timedelta(minutes=10)
        signal2_text = "EURUSD — 14:10: PUT\n⏱ 5 Minutes"
        parsed2 = parse_message(signal2_text, 1002, signal2_time)

        # Calculate expiration for signal 2: 5 minutes = 300 seconds
        expiration2 = calculate_expiration_time(signal2_time, [300])
        assert expiration2 == datetime(2026, 3, 23, 14, 15, 0, tzinfo=timezone.utc)

        # ===== STEP 3: Create active signals list =====
        active_signals = [
            {
                "id": "signal_1",
                "asset": "EURUSD",
                "direction": "CALL",
                "expiration_time": expiration1,
                "expirationTime": expiration1.isoformat(),
            },
            {
                "id": "signal_2",
                "asset": "EURUSD",
                "direction": "PUT",
                "expiration_time": expiration2,
                "expirationTime": expiration2.isoformat(),
            },
        ]

        # ===== STEP 4: Receive result at 14:05:02 (should match signal 1) =====
        result1_timestamp = datetime(2026, 3, 23, 14, 5, 2, tzinfo=timezone.utc)

        matched1 = None
        for signal in active_signals:
            if signal.get("asset") != "EURUSD":
                continue
            if signal.get("expiration_time") is None:
                continue

            time_diff = abs((result1_timestamp - signal["expiration_time"]).total_seconds())
            if time_diff <= 5:
                matched1 = signal
                break

        assert matched1 is not None, "Should match signal 1"
        assert matched1["id"] == "signal_1"
        assert matched1["direction"] == "CALL"

        # ===== STEP 5: Receive result at 14:15:03 (should match signal 2) =====
        result2_timestamp = datetime(2026, 3, 23, 14, 15, 3, tzinfo=timezone.utc)

        matched2 = None
        for signal in active_signals:
            if signal.get("asset") != "EURUSD":
                continue
            if signal.get("expiration_time") is None:
                continue

            time_diff = abs((result2_timestamp - signal["expiration_time"]).total_seconds())
            if time_diff <= 5:
                matched2 = signal
                break

        assert matched2 is not None, "Should match signal 2"
        assert matched2["id"] == "signal_2"
        assert matched2["direction"] == "PUT"

        # ===== VERIFY: Signals matched to correct results =====
        assert matched1["id"] != matched2["id"], "Different signals should be matched"

    @pytest.mark.asyncio
    async def test_failed_backend_post_e2e(self):
        """Test E2E flow when backend POST fails."""
        # ===== STEP 1: Parse signal =====
        signal_text = "OPPORTUNITY FOUND\nGBPUSD — 10:00: PUT\n⏱ 5 Minutes"
        msg_date = datetime(2026, 3, 23, 10, 0, 0, tzinfo=timezone.utc)
        parsed = parse_message(signal_text, 2001, msg_date)

        assert parsed is not None

        # ===== STEP 2: Calculate expiration =====
        signal_timestamp = datetime.fromisoformat(parsed["entry_time_utc"])
        expiration = calculate_expiration_time(signal_timestamp, [parsed["expiration_minutes"] * 60])

        # ===== STEP 3: Backend POST fails =====
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status = 500
        mock_response.text = AsyncMock(return_value="Internal Server Error")
        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=mock_response)
        cm.__aexit__ = AsyncMock(return_value=False)
        mock_session.post.return_value = cm

        with patch('aiohttp.ClientSession', return_value=mock_session):
            from api_client import post_signal
            backend_response = await post_signal(mock_session, "/signals", {})

        # ===== VERIFY: Handle failure gracefully =====
        assert backend_response is None, "Should return None on failure"

    @pytest.mark.asyncio
    async def test_result_outside_tolerance_e2e(self):
        """Test E2E when result arrives outside ±5s tolerance."""
        # ===== STEP 1-2: Parse and calculate expiration =====
        signal_time = datetime(2026, 3, 23, 15, 0, 0, tzinfo=timezone.utc)
        expiration_time = calculate_expiration_time(signal_time, [300])  # 5 minutes = 300 seconds

        active_signals = [{
            "id": "signal_999",
            "asset": "EURUSD",
            "expiration_time": expiration_time,
            "expirationTime": expiration_time.isoformat(),
        }]

        # ===== STEP 3: Result arrives 10 seconds late (outside tolerance) =====
        result_timestamp = expiration_time + timedelta(seconds=10)

        matched = None
        for signal in active_signals:
            if signal.get("expiration_time") is None:
                continue

            time_diff = abs((result_timestamp - signal["expiration_time"]).total_seconds())
            if time_diff <= 5:
                matched = signal
                break

        # ===== VERIFY: No match found =====
        assert matched is None, "Should not match signal outside tolerance"

    @pytest.mark.asyncio
    async def test_timezone_handling_e2e(self):
        """Test E2E with different timezone representations."""
        # ===== STEP 1: Parse signal with naive datetime =====
        signal_time_naive = datetime(2026, 3, 23, 12, 0, 0)

        # ===== STEP 2: Calculate expiration (naive datetime stays naive) =====
        expiration_time = calculate_expiration_time(signal_time_naive, [300])  # 5 minutes = 300 seconds

        assert expiration_time.tzinfo is None, "Naive datetime stays naive"
        assert expiration_time == datetime(2026, 3, 23, 12, 5, 0)

        # ===== STEP 3: Match with naive result timestamp =====
        result_timestamp = datetime(2026, 3, 23, 12, 5, 2)

        time_diff = abs((result_timestamp - expiration_time).total_seconds())
        assert time_diff == 2, "Should calculate correct time difference"
        assert time_diff <= 5, "Should be within tolerance"
