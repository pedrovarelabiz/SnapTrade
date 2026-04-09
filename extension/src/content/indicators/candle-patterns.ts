/**
 * Candlestick pattern detection — extracted from setup-detector.ts.
 * Pure function: takes candles + state, returns setup signal or null.
 */
import type { Candle, Timeframe } from './candle-collector';
import type { SetupSignal } from './setup-detector';

// Strength constant (must match setup-detector STRENGTH.candle_pattern)
const CANDLE_PATTERN_STRENGTH = 25;

interface CandlePatternState {
  readonly warmupCount: number;
}

const WARMUP_CANDLES = 3;

export function detectCandlePattern(candles: Candle[], s: CandlePatternState, tf: Timeframe): SetupSignal | null {
  if (candles.length < 3 || s.warmupCount < WARMUP_CANDLES) return null;

  const c = candles[candles.length - 1]!;
  const p = candles[candles.length - 2]!;
  const pp = candles[candles.length - 3]!;

  const cBody = Math.abs(c.close - c.open);
  const pBody = Math.abs(p.close - p.open);
  const cRange = c.high - c.low;
  const pRange = p.high - p.low;

  if (cRange === 0 || pRange === 0) return null;

  const cBullish = c.close > c.open;
  const pBullish = p.close > p.open;

  // === Bullish Engulfing ===
  if (!pBullish && cBullish && c.open <= p.close && c.close >= p.open && cBody > pBody * 1.1) {
    return {
      type: 'candle_pattern', direction: 'CALL', strength: CANDLE_PATTERN_STRENGTH,
      timeframe: tf, reason: 'Bullish engulfing', timestamp: Date.now(),
    };
  }

  // === Bearish Engulfing ===
  if (pBullish && !cBullish && c.open >= p.close && c.close <= p.open && cBody > pBody * 1.1) {
    return {
      type: 'candle_pattern', direction: 'PUT', strength: CANDLE_PATTERN_STRENGTH,
      timeframe: tf, reason: 'Bearish engulfing', timestamp: Date.now(),
    };
  }

  // === Hammer (bullish reversal at bottom) ===
  const cLowerWick = Math.min(c.open, c.close) - c.low;
  const cUpperWick = c.high - Math.max(c.open, c.close);
  if (cBody > 0 && cLowerWick >= cBody * 2 && cUpperWick <= cBody * 0.5) {
    if (!pBullish) {
      return {
        type: 'candle_pattern', direction: 'CALL', strength: CANDLE_PATTERN_STRENGTH,
        timeframe: tf, reason: `Hammer (wick ${(cLowerWick / cBody).toFixed(1)}x body)`, timestamp: Date.now(),
      };
    }
  }

  // === Shooting Star (bearish reversal at top) ===
  if (cBody > 0 && cUpperWick >= cBody * 2 && cLowerWick <= cBody * 0.5) {
    if (pBullish) {
      return {
        type: 'candle_pattern', direction: 'PUT', strength: CANDLE_PATTERN_STRENGTH,
        timeframe: tf, reason: `Shooting star (wick ${(cUpperWick / cBody).toFixed(1)}x body)`, timestamp: Date.now(),
      };
    }
  }

  // === Morning Doji Star (3-candle bullish reversal) ===
  const ppBody = Math.abs(pp.close - pp.open);
  const ppBullish = pp.close > pp.open;
  if (!ppBullish && pBody < ppBody * 0.3 && cBullish && c.close > (pp.open + pp.close) / 2) {
    return {
      type: 'candle_pattern', direction: 'CALL', strength: CANDLE_PATTERN_STRENGTH,
      timeframe: tf, reason: 'Morning doji star', timestamp: Date.now(),
    };
  }

  // === Evening Doji Star (3-candle bearish reversal) ===
  if (ppBullish && pBody < ppBody * 0.3 && !cBullish && c.close < (pp.open + pp.close) / 2) {
    return {
      type: 'candle_pattern', direction: 'PUT', strength: CANDLE_PATTERN_STRENGTH,
      timeframe: tf, reason: 'Evening doji star', timestamp: Date.now(),
    };
  }

  return null;
}

// ─── Trend Confirmation ───

const TREND_CONFIRM_STRENGTH = 15;

export interface TrendState {
  readonly warmupCount: number;
  readonly prevRsi: number | null;
  readonly wasOversold: boolean;
  readonly wasOverbought: boolean;
  readonly prevMacdLine: number | null;
  readonly prevSignalLine: number | null;
  readonly prevHistogram: number | null;
  readonly prevPrevHistogram: number | null;
  readonly sma80: number | null;
  readonly prevSma20: number | null;
  readonly alligatorState: string;
}

export async function detectTrendConfirmation(candles: Candle[], s: TrendState, tf: Timeframe): Promise<SetupSignal | null> {
  if (s.warmupCount < WARMUP_CANDLES) return null;
  const price = candles.length > 0 ? candles[candles.length - 1]!.close : 0;
  if (price === 0) return null;

  let bullishPoints = 0;
  let bearishPoints = 0;
  const bullishReasons: string[] = [];
  const bearishReasons: string[] = [];

  const rsiRisingFromOversold = s.prevRsi !== null && s.prevRsi < 40 && s.wasOversold;
  const rsiFallingFromOverbought = s.prevRsi !== null && s.prevRsi > 60 && s.wasOverbought;
  const histogramGrowing = s.prevHistogram !== null && s.prevPrevHistogram !== null &&
    s.prevHistogram > s.prevPrevHistogram;

  if (rsiRisingFromOversold && histogramGrowing) return null;
  if (rsiFallingFromOverbought && !histogramGrowing) return null;

  if (s.sma80 !== null && !isNaN(s.sma80)) {
    if (price > s.sma80) { bullishPoints += 2; bullishReasons.push('Price > SMA(80)'); }
    else { bearishPoints += 2; bearishReasons.push('Price < SMA(80)'); }
  }

  if (s.prevRsi !== null && !isNaN(s.prevRsi)) {
    if (rsiRisingFromOversold) {
      bullishReasons.push(`RSI ${s.prevRsi.toFixed(0)} recovering`);
    } else if (rsiFallingFromOverbought) {
      bearishReasons.push(`RSI ${s.prevRsi.toFixed(0)} weakening`);
    } else if (s.prevRsi > 50) {
      bullishPoints += 1; bullishReasons.push(`RSI ${s.prevRsi.toFixed(0)} bullish`);
    } else if (s.prevRsi < 50) {
      bearishPoints += 1; bearishReasons.push(`RSI ${s.prevRsi.toFixed(0)} bearish`);
    }
  }

  if (s.prevMacdLine !== null && s.prevSignalLine !== null && !isNaN(s.prevMacdLine) && !isNaN(s.prevSignalLine)) {
    if (s.prevMacdLine > s.prevSignalLine) { bullishPoints += 1; bullishReasons.push('MACD > Signal'); }
    else { bearishPoints += 1; bearishReasons.push('MACD < Signal'); }
  }

  if (s.prevHistogram !== null && s.prevPrevHistogram !== null && !isNaN(s.prevHistogram) && !isNaN(s.prevPrevHistogram)) {
    if (histogramGrowing) { bullishPoints += 1; bullishReasons.push('Histogram rising'); }
    else { bearishPoints += 1; bearishReasons.push('Histogram falling'); }
  }

  if (s.alligatorState === 'eating_up') { bullishPoints += 1; bullishReasons.push('Alligator eating UP'); }
  else if (s.alligatorState === 'eating_down') { bearishPoints += 1; bearishReasons.push('Alligator eating DOWN'); }

  if (s.prevSma20 !== null && !isNaN(s.prevSma20)) {
    if (price > s.prevSma20) { bullishPoints += 1; bullishReasons.push('Price > SMA(20)'); }
    else { bearishPoints += 1; bearishReasons.push('Price < SMA(20)'); }
  }

  const totalPoints = bullishPoints + bearishPoints;
  if (totalPoints < 3) return null;
  const threshold = 4;

  if (bullishPoints >= threshold) {
    return { type: 'trend_confirm', direction: 'CALL', strength: TREND_CONFIRM_STRENGTH,
      timeframe: tf, reason: bullishReasons.join(' + '), timestamp: Date.now() };
  }
  if (bearishPoints >= threshold) {
    return { type: 'trend_confirm', direction: 'PUT', strength: TREND_CONFIRM_STRENGTH,
      timeframe: tf, reason: bearishReasons.join(' + '), timestamp: Date.now() };
  }

  return null;
}
