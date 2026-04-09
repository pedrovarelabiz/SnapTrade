# Gale (Martingale) Architecture — Source of Truth Documentation

## A2 Fix: Consolidation of gale logic across 3 components

### Overview
Gale/martingale logic exists in 3 places with DIFFERENT responsibilities:

### 1. Listener (listener.py) — Signal-level gale MATCHING
- **Function**: `determine_gale_level()` (line ~260)
- **Purpose**: When a result message arrives from Telegram, determines which gale level
  the result corresponds to (gale 0 = direct, gale 1 = first retry, etc.)
- **How**: Compares result timestamp against expected end times for each gale level
- **NOT responsible for**: Deciding whether to execute a gale trade

### 2. Content Script (content-script.ts) — Trade-level gale EXECUTION
- **Function**: `handleTradeResult()` (line ~371)
- **Purpose**: After a trade loss, decides whether to execute the next gale level
- **How**: Checks per-channel strategy config (maxGale, multiplier, autoExecuteGale)
- **Source of truth for**: "Should we do another gale?" and "At what amount?"
- **Computes gale amount**: `lastAmount * multiplier` (per-channel config)

### 3. Service Worker (service-worker.ts) — State & MM RECORDING
- **Function**: `processResult()` / `TRADE_RESULT` handler (line ~708)
- **Purpose**: Records the trade result in Masaniello/Soros calculators, updates daily state
- **NOT responsible for**: Deciding gale execution (that's content-script's job)
- **Source of truth for**: Persistent state, P&L tracking, risk limits

### Data Flow
```
Trade closes (WS) → content-script handleTradeResult()
  ├─ Gale decision: execute next level? → YES → executeTrade(galeLevel+1)
  └─ Send TRADE_RESULT to service-worker
       └─ Record in MM calculator, update daily state, check risk limits
```

### Key Rule
- Content-script is the **decision maker** for gale execution
- Service-worker is the **state keeper** for MM and risk
- Listener gale logic is purely for **result matching** (which gale level did this Telegram result correspond to?)
- These are NOT duplicates — they serve different purposes in the pipeline
