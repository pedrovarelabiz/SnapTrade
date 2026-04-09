/**
 * Price Action Module — Pure stateless computation for S/R zones, order blocks,
 * fair value gaps, and market structure breaks.
 *
 * Same pattern as m5-indicators.ts: takes candle arrays, returns computed structures.
 * No side effects, no state, no storage.
 */

import type { Candle } from './candle-collector';

// ─── Types ───

export interface SRZone {
  readonly price: number;
  readonly type: 'support' | 'resistance';
  readonly touches: number;
  readonly lastTouch: number;   // unix seconds
  readonly strength: number;    // 0-100
}

export interface OrderBlock {
  readonly high: number;
  readonly low: number;
  readonly direction: 'bullish' | 'bearish';
  readonly time: number;
  readonly valid: boolean;       // unmitigated (price hasn't returned)
}

export interface FairValueGap {
  readonly high: number;         // top of gap
  readonly low: number;          // bottom of gap
  readonly direction: 'bullish' | 'bearish';
  readonly time: number;         // middle candle time
  readonly filled: boolean;
}

export interface StructureBreak {
  readonly price: number;
  readonly direction: 'bullish' | 'bearish';
  readonly time: number;
}

export interface PriceActionContext {
  readonly srZones: readonly SRZone[];
  readonly orderBlocks: readonly OrderBlock[];
  readonly fvgs: readonly FairValueGap[];
  readonly structureBreaks: readonly StructureBreak[];
  readonly nearSupport: boolean;
  readonly nearResistance: boolean;
  readonly hasUnfilledFvg: 'bullish' | 'bearish' | null;
  readonly recentStructureBreak: 'bullish' | 'bearish' | null;
  readonly hasValidOrderBlock: 'bullish' | 'bearish' | null;
}

// ─── S/R Zone Detection ───

/**
 * Find swing highs and lows (local maxima/minima over 3-candle window),
 * cluster nearby levels, and score by touches + recency.
 */
export function detectSRZones(
  candles: readonly Candle[],
  proximity: number = 0.0005,
): readonly SRZone[] {
  const len = candles.length;
  if (len < 5) return [];

  // Use last 50 candles (or all if fewer)
  const start = Math.max(0, len - 50);
  const pivots: Array<{ price: number; type: 'support' | 'resistance'; time: number }> = [];

  for (let i = start + 1; i < len - 1; i++) {
    const prev = candles[i - 1]!;
    const curr = candles[i]!;
    const next = candles[i + 1]!;

    // Swing high → resistance
    if (curr.high > prev.high && curr.high > next.high) {
      pivots.push({ price: curr.high, type: 'resistance', time: curr.time });
    }
    // Swing low → support
    if (curr.low < prev.low && curr.low < next.low) {
      pivots.push({ price: curr.low, type: 'support', time: curr.time });
    }
  }

  if (pivots.length === 0) return [];

  // Cluster pivots within proximity
  const clusters: Array<{
    prices: number[];
    type: 'support' | 'resistance';
    times: number[];
  }> = [];

  for (const pivot of pivots) {
    let merged = false;
    for (const cluster of clusters) {
      const avg = cluster.prices.reduce((a, b) => a + b, 0) / cluster.prices.length;
      if (Math.abs(pivot.price - avg) / avg < proximity && cluster.type === pivot.type) {
        cluster.prices.push(pivot.price);
        cluster.times.push(pivot.time);
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({
        prices: [pivot.price],
        type: pivot.type,
        times: [pivot.time],
      });
    }
  }

  const now = candles[len - 1]!.time;

  return clusters
    .map(c => {
      const avgPrice = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
      const lastTouch = Math.max(...c.times);
      const recencyBonus = Math.max(0, 30 - Math.floor((now - lastTouch) / 60));
      const strength = Math.min(100, c.prices.length * 20 + recencyBonus);
      return {
        price: avgPrice,
        type: c.type,
        touches: c.prices.length,
        lastTouch,
        strength,
      } as const;
    })
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10);
}

// ─── Order Block Detection ───

/**
 * Detect order blocks: last opposing-direction candle before a strong
 * impulsive move (3+ candles in one direction).
 */
export function detectOrderBlocks(
  candles: readonly Candle[],
  lookback: number = 30,
): readonly OrderBlock[] {
  const len = candles.length;
  if (len < 5) return [];

  const start = Math.max(0, len - lookback);
  const blocks: OrderBlock[] = [];
  const currentPrice = candles[len - 1]!.close;

  for (let i = start; i < len - 3; i++) {
    const c0 = candles[i]!;
    const c1 = candles[i + 1]!;
    const c2 = candles[i + 2]!;
    const c3 = candles[i + 3]!;

    const c0Bearish = c0.close < c0.open;
    const c0Bullish = c0.close > c0.open;

    // Bullish OB: bearish candle followed by 3 bullish candles
    if (c0Bearish &&
        c1.close > c1.open &&
        c2.close > c2.open &&
        c3.close > c3.open) {
      const valid = currentPrice > c0.low; // not mitigated if price above OB low
      blocks.push({
        high: c0.high,
        low: c0.low,
        direction: 'bullish',
        time: c0.time,
        valid,
      });
    }

    // Bearish OB: bullish candle followed by 3 bearish candles
    if (c0Bullish &&
        c1.close < c1.open &&
        c2.close < c2.open &&
        c3.close < c3.open) {
      const valid = currentPrice < c0.high; // not mitigated if price below OB high
      blocks.push({
        high: c0.high,
        low: c0.low,
        direction: 'bearish',
        time: c0.time,
        valid,
      });
    }
  }

  return blocks.slice(-5); // keep most recent 5
}

// ─── Fair Value Gap Detection ───

/**
 * Detect FVGs: 3-candle imbalances where there's a gap between
 * candle 1 and candle 3 that candle 2 doesn't fill.
 */
export function detectFVGs(candles: readonly Candle[]): readonly FairValueGap[] {
  const len = candles.length;
  if (len < 3) return [];

  const start = Math.max(0, len - 30);
  const gaps: FairValueGap[] = [];
  const currentPrice = candles[len - 1]!.close;

  for (let i = start; i < len - 2; i++) {
    const c1 = candles[i]!;
    const c3 = candles[i + 2]!;

    // Bullish FVG: gap between c1.high and c3.low (price moved up fast)
    if (c3.low > c1.high) {
      const filled = currentPrice <= c3.low; // price has come back down into the gap
      gaps.push({
        high: c3.low,
        low: c1.high,
        direction: 'bullish',
        time: candles[i + 1]!.time,
        filled,
      });
    }

    // Bearish FVG: gap between c1.low and c3.high (price moved down fast)
    if (c3.high < c1.low) {
      const filled = currentPrice >= c3.high; // price has come back up into the gap
      gaps.push({
        high: c1.low,
        low: c3.high,
        direction: 'bearish',
        time: candles[i + 1]!.time,
        filled,
      });
    }
  }

  return gaps.slice(-5); // keep most recent 5
}

// ─── Market Structure Break Detection ───

/**
 * Detect breaks of market structure: when price breaks a previous
 * swing high (bullish break) or swing low (bearish break).
 */
export function detectStructureBreaks(
  candles: readonly Candle[],
  lookback: number = 20,
): readonly StructureBreak[] {
  const len = candles.length;
  if (len < 5) return [];

  const start = Math.max(0, len - lookback);
  const breaks: StructureBreak[] = [];

  // Find swing highs and lows first
  const swingHighs: Array<{ price: number; idx: number }> = [];
  const swingLows: Array<{ price: number; idx: number }> = [];

  for (let i = start + 1; i < len - 1; i++) {
    const prev = candles[i - 1]!;
    const curr = candles[i]!;
    const next = candles[i + 1]!;

    if (curr.high > prev.high && curr.high > next.high) {
      swingHighs.push({ price: curr.high, idx: i });
    }
    if (curr.low < prev.low && curr.low < next.low) {
      swingLows.push({ price: curr.low, idx: i });
    }
  }

  // Check if recent candles broke previous swing levels
  const recentStart = Math.max(start, len - 5);
  for (let i = recentStart; i < len; i++) {
    const candle = candles[i]!;

    // Bullish break: close above a previous swing high
    for (const sh of swingHighs) {
      if (sh.idx < i && candle.close > sh.price) {
        breaks.push({
          price: sh.price,
          direction: 'bullish',
          time: candle.time,
        });
      }
    }

    // Bearish break: close below a previous swing low
    for (const sl of swingLows) {
      if (sl.idx < i && candle.close < sl.price) {
        breaks.push({
          price: sl.price,
          direction: 'bearish',
          time: candle.time,
        });
      }
    }
  }

  // Deduplicate: keep only the most recent break per direction
  const seen = new Set<string>();
  const unique: StructureBreak[] = [];
  for (let i = breaks.length - 1; i >= 0; i--) {
    const key = breaks[i]!.direction;
    if (!seen.has(key)) {
      seen.add(key);
      unique.unshift(breaks[i]!);
    }
  }

  return unique;
}

// ─── Main Entry Point ───

/**
 * Build full price action context for a symbol.
 * Called once per candle close — result is passed to strategy-lab.
 */
export function buildPriceActionContext(
  candles: readonly Candle[],
  currentPrice: number,
): PriceActionContext {
  if (candles.length < 5) {
    return {
      srZones: [],
      orderBlocks: [],
      fvgs: [],
      structureBreaks: [],
      nearSupport: false,
      nearResistance: false,
      hasUnfilledFvg: null,
      recentStructureBreak: null,
      hasValidOrderBlock: null,
    };
  }

  const srZones = detectSRZones(candles);
  const orderBlocks = detectOrderBlocks(candles);
  const fvgs = detectFVGs(candles);
  const structureBreaks = detectStructureBreaks(candles);

  // Proximity threshold: 0.1% of current price
  const threshold = currentPrice * 0.001;

  const nearSupport = srZones.some(
    z => z.type === 'support' && Math.abs(currentPrice - z.price) < threshold
  );
  const nearResistance = srZones.some(
    z => z.type === 'resistance' && Math.abs(currentPrice - z.price) < threshold
  );

  // Find most recent unfilled FVG (iterate backwards)
  let hasUnfilledFvg: 'bullish' | 'bearish' | null = null;
  for (let i = fvgs.length - 1; i >= 0; i--) {
    if (!fvgs[i]!.filled) {
      hasUnfilledFvg = fvgs[i]!.direction;
      break;
    }
  }

  // Most recent structure break within last 3 candles
  const recentTime = candles.length >= 3
    ? candles[candles.length - 3]!.time
    : 0;
  let recentStructureBreak: 'bullish' | 'bearish' | null = null;
  for (let i = structureBreaks.length - 1; i >= 0; i--) {
    if (structureBreaks[i]!.time >= recentTime) {
      recentStructureBreak = structureBreaks[i]!.direction;
      break;
    }
  }

  // Check if price is near a valid (unmitigated) order block
  let hasValidOrderBlock: 'bullish' | 'bearish' | null = null;
  for (let i = orderBlocks.length - 1; i >= 0; i--) {
    const ob = orderBlocks[i]!;
    if (ob.valid && currentPrice >= ob.low - threshold && currentPrice <= ob.high + threshold) {
      hasValidOrderBlock = ob.direction;
      break;
    }
  }

  return {
    srZones,
    orderBlocks,
    fvgs,
    structureBreaks,
    nearSupport,
    nearResistance,
    hasUnfilledFvg,
    recentStructureBreak,
    hasValidOrderBlock,
  };
}
