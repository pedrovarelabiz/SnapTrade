/**
 * Lab Indicators — Additional indicator computations for Strategy Lab expansion.
 *
 * Williams %R, CCI, Ichimoku (fast), Parabolic SAR, Keltner Channel,
 * Donchian Channel, Heikin Ashi, Pivot Points, OBV, RSI divergence helpers.
 *
 * Pure functions, no state, no storage.
 */

import type { Candle } from './candle-collector';
import { computeAroon, computeDeMarker, computeVortex, computeAlligator, computeFractal, computeAwesomeOscillator, computeSupertrend } from './lab-indicators-extra';

// Re-export for consumers that import from this file
export { computeAroon, computeDeMarker, computeVortex, computeAlligator, computeFractal, computeAwesomeOscillator, computeSupertrend };

// ─── Types ───

export interface WilliamsR {
  readonly value: number;          // -100 to 0
  readonly zone: 'overbought' | 'oversold' | 'neutral';
  readonly crossingUp: boolean;    // crossing above -80 (exit oversold)
  readonly crossingDown: boolean;  // crossing below -20 (exit overbought)
}

export interface CCIResult {
  readonly value: number;
  readonly zone: 'overbought' | 'oversold' | 'neutral';
  readonly crossingAboveMinus100: boolean;
  readonly crossingBelowPlus100: boolean;
}

export interface IchimokuResult {
  readonly tenkan: number;
  readonly kijun: number;
  readonly senkouA: number;
  readonly senkouB: number;
  readonly chikou: number;
  readonly tkCross: 'bullish' | 'bearish' | null;
  readonly priceVsCloud: 'above' | 'below' | 'inside';
  readonly cloudColor: 'green' | 'red';
}

export interface ParabolicSARResult {
  readonly value: number;
  readonly isBelow: boolean;       // SAR below price = bullish
  readonly flipped: boolean;       // SAR flipped direction on this candle
}

export interface KeltnerChannel {
  readonly upper: number;
  readonly middle: number;
  readonly lower: number;
  readonly pricePosition: 'above' | 'below' | 'inside';
}

export interface DonchianChannel {
  readonly upper: number;          // highest high of period
  readonly lower: number;          // lowest low of period
  readonly middle: number;
  readonly breakoutUp: boolean;    // close > previous upper
  readonly breakoutDown: boolean;  // close < previous lower
}

export interface HeikinAshiCandle {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly isBullish: boolean;
  readonly hasNoLowerWick: boolean; // strong bullish
  readonly hasNoUpperWick: boolean; // strong bearish
}

export interface PivotPoints {
  readonly pivot: number;
  readonly r1: number;
  readonly r2: number;
  readonly s1: number;
  readonly s2: number;
}

export interface DivergenceResult {
  readonly bullishRegular: boolean;    // price lower low, RSI higher low
  readonly bearishRegular: boolean;    // price higher high, RSI lower high
  readonly bullishHidden: boolean;     // price higher low, RSI lower low (continuation)
  readonly bearishHidden: boolean;     // price lower high, RSI higher high (continuation)
}

export interface BBSqueeze {
  readonly width: number;              // (upper - lower) / middle
  readonly percentile: number;         // 0-100, where current width sits in history
  readonly isSqueeze: boolean;         // bottom 20th percentile
}

export interface AroonResult {
  readonly aroonUp: number;      // 0-100, how recently the highest high occurred
  readonly aroonDown: number;    // 0-100, how recently the lowest low occurred
  readonly oscillator: number;   // aroonUp - aroonDown (-100 to +100)
  readonly trend: 'bullish' | 'bearish' | 'neutral';
  readonly crossingUp: boolean;  // aroonUp crosses above aroonDown
  readonly crossingDown: boolean; // aroonDown crosses above aroonUp
}

export interface DeMarkerResult {
  readonly value: number;        // 0-1 (0.3 = oversold, 0.7 = overbought)
  readonly zone: 'overbought' | 'oversold' | 'neutral';
  readonly crossingUp: boolean;  // crossing above 0.3 (exit oversold)
  readonly crossingDown: boolean; // crossing below 0.7 (exit overbought)
}

export interface VortexResult {
  readonly viPlus: number;       // Positive vortex indicator
  readonly viMinus: number;      // Negative vortex indicator
  readonly trend: 'bullish' | 'bearish' | 'neutral';
  readonly crossingUp: boolean;  // VI+ crosses above VI-
  readonly crossingDown: boolean; // VI- crosses above VI+
}

export interface AlligatorResult {
  readonly jaw: number;       // SMA 13, offset 8 (blue)
  readonly teeth: number;     // SMA 8, offset 5 (red)
  readonly lips: number;      // SMA 5, offset 3 (green)
  readonly trend: 'bullish' | 'bearish' | 'sleeping'; // lips>teeth>jaw = bullish
  readonly opening: boolean;  // Lines diverging (trend starting)
}

export interface FractalResult {
  readonly upFractal: boolean;    // High is highest of 5 candles (swing high)
  readonly downFractal: boolean;  // Low is lowest of 5 candles (swing low)
  readonly lastUpPrice: number;   // Price of most recent up fractal
  readonly lastDownPrice: number; // Price of most recent down fractal
}

export interface AwesomeOscillator {
  readonly value: number;          // AO = SMA5(midpoint) - SMA34(midpoint)
  readonly prevValue: number;
  readonly rising: boolean;
  readonly crossingZeroUp: boolean;
  readonly crossingZeroDown: boolean;
  readonly color: 'green' | 'red'; // current bar color
}

export interface SupertrendResult {
  readonly value: number;
  readonly direction: 'up' | 'down';  // up = bullish, down = bearish
  readonly flipped: boolean;           // Direction changed on this candle
}

export interface LabIndicatorSet {
  readonly williamsR: WilliamsR | null;
  readonly cci: CCIResult | null;
  readonly ichimoku: IchimokuResult | null;
  readonly sar: ParabolicSARResult | null;
  readonly keltner: KeltnerChannel | null;
  readonly donchian: DonchianChannel | null;
  readonly heikinAshi: readonly HeikinAshiCandle[];
  readonly pivots: PivotPoints | null;
  readonly divergence: DivergenceResult | null;
  readonly bbSqueeze: BBSqueeze | null;
  readonly obv: readonly number[];
  readonly aroon: AroonResult | null;
  readonly demarker: DeMarkerResult | null;
  readonly vortex: VortexResult | null;
  readonly alligator: AlligatorResult | null;
  readonly fractal: FractalResult | null;
  readonly awesomeOscillator: AwesomeOscillator | null;
  readonly supertrend: SupertrendResult | null;
  readonly insideBar: boolean;
  readonly threeWhiteSoldiers: boolean;
  readonly threeBlackCrows: boolean;
}

// ─── Helpers ───

function sma(values: readonly number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function ema(values: readonly number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let result = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    result = values[i]! * k + result * (1 - k);
  }
  return result;
}

function emaArray(values: readonly number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = [seed];
  for (let i = period; i < values.length; i++) {
    result.push(values[i]! * k + result[result.length - 1]! * (1 - k));
  }
  return result;
}

// ─── Williams %R ───

export function computeWilliamsR(candles: readonly Candle[], period = 14): WilliamsR | null {
  if (candles.length < period + 1) return null;
  const recent = candles.slice(-period);
  const prev = candles.slice(-(period + 1), -1);

  const hh = Math.max(...recent.map(c => c.high));
  const ll = Math.min(...recent.map(c => c.low));
  const close = recent[recent.length - 1]!.close;
  const value = hh === ll ? -50 : ((hh - close) / (hh - ll)) * -100;

  const prevHH = Math.max(...prev.map(c => c.high));
  const prevLL = Math.min(...prev.map(c => c.low));
  const prevClose = prev[prev.length - 1]!.close;
  const prevValue = prevHH === prevLL ? -50 : ((prevHH - prevClose) / (prevHH - prevLL)) * -100;

  return {
    value: Math.round(value * 100) / 100,
    zone: value > -20 ? 'overbought' : value < -80 ? 'oversold' : 'neutral',
    crossingUp: prevValue <= -80 && value > -80,
    crossingDown: prevValue >= -20 && value < -20,
  };
}

// ─── CCI ───

export function computeCCI(candles: readonly Candle[], period = 20): CCIResult | null {
  if (candles.length < period + 1) return null;

  const tp = candles.slice(-period).map(c => (c.high + c.low + c.close) / 3);
  const meanTP = tp.reduce((a, b) => a + b, 0) / tp.length;
  const meanDev = tp.reduce((a, b) => a + Math.abs(b - meanTP), 0) / tp.length;
  const value = meanDev === 0 ? 0 : (tp[tp.length - 1]! - meanTP) / (0.015 * meanDev);

  const prevTp = candles.slice(-(period + 1), -1).map(c => (c.high + c.low + c.close) / 3);
  const prevMeanTP = prevTp.reduce((a, b) => a + b, 0) / prevTp.length;
  const prevMeanDev = prevTp.reduce((a, b) => a + Math.abs(b - prevMeanTP), 0) / prevTp.length;
  const prevValue = prevMeanDev === 0 ? 0 : (prevTp[prevTp.length - 1]! - prevMeanTP) / (0.015 * prevMeanDev);

  return {
    value: Math.round(value * 100) / 100,
    zone: value > 100 ? 'overbought' : value < -100 ? 'oversold' : 'neutral',
    crossingAboveMinus100: prevValue <= -100 && value > -100,
    crossingBelowPlus100: prevValue >= 100 && value < 100,
  };
}

// ─── Ichimoku (fast settings for M1-M5) ───

export function computeIchimoku(candles: readonly Candle[], tenkanP = 6, kijunP = 13, senkouP = 26): IchimokuResult | null {
  if (candles.length < senkouP + kijunP) return null;

  const midpoint = (slice: readonly Candle[]) => {
    const h = Math.max(...slice.map(c => c.high));
    const l = Math.min(...slice.map(c => c.low));
    return (h + l) / 2;
  };

  const tenkan = midpoint(candles.slice(-tenkanP));
  const kijun = midpoint(candles.slice(-kijunP));
  const senkouA = (tenkan + kijun) / 2;
  const senkouB = midpoint(candles.slice(-senkouP));
  const chikou = candles[candles.length - 1]!.close;
  const price = chikou;

  // Previous values for cross detection
  const prevTenkan = midpoint(candles.slice(-(tenkanP + 1), -1));
  const prevKijun = midpoint(candles.slice(-(kijunP + 1), -1));

  let tkCross: IchimokuResult['tkCross'] = null;
  if (tenkan > kijun && prevTenkan <= prevKijun) tkCross = 'bullish';
  if (tenkan < kijun && prevTenkan >= prevKijun) tkCross = 'bearish';

  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBottom = Math.min(senkouA, senkouB);
  const priceVsCloud: IchimokuResult['priceVsCloud'] =
    price > cloudTop ? 'above' : price < cloudBottom ? 'below' : 'inside';

  return {
    tenkan, kijun, senkouA, senkouB, chikou,
    tkCross,
    priceVsCloud,
    cloudColor: senkouA >= senkouB ? 'green' : 'red',
  };
}

// ─── Parabolic SAR ───

export function computeParabolicSAR(candles: readonly Candle[], step = 0.021, max = 0.2): ParabolicSARResult | null {
  if (candles.length < 5) return null;

  let af = step;
  let isLong = candles[1]!.close > candles[0]!.close;
  let sar = isLong ? candles[0]!.low : candles[0]!.high;
  let ep = isLong ? candles[0]!.high : candles[0]!.low;
  let prevSarBelow = isLong;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prevSar = sar;

    sar = prevSar + af * (ep - prevSar);

    if (isLong) {
      sar = Math.min(sar, candles[i - 1]!.low);
      if (i >= 2) sar = Math.min(sar, candles[i - 2]!.low);
      if (c.low < sar) {
        isLong = false;
        sar = ep;
        ep = c.low;
        af = step;
      } else {
        if (c.high > ep) { ep = c.high; af = Math.min(af + step, max); }
      }
    } else {
      sar = Math.max(sar, candles[i - 1]!.high);
      if (i >= 2) sar = Math.max(sar, candles[i - 2]!.high);
      if (c.high > sar) {
        isLong = true;
        sar = ep;
        ep = c.high;
        af = step;
      } else {
        if (c.low < ep) { ep = c.low; af = Math.min(af + step, max); }
      }
    }

    if (i === candles.length - 1) {
      const currentBelow = isLong;
      return {
        value: sar,
        isBelow: currentBelow,
        flipped: currentBelow !== prevSarBelow,
      };
    }
    prevSarBelow = isLong;
  }

  return null;
}

// ─── Keltner Channel ───

export function computeKeltner(candles: readonly Candle[], emaPeriod = 10, atrPeriod = 10, mult = 1.5): KeltnerChannel | null {
  if (candles.length < Math.max(emaPeriod, atrPeriod) + 1) return null;

  const closes = candles.map(c => c.close);
  const middle = ema(closes, emaPeriod);
  if (middle === null) return null;

  // ATR
  let atrSum = 0;
  const start = candles.length - atrPeriod;
  for (let i = start; i < candles.length; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    atrSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  const atr = atrSum / atrPeriod;

  const upper = middle + mult * atr;
  const lower = middle - mult * atr;
  const price = candles[candles.length - 1]!.close;

  return {
    upper, middle, lower,
    pricePosition: price > upper ? 'above' : price < lower ? 'below' : 'inside',
  };
}

// ─── Donchian Channel ───

export function computeDonchian(candles: readonly Candle[], period = 20): DonchianChannel | null {
  if (candles.length < period + 1) return null;

  const recent = candles.slice(-period);
  const prev = candles.slice(-(period + 1), -1);
  const upper = Math.max(...recent.map(c => c.high));
  const lower = Math.min(...recent.map(c => c.low));
  const prevUpper = Math.max(...prev.map(c => c.high));
  const prevLower = Math.min(...prev.map(c => c.low));
  const close = candles[candles.length - 1]!.close;

  return {
    upper, lower,
    middle: (upper + lower) / 2,
    breakoutUp: close > prevUpper,
    breakoutDown: close < prevLower,
  };
}

// ─── Heikin Ashi ───

export function computeHeikinAshi(candles: readonly Candle[]): readonly HeikinAshiCandle[] {
  if (candles.length < 2) return [];

  const result: HeikinAshiCandle[] = [];
  let prevHA = {
    open: (candles[0]!.open + candles[0]!.close) / 2,
    close: (candles[0]!.open + candles[0]!.high + candles[0]!.low + candles[0]!.close) / 4,
  };

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = (prevHA.open + prevHA.close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    const isBullish = haClose > haOpen;

    result.push({
      open: haOpen, high: haHigh, low: haLow, close: haClose,
      isBullish,
      hasNoLowerWick: isBullish && Math.abs(haLow - haOpen) < (haHigh - haLow) * 0.01,
      hasNoUpperWick: !isBullish && Math.abs(haHigh - haOpen) < (haHigh - haLow) * 0.01,
    });
    prevHA = { open: haOpen, close: haClose };
  }

  return result;
}

// ─── Pivot Points (daily) ───

export function computePivotPoints(candles: readonly Candle[], lookback = 60): PivotPoints | null {
  if (candles.length < lookback) return null;

  // Use last N candles as "session" for pivot calculation
  const session = candles.slice(-lookback);
  const h = Math.max(...session.map(c => c.high));
  const l = Math.min(...session.map(c => c.low));
  const c = session[session.length - 1]!.close;
  const pivot = (h + l + c) / 3;

  return {
    pivot,
    r1: 2 * pivot - l,
    r2: pivot + (h - l),
    s1: 2 * pivot - h,
    s2: pivot - (h - l),
  };
}

// ─── RSI Divergence ───

export function computeDivergence(candles: readonly Candle[], rsiPeriod = 7, lookback = 20): DivergenceResult | null {
  if (candles.length < lookback + rsiPeriod) return null;

  // Compute RSI for the lookback window
  const closes = candles.slice(-(lookback + rsiPeriod)).map(c => c.close);
  const rsiValues: number[] = [];
  let avgGain = 0, avgLoss = 0;

  for (let i = 1; i <= rsiPeriod; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= rsiPeriod;
  avgLoss /= rsiPeriod;
  rsiValues.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = rsiPeriod + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (rsiPeriod - 1) + (diff > 0 ? diff : 0)) / rsiPeriod;
    avgLoss = (avgLoss * (rsiPeriod - 1) + (diff < 0 ? -diff : 0)) / rsiPeriod;
    rsiValues.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  // Find local extremes in last lookback candles
  const priceWindow = candles.slice(-lookback);
  const rsiWindow = rsiValues.slice(-lookback);

  // Find two most recent swing lows and highs (min 5 apart)
  let priceLow1 = Infinity, priceLow2 = Infinity, rsiLow1 = 100, rsiLow2 = 100;
  let priceHigh1 = -Infinity, priceHigh2 = -Infinity, rsiHigh1 = 0, rsiHigh2 = 0;
  let lowIdx1 = -1, highIdx1 = -1;

  for (let i = rsiWindow.length - 1; i >= 2; i--) {
    const p = priceWindow[i]!.low;
    const r = rsiWindow[i]!;
    if (p < priceLow1 && lowIdx1 === -1) { priceLow1 = p; rsiLow1 = r; lowIdx1 = i; }
    else if (p < priceLow2 && lowIdx1 !== -1 && lowIdx1 - i >= 5) { priceLow2 = p; rsiLow2 = r; break; }
  }

  for (let i = rsiWindow.length - 1; i >= 2; i--) {
    const p = priceWindow[i]!.high;
    const r = rsiWindow[i]!;
    if (p > priceHigh1 && highIdx1 === -1) { priceHigh1 = p; rsiHigh1 = r; highIdx1 = i; }
    else if (p > priceHigh2 && highIdx1 !== -1 && highIdx1 - i >= 5) { priceHigh2 = p; rsiHigh2 = r; break; }
  }

  return {
    bullishRegular: priceLow1 < priceLow2 && rsiLow1 > rsiLow2,
    bearishRegular: priceHigh1 > priceHigh2 && rsiHigh1 < rsiHigh2,
    bullishHidden: priceLow1 > priceLow2 && rsiLow1 < rsiLow2,
    bearishHidden: priceHigh1 < priceHigh2 && rsiHigh1 > rsiHigh2,
  };
}

// ─── BB Squeeze ───

export function computeBBSqueeze(candles: readonly Candle[], bbPeriod = 20, historyLen = 50): BBSqueeze | null {
  if (candles.length < historyLen) return null;

  const widths: number[] = [];
  for (let i = candles.length - historyLen; i <= candles.length - bbPeriod; i++) {
    const slice = candles.slice(i, i + bbPeriod);
    const closes = slice.map(c => c.close);
    const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
    const stdDev = Math.sqrt(closes.reduce((a, b) => a + (b - mean) ** 2, 0) / closes.length);
    const upper = mean + 2 * stdDev;
    const lower = mean - 2 * stdDev;
    widths.push(mean > 0 ? (upper - lower) / mean : 0);
  }

  const currentWidth = widths[widths.length - 1]!;
  const sorted = [...widths].sort((a, b) => a - b);
  const rank = sorted.findIndex(w => w >= currentWidth);
  const percentile = Math.round((rank / sorted.length) * 100);

  return {
    width: currentWidth,
    percentile,
    isSqueeze: percentile <= 20,
  };
}

// ─── OBV ───

export function computeOBV(candles: readonly Candle[]): readonly number[] {
  if (candles.length < 2) return [];
  const obv: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const vol = candles[i]!.high - candles[i]!.low; // proxy volume via range
    const prev = obv[obv.length - 1]!;
    if (candles[i]!.close > candles[i - 1]!.close) obv.push(prev + vol);
    else if (candles[i]!.close < candles[i - 1]!.close) obv.push(prev - vol);
    else obv.push(prev);
  }
  return obv;
}

// ─── Pattern Detection ───

export function detectInsideBar(candles: readonly Candle[]): boolean {
  if (candles.length < 2) return false;
  const curr = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  return curr.high < prev.high && curr.low > prev.low;
}

export function detectThreeWhiteSoldiers(candles: readonly Candle[]): boolean {
  if (candles.length < 3) return false;
  const last3 = candles.slice(-3);
  return last3.every((c, i) => {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const isBullish = c.close > c.open;
    const bodyRatio = range > 0 ? body / range : 0;
    const higherClose = i === 0 || c.close > last3[i - 1]!.close;
    const opensInBody = i === 0 || (c.open >= last3[i - 1]!.open && c.open <= last3[i - 1]!.close);
    return isBullish && bodyRatio >= 0.6 && higherClose && opensInBody;
  });
}

export function detectThreeBlackCrows(candles: readonly Candle[]): boolean {
  if (candles.length < 3) return false;
  const last3 = candles.slice(-3);
  return last3.every((c, i) => {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const isBearish = c.close < c.open;
    const bodyRatio = range > 0 ? body / range : 0;
    const lowerClose = i === 0 || c.close < last3[i - 1]!.close;
    const opensInBody = i === 0 || (c.open <= last3[i - 1]!.open && c.open >= last3[i - 1]!.close);
    return isBearish && bodyRatio >= 0.6 && lowerClose && opensInBody;
  });
}

// Aroon, DeMarker, Vortex, Alligator, Fractal, AwesomeOscillator, Supertrend
// → Moved to lab-indicators-extra.ts


// ─── Aggregate ───

export function computeLabIndicators(candles: readonly Candle[]): LabIndicatorSet {
  return {
    williamsR: computeWilliamsR(candles),
    cci: computeCCI(candles),
    ichimoku: computeIchimoku(candles),
    sar: computeParabolicSAR(candles),
    keltner: computeKeltner(candles),
    donchian: computeDonchian(candles),
    heikinAshi: computeHeikinAshi(candles.slice(-10)),
    pivots: computePivotPoints(candles),
    divergence: computeDivergence(candles),
    bbSqueeze: computeBBSqueeze(candles),
    obv: computeOBV(candles.slice(-30)),
    aroon: computeAroon(candles),
    demarker: computeDeMarker(candles),
    vortex: computeVortex(candles),
    alligator: computeAlligator(candles),
    fractal: computeFractal(candles),
    awesomeOscillator: computeAwesomeOscillator(candles),
    supertrend: computeSupertrend(candles),
    insideBar: detectInsideBar(candles),
    threeWhiteSoldiers: detectThreeWhiteSoldiers(candles),
    threeBlackCrows: detectThreeBlackCrows(candles),
  };
}
