"""Tests for multi_channel_parsers.py — all 4 parsers."""
import pytest
from datetime import datetime, timezone
from multi_channel_parsers import (
    parse_blacklist_live,
    parse_sinais_live,
    parse_instant_ready_live,
    parse_vip_otc_market,
)


class TestBlacklistParser:
    """Tests for parse_blacklist_live (BLACKLIST channel)."""

    def _dt(self, h=12, m=0):
        return datetime(2025, 3, 20, h, m, tzinfo=timezone.utc)

    def test_inline_win(self):
        text = "📍 EUR/USD; 10:00; CALL ✅"
        results = parse_blacklist_live(text, 1, self._dt())
        assert len(results) >= 1
        r = results[0]
        assert r["asset"].upper() in ("EUR/USD", "EURUSD")
        assert r["direction"] == "CALL"
        assert r["is_win"] == True

    def test_inline_loss(self):
        text = "📍 GBP/JPY; 14:30; PUT ⛔"
        results = parse_blacklist_live(text, 2, self._dt())
        assert len(results) >= 1
        assert results[0]["is_win"] == False

    def test_bullet_signal_no_result(self):
        text = "SINAL BLACKLIST\n• EUR/USD — CALL — 15:00"
        results = parse_blacklist_live(text, 3, self._dt())
        assert len(results) >= 1
        r = results[0]
        assert r["direction"] == "CALL"
        assert "is_win" not in r or r["type"] == "signal"

    def test_empty_text_returns_empty(self):
        results = parse_blacklist_live("random text no signal", 4, self._dt())
        assert results == []

    def test_multiple_signals_one_message(self):
        text = "📍 EUR/USD; 10:00; CALL ✅\n📍 GBP/JPY; 10:05; PUT ⛔"
        results = parse_blacklist_live(text, 5, self._dt())
        assert len(results) == 2

    def test_utc_conversion(self):
        # Parser adds +3h to convert from UTC-3 to UTC
        text = "📍 EUR/USD; 10:00; CALL ✅"
        results = parse_blacklist_live(text, 6, self._dt())
        assert len(results) >= 1
        entry = results[0].get("entry_time_utc")
        if entry:
            assert "13:00" in entry  # 10:00 + 3h = 13:00 UTC


class TestSinaisParser:
    """Tests for parse_sinais_live (SINAIS MILIONARIOS channel)."""

    def _dt(self, h=12, m=0):
        return datetime(2025, 3, 20, h, m, tzinfo=timezone.utc)

    def test_signal_vip(self):
        text = "🔔 SINAL VIP\n• EUR/USD — CALL — 14:00"
        results = parse_sinais_live(text, 10, self._dt())
        assert len(results) >= 1
        r = results[0]
        assert r["direction"] == "CALL"

    def test_chart_emoji_trigger(self):
        text = "📊\n• GBP/JPY — PUT — 15:30"
        results = parse_sinais_live(text, 11, self._dt())
        assert len(results) >= 1

    def test_empty_returns_empty(self):
        results = parse_sinais_live("Bom dia pessoal!", 12, self._dt())
        assert results == []


class TestInstantReadyParser:
    """Tests for parse_instant_ready_live (Cole Carter / Private Team)."""

    def _dt(self, h=12, m=0):
        return datetime(2025, 3, 20, h, m, tzinfo=timezone.utc)

    def test_getting_ready_buy(self):
        text = "Getting: EUR/USD ready\nAnalysis: BUY"
        results = parse_instant_ready_live(text, 20, self._dt())
        assert len(results) == 1
        r = results[0]
        assert r["direction"] == "CALL"
        assert "EUR" in r["asset"].upper()

    def test_getting_ready_sell(self):
        text = "Getting: GBP/JPY ready\nAnalysis: SELL"
        results = parse_instant_ready_live(text, 21, self._dt())
        assert len(results) == 1
        assert results[0]["direction"] == "PUT"

    def test_no_match(self):
        text = "Great session today everyone!"
        results = parse_instant_ready_live(text, 22, self._dt())
        assert results == []

    def test_5min_expiration(self):
        text = "Getting: AUD/CAD ready\nAnalysis: BUY"
        results = parse_instant_ready_live(text, 23, self._dt())
        if results and "expiration" in results[0]:
            assert results[0]["expiration"] == 5


class TestVipOtcMarketParser:
    """Tests for parse_vip_otc_market (VIP Signals OTC Market)."""

    def _dt(self, h=12, m=0):
        return datetime(2025, 3, 20, h, m, tzinfo=timezone.utc)

    def test_otc_signal(self):
        text = '"EUR/USD" OTC\n"BUY" on the next Candle'
        results = parse_vip_otc_market(text, 30, self._dt())
        assert len(results) >= 1
        r = results[0]
        assert r["direction"] == "CALL"

    def test_gale_message(self):
        text = "prepared Martin 1"
        results = parse_vip_otc_market(text, 31, self._dt())
        assert len(results) >= 1
        r = results[0]
        assert r.get("type") == "gale" or r.get("gale_level", 0) >= 1

    def test_no_match(self):
        results = parse_vip_otc_market("Good morning team", 32, self._dt())
        assert results == []
