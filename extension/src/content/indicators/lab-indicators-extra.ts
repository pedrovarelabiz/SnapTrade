/**
 * Lab Indicators Extra — Aroon, DeMarker, Vortex, Alligator, Fractal,
 * Awesome Oscillator, Supertrend.
 * Extracted from lab-indicators.ts for file size compliance.
 * Pure functions, no state.
 */
import type { Candle } from './candle-collector';
import type { AroonResult, DeMarkerResult, VortexResult, AlligatorResult, FractalResult, AwesomeOscillator, SupertrendResult } from './lab-indicators';

// ─── Aroon Indicator ───

export function computeAroon(candles: readonly Candle[], period = 14): AroonResult | null {
  if (candles.length < period + 2) return null;

  const recent = candles.slice(-(period + 1));
  const prev = candles.slice(-(period + 2), -1);

  // Find index of highest high and lowest low in current window
  let highIdx = 0, lowIdx = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i]!.high >= recent[highIdx]!.high) highIdx = i;
    if (recent[i]!.low <= recent[lowIdx]!.low) lowIdx = i;
  }

  const aroonUp = Math.round((highIdx / period) * 100);
  const aroonDown = Math.round((lowIdx / period) * 100);

  // Previous values for cross detection
  let prevHighIdx = 0, prevLowIdx = 0;
  for (let i = 1; i < prev.length; i++) {
    if (prev[i]!.high >= prev[prevHighIdx]!.high) prevHighIdx = i;
    if (prev[i]!.low <= prev[prevLowIdx]!.low) prevLowIdx = i;
  }
  const prevAroonUp = Math.round((prevHighIdx / period) * 100);
  const prevAroonDown = Math.round((prevLowIdx / period) * 100);

  const oscillator = aroonUp - aroonDown;

  return {
    aroonUp,
    aroonDown,
    oscillator,
    trend: oscillator > 30 ? 'bullish' : oscillator < -30 ? 'bearish' : 'neutral',
    crossingUp: aroonUp > aroonDown && prevAroonUp <= prevAroonDown,
    crossingDown: aroonDown > aroonUp && prevAroonDown <= prevAroonUp,
  };
}

// ─── DeMarker Indicator ───

export function computeDeMarker(candles: readonly Candle[], period = 13): DeMarkerResult | null {
  if (candles.length < period + 2) return null;

  function demarkerValue(slice: readonly Candle[]): number {
    let deMax = 0, deMin = 0;
    for (let i = 1; i < slice.length; i++) {
      const highDiff = slice[i]!.high - slice[i - 1]!.high;
      const lowDiff = slice[i - 1]!.low - slice[i]!.low;
      deMax += highDiff > 0 ? highDiff : 0;
      deMin += lowDiff > 0 ? lowDiff : 0;
    }
    const sum = deMax + deMin;
    return sum > 0 ? deMax / sum : 0.5;
  }

  const current = demarkerValue(candles.slice(-(period + 1)));
  const prev = demarkerValue(candles.slice(-(period + 2), -1));

  return {
    value: Math.round(current * 1000) / 1000,
    zone: current > 0.7 ? 'overbought' : current < 0.3 ? 'oversold' : 'neutral',
    crossingUp: prev <= 0.3 && current > 0.3,
    crossingDown: prev >= 0.7 && current < 0.7,
  };
}

// ─── Vortex Indicator ───

export function computeVortex(candles: readonly Candle[], period = 14): VortexResult | null {
  if (candles.length < period + 2) return null;

  function vortexValues(slice: readonly Candle[]): { viPlus: number; viMinus: number } {
    let vmPlus = 0, vmMinus = 0, tr = 0;
    for (let i = 1; i < slice.length; i++) {
      const c = slice[i]!;
      const p = slice[i - 1]!;
      vmPlus += Math.abs(c.high - p.low);
      vmMinus += Math.abs(c.low - p.high);
      tr += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    }
    return {
      viPlus: tr > 0 ? vmPlus / tr : 1,
      viMinus: tr > 0 ? vmMinus / tr : 1,
    };
  }

  const current = vortexValues(candles.slice(-(period + 1)));
  const prev = vortexValues(candles.slice(-(period + 2), -1));

  const diff = current.viPlus - current.viMinus;

  return {
    viPlus: Math.round(current.viPlus * 1000) / 1000,
    viMinus: Math.round(current.viMinus * 1000) / 1000,
    trend: diff > 0.1 ? 'bullish' : diff < -0.1 ? 'bearish' : 'neutral',
    crossingUp: current.viPlus > current.viMinus && prev.viPlus <= prev.viMinus,
    crossingDown: current.viMinus > current.viPlus && prev.viMinus <= prev.viPlus,
  };
}

// ─── Alligator (Bill Williams) ───

export function computeAlligator(candles: readonly Candle[]): AlligatorResult | null {
  if (candles.length < 21) return null;

  const closes = candles.map(c => c.close);

  // Smoothed MAs (SMMA = Wilders)
  function smma(values: readonly number[], period: number): number {
    if (values.length < period) return values[values.length - 1]!;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[values.length - period + i]!;
    let result = sum / period;
    // Additional smoothing iterations
    for (let i = values.length - period + 1; i < values.length; i++) {
      result = (result * (period - 1) + values[i]!) / period;
    }
    return result;
  }

  const midpoints = candles.map(c => (c.high + c.low) / 2);
  const jaw = smma(midpoints.slice(0, -8), 13);    // 13-period, 8 bars offset
  const teeth = smma(midpoints.slice(0, -5), 8);   // 8-period, 5 bars offset
  const lips = smma(midpoints.slice(0, -3), 5);    // 5-period, 3 bars offset

  const isBullish = lips > teeth && teeth > jaw;
  const isBearish = lips < teeth && teeth < jaw;
  const prevClose = closes[closes.length - 2]!;
  const currClose = closes[closes.length - 1]!;

  // Opening: distance between lines is increasing
  const spread = Math.abs(lips - jaw);
  const prevMid = midpoints.slice(0, -4);
  const prevJaw = smma(prevMid.slice(0, -8), 13);
  const prevLips = smma(prevMid.slice(0, -3), 5);
  const prevSpread = Math.abs(prevLips - prevJaw);

  return {
    jaw, teeth, lips,
    trend: isBullish ? 'bullish' : isBearish ? 'bearish' : 'sleeping',
    opening: spread > prevSpread * 1.1,
  };
}

// ─── Fractal (Bill Williams) ───

export function computeFractal(candles: readonly Candle[]): FractalResult | null {
  if (candles.length < 7) return null;

  // Check if middle candle of last 5 is a fractal
  const i = candles.length - 3; // Middle of last 5
  const mid = candles[i]!;
  const upFractal = mid.high > candles[i - 2]!.high && mid.high > candles[i - 1]!.high &&
                    mid.high > candles[i + 1]!.high && mid.high > candles[i + 2]!.high;
  const downFractal = mid.low < candles[i - 2]!.low && mid.low < candles[i - 1]!.low &&
                      mid.low < candles[i + 1]!.low && mid.low < candles[i + 2]!.low;

  // Find most recent up/down fractal prices
  let lastUpPrice = 0, lastDownPrice = 0;
  for (let j = candles.length - 3; j >= 2; j--) {
    const c = candles[j]!;
    if (!lastUpPrice && c.high > candles[j - 1]!.high && c.high > candles[j - 2]!.high &&
        c.high > candles[j + 1]!.high && c.high > candles[j + 2]!.high) {
      lastUpPrice = c.high;
    }
    if (!lastDownPrice && c.low < candles[j - 1]!.low && c.low < candles[j - 2]!.low &&
        c.low < candles[j + 1]!.low && c.low < candles[j + 2]!.low) {
      lastDownPrice = c.low;
    }
    if (lastUpPrice && lastDownPrice) break;
  }

  return { upFractal, downFractal, lastUpPrice, lastDownPrice };
}

// ─── Awesome Oscillator (Bill Williams) ───

export function computeAwesomeOscillator(candles: readonly Candle[]): AwesomeOscillator | null {
  if (candles.length < 36) return null;

  const midpoints = candles.map(c => (c.high + c.low) / 2);

  function smaSlice(values: readonly number[], end: number, period: number): number {
    let sum = 0;
    for (let i = end - period; i < end; i++) sum += values[i]!;
    return sum / period;
  }

  const len = midpoints.length;
  const value = smaSlice(midpoints, len, 5) - smaSlice(midpoints, len, 34);
  const prevValue = smaSlice(midpoints, len - 1, 5) - smaSlice(midpoints, len - 1, 34);

  return {
    value: Math.round(value * 100000) / 100000,
    prevValue: Math.round(prevValue * 100000) / 100000,
    rising: value > prevValue,
    crossingZeroUp: prevValue <= 0 && value > 0,
    crossingZeroDown: prevValue >= 0 && value < 0,
    color: value > prevValue ? 'green' : 'red',
  };
}

// ─── Supertrend ───

export function computeSupertrend(candles: readonly Candle[], period = 10, multiplier = 3): SupertrendResult | null {
  if (candles.length < period + 2) return null;

  // ATR
  let atrSum = 0;
  const start = candles.length - period;
  for (let i = start; i < candles.length; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    atrSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  const atr = atrSum / period;

  const curr = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  const hl2 = (curr.high + curr.low) / 2;
  const prevHl2 = (prev.high + prev.low) / 2;

  const upperBand = hl2 + multiplier * atr;
  const lowerBand = hl2 - multiplier * atr;

  // Simplified: if close > upper → bullish, if close < lower → bearish
  const prevDir = prev.close > (prevHl2 - multiplier * atr) ? 'up' : 'down';
  const currDir = curr.close > lowerBand ? 'up' as const : 'down' as const;

  return {
    value: currDir === 'up' ? lowerBand : upperBand,
    direction: currDir,
    flipped: currDir !== prevDir,
  };
}
