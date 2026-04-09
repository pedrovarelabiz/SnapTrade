/**
 * M1 Entry Optimizer — Finds the sweet spot to enter within a 5-min window.
 *
 * After an M5 signal fires (direction determined), this module monitors M1 candles
 * to find the optimal entry moment. Instead of entering immediately at M5 close,
 * it waits for M1 to confirm the expected move has started.
 *
 * Scoring system (0-100):
 *   - M1 momentum alignment (last 3 candles direction)
 *   - M1 RSI position (oversold for CALL = good, overbought for CALL = bad)
 *   - M1 MACD histogram direction
 *   - Pullback detection (counter-move followed by reversal = ideal entry)
 *   - Candle pattern (reversal candle in signal direction = strong)
 *
 * Entry triggers when score >= ENTRY_THRESHOLD.
 * If no good entry in MAX_WAIT_CANDLES M1 candles, enters anyway (signal is still valid).
 */

import type { Candle } from './candle-collector';

// Config
const ENTRY_THRESHOLD = 60;  // Minimum score to trigger entry
const MAX_WAIT_CANDLES = 4;  // Max M1 candles to wait (0-4 = within same M5 candle)
const FALLBACK_ENTRY = true; // If true, enter at timeout even if score is low

export interface M1EntryState {
  readonly direction: 'CALL' | 'PUT';
  readonly signalTime: number;
  readonly signalPrice: number; // Price at M5 close (signal time)
  waitCount: number;           // How many M1 candles we've watched
  pullbackSeen: boolean;       // Did we see a counter-move?
  bestScore: number;           // Highest score seen
  bestScoreCandle: number;     // Index of best score
  entered: boolean;            // Did we enter?
  entryPrice: number;          // Price we entered at (0 = not yet)
  entryTime: number;           // When we entered (0 = not yet)
  skipped: boolean;            // Signal was skipped (no good entry, fallback disabled)
}

export interface M1EntryScore {
  total: number;
  momentum: number;     // 0-25: last 3 M1 candles aligned with direction
  rsi: number;          // 0-25: RSI favorable for entry
  macdAlign: number;    // 0-20: MACD histogram moving in signal direction
  pullbackEntry: number; // 0-20: pullback seen + reversal = ideal
  candleStrength: number; // 0-10: current candle body size + direction
  reason: string;
}

export function createM1EntryState(direction: 'CALL' | 'PUT', signalPrice: number): M1EntryState {
  return {
    direction,
    signalTime: Date.now(),
    signalPrice,
    waitCount: 0,
    pullbackSeen: false,
    bestScore: 0,
    bestScoreCandle: 0,
    entered: false,
    entryPrice: 0,
    entryTime: 0,
    skipped: false,
  };
}

/**
 * Evaluate M1 conditions for entry. Called on each M1 candle close.
 * Returns the score and whether to enter.
 */
export function evaluateM1Entry(
  state: M1EntryState,
  candles: readonly Candle[], // M1 candles (last ~20)
  rsi: number | null,
  macdHistogram: number | null,
  histogramRising: boolean,
): { shouldEnter: boolean; score: M1EntryScore; state: M1EntryState } {
  if (state.entered || state.skipped) {
    return { shouldEnter: false, score: emptyScore('already handled'), state };
  }

  if (candles.length < 5) {
    return { shouldEnter: false, score: emptyScore('insufficient candles'), state };
  }

  const isBuy = state.direction === 'CALL';
  const last5 = candles.slice(-5);
  const last3 = candles.slice(-3);
  const current = candles[candles.length - 1]!;

  // --- Score components ---

  // 1. Momentum: last 3 M1 candles direction alignment (0-25)
  let momentum = 0;
  const bullishCount = last3.filter(c => c.close > c.open).length;
  const bearishCount = last3.filter(c => c.close < c.open).length;
  if (isBuy) {
    if (bullishCount >= 3) momentum = 25;        // Strong bullish momentum
    else if (bullishCount === 2) momentum = 18;   // Good
    else if (bullishCount === 1) momentum = 8;    // Weak, maybe turning
    // 0 if all bearish
  } else {
    if (bearishCount >= 3) momentum = 25;
    else if (bearishCount === 2) momentum = 18;
    else if (bearishCount === 1) momentum = 8;
  }

  // 2. RSI position (0-25)
  let rsiScore = 0;
  if (rsi !== null) {
    if (isBuy) {
      // For CALL: low RSI = oversold = good entry. High RSI = overbought = bad.
      if (rsi < 30) rsiScore = 25;       // Oversold → strong CALL entry
      else if (rsi < 40) rsiScore = 20;
      else if (rsi < 50) rsiScore = 15;  // Neutral-low → decent
      else if (rsi < 60) rsiScore = 10;  // Neutral → OK
      else if (rsi < 70) rsiScore = 5;   // Getting high
      // >= 70: overbought for CALL = 0
    } else {
      // For PUT: high RSI = overbought = good entry
      if (rsi > 70) rsiScore = 25;
      else if (rsi > 60) rsiScore = 20;
      else if (rsi > 50) rsiScore = 15;
      else if (rsi > 40) rsiScore = 10;
      else if (rsi > 30) rsiScore = 5;
    }
  } else {
    rsiScore = 12; // No RSI data → neutral
  }

  // 3. MACD histogram alignment (0-20)
  let macdAlign = 0;
  if (macdHistogram !== null) {
    const histPositive = macdHistogram > 0;
    const aligned = (isBuy && histPositive) || (!isBuy && !histPositive);
    const turning = (isBuy && histogramRising) || (!isBuy && !histogramRising);
    if (aligned && turning) macdAlign = 20;      // Histogram in direction and growing
    else if (aligned) macdAlign = 14;            // In direction but weakening
    else if (turning) macdAlign = 10;            // Against but turning toward signal
    else macdAlign = 3;                          // Against and growing against
  } else {
    macdAlign = 10; // No data → neutral
  }

  // 4. Pullback detection (0-20)
  let pullbackEntry = 0;
  // Check if price pulled back against direction and is now reversing
  const prevCandle = candles[candles.length - 2]!;
  const currentBullish = current.close > current.open;
  const prevAgainstSignal = isBuy ? (prevCandle.close < prevCandle.open) : (prevCandle.close > prevCandle.open);
  const currentWithSignal = isBuy ? currentBullish : !currentBullish;

  if (prevAgainstSignal && currentWithSignal) {
    // Classic pullback reversal — ideal entry
    pullbackEntry = 20;
    state = { ...state, pullbackSeen: true };
  } else if (state.pullbackSeen && currentWithSignal) {
    // Pullback was seen earlier, now aligned
    pullbackEntry = 15;
  } else {
    // Check for deeper pullback in last 5 candles
    const against = last5.filter(c => isBuy ? c.close < c.open : c.close > c.open).length;
    if (against >= 2 && currentWithSignal) {
      pullbackEntry = 12; // Some pullback + current reversal
      state = { ...state, pullbackSeen: true };
    } else if (against === 0 && currentWithSignal) {
      pullbackEntry = 5; // No pullback at all — entering on momentum (riskier)
    }
  }

  // 5. Current candle strength (0-10)
  let candleStrength = 0;
  const bodySize = Math.abs(current.close - current.open);
  const totalRange = current.high - current.low;
  const bodyRatio = totalRange > 0 ? bodySize / totalRange : 0;

  if (currentWithSignal && bodyRatio > 0.6) candleStrength = 10;      // Strong body in direction
  else if (currentWithSignal && bodyRatio > 0.3) candleStrength = 7;   // Moderate body
  else if (currentWithSignal) candleStrength = 4;                      // Weak but aligned
  else if (bodyRatio < 0.2) candleStrength = 3;                        // Doji — indecision, wait

  // --- Total score ---
  const total = momentum + rsiScore + macdAlign + pullbackEntry + candleStrength;

  const score: M1EntryScore = {
    total,
    momentum,
    rsi: rsiScore,
    macdAlign,
    pullbackEntry,
    candleStrength,
    reason: `mom:${momentum} rsi:${rsiScore} macd:${macdAlign} pb:${pullbackEntry} str:${candleStrength}`,
  };

  // Update state
  const updatedState: M1EntryState = {
    ...state,
    waitCount: state.waitCount + 1,
    bestScore: total > state.bestScore ? total : state.bestScore,
    bestScoreCandle: total > state.bestScore ? state.waitCount : state.bestScoreCandle,
  };

  // Decide entry
  if (total >= ENTRY_THRESHOLD) {
    return {
      shouldEnter: true,
      score,
      state: { ...updatedState, entered: true, entryPrice: current.close, entryTime: Date.now() },
    };
  }

  // Timeout: entered max M1 candles without good score
  if (updatedState.waitCount >= MAX_WAIT_CANDLES) {
    if (FALLBACK_ENTRY) {
      return {
        shouldEnter: true,
        score: { ...score, reason: `TIMEOUT(${MAX_WAIT_CANDLES}): ${score.reason}` },
        state: { ...updatedState, entered: true, entryPrice: current.close, entryTime: Date.now() },
      };
    }
    return {
      shouldEnter: false,
      score: { ...score, reason: `SKIPPED(${MAX_WAIT_CANDLES}): ${score.reason}` },
      state: { ...updatedState, skipped: true },
    };
  }

  return { shouldEnter: false, score, state: updatedState };
}

function emptyScore(reason: string): M1EntryScore {
  return { total: 0, momentum: 0, rsi: 0, macdAlign: 0, pullbackEntry: 0, candleStrength: 0, reason };
}

/**
 * Check if entry state is still waiting (not entered and not skipped).
 */
export function isWaiting(state: M1EntryState): boolean {
  return !state.entered && !state.skipped;
}

/**
 * Get entry timing stats for logging.
 */
export function getEntryTimingInfo(state: M1EntryState): string {
  if (state.entered) {
    const delayMs = state.entryTime - state.signalTime;
    return `entered after ${state.waitCount} M1 candles (${(delayMs / 1000).toFixed(0)}s delay), score=${state.bestScore}`;
  }
  if (state.skipped) {
    return `skipped after ${state.waitCount} M1 candles, bestScore=${state.bestScore}`;
  }
  return `waiting: ${state.waitCount}/${MAX_WAIT_CANDLES} candles, bestScore=${state.bestScore}`;
}
