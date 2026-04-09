/**
 * Sentinel Engine — Lightweight autonomous strategy evaluators for regime detection.
 *
 * Runs independently of Strategy Lab. Each sentinel evaluates on every M1 candle close,
 * decides CALL/PUT, and resolves on the next candle. Results feed the regime detector
 * directly, providing continuous market health signal regardless of which trading
 * strategies are active.
 *
 * Sentinels are chosen for diversity (trend, reversion, momentum, price action, volatility)
 * and stability (low WR variance), NOT for profitability.
 */

import type { Candle } from './candle-collector';
import { computeExtraIndicators, type ExtraIndicators } from './extra-indicators';
import { buildPriceActionContext, type PriceActionContext } from './price-action';

// ─── Types ───

interface SentinelSignal {
  readonly sentinelId: string;
  readonly direction: 'CALL' | 'PUT';
  readonly entryPrice: number;
  readonly symbol: string;
  readonly time: number;
}

export interface SentinelDef {
  readonly id: string;
  readonly type: 'trend' | 'reversion' | 'momentum' | 'price_action' | 'volatility';
  readonly baselineWR: number;
  readonly evaluate: (candles: readonly Candle[], extra: ExtraIndicators, pa: PriceActionContext) => 'CALL' | 'PUT' | null;
}

// ─── Sentinel Definitions ───

const SENTINELS: readonly SentinelDef[] = [
  {
    // Trend-following: EMA 8 > 21 > 50 = CALL, inverse = PUT
    id: 'sentinel_trend',
    type: 'trend',
    baselineWR: 48,
    evaluate: (_candles, extra) => {
      if (!extra.ema) return null;
      const { ema8, ema21, ema50 } = extra.ema;
      if (ema8 > ema21 && ema21 > ema50) return 'CALL';
      if (ema8 < ema21 && ema21 < ema50) return 'PUT';
      return null;
    },
  },
  {
    // Mean-reversion: RSI oversold/overbought (Stochastic extreme)
    id: 'sentinel_reversion',
    type: 'reversion',
    baselineWR: 46,
    evaluate: (_candles, extra) => {
      if (!extra.stochastic) return null;
      const { k, d } = extra.stochastic;
      if (k < 20 && d < 20) return 'CALL';   // oversold → expect bounce
      if (k > 80 && d > 80) return 'PUT';     // overbought → expect drop
      return null;
    },
  },
  {
    // Momentum: MACD cross (signal line cross)
    id: 'sentinel_momentum',
    type: 'momentum',
    baselineWR: 51,
    evaluate: (candles) => {
      if (candles.length < 30) return null;
      // Simple MACD: EMA12 - EMA26, signal = EMA9 of MACD
      const closes = candles.slice(-30).map(c => c.close);
      const ema12 = emaFromArray(closes, 12);
      const ema26 = emaFromArray(closes, 26);
      if (ema12 === null || ema26 === null) return null;
      const macd = ema12 - ema26;
      // Compare with previous bar's MACD
      const prevCloses = closes.slice(0, -1);
      const prevEma12 = emaFromArray(prevCloses, 12);
      const prevEma26 = emaFromArray(prevCloses, 26);
      if (prevEma12 === null || prevEma26 === null) return null;
      const prevMacd = prevEma12 - prevEma26;
      // Cross detection
      if (macd > 0 && prevMacd <= 0) return 'CALL';
      if (macd < 0 && prevMacd >= 0) return 'PUT';
      return null;
    },
  },
  {
    // Price action: candle pattern (engulfing, pin bar)
    id: 'sentinel_candle',
    type: 'price_action',
    baselineWR: 57,
    evaluate: (candles) => {
      if (candles.length < 3) return null;
      const curr = candles[candles.length - 1]!;
      const prev = candles[candles.length - 2]!;
      const body = Math.abs(curr.close - curr.open);
      const prevBody = Math.abs(prev.close - prev.open);
      // Bullish engulfing
      if (curr.close > curr.open && prev.close < prev.open && body > prevBody * 1.2 && curr.close > prev.open) {
        return 'CALL';
      }
      // Bearish engulfing
      if (curr.close < curr.open && prev.close > prev.open && body > prevBody * 1.2 && curr.close < prev.open) {
        return 'PUT';
      }
      return null;
    },
  },
  {
    // Price action: near S/R zone
    id: 'sentinel_structure',
    type: 'price_action',
    baselineWR: 55,
    evaluate: (_candles, _extra, pa) => {
      // Near support → expect bounce (CALL), near resistance → expect rejection (PUT)
      if (pa.nearSupport && !pa.nearResistance) return 'CALL';
      if (pa.nearResistance && !pa.nearSupport) return 'PUT';
      return null;
    },
  },
  {
    // Volatility/trend strength: ADX strong trend
    id: 'sentinel_adx',
    type: 'volatility',
    baselineWR: 57,
    evaluate: (_candles, extra) => {
      if (!extra.adx) return null;
      const { adx, plusDI, minusDI } = extra.adx;
      if (adx < 25) return null; // no strong trend
      if (plusDI > minusDI) return 'CALL';
      if (minusDI > plusDI) return 'PUT';
      return null;
    },
  },
  {
    // Combo: Stochastic extreme + EMA alignment
    id: 'sentinel_stoch_ema',
    type: 'reversion',
    baselineWR: 50,
    evaluate: (_candles, extra) => {
      if (!extra.stochastic || !extra.ema) return null;
      const { k } = extra.stochastic;
      const { ema8, ema21 } = extra.ema;
      // Stoch oversold + EMA bullish alignment → strong CALL
      if (k < 25 && ema8 > ema21) return 'CALL';
      // Stoch overbought + EMA bearish alignment → strong PUT
      if (k > 75 && ema8 < ema21) return 'PUT';
      return null;
    },
  },
];

// ─── Helpers ───

function emaFromArray(data: readonly number[], period: number): number | null {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i]! * k + ema * (1 - k);
  }
  return ema;
}

// ─── State ───

const pendingSignals: Map<string, SentinelSignal> = new Map(); // sentinelId+symbol → signal

// ─── Public API ───

/**
 * Callback type for when a sentinel resolves a trade.
 */
export type SentinelResultCallback = (sentinelId: string, isWin: boolean) => void;

let resultCallback: SentinelResultCallback | null = null;

/**
 * Register callback for sentinel results. The regime detector hooks into this.
 */
export function onSentinelResult(cb: SentinelResultCallback): void {
  resultCallback = cb;
}

/**
 * Call on every M1 candle close. Evaluates all sentinels and resolves pending signals.
 * Lightweight: computes indicators once, shares across all sentinels.
 */
export function sentinelOnCandleClose(symbol: string, candles: readonly Candle[]): void {
  if (candles.length < 30) return;

  const lastCandle = candles[candles.length - 1]!;

  // Phase 1: Resolve pending signals from previous candle
  for (const sentinel of SENTINELS) {
    const key = `${sentinel.id}:${symbol}`;
    const pending = pendingSignals.get(key);
    if (!pending) continue;

    const isWin = pending.direction === 'CALL'
      ? lastCandle.close > pending.entryPrice
      : lastCandle.close < pending.entryPrice;

    pendingSignals.delete(key);

    if (resultCallback) {
      resultCallback(sentinel.id, isWin);
    }
  }

  // Phase 2: Evaluate sentinels for new signals
  const extra = computeExtraIndicators(candles);
  const pa = buildPriceActionContext(candles, lastCandle.close);

  for (const sentinel of SENTINELS) {
    const key = `${sentinel.id}:${symbol}`;
    // Don't create new signal if one is already pending for this symbol
    if (pendingSignals.has(key)) continue;

    const direction = sentinel.evaluate(candles, extra, pa);
    if (direction) {
      pendingSignals.set(key, {
        sentinelId: sentinel.id,
        direction,
        entryPrice: lastCandle.close,
        symbol,
        time: Date.now(),
      });
    }
  }
}

/**
 * Get sentinel definitions (for regime detector to read baselines).
 */
export function getSentinelDefs(): readonly SentinelDef[] {
  return SENTINELS;
}

/**
 * Get count of pending sentinel signals.
 */
export function getSentinelPendingCount(): number {
  return pendingSignals.size;
}
