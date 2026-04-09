"""Integration test for real channel parsers with signal matching.

Tests the full flow: parse signal → store in active_signals → parse result → match signal.
"""

import unittest
from datetime import datetime, timezone, timedelta

from listener import ChannelHandler
from multi_channel_parsers import parse_blacklist_live, parse_sinais_live


class TestIntegrationMatching(unittest.TestCase):
    """Integration tests for real channel parsers with signal matching."""

    def setUp(self):
        """Set up test fixtures."""
        self.channel_config = {
            "id": "test-blacklist",
            "slug": "test-blacklist",
            "name": "Test BLACKLIST Channel",
            "timezone": "UTC",
            "sourceFormat": "blacklist_live",
            "maxGaleLevel": 2,
            "telegramId": "123456",
            "telegramName": "test_blacklist"
        }
        self.handler = ChannelHandler(self.channel_config)

    def test_blacklist_signal_and_result_matching(self):
        """Test BLACKLIST: parse signal → store → parse result → match."""
        # Step 1: Parse signal message (• format)
        signal_text = """🚨 SINAL BLACKLIST 🚨

• EURUSD - CALL - 10:00

📊 M5
✅ Analisado"""

        msg_date = datetime(2024, 1, 1, 7, 0, 0, tzinfo=timezone.utc)  # BRT 10:00 - 3 = UTC 07:00
        msg_id = 1001

        parsed_signals = parse_blacklist_live(signal_text, msg_id, msg_date)

        # Verify signal was parsed
        self.assertIsNotNone(parsed_signals)
        self.assertEqual(len(parsed_signals), 1)
        signal = parsed_signals[0]
        self.assertEqual(signal["type"], "signal")
        self.assertEqual(signal["asset"], "EURUSD")
        self.assertEqual(signal["direction"], "CALL")

        # Step 2: Store in active_signals
        self.handler.active_signals.append({
            "asset": signal["asset"],
            "direction": signal["direction"],
            "entryTimeUtc": signal["entry_time_utc"],
            "expirationMinutes": signal["expiration_minutes"],
            "martingaleTimes": signal["martingale_times"],
        })

        # Step 3: Parse result message (informal Portuguese)
        result_text = "EURUSD win de primeira 🔥🔥"
        result_date = datetime(2024, 1, 1, 13, 5, 30, tzinfo=timezone.utc)  # 5:30 after entry (13:00 UTC)
        result_msg_id = 1002

        parsed_results = parse_blacklist_live(result_text, result_msg_id, result_date)

        # Verify result was parsed
        self.assertIsNotNone(parsed_results)
        self.assertEqual(len(parsed_results), 1)
        result = parsed_results[0]
        self.assertEqual(result["type"], "result")
        self.assertEqual(result["result"], "win")
        self.assertEqual(result["gale_level"], 0)
        self.assertEqual(result["asset"], "EURUSD")

        # Step 4: Find matching signal
        matched_signal = self.handler.find_matching_signal(
            result_date,
            asset=result["asset"]
        )

        # Step 5: Verify correct match
        self.assertIsNotNone(matched_signal, "Should match the EURUSD signal")
        self.assertEqual(matched_signal["asset"], "EURUSD")
        self.assertEqual(matched_signal["direction"], "CALL")

    def test_sinais_live_signal_and_result_matching(self):
        """Test SINAIS MILIONARIOS: parse signal → store → parse result → match."""
        # Step 1: Parse signal message (📊 SINAL VIP format)
        signal_text = """📊 SINAL VIP 📊

• GBPUSD - PUT - 14:30

📈 M5
🔥 Ativem as notificações!"""

        msg_date = datetime(2024, 1, 1, 11, 30, 0, tzinfo=timezone.utc)  # BRT 14:30 - 3 = UTC 11:30
        msg_id = 2001

        parsed_signals = parse_sinais_live(signal_text, msg_id, msg_date)

        # Verify signal was parsed
        self.assertIsNotNone(parsed_signals)
        self.assertEqual(len(parsed_signals), 1)
        signal = parsed_signals[0]
        self.assertEqual(signal["type"], "signal")
        self.assertEqual(signal["asset"], "GBPUSD")
        self.assertEqual(signal["direction"], "PUT")

        # Step 2: Store in active_signals
        self.handler.active_signals.append({
            "asset": signal["asset"],
            "direction": signal["direction"],
            "entryTimeUtc": signal["entry_time_utc"],
            "expirationMinutes": signal["expiration_minutes"],
            "martingaleTimes": signal["martingale_times"],
        })

        # Step 3: Parse result message (informal Portuguese with gale)
        result_text = "GBPUSD pagou no gale! 💚"
        result_date = datetime(2024, 1, 1, 17, 41, 0, tzinfo=timezone.utc)  # ~10 min after entry (gale at 14:30 BRT = 17:30 UTC)
        result_msg_id = 2002

        parsed_results = parse_sinais_live(result_text, result_msg_id, result_date)

        # Verify result was parsed
        self.assertIsNotNone(parsed_results)
        self.assertEqual(len(parsed_results), 1)
        result = parsed_results[0]
        self.assertEqual(result["type"], "result")
        self.assertEqual(result["result"], "win")
        self.assertEqual(result["gale_level"], 1)
        self.assertEqual(result["asset"], "GBPUSD")

        # Step 4: Find matching signal
        matched_signal = self.handler.find_matching_signal(
            result_date,
            asset=result["asset"]
        )

        # Step 5: Verify correct match
        self.assertIsNotNone(matched_signal, "Should match the GBPUSD signal")
        self.assertEqual(matched_signal["asset"], "GBPUSD")
        self.assertEqual(matched_signal["direction"], "PUT")

    def test_blacklist_signal_result_flow(self):
        """Test BLACKLIST channel signal+result flow with informal result parsing."""
        # Step 1: Parse BLACKLIST signal message
        signal_text = """🚨 SINAL BLACKLIST 🚨

• EURUSD - CALL - 15:30

📊 M5
✅ Confirmado"""

        msg_date = datetime(2024, 1, 1, 12, 30, 0, tzinfo=timezone.utc)  # BRT 15:30 - 3 = UTC 12:30
        msg_id = 5001

        parsed_signals = parse_blacklist_live(signal_text, msg_id, msg_date)

        # Verify signal was parsed
        self.assertIsNotNone(parsed_signals)
        self.assertEqual(len(parsed_signals), 1)
        signal = parsed_signals[0]
        self.assertEqual(signal["type"], "signal")
        self.assertEqual(signal["asset"], "EURUSD")

        # Step 2: Add to active_signals
        self.handler.active_signals.append({
            "asset": signal["asset"],
            "direction": signal["direction"],
            "entryTimeUtc": signal["entry_time_utc"],
            "expirationMinutes": signal["expiration_minutes"],
            "martingaleTimes": signal["martingale_times"],
        })

        # Step 3: Parse informal result "EURUSD win no gale"
        result_text = "EURUSD win no gale"
        result_date = datetime(2024, 1, 1, 18, 35, 0, tzinfo=timezone.utc)  # 5 min after entry
        result_msg_id = 5002

        parsed_results = parse_blacklist_live(result_text, result_msg_id, result_date)

        # Verify result was parsed
        self.assertIsNotNone(parsed_results)
        self.assertEqual(len(parsed_results), 1)
        result = parsed_results[0]
        self.assertEqual(result["type"], "result")
        self.assertEqual(result["asset"], "EURUSD")

        # Step 4: Call find_matching_signal with extracted asset
        matched_signal = self.handler.find_matching_signal(
            result_date,
            asset=result["asset"]
        )

        # Step 5: Assert correct match
        self.assertIsNotNone(matched_signal, "Should match the EURUSD signal")
        self.assertEqual(matched_signal["asset"], "EURUSD")
        self.assertEqual(matched_signal["direction"], "CALL")

    def test_multiple_signals_correct_match(self):
        """Test matching with multiple active signals - verify correct one is matched."""
        # Create multiple signals at different times
        base_time = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)

        # Signal 1: EURUSD CALL at 10:00
        signal1_text = "• EURUSD - CALL - 10:00"
        parsed1 = parse_blacklist_live(
            f"🚨 SINAL BLACKLIST 🚨\n{signal1_text}",
            1001,
            datetime(2024, 1, 1, 7, 0, 0, tzinfo=timezone.utc)
        )
        self.handler.active_signals.append({
            "asset": parsed1[0]["asset"],
            "direction": parsed1[0]["direction"],
            "entryTimeUtc": parsed1[0]["entry_time_utc"],
            "expirationMinutes": parsed1[0]["expiration_minutes"],
            "martingaleTimes": parsed1[0]["martingale_times"],
        })

        # Signal 2: GBPUSD PUT at 10:10
        signal2_text = "• GBPUSD - PUT - 10:10"
        parsed2 = parse_blacklist_live(
            f"🚨 SINAL BLACKLIST 🚨\n{signal2_text}",
            1002,
            datetime(2024, 1, 1, 7, 10, 0, tzinfo=timezone.utc)
        )
        self.handler.active_signals.append({
            "asset": parsed2[0]["asset"],
            "direction": parsed2[0]["direction"],
            "entryTimeUtc": parsed2[0]["entry_time_utc"],
            "expirationMinutes": parsed2[0]["expiration_minutes"],
            "martingaleTimes": parsed2[0]["martingale_times"],
        })

        # Signal 3: USDJPY CALL at 10:20
        signal3_text = "• USDJPY - CALL - 10:20"
        parsed3 = parse_blacklist_live(
            f"🚨 SINAL BLACKLIST 🚨\n{signal3_text}",
            1003,
            datetime(2024, 1, 1, 7, 20, 0, tzinfo=timezone.utc)
        )
        self.handler.active_signals.append({
            "asset": parsed3[0]["asset"],
            "direction": parsed3[0]["direction"],
            "entryTimeUtc": parsed3[0]["entry_time_utc"],
            "expirationMinutes": parsed3[0]["expiration_minutes"],
            "martingaleTimes": parsed3[0]["martingale_times"],
        })

        # Result arrives for GBPUSD at 13:15 UTC (5 min after GBPUSD entry at 10:10 BRT = 13:10 UTC)
        result_date = datetime(2024, 1, 1, 13, 15, 0, tzinfo=timezone.utc)
        result_text = "GBPUSD win! 🔥"
        parsed_result = parse_blacklist_live(result_text, 1004, result_date)

        # Find matching signal
        matched_signal = self.handler.find_matching_signal(
            result_date,
            asset=parsed_result[0]["asset"]
        )

        # Verify it matched GBPUSD, not EURUSD or USDJPY
        self.assertIsNotNone(matched_signal)
        self.assertEqual(matched_signal["asset"], "GBPUSD")
        self.assertEqual(matched_signal["direction"], "PUT")

    def test_inline_result_format(self):
        """Test BLACKLIST inline format (legacy): signal + result in same message."""
        # Parse inline signal with result
        inline_text = "📍 EURUSD 15:00 CALL ✅"
        msg_date = datetime(2024, 1, 1, 12, 1, 0, tzinfo=timezone.utc)  # Shortly after signal
        msg_id = 3001

        parsed = parse_blacklist_live(inline_text, msg_id, msg_date)

        # Verify inline signal was parsed with result
        self.assertIsNotNone(parsed)
        self.assertEqual(len(parsed), 1)
        signal = parsed[0]
        self.assertEqual(signal["type"], "inline_signal")
        self.assertEqual(signal["asset"], "EURUSD")
        self.assertEqual(signal["direction"], "CALL")
        self.assertTrue(signal["is_win"])
        self.assertEqual(signal["gale_level"], 0)

    def test_otc_asset_normalization(self):
        """Test OTC asset parsing and matching across different formats."""
        # Signal with OTC asset
        signal_text = "• EUR/USD OTC - CALL - 22:00"
        msg_date = datetime(2024, 1, 1, 19, 0, 0, tzinfo=timezone.utc)

        parsed = parse_blacklist_live(
            f"🚨 SINAL BLACKLIST 🚨\n{signal_text}",
            4001,
            msg_date
        )

        self.assertIsNotNone(parsed)
        signal = parsed[0]
        # Verify OTC normalization (should be EURUSD_otc)
        self.assertIn("otc", signal["asset"].lower())

        # Store signal
        self.handler.active_signals.append({
            "asset": signal["asset"],
            "direction": signal["direction"],
            "entryTimeUtc": signal["entry_time_utc"],
            "expirationMinutes": signal["expiration_minutes"],
            "martingaleTimes": signal["martingale_times"],
        })

        # Result message with different OTC format (22:00 BRT = 01:00 UTC next day, result at 01:05 UTC)
        # Note: Asset must come before "win/pagou" keywords for proper extraction
        result_text = "EUR/USD OTC win! 🔥"
        result_date = datetime(2024, 1, 2, 1, 5, 0, tzinfo=timezone.utc)

        parsed_result = parse_blacklist_live(result_text, 4002, result_date)

        # Match should work despite different OTC formatting
        matched = self.handler.find_matching_signal(
            result_date,
            asset=parsed_result[0]["asset"]
        )

        self.assertIsNotNone(matched, "Should match despite different OTC format")

    def test_sinais_signal_result_flow(self):
        """Test SINAIS MILIONARIOS channel signal+result flow with informal result parsing."""
        # Step 1: Parse SINAIS signal message
        signal_text = """📊 SINAL VIP 📊

• USDJPY - CALL - 16:45

📈 M5
🔥 Foco no lucro!"""

        msg_date = datetime(2024, 1, 1, 13, 45, 0, tzinfo=timezone.utc)  # BRT 16:45 - 3 = UTC 13:45
        msg_id = 6001

        parsed_signals = parse_sinais_live(signal_text, msg_id, msg_date)

        # Verify signal was parsed
        self.assertIsNotNone(parsed_signals)
        self.assertEqual(len(parsed_signals), 1)
        signal = parsed_signals[0]
        self.assertEqual(signal["type"], "signal")
        self.assertEqual(signal["asset"], "USDJPY")
        self.assertEqual(signal["direction"], "CALL")

        # Step 2: Add to active_signals
        self.handler.active_signals.append({
            "asset": signal["asset"],
            "direction": signal["direction"],
            "entryTimeUtc": signal["entry_time_utc"],
            "expirationMinutes": signal["expiration_minutes"],
            "martingaleTimes": signal["martingale_times"],
        })

        # Step 3: Parse informal result "USDJPY win de primeira"
        result_text = "USDJPY win de primeira 🔥🔥"
        result_date = datetime(2024, 1, 1, 19, 50, 0, tzinfo=timezone.utc)  # 5 min after entry
        result_msg_id = 6002

        parsed_results = parse_sinais_live(result_text, result_msg_id, result_date)

        # Verify result was parsed
        self.assertIsNotNone(parsed_results)
        self.assertEqual(len(parsed_results), 1)
        result = parsed_results[0]
        self.assertEqual(result["type"], "result")
        self.assertEqual(result["asset"], "USDJPY")
        self.assertEqual(result["result"], "win")
        self.assertEqual(result["gale_level"], 0)

        # Step 4: Call find_matching_signal with extracted asset
        matched_signal = self.handler.find_matching_signal(
            result_date,
            asset=result["asset"]
        )

        # Step 5: Assert correct match using enhanced logic
        self.assertIsNotNone(matched_signal, "Should match the USDJPY signal")
        self.assertEqual(matched_signal["asset"], "USDJPY")
        self.assertEqual(matched_signal["direction"], "CALL")


if __name__ == '__main__':
    unittest.main()
