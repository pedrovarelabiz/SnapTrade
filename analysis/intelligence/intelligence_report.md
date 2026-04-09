# SNAPTRADE SIGNAL INTELLIGENCE REPORT
## Autonomous Deep Analysis — March 2026

---

## 1. EXECUTIVE SUMMARY

Analysis of **19,093 signals** across 7 Telegram channels (Nov 2021 – Mar 2026).

**Core Finding**: Most channels have NO genuine edge without martingale recovery.

| Channel | Reported WR | Real WR (no gale) | Edge? |
|---------|------------|-------------------|-------|
| TYL VIP (8,028 sigs) | 87.2% | **49.5%** | ❌ NO |
| TYL Trading (5,103) | 86.9% | **49.9%** | ❌ NO |
| Sinais Mil (3,645) | 82.8% | **82.5%** | ✅ +29.3pp |
| Blacklist (837) | 90.4% | **70.1%** | ✅ +16.9pp |
| Private Team (429) | 87.6% | **87.6%** | ✅ +34.4pp* |
| Cole Carter (65) | 100% | N/A | ⚠️ SUSPECT |
| VIP OTC (986) | 99.5% | ~63% | ⚠️ INFLATED |

*Private Team: only 3 months data. Breakeven = 53.2% (at 88% payout).

**Recommendation**: Use **Sinais Mil** as primary signal source with Masaniello (no gale), 2% stake, daily drawdown limits.

---

## 2. GALE STRUCTURE — WHY REPORTED WIN RATES ARE MISLEADING

TYL VIP/Trading use 2-level martingale. Data structure:
- GL0 win = won first try (only these count without gale)
- GL1 win = lost first, recovered on 2nd bet (2.27x stake)
- GL2 win/loss = lost twice, final attempt (5.15x stake)

**TYL VIP breakdown**: 3,958 GL0-wins + 2,008 GL1-wins + 1,002 GL2-wins + 1,021 GL2-losses = 7,989 chains. Without gale: 3,958/7,989 = **49.5%** (coin flip).

**Sinais Mil**: Only 1-level gale. 3,008 GL0-wins + 637 GL1 = 3,645 chains. Without gale: 3,008/3,645 = **82.5%** (genuine edge).

## 3. P&L SIMULATION ($1,000 initial, 2% flat stake, no gale)

| Channel | Final Bank | ROI | Max Drawdown |
|---------|-----------|-----|-------------|
| Sinais Mil | $41,200 | +4,020% | 7.8% |
| Blacklist | $6,330 | +533% | 14.2% |
| TYL VIP | $0 | -100% | 100% (bust) |

## 4. MONTE CARLO (2,000 sims × 500 trades)

| Scenario | Median Final | Avg Max DD | Bust Rate |
|----------|-------------|-----------|-----------|
| Sinais Mil 2% | $232K | ~8% | 0% |
| Sinais Mil 5% | $610M* | ~17% | 0% |
| Combined 80% WR | $142K | ~8% | 0% |
| TYL VIP no-gale | $448 | — | Losing |

*Theoretical — no position/liquidity limits.

## 5. CROSS-CHANNEL CONFLUENCE

- Only 49/17,866 windows (0.27%) had 2+ channel overlap
- Too rare for a confluence-based strategy
- cole_carter × private_team: 8 agreements, 100% WR (tiny sample)
- tyl_trading × tyl_vip: 28 agreements, 69.2% WR

---

## 6. RECOMMENDED STRATEGY: SINAIS MIL + MASANIELLO (NO GALE)

**Why Sinais Mil**: 82.5% real WR, lowest gale dependency (17.5%), 3 years data, 33 focused assets, survives all Monte Carlo scenarios.

**Masaniello Parameters**:
- trades_per_day: 10-15
- expected_wins: 8-12 (82.5% WR → ~8.25/10)
- max_bet_multiplier: 3x
- payout_rate: 0.88
- NO GALE/MARTINGALE

**Risk Management**:
- Stake: 2% (conservative) or 3% (moderate)
- Daily loss limit: 10% of bankroll
- Drawdown hard stop: 20% from peak
- Rolling WR monitor: pause if 50-signal WR < 70%

**Smart Filters**:
- Skip asset if recent_wr(50) < 75%
- Skip hour if recent_wr(100) < 80%
- Stop day after 3 consecutive losses
- Hard stop if drawdown > 20%

**Expected value per trade**: 0.825 × 0.88 - 0.175 = +0.551 per unit staked
**Kelly fraction**: 62.1% (use 2-5% = well below Kelly = very safe)

## 7. TEMPORAL PATTERNS

Best hours (UTC): 04:00-10:00 (volume + above-avg WR)
Best day: Saturday (88.5%)
Worst day: Thursday (84.9%)

## 8. IMPLEMENTATION CHANGES

1. Add real-time rolling WR per channel (no-gale metric)
2. Remove gale as default — make opt-in with risk warnings
3. Add smart filters (asset + hourly blacklists)
4. Prioritise Sinais Mil as primary channel
5. Add drawdown circuit breaker
6. Daily P&L dashboard showing real vs reported WR
7. Cross-reference reported results with actual execution

## 9. LIMITATIONS

1. Sinais Mil data ends Aug 2025 — verify channel still active
2. Blacklist data from 2021-2022 — may not reflect current markets
3. Private Team only 3 months — insufficient for high confidence
4. OTC prices set by brokers — WR may vary by platform
5. All backtests assume perfect execution (no slippage/latency)
6. Cole Carter and VIP OTC data quality too low for analysis

## 10. FILES GENERATED

- all_signals_unified.json (19,093 signals, all channels)
- channel_analysis.json, temporal_analysis.json, cross_channel.json
- strategy_results.json, monte_carlo_results.json
- parsed_cole_carter.json (65), parsed_private_team.json (429), parsed_vip_otc.json (986)
- vip_otc_sessions.json, cole_carter_session_results.json

---
*Report generated: March 2026 | Signals analyzed: 19,093 | Data: Nov 2021 – Mar 2026*
