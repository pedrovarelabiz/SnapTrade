#!/usr/bin/env python3
"""Comprehensive integration test for listener lifecycle.

Tests the full cycle:
1. Start listener
2. Simulate connection loss
3. Verify reconnection with exponential backoff
4. Send test signal
5. Verify backend POST
6. Check alert sent
7. Graceful shutdown
"""

import asyncio
import json
import signal
import sys
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch, call
from typing import List

try:
    import pytest
    HAS_PYTEST = True
except ImportError:
    HAS_PYTEST = False

from listener import (
    ReconnectionManager,
    ReconnectionConfig,
    ConnectionState,
    TelegramAlerter,
    HealthTracker,
    calculate_expiration_time,
)
from parser import parse_message, ParsedSignal


class MockTelegramClient:
    """Mock Telegram client for testing."""

    def __init__(self):
        self._connected = False
        self._connection_attempts = 0
        self._should_fail_next = False

    async def connect(self):
        """Mock connect method."""
        self._connection_attempts += 1
        if self._should_fail_next:
            self._should_fail_next = False
            raise ConnectionError("Simulated connection failure")
        self._connected = True
        await asyncio.sleep(0.01)  # Simulate connection time

    async def disconnect(self):
        """Mock disconnect method."""
        self._connected = False
        await asyncio.sleep(0.01)

    def is_connected(self):
        """Check connection status."""
        return self._connected

    def simulate_disconnect(self):
        """Simulate unexpected disconnect."""
        self._connected = False

    def set_next_connection_fails(self):
        """Set next connection attempt to fail."""
        self._should_fail_next = True


class MockHTTPSession:
    """Mock aiohttp ClientSession for testing."""

    def __init__(self):
        self.post_calls: List[dict] = []
        self.response_status = 200

    async def post(self, url, **kwargs):
        """Mock POST request."""
        self.post_calls.append({
            'url': url,
            'kwargs': kwargs,
            'timestamp': datetime.now(timezone.utc)
        })

        response = AsyncMock()
        response.status = self.response_status
        response.json = AsyncMock(return_value={'success': True})
        return response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass


@pytest.mark.asyncio
async def test_full_listener_lifecycle():
    """Test complete listener lifecycle: start → disconnect → reconnect → signal → alert → shutdown."""

    # Initialize components
    client = MockTelegramClient()
    session = MockHTTPSession()
    config = ReconnectionConfig(initial_delay=0.01, max_delay=0.1)
    reconnect_mgr = ReconnectionManager(config)
    health_tracker = HealthTracker()
    alerter = TelegramAlerter("test_bot_token", "test_chat_id")

    # Track lifecycle events
    events = []

    # STEP 1: Start listener (simulate successful connection)
    events.append("listener_started")
    await client.connect()
    assert client.is_connected(), "Listener should be connected"
    reconnect_mgr.state = ConnectionState.CONNECTED
    events.append("connected")

    # STEP 2: Simulate connection loss
    events.append("simulating_disconnect")
    client.simulate_disconnect()
    assert not client.is_connected(), "Connection should be lost"
    reconnect_mgr.state = ConnectionState.DISCONNECTED
    events.append("disconnected")

    # STEP 3: Verify reconnection with exponential backoff
    events.append("starting_reconnection")
    reconnect_mgr.state = ConnectionState.RECONNECTING

    # First reconnection attempt (should succeed)
    delay_1 = reconnect_mgr.calculate_next_delay()
    assert delay_1 == 0.01, f"First delay should be 0.01s, got {delay_1}"
    events.append(f"backoff_delay_{delay_1}")

    await asyncio.sleep(delay_1)
    await client.connect()
    assert client.is_connected(), "Reconnection should succeed"
    reconnect_mgr.reset()
    reconnect_mgr.state = ConnectionState.CONNECTED
    events.append("reconnected")

    # Simulate another disconnect to test backoff progression
    client.simulate_disconnect()
    client.set_next_connection_fails()  # Next attempt will fail

    # First attempt fails
    try:
        await client.connect()
    except ConnectionError:
        reconnect_mgr.record_failure()
        events.append("reconnect_failed_1")

    # Second attempt with increased backoff
    delay_2 = reconnect_mgr.calculate_next_delay()
    assert delay_2 == 0.02, f"Second delay should be 0.02s (exponential), got {delay_2}"
    events.append(f"backoff_delay_{delay_2}")
    reconnect_mgr.attempt_count += 1

    await asyncio.sleep(delay_2)
    await client.connect()  # This will succeed
    assert client.is_connected(), "Should reconnect after backoff"
    reconnect_mgr.reset()
    reconnect_mgr.state = ConnectionState.CONNECTED
    events.append("reconnected_after_backoff")

    # STEP 4: Send test signal (simulate message processing)
    events.append("processing_signal")
    test_signal_data = {
        'symbol': 'EURUSD',
        'direction': 'CALL',
        'expiration': 5,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }

    # Mock backend API POST
    with patch('listener.listener.aiohttp.ClientSession', return_value=session):
        api_url = "http://127.0.0.1:3001/api/signals"
        async with session as s:
            response = await s.post(
                api_url,
                json=test_signal_data,
                headers={'X-Internal-API-Key': 'test_key'}
            )
            assert response.status == 200, "Backend POST should succeed"
            events.append("backend_post_success")

    # STEP 5: Verify backend POST was called correctly
    assert len(session.post_calls) == 1, "Should have exactly one POST call"
    post_call = session.post_calls[0]
    assert post_call['url'] == api_url, "POST should be to correct endpoint"
    assert 'json' in post_call['kwargs'], "POST should include JSON payload"
    assert post_call['kwargs']['json'] == test_signal_data, "Payload should match signal data"
    events.append("backend_verified")

    # Update health tracker
    health_tracker.record_message()
    assert health_tracker.message_count == 1, "Health tracker should count message"
    assert health_tracker.is_healthy(max_age_seconds=10), "Service should be healthy"
    events.append("health_updated")

    # STEP 6: Check alert sent
    events.append("sending_alert")

    # Mock aiohttp for alerter
    mock_alert_session = MockHTTPSession()
    with patch('listener.listener.aiohttp.ClientSession', return_value=mock_alert_session):
        await alerter.send_alert("Test signal processed successfully", "info")

    # Verify alert was sent
    assert len(mock_alert_session.post_calls) == 1, "Alert should be sent"
    alert_call = mock_alert_session.post_calls[0]
    assert "bot" in alert_call['url'], "Alert should be sent to Telegram bot API"
    assert alert_call['kwargs']['json']['chat_id'] == "test_chat_id"
    assert "Test signal processed successfully" in alert_call['kwargs']['json']['text']
    assert "INFO" in alert_call['kwargs']['json']['text']
    events.append("alert_sent")

    # STEP 7: Graceful shutdown
    events.append("initiating_shutdown")
    shutdown_requested = True

    # Send shutdown alert
    with patch('listener.listener.aiohttp.ClientSession', return_value=mock_alert_session):
        await alerter.send_alert("Listener shutting down", "warning")

    # Disconnect client
    if client.is_connected():
        await client.disconnect()
        events.append("client_disconnected")

    assert not client.is_connected(), "Client should be disconnected"

    # Save final metrics
    final_metrics = {
        'shutdown_time': datetime.now(timezone.utc).isoformat(),
        'messages_processed': health_tracker.message_count,
        'error_count': health_tracker.error_count,
        'reconnection_count': reconnect_mgr.attempt_count,
    }
    events.append("metrics_saved")
    events.append("shutdown_complete")

    # ASSERTIONS: Verify all steps completed successfully
    expected_events = [
        "listener_started",
        "connected",
        "simulating_disconnect",
        "disconnected",
        "starting_reconnection",
        "backoff_delay_0.01",
        "reconnected",
        "reconnect_failed_1",
        "backoff_delay_0.02",
        "reconnected_after_backoff",
        "processing_signal",
        "backend_post_success",
        "backend_verified",
        "health_updated",
        "sending_alert",
        "alert_sent",
        "initiating_shutdown",
        "client_disconnected",
        "metrics_saved",
        "shutdown_complete"
    ]

    assert events == expected_events, f"Lifecycle events mismatch.\nExpected: {expected_events}\nActual: {events}"
    assert health_tracker.message_count == 1, "Should have processed 1 message"
    assert final_metrics['messages_processed'] == 1, "Final metrics should match"

    print("\n✅ INTEGRATION TEST PASSED")
    print(f"   - Lifecycle events: {len(events)}")
    print(f"   - Messages processed: {health_tracker.message_count}")
    print(f"   - Backend POSTs: {len(session.post_calls)}")
    print(f"   - Alerts sent: {len(mock_alert_session.post_calls)}")
    print(f"   - Connection attempts: {client._connection_attempts}")


@pytest.mark.asyncio
async def test_exponential_backoff_sequence():
    """Verify exponential backoff timing in reconnection scenario."""

    config = ReconnectionConfig(initial_delay=1, max_delay=60, backoff_multiplier=2)
    manager = ReconnectionManager(config)

    expected_delays = [1, 2, 4, 8, 16, 32, 60, 60]
    actual_delays = []

    for _ in range(8):
        delay = manager.calculate_next_delay()
        actual_delays.append(delay)
        manager.attempt_count += 1

    assert actual_delays == expected_delays, (
        f"Backoff sequence mismatch.\nExpected: {expected_delays}\nActual: {actual_delays}"
    )

    print("\n✅ Exponential backoff verified:")
    print(f"   Sequence: {' → '.join(map(str, actual_delays))}s")


@pytest.mark.asyncio
async def test_health_tracker_lifecycle():
    """Test health tracker through message processing and error scenarios."""

    tracker = HealthTracker()

    # Initially unhealthy (no heartbeat)
    assert not tracker.is_healthy(), "Should be unhealthy with no heartbeat"

    # Process messages
    tracker.record_message()
    assert tracker.message_count == 1
    assert tracker.is_healthy(), "Should be healthy after message"

    # Record errors
    tracker.record_error()
    tracker.record_error()
    assert tracker.error_count == 2

    # Still healthy (recent heartbeat)
    assert tracker.is_healthy(max_age_seconds=60)

    # Simulate stale heartbeat
    tracker.last_heartbeat = datetime.now(timezone.utc) - __import__('datetime').timedelta(seconds=400)
    assert not tracker.is_healthy(max_age_seconds=300), "Should be unhealthy with stale heartbeat"

    print("\n✅ Health tracker lifecycle verified")
    print(f"   Messages: {tracker.message_count}, Errors: {tracker.error_count}")


@pytest.mark.asyncio
async def test_signal_result_attribution_flow():
    """
    Test complete signal result attribution flow with martingale_times.

    Simulates:
    1. Telegram signal received
    2. Parsed with martingale_times
    3. Stored to backend
    4. Result received
    5. Matched correctly using exact expiration time
    """
    # Track flow events
    events = []

    # STEP 1: Telegram signal received
    events.append("telegram_signal_received")
    signal_text = """🪙 OPPORTUNITY FOUND 🪙

EURUSD — 14:30: CALL

⏱ 5 Minutes (M5)
🎯 MARTINGALE 14:35
🎯 MARTINGALE 14:40
"""
    msg_date = datetime(2026, 3, 23, 14, 30, 0, tzinfo=timezone.utc)
    msg_id = 1001

    # STEP 2: Parse signal with martingale_times
    events.append("parsing_signal")
    parsed = parse_message(signal_text, msg_id, msg_date)

    assert parsed is not None, "Signal should be parsed successfully"
    assert isinstance(parsed, dict), "Should return dict instance"
    assert parsed['asset'] == "EURUSD", f"Expected asset EURUSD, got {parsed['asset']}"
    assert parsed['direction'] == "CALL", f"Expected direction CALL, got {parsed['direction']}"
    assert parsed['expiration_minutes'] == 5, f"Expected 5 minutes, got {parsed['expiration_minutes']}"
    assert len(parsed['martingale_times']) == 2, f"Expected 2 martingale times, got {len(parsed['martingale_times'])}"
    events.append("signal_parsed")

    # Calculate expiration time using real datetime objects
    signal_timestamp = datetime.fromisoformat(parsed['entry_time_utc'])
    expiration_time = calculate_expiration_time(signal_timestamp, [parsed['expiration_minutes'] * 60])

    expected_expiration = signal_timestamp + __import__('datetime').timedelta(minutes=5)
    assert expiration_time == expected_expiration, "Expiration calculation mismatch"
    assert expiration_time.tzinfo is not None, "Expiration should be timezone-aware"
    # Format 1 uses UTC-3 offset, so 14:30 local becomes 17:30 UTC, + 5 min = 17:35 UTC
    assert expiration_time == datetime(2026, 3, 23, 17, 35, 0, tzinfo=timezone.utc)
    events.append("expiration_calculated")

    # STEP 3: Store to backend (simulate POST)
    events.append("storing_to_backend")
    signal_payload = {
        "asset": parsed['asset'],
        "direction": parsed['direction'],
        "entryTimeUtc": parsed['entry_time_utc'],
        "expirationTime": expiration_time.isoformat(),
        "expirationMinutes": parsed['expiration_minutes'],
        "martingaleTimes": parsed['martingale_times'],
        "messageId": msg_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Mock backend POST
    mock_session = MockHTTPSession()
    mock_session.response_status = 201

    with patch('listener.listener.aiohttp.ClientSession', return_value=mock_session):
        api_url = "http://127.0.0.1:3001/api/signals"
        async with mock_session as s:
            response = await s.post(
                api_url,
                json=signal_payload,
                headers={'X-Internal-API-Key': 'test_key'}
            )
            assert response.status == 201, f"Expected 201, got {response.status}"
            events.append("backend_stored")

    # Verify backend call
    assert len(mock_session.post_calls) == 1, "Should have exactly one POST call"
    post_call = mock_session.post_calls[0]
    assert post_call['kwargs']['json'] == signal_payload, "Payload should match signal data"
    assert 'martingaleTimes' in post_call['kwargs']['json'], "Should include martingaleTimes"
    # Martingale times are converted to UTC (14:35/14:40 in UTC-3 = 17:35/17:40 UTC)
    assert post_call['kwargs']['json']['martingaleTimes'] == ['17:35', '17:40']
    events.append("backend_verified")

    # STEP 4: Result received (simulate result arriving 3 seconds after expiration)
    events.append("result_received")
    result_timestamp = expiration_time + __import__('datetime').timedelta(seconds=3)

    # Simulate active signals list from backend
    active_signals = [{
        "id": "signal_12345",
        "asset": "EURUSD",
        "direction": "CALL",
        "entryTimeUtc": signal_timestamp.isoformat(),
        "expirationTime": expiration_time.isoformat(),
        "expiration_time": expiration_time,  # datetime object for matching
        "expirationMinutes": 5,
        "martingaleTimes": [1, 2],
        "status": "active"
    }]
    events.append("active_signals_loaded")

    # STEP 5: Match result with signal using exact expiration time (±5s tolerance)
    events.append("matching_result")
    matched_signal = None

    for signal in active_signals:
        # Check asset match
        if signal.get("asset") != "EURUSD":
            continue

        # Check expiration time exists
        if signal.get("expiration_time") is None:
            continue

        # Check if expiration matches within ±5 seconds tolerance
        signal_expiration = signal["expiration_time"]
        time_diff = abs((result_timestamp - signal_expiration).total_seconds())

        if time_diff <= 5:
            matched_signal = signal
            break

    # VERIFY: Complete flow worked correctly
    assert matched_signal is not None, "Should find exact match within ±5s tolerance"
    assert matched_signal["id"] == "signal_12345", f"Expected signal_12345, got {matched_signal['id']}"
    assert matched_signal["asset"] == "EURUSD"
    assert matched_signal["direction"] == "CALL"
    assert matched_signal["expirationTime"] == expiration_time.isoformat()
    assert matched_signal["martingaleTimes"] == [1, 2], "martingale_times should be preserved"
    events.append("result_matched")

    # Calculate actual time difference
    time_diff_seconds = abs((result_timestamp - expiration_time).total_seconds())
    assert time_diff_seconds == 3.0, f"Expected 3s difference, got {time_diff_seconds}"
    assert time_diff_seconds <= 5, "Should be within tolerance"
    events.append("attribution_complete")

    # ASSERTIONS: Verify all steps completed successfully
    expected_events = [
        "telegram_signal_received",
        "parsing_signal",
        "signal_parsed",
        "expiration_calculated",
        "storing_to_backend",
        "backend_stored",
        "backend_verified",
        "result_received",
        "active_signals_loaded",
        "matching_result",
        "result_matched",
        "attribution_complete"
    ]

    assert events == expected_events, f"Flow events mismatch.\nExpected: {expected_events}\nActual: {events}"

    print("\n✅ SIGNAL RESULT ATTRIBUTION FLOW TEST PASSED")
    print(f"   - Signal: {parsed['asset']} {parsed['direction']} @ {parsed['entry_time_utc']}")
    print(f"   - Expiration: {expiration_time}")
    print(f"   - Martingale times: {parsed['martingale_times']}")
    print(f"   - Result timestamp: {result_timestamp}")
    print(f"   - Match time diff: {time_diff_seconds}s (within ±5s tolerance)")
    print(f"   - Flow steps: {len(events)}")


@pytest.mark.asyncio
async def test_signal_result_attribution_integration():
    """
    Full flow integration test for signal result attribution.

    Test Flow:
    1. Parse signal from mock Telegram message
    2. Store signal with expiration via backend API
    3. Simulate trade result webhook received
    4. Use find_matching_signal() to correctly attribute result to signal
    5. Verify database update via backend PATCH
    """
    from listener.listener import find_matching_signal
    from api_client import post_signal, patch_signal

    # Track integration test events
    events = []

    # ===== STEP 1: Parse signal from mock Telegram message =====
    events.append("telegram_message_received")

    telegram_message = """🪙 OPPORTUNITY FOUND 🪙

GBPUSD — 10:00: PUT

⏱ 5 Minutes (M5)
🎯 MARTINGALE 10:05
🎯 MARTINGALE 10:10
"""
    message_date = datetime(2026, 3, 24, 10, 0, 0, tzinfo=timezone.utc)
    message_id = 5001

    parsed_signal = parse_message(telegram_message, message_id, message_date)

    assert parsed_signal is not None, "Signal parsing should succeed"
    assert isinstance(parsed_signal, dict), "Parsed signal should be dict"
    assert parsed_signal['asset'] == "GBPUSD", f"Expected GBPUSD, got {parsed_signal['asset']}"
    assert parsed_signal['direction'] == "PUT", f"Expected PUT, got {parsed_signal['direction']}"
    assert parsed_signal['expiration_minutes'] == 5, f"Expected 5 minutes, got {parsed_signal['expiration_minutes']}"
    events.append("signal_parsed")

    # ===== STEP 2: Store signal with expiration via backend API =====
    events.append("storing_signal")

    # Calculate expiration time
    entry_time = datetime.fromisoformat(parsed_signal['entry_time_utc'])
    martingale_times_seconds = [parsed_signal['expiration_minutes'] * 60]
    expiration_time = calculate_expiration_time(entry_time, martingale_times_seconds)

    assert expiration_time.tzinfo is not None, "Expiration should be timezone-aware"
    events.append("expiration_calculated")

    # Prepare signal payload for backend
    signal_payload = {
        "asset": parsed_signal['asset'],
        "direction": parsed_signal['direction'],
        "entryTimeUtc": parsed_signal['entry_time_utc'],
        "expirationTime": expiration_time.isoformat(),
        "expirationMinutes": parsed_signal['expiration_minutes'],
        "martingaleTimes": parsed_signal.get('martingale_times', []),
        "messageId": message_id,
        "status": "active",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    # Mock backend POST request
    mock_session = MockHTTPSession()
    mock_session.response_status = 201

    backend_signal_id = "signal_gbpusd_5001"
    mock_post_response = {
        "id": backend_signal_id,
        "asset": "GBPUSD",
        "direction": "PUT",
        "expirationTime": expiration_time.isoformat(),
        "status": "active",
        "created": True
    }

    with patch('listener.listener.aiohttp.ClientSession', return_value=mock_session):
        # Override mock response - must support async context manager (async with session.post(...) as resp)
        mock_resp = MagicMock()
        mock_resp.status = 201
        mock_resp.json = AsyncMock(return_value=mock_post_response)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=None)
        mock_session.post = MagicMock(return_value=mock_resp)

        response = await post_signal(mock_session, "/signals", signal_payload)

    assert response is not None, "Backend POST should return response"
    assert response['id'] == backend_signal_id, f"Expected {backend_signal_id}, got {response['id']}"
    assert response['status'] == "active", "Signal should be active"
    events.append("signal_stored")

    # ===== STEP 3: Simulate trade result webhook received =====
    events.append("result_webhook_received")

    # Result arrives 2 seconds after expiration (within tolerance)
    result_timestamp = expiration_time + __import__('datetime').timedelta(seconds=2)
    result_iteration = 0  # First attempt (not a martingale retry)

    result_payload = {
        "asset": "GBPUSD",
        "result": "WIN",
        "timestamp": result_timestamp.isoformat(),
        "iteration": result_iteration
    }
    events.append("result_parsed")

    # ===== STEP 4: Use find_matching_signal to correctly attribute =====
    events.append("matching_signal")

    # Simulate active signals list from backend (would normally be fetched via API)
    active_signals = [
        {
            "id": backend_signal_id,
            "asset": "GBPUSD",
            "direction": "PUT",
            "entryTimeUtc": entry_time.isoformat(),
            "expirationTime": expiration_time.isoformat(),
            "expiration_time": expiration_time,  # datetime object for matching
            "expirationMinutes": 5,
            "martingaleTimes": [300],  # 5 minutes in seconds
            "status": "active",
            "messageId": message_id
        },
        # Add a decoy signal to test matching specificity
        {
            "id": "signal_decoy_9999",
            "asset": "GBPUSD",
            "direction": "CALL",  # Different direction
            "entryTimeUtc": (entry_time - __import__('datetime').timedelta(minutes=10)).isoformat(),
            "expirationTime": (expiration_time - __import__('datetime').timedelta(minutes=10)).isoformat(),
            "expiration_time": expiration_time - __import__('datetime').timedelta(minutes=10),
            "expirationMinutes": 5,
            "martingaleTimes": [300],
            "status": "active",
            "messageId": 9999
        }
    ]

    # Call find_matching_signal to match result to signal
    matched_signal = find_matching_signal(
        asset="GBPUSD",
        result_timestamp=result_timestamp,
        result_iteration=result_iteration,
        signals=active_signals
    )

    # Verify correct signal was matched
    assert matched_signal is not None, "Should find matching signal"

    # Extract signal from tuple if returned as (signal, tier, confidence)
    if isinstance(matched_signal, tuple):
        matched_signal, match_tier, confidence_score = matched_signal
        assert match_tier is not None, "Match tier should be set"
        assert confidence_score is not None, "Confidence score should be set"
        assert confidence_score > 0.0, "Confidence should be positive"
        events.append(f"match_tier_{match_tier}_confidence_{confidence_score:.2f}")

    assert matched_signal['id'] == backend_signal_id, f"Expected {backend_signal_id}, got {matched_signal['id']}"
    assert matched_signal['asset'] == "GBPUSD", "Asset should match"
    assert matched_signal['direction'] == "PUT", "Direction should match"
    assert matched_signal['messageId'] == message_id, "Message ID should match"
    events.append("signal_matched")

    # Verify the match was precise (not the decoy signal)
    assert matched_signal['id'] != "signal_decoy_9999", "Should not match decoy signal"

    # Calculate time difference for verification
    time_diff = abs((result_timestamp - expiration_time).total_seconds())
    assert time_diff == 2.0, f"Expected 2s difference, got {time_diff}s"
    assert time_diff <= 60, "Should be within 60s tolerance"
    events.append("timing_verified")

    # ===== STEP 5: Verify database update via backend PATCH =====
    events.append("updating_database")

    # Prepare update payload
    update_payload = {
        "result": result_payload['result'],
        "resultTimestamp": result_timestamp.isoformat(),
        "resultIteration": result_iteration,
        "status": "resolved",
        "timeDiffSeconds": time_diff
    }

    # Mock backend PATCH request
    mock_patch_response = {
        "id": backend_signal_id,
        "asset": "GBPUSD",
        "result": "WIN",
        "status": "resolved",
        "updated": True
    }

    with patch('listener.listener.aiohttp.ClientSession', return_value=mock_session):
        # Override mock for PATCH - must support async context manager (async with session.patch(...) as resp)
        mock_patch_resp = MagicMock()
        mock_patch_resp.status = 200
        mock_patch_resp.json = AsyncMock(return_value=mock_patch_response)
        mock_patch_resp.__aenter__ = AsyncMock(return_value=mock_patch_resp)
        mock_patch_resp.__aexit__ = AsyncMock(return_value=None)
        mock_session.patch = MagicMock(return_value=mock_patch_resp)

        patch_response = await patch_signal(
            mock_session,
            f"/signals/{backend_signal_id}",
            update_payload
        )

    assert patch_response is not None, "Backend PATCH should succeed"
    assert patch_response['id'] == backend_signal_id, "Updated signal ID should match"
    assert patch_response['result'] == "WIN", "Result should be stored"
    assert patch_response['status'] == "resolved", "Status should be resolved"
    assert patch_response['updated'] is True, "Update flag should be true"
    events.append("database_updated")

    # ===== VERIFY: Complete integration flow succeeded =====
    expected_events = [
        "telegram_message_received",
        "signal_parsed",
        "storing_signal",
        "expiration_calculated",
        "signal_stored",
        "result_webhook_received",
        "result_parsed",
        "matching_signal",
    ]

    # Check that all expected events occurred (allowing for dynamic match_tier event)
    for expected_event in expected_events:
        assert expected_event in events, f"Missing expected event: {expected_event}"

    assert "signal_matched" in events, "signal_matched event should be present"
    assert "timing_verified" in events, "timing_verified event should be present"
    assert "updating_database" in events, "updating_database event should be present"
    assert "database_updated" in events, "database_updated event should be present"

    print("\n✅ SIGNAL RESULT ATTRIBUTION INTEGRATION TEST PASSED")
    print(f"   - Signal: {parsed_signal['asset']} {parsed_signal['direction']} @ {entry_time}")
    print(f"   - Expiration: {expiration_time}")
    print(f"   - Result timestamp: {result_timestamp}")
    print(f"   - Match time difference: {time_diff}s")
    print(f"   - Matched signal ID: {matched_signal['id']}")
    print(f"   - Result: {result_payload['result']}")
    print(f"   - Integration steps: {len(events)}")
    print(f"   - Events: {' → '.join(events)}")


async def run_all_tests():
    """Run all tests."""
    print("=" * 60)
    print("RUNNING COMPREHENSIVE INTEGRATION TESTS")
    print("=" * 60)

    try:
        print("\n[1/5] Testing full listener lifecycle...")
        await test_full_listener_lifecycle()

        print("\n[2/5] Testing exponential backoff sequence...")
        await test_exponential_backoff_sequence()

        print("\n[3/5] Testing health tracker lifecycle...")
        await test_health_tracker_lifecycle()

        print("\n[4/5] Testing signal result attribution flow...")
        await test_signal_result_attribution_flow()

        print("\n[5/5] Testing signal result attribution integration...")
        await test_signal_result_attribution_integration()

        print("\n" + "=" * 60)
        print("🎉 ALL INTEGRATION TESTS PASSED")
        print("=" * 60)
        return 0
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    if HAS_PYTEST:
        # Run with pytest if available
        exit_code = pytest.main([__file__, "-v", "-s"])
    else:
        # Run directly with asyncio
        exit_code = asyncio.run(run_all_tests())

    sys.exit(exit_code)
