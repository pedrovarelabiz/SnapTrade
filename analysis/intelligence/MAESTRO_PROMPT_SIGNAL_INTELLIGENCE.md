# SNAPTRADE SIGNAL INTELLIGENCE — KNOWLEDGE BASE FOR MAESTRO LLM

## ROLE

You are the mission planner for the SnapTrade platform. You receive the findings below from an exhaustive signal intelligence analysis (185,039 Telegram messages across 6 channels, 3.5 years of data) and must generate prioritized implementation missions to transform SnapTrade from a single-channel gale-dependent system into a multi-channel intelligent trading engine.

Every mission you create must be concrete, implementable, and reference the specific files, modules, and parameters described here.

---

## 1. CRITICAL FINDINGS — THE ECONOMICS OF GALE (MARTINGALE)

### 1.1 Payout & Breakeven Math

The platform operates on binary options with **88% payout** (win pays 0.88x stake, loss costs 1.00x stake).

Gale (martingale) recovery multipliers at 88% payout:
- **G0** (base trade): stake = 1.00x
- **G1** (1st recovery): stake = 2.136x (must recover G0 loss + make profit)
- **G2** (2nd recovery): stake = 4.564x (must recover G0+G1 losses + make profit)

**Breakeven win rates by gale mode:**
| Mode | Total Exposure | Breakeven WR |
|------|---------------|-------------|
| No Martingale | 1.00x | **53.2%** |
| Max MG1 | 3.136x (1+2.136) | **78.1%** |
| Max MG2 | 7.700x (1+2.136+4.564) | **89.7%** |

**KEY INSIGHT**: Each gale level RAISES the breakeven exponentially. A channel needs progressively higher win rates to justify each additional gale level. More gale ≠ more profit. More gale = higher breakeven = harder to be profitable.

### 1.2 Expected Value (EV) Per Channel — THE DECISION TABLE

Analysis of complete historical data with gale-level decomposition:

| Channel | Mode | WR | EV/trade | Profitable? | Trades | Period |
|---------|------|-----|----------|-------------|--------|--------|
| **Sinais Mil** | **MG1** | 84.4% | **+0.247x** | ✅ YES | 7,135 | 2022-08 → 2026-03 |
| **Sinais Mil** | NoMG | 56.4% | +0.061x | ✅ YES | 7,135 | 2022-08 → 2026-03 |
| **Private Team** | **NoMG** | 87.4% | **+0.643x** | ✅ YES | 437 | 2025-12 → 2026-03 |
| **TYL Trading** | **MG1** | 86.7% | **+0.024x** | ✅ YES | 2,547 | 2024-10 → 2026-03 |
| TYL Trading | NoMG | 49.9% | -0.062x | ❌ NO | 2,547 | |
| TYL Trading | MG2 | 86.9% | -0.247x | ❌ NO | 2,547 | |
| TYL VIP | NoMG | 49.5% | -0.069x | ❌ NO | 7,989 | |
| TYL VIP | MG1 | 74.7% | -0.137x | ❌ NO | 7,989 | |
| TYL VIP | MG2 | 87.2% | -0.217x | ❌ NO | 7,989 | |
| Blacklist | NoMG | 45.5% | -0.145x | ❌ NO | 884 | |
| Blacklist | MG1 | 61.2% | -0.678x | ❌ NO | 884 | |
| Cole Carter | N/A | 100%* | N/A | ⚠️ SUSPECT | 67 | |

*Cole Carter reports 100% WR — promotional channel, unreliable data.

### 1.3 Gale Level Distribution by Channel

**Sinais Mil** (max gale = 1, result tags: "Win de Primeira" = GL0, "Win no Gale" = GL1, "Loss" = GL1):
- GL0 win: 4,072 (56.4%) — won on first attempt
- GL1 win: 2,009 (27.8%) — lost first, won on recovery
- GL1 loss: 1,137 (15.7%) — lost both attempts

**TYL VIP** (max gale = 2, from seed_signals.json gale_level field):
- GL0 win: 3,958 (49.5%)
- GL1 win: 2,008 (25.1%)
- GL2 win: 1,002 (12.5%)
- GL2 loss: 1,021 (12.8%)

**TYL Trading** (max gale = 2, from db_import galeLevel field):
- GL0 win: 2,546 (49.9%)
- GL1 win: 1,469 (28.8%)
- GL2 win: 418 (8.2%)
- GL2 loss: 670 (13.1%)

**Blacklist** (max gale = 1, from parsed messages):
- GL0 win: 402 (45.5%)
- GL1 win: 139 (15.7%)
- GL1 loss: 343 (38.8%)

**Private Team** (gale level unknown from parsed data — reported WR includes gale):
- WIN: 382 (87.4%)
- LOSS: 55 (12.6%)

### 1.4 Asset-Level Analysis

**Sinais Mil (MG1 mode)**: 21 out of 22 assets profitable. Only CADCHF_otc is negative (EV=-0.185). Top performers by volume:
- EURUSD_otc: 917 trades, 85.0% WR, EV=+0.276
- EURGBP_otc: 504 trades, 86.9% WR, EV=+0.354
- GBPUSD_otc: 450 trades, 84.4% WR, EV=+0.261
- USDJPY_otc: 311 trades, 88.4% WR, EV=+0.415

**Private Team (NoMG)**: 19 assets profitable (min 5 trades). Top:
- AUDCAD_otc: 40 trades, 97.5% WR
- AUDCHF_otc: 40 trades, 90.0% WR
- BHDCNY_otc: 25 trades, 100% WR

**TYL VIP (MG2 mode, from ops reports)**: Only 4-6 assets above 89.7% BE:
- NZDUSD_otc: 1,132 trades, 90.9% WR
- AUDCAD_otc: 505 trades, 90.9% WR

### 1.5 Temporal Patterns (from TYL VIP ops reports, 15,155 detailed trades)

**Best hours UTC**: 09:00, 22:00, 08:00, 20:00
**Worst hours UTC**: 06:00 (45.5%!), 18:00 (63.6%)
**Day of week**: Stable range 85.9%-88.3%, Saturday slightly best
**Monthly consistency**: 84.9% to 89.6% — no significant drift

### 1.6 OPERATIONS REPORT Validation

Both TYL channels publish daily OPERATIONS REPORT messages with per-trade results:
- TYL VIP: 1,331 reports, 20,717 trades, 87.4% WR
- TYL Trading: 1,350 reports, 11,949 trades, 88.1% WR

These reports show results WITH gale (a WIN may have needed GL0, GL1, or GL2 to succeed). They do NOT distinguish gale levels. They serve as the ground truth for reported WR validation.

---

## 2. CURRENT ARCHITECTURE

### 2.1 Codebase Structure

```
snaptrade-phase2/backend/          # Node.js/TypeScript API
├── src/
│   ├── lib/
│   │   ├── masaniello.ts          # Masaniello progressive staking calculator
│   │   ├── pnlCalculator.ts       # P&L calculator (flat, masaniello, soros)
│   │   ├── soros.ts               # Soros staking strategy
│   │   └── prisma.ts              # Database client
│   ├── routes/
│   │   ├── signals.ts             # Signal CRUD endpoints
│   │   ├── stats.ts               # Statistics endpoints
│   │   └── reports.ts             # Report generation
│   ├── services/
│   │   ├── signalService.ts       # Signal business logic
│   │   ├── statsService.ts        # Stats computation
│   │   └── cronService.ts         # Scheduled tasks
│   └── config.ts

snaptrade-phase2b/                 # Telegram listener & parsers (Python + TS)
├── listener.py                    # Multi-channel Telethon listener (ACTIVE on VPS)
├── parser.py                      # TYL VIP signal/result parser
├── multi_channel_parsers.py       # Blacklist & Sinais Mil parsers
├── parser_pocket_vip.py           # Pocket VIP parser
├── seed_channels.ts               # Channel config & Prisma seeding
├── signalService.ts               # Signal creation service
├── import_channels.ts             # Channel import script
└── _archive/                      # Deprecated: analyzer, matcher, extractor, etc.
```

### 2.2 Current Channel Configuration (from seed_channels.ts)

| Channel | Slug | Telegram ID | Max Gale | Masaniello Trades/ExpWins |
|---------|------|-------------|----------|--------------------------|
| TYL VIP | tyl_vip | -1002593332597 | 2 | 20/17 |
| TYL Trading | tyl_trading | -1002281357812 | 2 | 20/16 |
| Sinais Mil | sinais_milionarios | -1001756002871 | 1 | 10/9 |
| Blacklist | blacklist_otc | -1001221176746 | 2 | 10/9 |
| Cole Carter | cole_carter | -1003515057952 | 2 | 10/8 |
| Private Team | private_team | -1003447450577 | 2 | 10/8 |

### 2.3 Current Masaniello Parameters (masaniello.ts)

Default: payoutRate=0.88, tradesPerDay=20, expectedWins=16, targetProfitPct=0.5
These parameters are CHANNEL-AGNOSTIC. The system does not yet differentiate gale strategy per channel.

### 2.4 VPS Infrastructure

- IP: 213.199.51.26 (Contabo)
- Listener: `/opt/snaptrade/telegram/listener.py` (Telethon, always-on)
- Session: `snaptrade.session` (authenticated Telegram session)
- Database: PostgreSQL `snaptrade_db` on localhost
- Backend: Node.js running on port 3001

---

## 3. PARSED DATA INVENTORY (intelligence/ directory)

All files in `/Users/pedrovarela/Documents/snaptrade-analysis/intelligence/`:

| File | Records | Description |
|------|---------|-------------|
| full_sinais_mil.json | 20,904 | Parsed signals with gale_level (GL0/GL1) |
| full_blacklist.json | 3,530 | Parsed signals with gale_level |
| full_private_team.json | 437 | Parsed signals (no gale level info) |
| full_cole_carter.json | 67 | Parsed signals |
| ops_tyl_vip.json | 20,717 | TYL VIP ops report trades |
| ops_tyl_trading.json | 11,949 | TYL Trading ops report trades |
| global_strategy_v2.json | — | Global strategy configuration |

Raw Telegram message files in `/Users/pedrovarela/Documents/snaptrade-analysis/`:
- tyl_vip.json (35,326 msgs), tyl_trading.json (37,585), sinais_mil.json (73,231)
- blacklist.json (33,927), private_team.json (2,756), cole_carter.json (2,214)

---

## 4. REQUIRED MISSIONS

### PRIORITY 1 — CHANNEL-SPECIFIC GALE MODE ENGINE

**Problem**: The current system applies the same gale strategy to ALL channels. The data proves that each channel has a unique optimal gale level. Using the wrong gale mode destroys profitability.

**Implementation**:
1. Add `optimalGaleMode` field to channel config (Prisma schema + seed_channels.ts)
   - Sinais Mil: maxGaleLevel=1 (MG1 optimal)
   - Private Team: maxGaleLevel=0 (NoMG optimal)
   - TYL Trading: maxGaleLevel=1 (MG1 optimal)
   - TYL VIP: maxGaleLevel=0 OR flag as non-tradeable (negative EV at all levels)
   - Blacklist: flag as non-tradeable
   - Cole Carter: flag as non-tradeable
2. Modify `pnlCalculator.ts` to read gale mode from channel config
3. Modify `masaniello.ts` to accept per-channel parameters
4. Update `signalService.ts` to enforce channel gale limits
5. Frontend: display channel gale mode and breakeven threshold

**Files to modify**: `seed_channels.ts`, `masaniello.ts`, `pnlCalculator.ts`, `signalService.ts`, Prisma schema

### PRIORITY 2 — ASSET-LEVEL SMART FILTER

**Problem**: Even within profitable channels, some assets underperform. CADCHF in Sinais Mil is EV-negative. Asset filtering can boost net returns.

**Implementation**:
1. Create `assetFilter` module that maintains per-channel, per-asset rolling WR
2. Compute rolling WR over last N signals (N=50 recommended)
3. Auto-blacklist assets where rolling WR drops below channel's breakeven threshold
4. Store blacklist in DB with reason and timestamp
5. Expose via API: GET /channels/:slug/blacklisted-assets
6. Listener should check asset blacklist before forwarding signal to users

**Known blacklisted assets (from analysis)**:
- Sinais Mil: CADCHF_otc (73.5% MG1 WR, EV=-0.185)
- TYL VIP: All assets except NZDUSD, AUDCAD, CADJPY, USDCOP (if MG2 mode used)

### PRIORITY 3 — MULTI-CHANNEL PARSER UPGRADE

**Problem**: Current parsers (multi_channel_parsers.py) use regex only and miss significant data. The Sinais Mil format changed over time (added/removed "OTC" keyword). Coverage is 25-35% for result matching.

**Implementation**:
1. Sinais Mil parser must handle both formats:
   - Old: `• AUDUSD (OTC) - PUT - 22:45`
   - New: `• GBPJPY - CALL - 14:50` (no OTC)
   - Regex: `r'•\s*([A-Z]{3,8}(?:/[A-Z]{3,4})?)\s*(?:\(OTC\)|OTC)?\s*-\s*(PUT|CALL)\s*-\s*(\d{2}:\d{2})'`
2. Result matching must handle gale sequence:
   - Signal → "Loss" (GL0 lost) → "Win no Gale" (GL1 won) = final result WIN at GL1
   - Signal → "Loss" = final result LOSS at GL1
   - Signal → "Win de Primeira" = final result WIN at GL0
3. Blacklist parser uses same format and result patterns
4. Private Team and Cole Carter use English format:
   - Signal: `Getting: PAIR OTC ready... Analysis: SELL/BUY`
   - Result: `⭐️PROFIT⭐️` or `⭐️LOSS⭐️`
5. Store gale_level in signal record (0=GL0 win, 1=GL1 win/loss)

**Result message patterns (Portuguese channels)**:
- "Win de Primeira" / "Winzao" → WIN at GL0
- "Win no Gale" / "Win no Martingale" → WIN at GL1
- "💢 Loss." / "❌ Loss." / "Não pagou" → LOSS at GL1
- "Que vela é essa… Loss." → LOSS at GL1

**Files to modify**: `multi_channel_parsers.py`, `listener.py`, `parser.py`

### PRIORITY 4 — OPERATIONS REPORT PARSER

**Problem**: TYL VIP and TYL Trading publish daily OPERATIONS REPORT messages with per-trade results including asset, time, and WIN/LOSS. These are currently ignored by the system but contain 32,666 validated trade results.

**Implementation**:
1. Add ops report parser to listener.py
2. Pattern: `OPERATIONS REPORT (DD/MM)` header followed by lines like:
   - `EUR/USD OTC - 07:25 -> WIN ✅`
   - `USD/JPY OTC - 07:45 -> LOSS ❌`
3. Earlier format (pre-Nov 2025): `SIGNAL 1 -> PROFIT ✅`
4. Extract: date, asset, time, result
5. Store as validation data (separate from live signals)
6. Use for real-time channel health monitoring

**Files to create/modify**: New `ops_report_parser.py`, modify `listener.py`

### PRIORITY 5 — REAL-TIME CHANNEL HEALTH DASHBOARD

**Problem**: No visibility into whether a channel is currently performing above or below its breakeven threshold. The system trades blindly without monitoring recent performance.

**Implementation**:
1. Rolling WR tracker per channel (last 50 signals, last 100 signals)
2. Compare rolling WR against channel's breakeven threshold
3. Circuit breakers:
   - If 50-signal rolling WR < breakeven → PAUSE channel (stop forwarding signals)
   - If drawdown > 20% of peak → PAUSE all channels
   - If 3 consecutive losses in a session → STOP for the day
4. Dashboard endpoint: GET /channels/health
5. Telegram alert to admin when circuit breaker triggers
6. Daily summary report with per-channel WR, P&L, and health status

### PRIORITY 6 — MASANIELLO PARAMETER OPTIMIZATION

**Problem**: Current Masaniello parameters are hardcoded per channel and not based on actual statistical analysis. The seed_channels.ts has tradesPerDay=20, expectedWins=17 for TYL VIP which implies 85% WR — but real WR varies by channel and gale mode.

**Recommended parameters based on data**:
| Channel | Gale Mode | Real WR | Trades/Day | Expected Wins | Max Bet Mult |
|---------|-----------|---------|------------|---------------|-------------|
| Sinais Mil | MG1 | 84.4% | 12 | 10 | 3x |
| Private Team | NoMG | 87.4% | 8 | 7 | 3x |
| TYL Trading | MG1 | 86.7% | 12 | 10 | 3x |
| TYL VIP | DISABLED | — | — | — | — |
| Blacklist | DISABLED | — | — | — | — |

**Implementation**:
1. Update seed_channels.ts with optimized parameters
2. Add dynamic parameter adjustment based on rolling WR
3. If rolling WR drops, reduce expectedWins proportionally
4. Add validation: expectedWins/tradesPerDay must be ≥ breakeven WR for channel's gale mode

### PRIORITY 7 — RISK MANAGEMENT MODULE

**Problem**: No automated risk management. Losses compound without intervention.

**Implementation**:
1. Create `riskManager.ts` module
2. Daily loss limit: configurable per user (default 10% of bankroll)
3. Drawdown stop: if account drops 20% from peak, pause all trading
4. Consecutive loss stop: 3 losses in a row → stop for the day
5. Session tracking: start/end of each trading session
6. Recovery mode: after drawdown stop, reduce stake by 50% for next 10 trades
7. Wire into signalService.ts — check risk limits before allowing trade execution

### PRIORITY 8 — PRIVATE TEAM FULL INTEGRATION

**Problem**: Private Team shows the highest EV per trade (+0.643x) with lowest drawdown (~2%) but is not yet a first-class channel in the system. Its parser needs improvement and it should be treated as a premium signal source.

**Implementation**:
1. Ensure listener.py routes Private Team messages correctly
2. Parser handles English format signals and ⭐️ result markers
3. Investigate gale structure: the 87.4% WR may include gale recovery
4. If gale-free, this is the single best channel — prioritize its signals
5. Monitor: with only 3 months of data, continuous validation is critical

### PRIORITY 9 — SIGNAL CONFLUENCE ENGINE (OPTIONAL, LOW PRIORITY)

**Finding**: Cross-channel signal overlap is extremely rare (0.27% of time windows). Confluence-based strategy is NOT viable as a primary approach.

However, when channels DO agree (same asset, same direction, within 15-min window):
- Cole Carter × Private Team: 100% WR (8 cases)
- TYL Trading × TYL VIP: 69.2% WR (28 cases)

**Implementation** (if pursued): lightweight detection layer, boost stake when 2+ profitable channels agree. Do NOT use as filter (too few occurrences).

---

## 5. DATA FLOW — TARGET ARCHITECTURE

```
Telegram Channels (6)
        │
        ▼
   listener.py (Telethon)
        │
        ├─── parser routing per channel
        │    ├── sinais_mil → parse_pt_format()
        │    ├── blacklist → parse_pt_format()
        │    ├── tyl_vip → parse_tyl_format()
        │    ├── tyl_trading → parse_tyl_format()
        │    ├── private_team → parse_en_format()
        │    └── cole_carter → parse_en_format()
        │
        ▼
   Signal + Result + GaleLevel
        │
        ├─── Asset Filter (is asset blacklisted?)
        ├─── Channel Health Check (is rolling WR above breakeven?)
        ├─── Risk Manager (daily limit reached? drawdown stop?)
        │
        ▼
   signalService.ts
        │
        ├─── Apply channel-specific gale mode
        ├─── Masaniello stake calculation (per-channel params)
        │
        ▼
   User notifications + trade execution
        │
        ▼
   statsService.ts → Dashboard
```

---

## 6. KEY CONSTRAINTS & WARNINGS

1. **Never use MG2 on Sinais Mil** — it only has 1 gale level. MG2 would require recovery at a level that doesn't exist.
2. **TYL VIP is EV-negative at ALL gale levels** — it should be disabled or used only for monitoring/validation.
3. **Blacklist is EV-negative at ALL gale levels** — confirmed with 4+ years of data.
4. **Result parsing coverage is 25-35%** for PT-format channels — many results are simply not posted. WR calculations are based on the subset that IS matched. This may introduce bias.
5. **Private Team has only 3 months of data** — treat with caution, validate continuously.
6. **All WR calculations assume honest result reporting** by channel operators.
7. **OTC market prices** are set by brokers, not real markets — WR may vary by broker.
8. **Payout rate of 88%** is assumed throughout — if broker changes payout, ALL breakevens shift.

---

## 7. FORMULA REFERENCE

```
Breakeven WR (No MG)  = 1 / (1 + PAYOUT)
Breakeven WR (MG1)    = (1 + G1) / (1 + G1 + PAYOUT)
Breakeven WR (MG2)    = (1 + G1 + G2) / (1 + G1 + G2 + PAYOUT)

where:
  PAYOUT = 0.88
  G1 = (1 + PAYOUT) / PAYOUT = 2.136
  G2 = (1 + G1 + PAYOUT) / PAYOUT = 4.564

EV per chain (MG1) = P(GL0w) × PAYOUT + P(GL1w) × (PAYOUT×G1 - 1) - P(GL1l) × (1+G1)
EV per chain (MG2) = P(GL0w) × PAYOUT + P(GL1w) × (PAYOUT×G1 - 1) + P(GL2w) × (PAYOUT×G2 - 1 - G1) - P(GL2l) × (1+G1+G2)
```

---

## 8. SUCCESS METRICS

After implementing all priorities, the system should:
1. **Trade only EV-positive channel×gale combinations** (SM/MG1, PT/NoMG, TT/MG1)
2. **Auto-pause channels** when rolling WR drops below breakeven
3. **Auto-blacklist assets** that underperform within a channel
4. **Report real WR** (with gale level breakdown) not just aggregate WR
5. **Enforce risk limits** at user level (daily loss, drawdown, consecutive loss)
6. **Parse 90%+ of signals** with correct gale level tagging
7. **Generate daily intelligence report** comparing ops report WR vs live WR vs historical WR
