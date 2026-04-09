/**
 * Extra Indicators — Lightweight sync computations for Strategy Lab.
 *
 * Adds Stochastic, ADX, EMA crossovers, and session detection.
 * Pure functions, no state, no storage — same pattern as m5-indicators.ts.
 */

import type { Candle } from './candle-collector';

// ─── Types ───

export interface StochasticResult {
  readonly k: number;       // %K (fast line, 0-100)
  readonly d: number;       // %D (slow line, 0-100)
  readonly zone: 'overbought' | 'oversold' | 'neutral';
  readonly crossingUp: boolean;   // %K crossing above %D
  readonly crossingDown: boolean; // %K crossing below %D
}

export interface ADXResult {
  readonly adx: number;      // 0-100, trend strength
  readonly plusDI: number;    // +DI (bullish directional)
  readonly minusDI: number;  // -DI (bearish directional)
  readonly regime: 'trending' | 'ranging' | 'ambiguous';
  readonly trendDirection: 'bullish' | 'bearish' | 'neutral';
}

export interface EMAContext {
  readonly ema8: number;
  readonly ema21: number;
  readonly ema50: number;
  readonly aligned: 'bullish' | 'bearish' | 'mixed';
  readonly crossover: 'bullish' | 'bearish' | null; // 8/21 crossover on current candle
  readonly priceAboveEma50: boolean;
}

export type SessionType = 'asian' | 'london' | 'ny' | 'london_ny_overlap' | 'off';

export interface SessionInfo {
  readonly session: SessionType;
  readonly isHighLiquidity: boolean; // london or ny or overlap
}

export interface ExtraIndicators {
  readonly stochastic: StochasticResult | null;
  readonly adx: ADXResult | null;
  readonly ema: EMAContext | null;
  readonly session: SessionInfo;
}

// ─── EMA Helper ───

function emaArray(values: readonly number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i]! * k + result[i - 1]! * (1 - k));
  }
  return result;
}

// ─── Stochastic Oscillator ───

/**
 * Stochastic Oscillator: %K = (Close - LowestLow) / (HighestHigh - LowestLow) * 100
 * %D = SMA(%K, dPeriod)
 */
export function computeStochastic(
  candles: readonly Candle[],
  kPeriod: number = 14,
  dPeriod: number = 3,
  smoothK: number = 3,
): StochasticResult | null {
  const len = candles.length;
  if (len < kPeriod + dPeriod + smoothK) return null;

  // Compute raw %K values for the last (dPeriod + smoothK + 1) candles
  const rawKs: number[] = [];
  const neededRawK = dPeriod + smoothK + 1;
  const startIdx = Math.max(0, len - neededRawK - kPeriod + 1);

  for (let i = startIdx + kPeriod - 1; i < len; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      const c = candles[j]!;
      if (c.high > highest) highest = c.high;
      if (c.low < lowest) lowest = c.low;
    }
    const range = highest - lowest;
    const rawK = range > 0 ? ((candles[i]!.close - lowest) / range) * 100 : 50;
    rawKs.push(rawK);
  }

  if (rawKs.length < smoothK + dPeriod) return null;

  // Smooth %K with SMA(smoothK)
  const smoothedKs: number[] = [];
  for (let i = smoothK - 1; i < rawKs.length; i++) {
    let sum = 0;
    for (let j = 0; j < smoothK; j++) {
      sum += rawKs[i - j]!;
    }
    smoothedKs.push(sum / smoothK);
  }

  if (smoothedKs.length < dPeriod + 1) return null;

  // %D = SMA of smoothed %K
  const dValues: number[] = [];
  for (let i = dPeriod - 1; i < smoothedKs.length; i++) {
    let sum = 0;
    for (let j = 0; j < dPeriod; j++) {
      sum += smoothedKs[i - j]!;
    }
    dValues.push(sum / dPeriod);
  }

  const k = smoothedKs[smoothedKs.length - 1]!;
  const d = dValues[dValues.length - 1]!;
  const prevK = smoothedKs[smoothedKs.length - 2]!;
  const prevD = dValues.length >= 2 ? dValues[dValues.length - 2]! : d;

  const zone: StochasticResult['zone'] =
    k > 80 ? 'overbought' :
    k < 20 ? 'oversold' :
    'neutral';

  return {
    k: Math.round(k * 10) / 10,
    d: Math.round(d * 10) / 10,
    zone,
    crossingUp: prevK <= prevD && k > d,
    crossingDown: prevK >= prevD && k < d,
  };
}

// ─── ADX (Average Directional Index) ───

/**
 * ADX measures trend strength (not direction).
 * ADX > 25 = trending, ADX < 20 = ranging, 20-25 = ambiguous.
 * +DI > -DI = bullish trend, -DI > +DI = bearish trend.
 */
export function computeADX(
  candles: readonly Candle[],
  period: number = 14,
): ADXResult | null {
  const len = candles.length;
  if (len < period * 2 + 1) return null;

  // Step 1: Calculate True Range, +DM, -DM
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < len; i++) {
    const curr = candles[i]!;
    const prev = candles[i - 1]!;

    // True Range
    const highLow = curr.high - curr.low;
    const highPrevClose = Math.abs(curr.high - prev.close);
    const lowPrevClose = Math.abs(curr.low - prev.close);
    tr.push(Math.max(highLow, highPrevClose, lowPrevClose));

    // Directional Movement
    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  if (tr.length < period * 2) return null;

  // Step 2: Wilder's smoothing (first value = sum of period, then smooth)
  function wilderSmooth(values: number[], p: number): number[] {
    const result: number[] = [];
    let sum = 0;
    for (let i = 0; i < p; i++) sum += values[i]!;
    result.push(sum);
    for (let i = p; i < values.length; i++) {
      result.push(result[result.length - 1]! - result[result.length - 1]! / p + values[i]!);
    }
    return result;
  }

  const smoothTR = wilderSmooth(tr, period);
  const smoothPlusDM = wilderSmooth(plusDM, period);
  const smoothMinusDM = wilderSmooth(minusDM, period);

  // Step 3: Calculate +DI, -DI, DX
  const dx: number[] = [];
  let lastPlusDI = 0;
  let lastMinusDI = 0;

  for (let i = 0; i < smoothTR.length; i++) {
    const atr = smoothTR[i]!;
    if (atr === 0) {
      dx.push(0);
      continue;
    }
    const pdi = (smoothPlusDM[i]! / atr) * 100;
    const mdi = (smoothMinusDM[i]! / atr) * 100;
    const diSum = pdi + mdi;
    dx.push(diSum > 0 ? (Math.abs(pdi - mdi) / diSum) * 100 : 0);

    if (i === smoothTR.length - 1) {
      lastPlusDI = pdi;
      lastMinusDI = mdi;
    }
  }

  if (dx.length < period) return null;

  // Step 4: ADX = Wilder's smoothed DX
  const smoothDX = wilderSmooth(dx, period);
  const adx = smoothDX[smoothDX.length - 1]! / period; // normalize

  const regime: ADXResult['regime'] =
    adx > 25 ? 'trending' :
    adx < 20 ? 'ranging' :
    'ambiguous';

  const trendDirection: ADXResult['trendDirection'] =
    lastPlusDI > lastMinusDI ? 'bullish' :
    lastMinusDI > lastPlusDI ? 'bearish' :
    'neutral';

  return {
    adx: Math.round(adx * 10) / 10,
    plusDI: Math.round(lastPlusDI * 10) / 10,
    minusDI: Math.round(lastMinusDI * 10) / 10,
    regime,
    trendDirection,
  };
}

// ─── EMA Context ───

/**
 * Compute EMA 8, 21, 50 and detect crossovers and alignment.
 */
export function computeEMAContext(candles: readonly Candle[]): EMAContext | null {
  const closes = candles.map(c => c.close);
  if (closes.length < 51) return null;

  const ema8Arr = emaArray(closes, 8);
  const ema21Arr = emaArray(closes, 21);
  const ema50Arr = emaArray(closes, 50);

  const ema8 = ema8Arr[ema8Arr.length - 1]!;
  const ema21 = ema21Arr[ema21Arr.length - 1]!;
  const ema50 = ema50Arr[ema50Arr.length - 1]!;

  const prevEma8 = ema8Arr[ema8Arr.length - 2]!;
  const prevEma21 = ema21Arr[ema21Arr.length - 2]!;

  const price = closes[closes.length - 1]!;

  // Alignment: all EMAs ordered
  const bullishAligned = ema8 > ema21 && ema21 > ema50;
  const bearishAligned = ema8 < ema21 && ema21 < ema50;
  const aligned: EMAContext['aligned'] =
    bullishAligned ? 'bullish' :
    bearishAligned ? 'bearish' :
    'mixed';

  // Crossover detection: EMA8 crossing EMA21
  let crossover: EMAContext['crossover'] = null;
  if (prevEma8 <= prevEma21 && ema8 > ema21) crossover = 'bullish';
  else if (prevEma8 >= prevEma21 && ema8 < ema21) crossover = 'bearish';

  return {
    ema8,
    ema21,
    ema50,
    aligned,
    crossover,
    priceAboveEma50: price > ema50,
  };
}

// ─── Session Detection ───

/**
 * Determine trading session based on UTC hour.
 * Asian: 00:00-07:00 UTC
 * London: 07:00-16:00 UTC
 * NY: 13:00-22:00 UTC
 * Overlap: 13:00-16:00 UTC (London + NY)
 */
export function getSessionInfo(utcHour?: number): SessionInfo {
  const hour = utcHour ?? new Date().getUTCHours();

  if (hour >= 13 && hour < 16) {
    return { session: 'london_ny_overlap', isHighLiquidity: true };
  }
  if (hour >= 7 && hour < 16) {
    return { session: 'london', isHighLiquidity: true };
  }
  if (hour >= 13 && hour < 22) {
    return { session: 'ny', isHighLiquidity: true };
  }
  if (hour >= 0 && hour < 7) {
    return { session: 'asian', isHighLiquidity: false };
  }

  return { session: 'off', isHighLiquidity: false };
}

// ─── Main Entry Point ───

/**
 * Compute all extra indicators for a symbol's candles.
 * Called once per candle close — result passed to strategy-lab.
 */
export function computeExtraIndicators(candles: readonly Candle[]): ExtraIndicators {
  return {
    stochastic: computeStochastic(candles),
    adx: computeADX(candles),
    ema: computeEMAContext(candles),
    session: getSessionInfo(),
  };
}
