/**
 * Setup Detector v2 — Detects classic trading setups on candle close.
 * Stateful: tracks crosses, reversals, trends across candles.
 * Multi-timeframe: M5 for macro trend (SMA 80), M1 for entry timing.
 *
 * Setups:
 * - RSI Reversal: RSI exits oversold (<30→above) or overbought (>70→below)
 * - MACD Cross: MACD line crosses signal line (not just histogram sign change)
 * - MA Trend: Price vs SMA(20) + SMA(80) for macro direction + Alligator awakening
 * - BB Squeeze: Bollinger Band squeeze followed by breakout
 */

import type { Candle, Timeframe } from './candle-collector';
import { calculateIndicator, type IndicatorConfig } from './indicator-engine';
import { detectCandlePattern, detectTrendConfirmation } from './candle-patterns';

// ─── Types ───

export type SetupType = 'rsi_reversal' | 'macd_cross' | 'ma_trend' | 'bb_squeeze' | 'candle_pattern' | 'trend_confirm';

export interface SetupSignal {
  type: SetupType;
  direction: 'CALL' | 'PUT';
  strength: number;
  timeframe: Timeframe;
  reason: string;
  timestamp: number;
}

export interface AggregatedSetup {
  direction: 'CALL' | 'PUT' | null;
  confidence: number;
  activeSetups: SetupSignal[];
  m5Trend: 'up' | 'down' | 'flat';
  m1Entry: SetupSignal | null;
  canTrade: boolean;
  lastAnalysis: number;
  symbol: string;
}

// ─── State ───

interface SymbolState {
  // RSI
  prevRsi: number | null;
  wasOversold: boolean;  // RSI was below 30
  wasOverbought: boolean; // RSI was above 70
  // MACD — track actual LINE values, not just histogram
  prevMacdLine: number | null;
  prevSignalLine: number | null;
  prevHistogram: number | null;
  prevPrevHistogram: number | null; // for histogram slope
  warmupCount: number; // skip first N candles after init
  // MA / Trend
  prevPrice: number | null;
  prevSma20: number | null;
  sma20History: number[]; // for slope detection
  sma80: number | null; // macro trend
  prevSma80: number | null;
  // Alligator
  prevLips: number | null;
  prevTeeth: number | null;
  prevJaw: number | null;
  alligatorState: 'sleeping' | 'awakening' | 'eating_up' | 'eating_down';
  // BB
  inSqueeze: boolean;
  squeezeCandles: number;
  avgBbw: number;
  // M5 macro
  m5Trend: 'up' | 'down' | 'flat';
  // Volatility tracking
  recentCloses: number[]; // last 20 close prices for volatility measurement
  volatilityRatio: number; // std dev(last 5) / std dev(last 20), >1.5 = spike
  // Active setups
  activeSetups: SetupSignal[];
}

const symbolStates = new Map<string, SymbolState>();
const SETUP_EXPIRY_CANDLES = 3;
const WARMUP_CANDLES = 3; // skip first 3 candles to build state
const VOLATILITY_WINDOW_SHORT = 5;
const VOLATILITY_WINDOW_LONG = 20;
const VOLATILITY_SPIKE_THRESHOLD = 1.5;
const VOLATILITY_PENALTY = 15;

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function updateVolatility(s: SymbolState, close: number): void {
  s.recentCloses = [...s.recentCloses, close].slice(-VOLATILITY_WINDOW_LONG);
  if (s.recentCloses.length >= VOLATILITY_WINDOW_LONG) {
    const shortStd = stdDev(s.recentCloses.slice(-VOLATILITY_WINDOW_SHORT));
    const longStd = stdDev(s.recentCloses);
    s.volatilityRatio = longStd > 0 ? shortStd / longStd : 1;
  }
}

function makeDefaultState(): SymbolState {
  return {
    prevRsi: null, wasOversold: false, wasOverbought: false,
    prevMacdLine: null, prevSignalLine: null, prevHistogram: null, prevPrevHistogram: null,
    warmupCount: 0,
    prevPrice: null, prevSma20: null, sma20History: [],
    sma80: null, prevSma80: null,
    prevLips: null, prevTeeth: null, prevJaw: null, alligatorState: 'sleeping',
    inSqueeze: false, squeezeCandles: 0, avgBbw: 0,
    m5Trend: 'flat',
    recentCloses: [], volatilityRatio: 1,
    activeSetups: [],
  };
}

function getState(symbol: string, tf: Timeframe = 'M1'): SymbolState {
  const key = `${symbol}:${tf}`;
  let s = symbolStates.get(key);
  if (!s) {
    s = makeDefaultState();
    symbolStates.set(key, s);
  }
  return s;
}

const STRENGTH: Record<SetupType, number> = {
  rsi_reversal: 35,    // early reversal — high weight (entry signal)
  macd_cross: 35,      // momentum shift — high weight (entry signal)
  candle_pattern: 30,  // engulfing/hammer/shooting star — early entry catalyst
  ma_trend: 25,        // price-MA cross — medium weight (entry signal)
  bb_squeeze: 30,      // breakout — good weight (entry signal)
  trend_confirm: 15,   // confirmation ONLY — low weight (NOT an entry signal)
};

// ─── RSI Reversal ───
// Entry: RSI exits oversold zone (crosses above 30) = BUY
//        RSI exits overbought zone (crosses below 70) = SELL
// Confirmation: RSI > 50 = bullish bias, RSI < 50 = bearish bias

async function detectRsiReversal(candles: Candle[], s: SymbolState, tf: Timeframe): Promise<SetupSignal | null> {
  const cfg: IndicatorConfig = { id: 'rsi', type: 'rsi', enabled: true, params: { period: 14 }, overlay: false, color: '' };
  const result = await calculateIndicator(cfg, candles);
  if (result.currentValue === null || typeof result.currentValue !== 'number' || isNaN(result.currentValue)) return null;

  const rsi = result.currentValue;
  const prev = s.prevRsi;
  let signal: SetupSignal | null = null;

  if (prev !== null && s.warmupCount >= WARMUP_CANDLES) {
    // Early oversold recovery: RSI was in oversold zone and starts rising past 35
    // (fires earlier than waiting for the classic 30→above 30 cross)
    if (s.wasOversold && prev <= 35 && rsi > 35) {
      signal = { type: 'rsi_reversal', direction: 'CALL', strength: STRENGTH.rsi_reversal,
        timeframe: tf, reason: `RSI oversold recovery (${prev.toFixed(1)}→${rsi.toFixed(1)})`, timestamp: Date.now() };
      s.wasOversold = false;
    }
    // Classic oversold exit (still fire if the early one didn't catch it)
    else if (s.wasOversold && prev <= 30 && rsi > 30) {
      signal = { type: 'rsi_reversal', direction: 'CALL', strength: STRENGTH.rsi_reversal,
        timeframe: tf, reason: `RSI oversold exit (${prev.toFixed(1)}→${rsi.toFixed(1)})`, timestamp: Date.now() };
      s.wasOversold = false;
    }
    // Early overbought exit: RSI was in overbought zone and drops below 65
    if (s.wasOverbought && prev >= 65 && rsi < 65) {
      signal = { type: 'rsi_reversal', direction: 'PUT', strength: STRENGTH.rsi_reversal,
        timeframe: tf, reason: `RSI overbought weakening (${prev.toFixed(1)}→${rsi.toFixed(1)})`, timestamp: Date.now() };
      s.wasOverbought = false;
    }
    // Classic overbought exit
    else if (s.wasOverbought && prev >= 70 && rsi < 70) {
      signal = { type: 'rsi_reversal', direction: 'PUT', strength: STRENGTH.rsi_reversal,
        timeframe: tf, reason: `RSI overbought exit (${prev.toFixed(1)}→${rsi.toFixed(1)})`, timestamp: Date.now() };
      s.wasOverbought = false;
    }
  }

  // Track zones (keep classic thresholds for zone detection)
  if (rsi < 30) s.wasOversold = true;
  if (rsi > 70) s.wasOverbought = true;
  // Only store valid values (clean up any prior NaN contamination)
  if (!isNaN(rsi)) s.prevRsi = rsi;

  return signal;
}

// ─── MACD Cross ───
// Entry: MACD LINE crosses SIGNAL LINE from below = BUY (bullish crossover)
//        MACD LINE crosses SIGNAL LINE from above = SELL (bearish crossover)
// Confirmation: histogram growing in direction = momentum building
// The histogram = MACD line - Signal line. Positive = MACD above signal (bullish)

async function detectMacdCross(candles: Candle[], s: SymbolState, tf: Timeframe): Promise<SetupSignal | null> {
  const cfg: IndicatorConfig = { id: 'macd', type: 'macd', enabled: true, params: { fast: 12, slow: 26, signal: 9 }, overlay: false, color: '' };
  const result = await calculateIndicator(cfg, candles);

  const lastVal = result.values.length > 0 ? result.values[result.values.length - 1] : null;
  if (!lastVal || lastVal.secondary === undefined) return null;

  const macdLine = lastVal.value;
  const signalLine = lastVal.secondary;
  const histogram = lastVal.histogram ?? (macdLine - signalLine);
  if (isNaN(macdLine) || isNaN(signalLine) || isNaN(histogram)) return null;

  let signal: SetupSignal | null = null;

  if (s.prevMacdLine !== null && s.prevSignalLine !== null && s.warmupCount >= WARMUP_CANDLES) {
    const prevDiff = s.prevMacdLine - s.prevSignalLine;
    const currDiff = macdLine - signalLine;

    // === Classic crossover (strong, full weight) ===
    // Bullish crossover: MACD line crosses above signal line
    if (prevDiff <= 0 && currDiff > 0) {
      signal = { type: 'macd_cross', direction: 'CALL', strength: STRENGTH.macd_cross,
        timeframe: tf, reason: `MACD crossed signal upward`, timestamp: Date.now() };
    }
    // Bearish crossover: MACD line crosses below signal line
    if (prevDiff >= 0 && currDiff < 0) {
      signal = { type: 'macd_cross', direction: 'PUT', strength: STRENGTH.macd_cross,
        timeframe: tf, reason: `MACD crossed signal downward`, timestamp: Date.now() };
    }

    // === Early signal: Histogram reversal (fires BEFORE line cross) ===
    // Histogram shrinking toward zero = momentum shifting, 2-3 candles before crossover
    if (!signal && s.prevHistogram !== null && s.prevPrevHistogram !== null) {
      // Was negative and shrinking (getting less negative) = bullish momentum building
      if (histogram < 0 && s.prevHistogram < 0 && histogram > s.prevHistogram && s.prevHistogram < s.prevPrevHistogram) {
        signal = { type: 'macd_cross', direction: 'CALL', strength: Math.round(STRENGTH.macd_cross * 0.7),
          timeframe: tf, reason: `MACD histogram reversing up (${s.prevHistogram.toFixed(5)}→${histogram.toFixed(5)})`, timestamp: Date.now() };
      }
      // Was positive and shrinking (getting less positive) = bearish momentum building
      if (histogram > 0 && s.prevHistogram > 0 && histogram < s.prevHistogram && s.prevHistogram > s.prevPrevHistogram) {
        signal = { type: 'macd_cross', direction: 'PUT', strength: Math.round(STRENGTH.macd_cross * 0.7),
          timeframe: tf, reason: `MACD histogram reversing down (${s.prevHistogram.toFixed(5)}→${histogram.toFixed(5)})`, timestamp: Date.now() };
      }
    }
  }

  // Only store valid values
  if (!isNaN(histogram)) { s.prevPrevHistogram = s.prevHistogram; s.prevHistogram = histogram; }
  if (!isNaN(macdLine)) s.prevMacdLine = macdLine;
  if (!isNaN(signalLine)) s.prevSignalLine = signalLine;

  return signal;
}

// ─── MA Trend ───
// Uses SMA(20) for short trend + SMA(80) for macro/big trend + Alligator for confirmation
// SMA(80): price above = macro uptrend, below = macro downtrend
// SMA(20): price crosses above with rising slope = entry timing
// Alligator: lips > teeth > jaw = uptrend (eating up), reverse = downtrend

async function detectMaTrend(candles: Candle[], s: SymbolState, tf: Timeframe): Promise<SetupSignal | null> {
  // Macro SMA: use long-period SMA for stable trend direction
  // M1: SMA(50) = 50min window — works reliably with 150 candles (100 valid data points)
  //     Using 50 instead of 100 to equalize quality across ALL pairs (WS history caps at ~150)
  // M5: SMA(80) = 6.6h window or fallback to shorter
  const macroPeriod = tf === 'M5'
    ? (candles.length >= 81 ? 80 : candles.length >= 41 ? 40 : 0)
    : (candles.length >= 51 ? 50 : candles.length >= 31 ? 30 : 0);

  const promises: Promise<any>[] = [
    calculateIndicator({ id: 'sma20', type: 'sma', enabled: true, params: { period: 20 }, overlay: true, color: '' }, candles),
    calculateIndicator({ id: 'alligator', type: 'alligator', enabled: true, params: { jaw: 13, teeth: 8, lips: 5 }, overlay: true, color: '' }, candles),
  ];
  if (macroPeriod > 0) {
    promises.push(calculateIndicator({ id: 'sma_macro', type: 'sma', enabled: true, params: { period: macroPeriod }, overlay: true, color: '' }, candles));
  }

  const [sma20Result, alligatorResult, smaMacroResult] = await Promise.all(promises);

  const sma20 = typeof sma20Result.currentValue === 'number' && !isNaN(sma20Result.currentValue) ? sma20Result.currentValue : null;
  const sma80 = smaMacroResult && typeof smaMacroResult.currentValue === 'number' && !isNaN(smaMacroResult.currentValue) ? smaMacroResult.currentValue : null;
  const price = candles.length > 0 ? candles[candles.length - 1]!.close : 0;

  // Alligator state detection
  const alligLast = alligatorResult.values.length > 0 ? alligatorResult.values[alligatorResult.values.length - 1] : null;
  if (alligLast && !isNaN(alligLast.value)) {
    const jaw = alligLast.value;
    const teeth = (alligLast.secondary !== undefined && !isNaN(alligLast.secondary)) ? alligLast.secondary : jaw;
    const lips = (alligLast.tertiary !== undefined && !isNaN(alligLast.tertiary)) ? alligLast.tertiary : teeth;

    // Eating up: lips > teeth > jaw (lines spread apart, ascending order)
    if (lips > teeth && teeth > jaw) {
      const spread = lips - jaw;
      s.alligatorState = spread > 0 ? 'eating_up' : 'awakening';
    }
    // Eating down: jaw > teeth > lips (lines spread apart, descending order)
    else if (jaw > teeth && teeth > lips) {
      s.alligatorState = 'eating_down';
    }
    // Sleeping: lines intertwined
    else {
      const spread = Math.abs(lips - jaw);
      s.alligatorState = spread < Math.abs(jaw * 0.001) ? 'sleeping' : 'awakening';
    }

    s.prevLips = lips;
    s.prevTeeth = teeth;
    s.prevJaw = jaw;
  }

  if (sma20 === null) return null;

  // Track SMA(20) slope
  s.sma20History.push(sma20);
  if (s.sma20History.length > 5) s.sma20History.shift();
  const sma20Rising = s.sma20History.length >= 3 && s.sma20History[s.sma20History.length - 1]! > s.sma20History[0]!;
  const sma20Falling = s.sma20History.length >= 3 && s.sma20History[s.sma20History.length - 1]! < s.sma20History[0]!;

  // Update SMA(80) for macro trend
  if (sma80 !== null) {
    s.sma80 = sma80;
    s.prevSma80 = sma80;
  }

  // Macro trend — requires sustained price position above/below macro SMA
  // M5 updates freely (each M5 candle = 5 min, naturally stable)
  // M1 requires a margin (0.05% distance from SMA) to avoid flipping on noise
  if (sma80 !== null) {
    if (tf === 'M5') {
      // M5 is inherently stable — update directly
      if (price > sma80) s.m5Trend = 'up';
      else if (price < sma80) s.m5Trend = 'down';
      else s.m5Trend = 'flat';
    } else {
      // M1: only change macro trend if price is clearly above/below SMA (0.05% margin)
      const margin = sma80 * 0.0005;
      if (price > sma80 + margin) s.m5Trend = 'up';
      else if (price < sma80 - margin) s.m5Trend = 'down';
      // If within margin, keep previous trend (don't flip on noise)
    }
  }

  let signal: SetupSignal | null = null;

  if (s.prevPrice !== null && s.prevSma20 !== null && s.warmupCount >= WARMUP_CANDLES) {
    // Bullish: price crosses above rising SMA(20) + alligator eating up or awakening + macro trend up
    if (s.prevPrice <= s.prevSma20 && price > sma20 && sma20Rising) {
      const macroAligned = s.sma80 !== null && price > s.sma80;
      const alligConfirm = s.alligatorState === 'eating_up' || s.alligatorState === 'awakening';
      const reasons: string[] = ['Price crossed above rising SMA(20)'];
      if (macroAligned) reasons.push('above SMA(80)');
      if (alligConfirm) reasons.push(`Alligator ${s.alligatorState}`);

      signal = { type: 'ma_trend', direction: 'CALL', strength: STRENGTH.ma_trend,
        timeframe: tf, reason: reasons.join(' + '), timestamp: Date.now() };
    }

    // Bearish: price crosses below falling SMA(20) + alligator eating down + macro trend down
    if (s.prevPrice >= s.prevSma20 && price < sma20 && sma20Falling) {
      const macroAligned = s.sma80 !== null && price < s.sma80;
      const alligConfirm = s.alligatorState === 'eating_down';
      const reasons: string[] = ['Price crossed below falling SMA(20)'];
      if (macroAligned) reasons.push('below SMA(80)');
      if (alligConfirm) reasons.push('Alligator eating down');

      signal = { type: 'ma_trend', direction: 'PUT', strength: STRENGTH.ma_trend,
        timeframe: tf, reason: reasons.join(' + '), timestamp: Date.now() };
    }
  }

  s.prevSma20 = sma20;
  s.prevPrice = price;

  return signal;
}

// ─── BB Squeeze/Breakout ───
// Squeeze: BB width contracts below 70% of its average → volatility compression
// Breakout: after squeeze, price closes above upper band (BUY) or below lower band (SELL)

async function detectBbSqueeze(candles: Candle[], s: SymbolState, tf: Timeframe): Promise<SetupSignal | null> {
  const cfg: IndicatorConfig = { id: 'bb', type: 'bollinger_bands', enabled: true, params: { period: 20, stdDev: 2 }, overlay: true, color: '' };
  const result = await calculateIndicator(cfg, candles);
  if (result.values.length < 5) return null;

  const last = result.values[result.values.length - 1]!;
  const upper = last.secondary ?? 0;
  const lower = last.tertiary ?? 0;
  if (isNaN(upper) || isNaN(lower) || isNaN(last.value)) return null;
  const bbw = upper - lower;
  const price = candles[candles.length - 1]!.close;

  // Rolling average BBW
  if (s.avgBbw === 0) s.avgBbw = bbw;
  else s.avgBbw = s.avgBbw * 0.9 + bbw * 0.1;

  const isSqueeze = bbw < s.avgBbw * 0.7;
  let signal: SetupSignal | null = null;

  if (s.warmupCount >= WARMUP_CANDLES) {
    if (isSqueeze) {
      s.squeezeCandles++;
    }

    // Was in squeeze (at least 2 candles) and now breaking out
    if (s.inSqueeze && s.squeezeCandles >= 2 && !isSqueeze) {
      if (price > upper) {
        signal = { type: 'bb_squeeze', direction: 'CALL', strength: STRENGTH.bb_squeeze,
          timeframe: tf, reason: `BB breakout UP after ${s.squeezeCandles} candle squeeze`, timestamp: Date.now() };
      } else if (price < lower) {
        signal = { type: 'bb_squeeze', direction: 'PUT', strength: STRENGTH.bb_squeeze,
          timeframe: tf, reason: `BB breakout DOWN after ${s.squeezeCandles} candle squeeze`, timestamp: Date.now() };
      }
      s.squeezeCandles = 0;
    }
  }

  s.inSqueeze = isSqueeze;
  return signal;
}

// ─── Candle Pattern Detection ───
// Detects reversal candlestick patterns as early entry signals.
// Patterns: Engulfing, Hammer/Shooting Star, Morning/Evening Doji Star
// ─── Main Analysis ───

export async function analyzeOnCandleClose(
  symbol: string, tf: Timeframe, candles: Candle[], enabledSetups: SetupType[],
): Promise<SetupSignal[]> {
  if (candles.length < 25) return [];

  const s = getState(symbol, tf);
  s.warmupCount++;

  // Track volatility from latest candle close
  const lastCandle = candles[candles.length - 1];
  if (lastCandle) updateVolatility(s, lastCandle.close);

  const newSetups: SetupSignal[] = [];

  const detectors: [SetupType, () => Promise<SetupSignal | null>][] = [
    ['rsi_reversal', () => detectRsiReversal(candles, s, tf)],
    ['macd_cross', () => detectMacdCross(candles, s, tf)],
    ['candle_pattern', () => Promise.resolve(detectCandlePattern(candles, s, tf))],
    ['ma_trend', () => detectMaTrend(candles, s, tf)],
    ['bb_squeeze', () => detectBbSqueeze(candles, s, tf)],
    ['trend_confirm', () => detectTrendConfirmation(candles, s, tf)],
  ];

  for (const [type, detect] of detectors) {
    if (!enabledSetups.includes(type)) continue;
    try {
      const signal = await detect();
      if (signal) newSetups.push(signal);
    } catch (err) {
      console.warn(`[SnapTrade] Setup ${type} error:`, err);
    }
  }

  // Manage active setups: remove expired, add new
  const now = Date.now();
  const expiryMs = tf === 'M1' ? SETUP_EXPIRY_CANDLES * 60000 : SETUP_EXPIRY_CANDLES * 300000;
  // Remove expired and replace same-type setups (latest wins)
  const newTypes = new Set(newSetups.map(ns => ns.type));
  s.activeSetups = [
    ...s.activeSetups.filter(setup => now - setup.timestamp < expiryMs && !newTypes.has(setup.type)),
    ...newSetups,
  ];

  return newSetups;
}

/**
 * Get aggregated setup state for decision making.
 */
export function getAggregatedSetup(symbol: string, minConfidence: number): AggregatedSetup {
  const m1State = getState(symbol, 'M1');
  const m5State = symbolStates.get(`${symbol}:M5`);
  const now = Date.now();

  // Merge active setups from both M1 and M5 states (backward compatible)
  const allSetups = [...m1State.activeSetups, ...(m5State?.activeSetups ?? [])];
  const active = allSetups.filter(setup => {
    const expiryMs = setup.timeframe === 'M1' ? SETUP_EXPIRY_CANDLES * 60000 : SETUP_EXPIRY_CANDLES * 300000;
    return now - setup.timestamp < expiryMs;
  });

  const callStrength = active.filter(a => a.direction === 'CALL').reduce((sum, a) => sum + a.strength, 0);
  const putStrength = active.filter(a => a.direction === 'PUT').reduce((sum, a) => sum + a.strength, 0);

  const direction: 'CALL' | 'PUT' | null = callStrength > putStrength ? 'CALL'
    : putStrength > callStrength ? 'PUT' : null;

  let confidence = Math.max(callStrength, putStrength);

  // Use M5 state's m5Trend (more reliable, updated on M5 close) with M1 fallback
  const m5Trend = m5State?.m5Trend ?? m1State.m5Trend;

  // M5 macro trend alignment bonus/penalty (SMA 80 based)
  if (direction === 'CALL' && m5Trend === 'up') confidence += 15;
  if (direction === 'PUT' && m5Trend === 'down') confidence += 15;
  if (direction === 'CALL' && m5Trend === 'down') confidence -= 20;
  if (direction === 'PUT' && m5Trend === 'up') confidence -= 20;

  // Alligator alignment bonus (use M1 state for display — UI shows M1 indicators)
  if (direction === 'CALL' && m1State.alligatorState === 'eating_up') confidence += 10;
  if (direction === 'PUT' && m1State.alligatorState === 'eating_down') confidence += 10;
  if (direction === 'CALL' && m1State.alligatorState === 'eating_down') confidence -= 10;
  if (direction === 'PUT' && m1State.alligatorState === 'eating_up') confidence -= 10;

  // RSI bias alignment bonus (M1 RSI)
  if (direction === 'CALL' && m1State.prevRsi !== null && m1State.prevRsi > 50) confidence += 5;
  if (direction === 'PUT' && m1State.prevRsi !== null && m1State.prevRsi < 50) confidence += 5;

  // Volatility spike penalty — recent candles much more volatile than normal
  if (m1State.volatilityRatio > VOLATILITY_SPIKE_THRESHOLD) confidence -= VOLATILITY_PENALTY;

  // Indicator disagreement penalty — active setups pulling in opposite directions
  const callCount = active.filter(a => a.direction === 'CALL').length;
  const putCount = active.filter(a => a.direction === 'PUT').length;
  if (callCount > 0 && putCount > 0) confidence -= Math.min(callCount, putCount) * 10;

  confidence = Math.max(0, Math.min(100, confidence));

  const m1Setups = active.filter(a => a.timeframe === 'M1');

  // trend_confirm is a CONTINUOUS confirmation, not an entry signal.
  const EVENT_SETUPS: ReadonlySet<SetupType> = new Set(['rsi_reversal', 'macd_cross', 'candle_pattern', 'ma_trend', 'bb_squeeze']);
  const hasEventSetup = active.some(a => EVENT_SETUPS.has(a.type) && a.direction === direction);
  const hasOnlyTrendConfirm = active.length > 0 && !hasEventSetup;

  return {
    direction, confidence, activeSetups: active,
    m5Trend,
    m1Entry: m1Setups.length > 0 ? m1Setups[m1Setups.length - 1]! : null,
    canTrade: confidence >= minConfidence && direction !== null && !hasOnlyTrendConfirm,
    lastAnalysis: now, symbol,
  };
}

/**
 * Display state for the panel.
 */
export function getDisplayState(symbol: string, tf: Timeframe = 'M1'): {
  rsi: number | null;
  macdLine: number | null;
  signalLine: number | null;
  macdHistogram: number | null;
  histogramRising: boolean;
  m5Trend: 'up' | 'down' | 'flat';
  sma20: number | null;
  sma80: number | null;
  alligatorState: string;
  inSqueeze: boolean;
  squeezeCandles: number;
} {
  const s = getState(symbol, tf);
  // m5Trend: prefer M5 state when available
  const m5State = symbolStates.get(`${symbol}:M5`);
  return {
    rsi: s.prevRsi,
    macdLine: s.prevMacdLine,
    signalLine: s.prevSignalLine,
    macdHistogram: s.prevHistogram,
    histogramRising: s.prevHistogram !== null && s.prevPrevHistogram !== null && s.prevHistogram > s.prevPrevHistogram,
    m5Trend: m5State?.m5Trend ?? s.m5Trend,
    sma20: s.prevSma20,
    sma80: s.sma80,
    alligatorState: s.alligatorState,
    inSqueeze: s.inSqueeze,
    squeezeCandles: s.squeezeCandles,
  };
}

// ─── Multi-Pair Summary ───

export interface SymbolSummary {
  symbol: string;
  direction: 'CALL' | 'PUT' | null;
  confidence: number;
  activeSetupCount: number;
  setupTypes: SetupType[];
  m5Trend: 'up' | 'down' | 'flat';
  canTrade: boolean;
  lastAnalysis: number;
}

/**
 * Returns a summary of ALL tracked symbols, sorted by confidence descending.
 * Used by the multi-pair summary panel to show which pairs have active setups.
 */
export function getAllSymbolSummaries(minConfidence: number): SymbolSummary[] {
  // Collect unique symbols from keyed state map (keys are "symbol:tf")
  const uniqueSymbols = new Set<string>();
  for (const key of symbolStates.keys()) {
    uniqueSymbols.add(key.split(':')[0]!);
  }

  const summaries: SymbolSummary[] = [];

  for (const symbol of uniqueSymbols) {
    // Reuse getAggregatedSetup which already merges M1+M5 states
    const agg = getAggregatedSetup(symbol, minConfidence);
    if (agg.activeSetups.length === 0) continue;

    const EVENT_SETUPS: ReadonlySet<SetupType> = new Set(['rsi_reversal', 'macd_cross', 'candle_pattern', 'ma_trend', 'bb_squeeze']);
    const hasEventSetup = agg.activeSetups.some(a => EVENT_SETUPS.has(a.type) && a.direction === agg.direction);

    summaries.push({
      symbol,
      direction: agg.direction,
      confidence: agg.confidence,
      activeSetupCount: agg.activeSetups.length,
      setupTypes: [...new Set(agg.activeSetups.map(a => a.type))],
      m5Trend: agg.m5Trend,
      canTrade: agg.canTrade,
      lastAnalysis: agg.activeSetups.reduce((max, a) => Math.max(max, a.timestamp), 0),
    });
  }

  // Sort by confidence descending
  return summaries.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Returns the total number of symbols being tracked (including those with no active setups).
 */
export function getTrackedSymbolCount(): number {
  const symbols = new Set<string>();
  for (const key of symbolStates.keys()) {
    symbols.add(key.split(':')[0]!);
  }
  return symbols.size;
}

export function resetState(symbol: string): void {
  symbolStates.delete(`${symbol}:M1`);
  symbolStates.delete(`${symbol}:M5`);
}

// ─── M5-Primary Signal Architecture ───

export interface PendingM5Signal {
  symbol: string;
  direction: 'CALL' | 'PUT';
  confidence: number;
  activeSetups: SetupSignal[];
  m5Trend: 'up' | 'down' | 'flat';
  m5Indicators: {
    rsi: number | null;
    macdHistogram: number | null;
    histogramRising: boolean;
    sma20: number | null;
    sma80: number | null;
    alligatorState: string;
  };
  m5Candles: Array<{ o: number; h: number; l: number; c: number; t: number }>;
  timestamp: number;
}

const pendingM5Signals = new Map<string, PendingM5Signal>();
const M5_SIGNAL_EXPIRY = 300_000; // 5 min (1 M5 candle)

/**
 * M5-Primary aggregation — uses ONLY M5 state for direction and confidence.
 */
export function getAggregatedSetupM5(symbol: string, minConfidence: number): AggregatedSetup {
  const m5State = getState(symbol, 'M5');
  const now = Date.now();

  const active = m5State.activeSetups.filter(setup => {
    const expiryMs = SETUP_EXPIRY_CANDLES * 300000; // M5 expiry only
    return now - setup.timestamp < expiryMs;
  });

  const callStrength = active.filter(a => a.direction === 'CALL').reduce((sum, a) => sum + a.strength, 0);
  const putStrength = active.filter(a => a.direction === 'PUT').reduce((sum, a) => sum + a.strength, 0);

  const direction: 'CALL' | 'PUT' | null = callStrength > putStrength ? 'CALL'
    : putStrength > callStrength ? 'PUT' : null;

  let confidence = Math.max(callStrength, putStrength);

  // M5 trend alignment (intrinsic — M5 IS the primary signal)
  if (direction === 'CALL' && m5State.m5Trend === 'up') confidence += 15;
  if (direction === 'PUT' && m5State.m5Trend === 'down') confidence += 15;
  if (direction === 'CALL' && m5State.m5Trend === 'down') confidence -= 20;
  if (direction === 'PUT' && m5State.m5Trend === 'up') confidence -= 20;

  // Alligator alignment (M5 alligator)
  if (direction === 'CALL' && m5State.alligatorState === 'eating_up') confidence += 10;
  if (direction === 'PUT' && m5State.alligatorState === 'eating_down') confidence += 10;
  if (direction === 'CALL' && m5State.alligatorState === 'eating_down') confidence -= 10;
  if (direction === 'PUT' && m5State.alligatorState === 'eating_up') confidence -= 10;

  // RSI alignment (M5 RSI)
  if (direction === 'CALL' && m5State.prevRsi !== null && m5State.prevRsi > 50) confidence += 5;
  if (direction === 'PUT' && m5State.prevRsi !== null && m5State.prevRsi < 50) confidence += 5;

  // Volatility penalty (M5)
  if (m5State.volatilityRatio > VOLATILITY_SPIKE_THRESHOLD) confidence -= VOLATILITY_PENALTY;

  // Disagreement penalty
  const callCount = active.filter(a => a.direction === 'CALL').length;
  const putCount = active.filter(a => a.direction === 'PUT').length;
  if (callCount > 0 && putCount > 0) confidence -= Math.min(callCount, putCount) * 10;

  confidence = Math.max(0, Math.min(100, confidence));

  const EVENT_SETUPS: ReadonlySet<SetupType> = new Set(['rsi_reversal', 'macd_cross', 'candle_pattern', 'ma_trend', 'bb_squeeze']);
  const hasEventSetup = active.some(a => EVENT_SETUPS.has(a.type) && a.direction === direction);

  return {
    direction, confidence, activeSetups: active,
    m5Trend: m5State.m5Trend,
    m1Entry: null, // M5-primary — M1 entry is checked separately via alignment
    canTrade: confidence >= minConfidence && direction !== null && hasEventSetup,
    lastAnalysis: now, symbol,
  };
}

/**
 * Register a pending M5 signal for a symbol.
 * Called on M5 candle close when M5 setups meet criteria.
 * The pending signal waits for M1 alignment before becoming a batch candidate.
 */
export function registerM5Signal(
  symbol: string,
  aggregated: AggregatedSetup,
  m5Candles: Array<{ o: number; h: number; l: number; c: number; t: number }>,
): void {
  if (!aggregated.direction) return;
  const m5State = getState(symbol, 'M5');

  const pending: PendingM5Signal = {
    symbol,
    direction: aggregated.direction,
    confidence: aggregated.confidence,
    activeSetups: [...aggregated.activeSetups],
    m5Trend: aggregated.m5Trend,
    m5Indicators: {
      rsi: m5State.prevRsi,
      macdHistogram: m5State.prevHistogram,
      histogramRising: m5State.prevHistogram !== null && m5State.prevPrevHistogram !== null
        && m5State.prevHistogram > m5State.prevPrevHistogram,
      sma20: m5State.prevSma20,
      sma80: m5State.sma80,
      alligatorState: m5State.alligatorState,
    },
    m5Candles: m5Candles.slice(-20),
    timestamp: Date.now(),
  };

  pendingM5Signals.set(symbol, pending);
  console.log(`[SnapTrade] M5 SIGNAL REGISTERED: ${symbol} ${pending.direction} ${pending.confidence}% [${aggregated.activeSetups.map(s => s.type).join(',')}]`);
}

/**
 * Get pending M5 signal for a symbol (if exists and not expired).
 */
export function getPendingM5Signal(symbol: string): PendingM5Signal | null {
  const pending = pendingM5Signals.get(symbol);
  if (!pending) return null;
  if (Date.now() - pending.timestamp > M5_SIGNAL_EXPIRY) {
    pendingM5Signals.delete(symbol);
    return null;
  }
  return pending;
}

/**
 * Check if M1 momentum aligns with a pending M5 signal direction.
 * Called on each M1 candle close when a pending M5 signal exists.
 * Starts loose (histogram only) — can be tightened later.
 */
export function checkM1Alignment(
  m5Direction: 'CALL' | 'PUT',
  m1Display: ReturnType<typeof getDisplayState>,
): { aligned: boolean; reason: string } {
  // Gate 1: M1 MACD histogram must be in the M5 direction (mandatory)
  const histAligned = m5Direction === 'CALL' ? m1Display.histogramRising : !m1Display.histogramRising;
  if (!histAligned) {
    return { aligned: false, reason: `M1 histogram ${m1Display.histogramRising ? 'rising' : 'falling'} against M5 ${m5Direction}` };
  }

  // Gate 2: M1 RSI must not be in extreme against direction
  if (m5Direction === 'CALL' && m1Display.rsi !== null && m1Display.rsi > 75) {
    return { aligned: false, reason: `M1 RSI ${m1Display.rsi.toFixed(0)} overbought blocks CALL` };
  }
  if (m5Direction === 'PUT' && m1Display.rsi !== null && m1Display.rsi < 25) {
    return { aligned: false, reason: `M1 RSI ${m1Display.rsi.toFixed(0)} oversold blocks PUT` };
  }

  return { aligned: true, reason: 'M1 momentum confirms M5 direction' };
}
