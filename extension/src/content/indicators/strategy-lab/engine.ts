/**
 * Strategy Lab — Strategy evaluation functions.
 *
 * Pure-ish functions that evaluate whether a strategy should fire.
 * State dependencies are passed as parameters.
 */

import type { Candle } from '../candle-collector';
import type { SetupSignal, AggregatedSetup } from '../setup-detector';
import type { PriceActionContext } from '../price-action';
import type { ExtraIndicators } from '../extra-indicators';
import type { LabIndicatorSet } from '../lab-indicators';
import type { StrategyDef, StrategyStats, VirtualEntry, PayoutTier } from './types';
import { getPayoutTier } from './types';

// ─── Regime Strategy Evaluation ───

export function evaluateRegimeStrategy(
  strategy: StrategyDef,
  symbol: string,
  candle: Candle,
  activeSetups: readonly SetupSignal[],
  _aggregated: AggregatedSetup,
  extra: ExtraIndicators,
  payout: number,
  tier: PayoutTier,
  getGaleLevel: (stratId: string, symbol: string) => number,
): VirtualEntry | null {
  if (!extra.adx || !extra.ema) return null;

  const makeEntry = (dir: 'CALL' | 'PUT'): VirtualEntry => ({
    strategyId: strategy.id,
    symbol,
    direction: dir,
    payout,
    payoutTier: tier.label,
    galeLevel: getGaleLevel(strategy.id, symbol),
    signalPrice: candle.close,
    entryPrice: 0,
    entryTime: Date.now(),
    session: extra.session?.session ?? '',
    hour: new Date().getUTCHours(),
    entryOn: 'next_m1',
    resolveAfterMs: 0,
    m1OptWaitCount: 0,
    entrySet: false,
    confirmCount: 0,
    pullbackSeen: false,
    ready: true,
  });

  if (strategy.regimeMode === 'trend') {
    if (extra.adx.regime !== 'trending') return null;

    if (extra.ema.crossover === 'bullish' && extra.adx.trendDirection === 'bullish') {
      return makeEntry('CALL');
    }
    if (extra.ema.crossover === 'bearish' && extra.adx.trendDirection === 'bearish') {
      return makeEntry('PUT');
    }
    if (extra.ema.aligned === 'bullish' && extra.adx.trendDirection === 'bullish' && extra.adx.adx > 30) {
      const hasSetup = activeSetups.some(s => s.direction === 'CALL');
      if (hasSetup) return makeEntry('CALL');
    }
    if (extra.ema.aligned === 'bearish' && extra.adx.trendDirection === 'bearish' && extra.adx.adx > 30) {
      const hasSetup = activeSetups.some(s => s.direction === 'PUT');
      if (hasSetup) return makeEntry('PUT');
    }
    return null;
  }

  if (strategy.regimeMode === 'range') {
    if (extra.adx.regime !== 'ranging') return null;
    if (!extra.stochastic) return null;

    if (extra.stochastic.zone === 'oversold' && extra.stochastic.crossingUp) {
      return makeEntry('CALL');
    }
    if (extra.stochastic.zone === 'overbought' && extra.stochastic.crossingDown) {
      return makeEntry('PUT');
    }
    return null;
  }

  return null;
}

// ─── Strategy Evaluation ───

export interface EvalDeps {
  readonly getGaleLevel: (stratId: string, symbol: string) => number;
  readonly getStats: (stratId: string) => StrategyStats | undefined;
  readonly getPending: (stratId: string) => Map<string, VirtualEntry[]> | undefined;
  readonly getLastEntryTime: (stratId: string) => Map<string, number> | undefined;
}

export function evaluateStrategy(
  strategy: StrategyDef,
  symbol: string,
  candle: Candle,
  activeSetups: readonly SetupSignal[],
  aggregated: AggregatedSetup,
  pa: PriceActionContext,
  extra: ExtraIndicators,
  payout: number,
  deps: EvalDeps,
  candles?: readonly Candle[],
  lab?: LabIndicatorSet,
): VirtualEntry | null {
  // Skip disabled strategies
  const existingStats = deps.getStats(strategy.id);
  if (existingStats?.disabled) return null;

  // Skip if already have pending entry for this strategy+symbol
  const symbolMap = deps.getPending(strategy.id);
  const existing = symbolMap?.get(symbol);
  if (existing && existing.length > 0) return null;

  // Cooldown check
  if (strategy.minIntervalMs > 0) {
    const symTimes = deps.getLastEntryTime(strategy.id);
    const lastTime = symTimes?.get(symbol) ?? 0;
    if (Date.now() - lastTime < strategy.minIntervalMs) return null;
  }

  // Payout tier check — skip if below all tiers
  const tier = getPayoutTier(payout);
  if (!tier) return null;

  const session = extra.session?.session ?? '';
  const hour = new Date().getUTCHours();

  // --- Custom evaluator path (new indicators) ---
  if (strategy.customEval && candles && lab) {
    const dir = strategy.customEval(candles, extra, pa, lab);

    if (!dir) return null;
    const ms5 = 5 * 60_000;
    const nextM5Boundary = Math.ceil((Date.now() + 1) / ms5) * ms5;
    return {
      strategyId: strategy.id,
      symbol,
      direction: dir,
      payout,
      payoutTier: tier.label,
      galeLevel: deps.getGaleLevel(strategy.id, symbol),
      signalPrice: candle.close,
      entryTime: Date.now(),
      session,
      hour,
      entryPrice: strategy.entryTiming === 'immediate' ? candle.close : 0,
      entryOn: (strategy.entryTiming === 'next_m5_candle' || strategy.entryTiming === 'm5_gate_m1_signal') ? 'next_m5' as const
             : strategy.entryTiming === 'immediate' ? 'immediate' as const
             : 'next_m1' as const,
      resolveAfterMs: (strategy.entryTiming === 'next_m5_candle' || strategy.entryTiming === 'm5_gate_m1_signal') ? nextM5Boundary : 0,
      m1OptWaitCount: strategy.entryTiming === 'm5_m1_optimized' ? 1 : 0,
      entrySet: strategy.entryTiming === 'immediate',
      confirmCount: 0,
      pullbackSeen: false,
      ready: true,
    };
  }

  // --- Regime mode: special evaluation path ---
  if (strategy.regimeMode) {
    return evaluateRegimeStrategy(strategy, symbol, candle, activeSetups, aggregated, extra, payout, tier, deps.getGaleLevel);
  }

  const dir = aggregated.direction;
  if (!dir) return null;

  // Check required setups
  const matchCount = activeSetups.filter(
    s => strategy.requiredSetups.includes(s.type) && s.direction === dir
  ).length;
  if (matchCount < strategy.minSetupCount) return null;

  // Confidence threshold
  if (aggregated.confidence < strategy.minConfidence) return null;

  // M5 alignment filter
  if (strategy.requireM5Alignment) {
    if (dir === 'CALL' && aggregated.m5Trend !== 'up') return null;
    if (dir === 'PUT' && aggregated.m5Trend !== 'down') return null;
  }

  // Price action filters
  if (strategy.requireNearSR) {
    if (dir === 'CALL' && !pa.nearSupport) { return null; }
    if (dir === 'PUT' && !pa.nearResistance) { return null; }
  }
  if (strategy.requireOrderBlock) {
    const expected = dir === 'CALL' ? 'bullish' : 'bearish';
    if (pa.hasValidOrderBlock !== expected) { return null; }
  }
  if (strategy.requireFVG) {
    const expected = dir === 'CALL' ? 'bullish' : 'bearish';
    if (pa.hasUnfilledFvg !== expected) { return null; }
  }
  if (strategy.requireStructureBreak) {
    const expected = dir === 'CALL' ? 'bullish' : 'bearish';
    if (pa.recentStructureBreak !== expected) { return null; }
  }

  // --- Extra indicator filters ---
  if (strategy.requireStochExtreme) {
    if (!extra.stochastic) { return null; }
    if (dir === 'CALL' && extra.stochastic.zone !== 'oversold') { return null; }
    if (dir === 'PUT' && extra.stochastic.zone !== 'overbought') { return null; }
  }
  if (strategy.requireADXTrend) {
    if (!extra.adx || extra.adx.regime !== 'trending') { return null; }
  }
  if (strategy.requireADXRange) {
    if (!extra.adx || extra.adx.regime !== 'ranging') { return null; }
  }
  if (strategy.requireEMAAlignment) {
    if (!extra.ema) { return null; }
    if (dir === 'CALL' && extra.ema.aligned !== 'bullish') { return null; }
    if (dir === 'PUT' && extra.ema.aligned !== 'bearish') { return null; }
  }
  if (strategy.requireEMACrossover) {
    if (!extra.ema || !extra.ema.crossover) { return null; }
    if (dir === 'CALL' && extra.ema.crossover !== 'bullish') { return null; }
    if (dir === 'PUT' && extra.ema.crossover !== 'bearish') { return null; }
  }
  if (strategy.requireSession) {
    const s = extra.session.session;
    if (strategy.requireSession === 'london_ny_overlap') {
      if (s !== 'london_ny_overlap') { return null; }
    } else if (strategy.requireSession === 'london') {
      if (s !== 'london' && s !== 'london_ny_overlap') { return null; }
    } else if (strategy.requireSession === 'ny') {
      if (s !== 'ny' && s !== 'london_ny_overlap') { return null; }
    }
  }

  // Build virtual entry based on timing
  const baseEntry = {
    strategyId: strategy.id,
    symbol,
    direction: dir,
    payout,
    payoutTier: tier.label,
    galeLevel: deps.getGaleLevel(strategy.id, symbol),
    signalPrice: candle.close,
    entryTime: Date.now(),
    session,
    hour,
    entrySet: false,
  } as const;

  switch (strategy.entryTiming) {
    case 'immediate':
      return {
        ...baseEntry,
        entryPrice: candle.close,
        entryOn: 'immediate' as const,
        resolveAfterMs: 0, m1OptWaitCount: 0,
        entrySet: true, confirmCount: 0, pullbackSeen: false, ready: true,
      };

    case 'next_m1_candle':
      return {
        ...baseEntry,
        entryPrice: 0,
        entryOn: 'next_m1' as const,
        resolveAfterMs: 0, m1OptWaitCount: 0,
        confirmCount: 0, pullbackSeen: false, ready: true,
      };

    case 'next_m5_candle': {
      const ms5 = 5 * 60_000;
      return {
        ...baseEntry,
        entryPrice: 0,
        entryOn: 'next_m5' as const,
        resolveAfterMs: Math.ceil((Date.now() + 1) / ms5) * ms5, m1OptWaitCount: 0,
        confirmCount: 0, pullbackSeen: false, ready: true,
      };
    }

    case 'm5_gate_m1_signal': {
      const ms5g = 5 * 60_000;
      return {
        ...baseEntry,
        entryPrice: 0,
        entryOn: 'next_m5' as const,
        resolveAfterMs: Math.ceil((Date.now() + 1) / ms5g) * ms5g, m1OptWaitCount: 0,
        confirmCount: 0, pullbackSeen: false, ready: true,
      };
    }

    case 'm5_m1_optimized': {
      return {
        ...baseEntry,
        entryPrice: 0,
        entryOn: 'next_m1' as const,
        resolveAfterMs: 0, m1OptWaitCount: 1,
        confirmCount: 0, pullbackSeen: false, ready: false,
      };
    }

    case 'confirmation_2m1':
      return {
        ...baseEntry,
        entryPrice: 0,
        entryOn: 'next_m1' as const,
        resolveAfterMs: 0, m1OptWaitCount: 0,
        confirmCount: 1, pullbackSeen: false, ready: false,
      };

    case 'pullback':
      return {
        ...baseEntry,
        entryPrice: 0,
        entryOn: 'next_m1' as const,
        resolveAfterMs: 0, m1OptWaitCount: 0,
        confirmCount: 0, pullbackSeen: false, ready: false,
      };
  }
}
