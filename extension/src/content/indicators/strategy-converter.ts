/**
 * Strategy Converter — Migrates all 102 builtin strategies to StrategyDefJSON format.
 *
 * Produces serializable JSON definitions that the DSL interpreter can evaluate at runtime.
 * Three conversion paths:
 *   1. Declarative (setup-based): filters only, no customLogic/customCode
 *   2. DSL expression: customLogic expression tree (~20 strategies)
 *   3. Custom code escape hatch: customCode string (~7 complex strategies)
 *
 * M5/M5g/M5+M1 variants are generated automatically from base strategies.
 */

import type { StrategyDefJSON, DSLExpression, DSLContext } from './strategy-dsl';
import {
  eq, isTrue, exists, and, or, call, put, callPut, registerCompiledEval,
  transition, prevCompare, haPattern, confluence, ref,
} from './strategy-dsl';
import type { EntryTiming } from './strategy-lab';

// ─── Constants ───

const EVENT_SETUPS = ['rsi_reversal', 'macd_cross', 'candle_pattern', 'ma_trend', 'bb_squeeze'] as const;
const NOW = Date.now();

// ─── Helpers ───

const defaultFilters: StrategyDefJSON['filters'] = {
  nearSR: false, orderBlock: false, fvg: false, structureBreak: false,
  stochExtreme: false, adxTrend: false, adxRange: false,
  emaAlignment: false, emaCrossover: false,
  session: null, regimeMode: null,
};

/** Generate a default AI validation prompt from strategy name and description. */
function generateDefaultAiPrompt(name: string, description: string): string {
  return `Strategy "${name}": ${description} Validate: does the current price action support this signal? Check for conflicting signals, nearby S/R levels, and current market regime. Reject if the signal contradicts the dominant trend or if volatility is abnormally high/low for this pattern.`;
}

function declStrat(
  id: string, name: string, entryTiming: EntryTiming,
  requiredSetups: readonly string[], minSetupCount: number,
  requireM5Alignment: boolean, minConfidence: number,
  filterOverrides: Partial<StrategyDefJSON['filters']> = {},
  description = '',
): StrategyDefJSON {
  return {
    id, name, version: 1, source: 'builtin', entryTiming, minIntervalMs: 0,
    requiredSetups, minSetupCount, requireM5Alignment, minConfidence,
    filters: { ...defaultFilters, ...filterOverrides },
    customLogic: null, customCode: null,
    description,
    aiPrompt: description ? generateDefaultAiPrompt(name, description) : null,
    tags: [], parentIds: [],
    createdAt: NOW, disabledAt: null,
  };
}

function customStrat(
  id: string, name: string, entryTiming: EntryTiming,
  logic: DSLExpression | null, code: string | null,
  description: string, cooldownMs = 60_000,
  aiPrompt: string | null = null,
): StrategyDefJSON {
  return {
    id, name, version: 1, source: 'builtin', entryTiming, minIntervalMs: cooldownMs,
    requiredSetups: [], minSetupCount: 0, requireM5Alignment: false, minConfidence: 0,
    filters: { ...defaultFilters },
    customLogic: logic, customCode: code,
    description,
    aiPrompt: aiPrompt ?? generateDefaultAiPrompt(name, description),
    tags: [], parentIds: [],
    createdAt: NOW, disabledAt: null,
  };
}

// ─── DSL Expressions for Custom Strategies ───

const williamsRLogic: DSLExpression = callPut(
  and(exists('lab.williamsR'), isTrue('lab.williamsR.crossingUp')),
  and(exists('lab.williamsR'), isTrue('lab.williamsR.crossingDown')),
);

const cciBounceLogic: DSLExpression = callPut(
  and(exists('lab.cci'), isTrue('lab.cci.crossingAboveMinus100')),
  and(exists('lab.cci'), isTrue('lab.cci.crossingBelowPlus100')),
);

const williamsCciLogic: DSLExpression = callPut(
  and(exists('lab.williamsR'), exists('lab.cci'),
    eq('lab.williamsR.zone', 'oversold'), isTrue('lab.cci.crossingAboveMinus100')),
  and(exists('lab.williamsR'), exists('lab.cci'),
    eq('lab.williamsR.zone', 'overbought'), isTrue('lab.cci.crossingBelowPlus100')),
);

const ichimokuTkLogic: DSLExpression = callPut(
  and(exists('lab.ichimoku'),
    eq('lab.ichimoku.tkCross', 'bullish'), eq('lab.ichimoku.priceVsCloud', 'above')),
  and(exists('lab.ichimoku'),
    eq('lab.ichimoku.tkCross', 'bearish'), eq('lab.ichimoku.priceVsCloud', 'below')),
);

const ichimokuKumoLogic: DSLExpression = callPut(
  and(exists('lab.ichimoku'),
    transition('lab.ichimoku.priceVsCloud', ['below', 'inside'], 'above')),
  and(exists('lab.ichimoku'),
    transition('lab.ichimoku.priceVsCloud', ['above', 'inside'], 'below')),
);

const donchianBreakoutLogic: DSLExpression = callPut(
  and(exists('lab.donchian'), isTrue('lab.donchian.breakoutUp')),
  and(exists('lab.donchian'), isTrue('lab.donchian.breakoutDown')),
);

const rsiDivergenceLogic: DSLExpression = callPut(
  and(exists('lab.divergence'), isTrue('lab.divergence.bullishRegular')),
  and(exists('lab.divergence'), isTrue('lab.divergence.bearishRegular')),
);

const threeSoldiersLogic: DSLExpression = callPut(
  isTrue('lab.threeWhiteSoldiers'),
  isTrue('lab.threeBlackCrows'),
);

const hiddenDivergenceLogic: DSLExpression = callPut(
  and(exists('lab.divergence'), exists('extra.ema'),
    isTrue('lab.divergence.bullishHidden'), isTrue('extra.ema.priceAboveEma50')),
  and(exists('lab.divergence'), exists('extra.ema'),
    isTrue('lab.divergence.bearishHidden'),
    { type: 'check', path: 'extra.ema.priceAboveEma50', op: 'eq', value: { type: 'literal', value: false } }),
);

const haContinuationLogic: DSLExpression = callPut(
  haPattern('continuation_bull', 3),
  haPattern('continuation_bear', 3),
);

const haColorEmaLogic: DSLExpression = callPut(
  and(haPattern('color_change_bull', 2), exists('extra.ema'), isTrue('extra.ema.priceAboveEma50')),
  and(haPattern('color_change_bear', 2), exists('extra.ema'),
    { type: 'check', path: 'extra.ema.priceAboveEma50', op: 'eq', value: { type: 'literal', value: false } }),
);

const sarEmaLogic: DSLExpression = callPut(
  and(exists('lab.sar'), exists('extra.ema'), isTrue('lab.sar.flipped'),
    isTrue('lab.sar.isBelow'), isTrue('extra.ema.priceAboveEma50'),
    // candle is bullish: close > open
    { type: 'prev_compare', currPath: 'candle.close', op: 'gt', prevPath: 'candle.open' }),
  and(exists('lab.sar'), exists('extra.ema'), isTrue('lab.sar.flipped'),
    { type: 'check', path: 'lab.sar.isBelow', op: 'eq', value: { type: 'literal', value: false } },
    { type: 'check', path: 'extra.ema.priceAboveEma50', op: 'eq', value: { type: 'literal', value: false } },
    // candle is bearish: close < open (prev_compare used creatively: curr close < curr open)
    { type: 'prev_compare', currPath: 'candle.close', op: 'lt', prevPath: 'candle.open' }),
);

const keltnerBreakoutLogic: DSLExpression = callPut(
  and(exists('lab.keltner'),
    transition('lab.keltner.pricePosition', ['below', 'inside'], 'above')),
  and(exists('lab.keltner'),
    transition('lab.keltner.pricePosition', ['above', 'inside'], 'below')),
);

const keltnerRevertLogic: DSLExpression = callPut(
  and(exists('lab.keltner'), exists('lab.cci'),
    prevCompare('candle.prev.close', 'lt', 'lab.keltner.lower'),
    { type: 'prev_compare', currPath: 'candle.close', op: 'gte', prevPath: 'lab.keltner.lower' },
    eq('lab.cci.zone', 'oversold')),
  and(exists('lab.keltner'), exists('lab.cci'),
    prevCompare('candle.prev.close', 'gt', 'lab.keltner.upper'),
    { type: 'prev_compare', currPath: 'candle.close', op: 'lte', prevPath: 'lab.keltner.upper' },
    eq('lab.cci.zone', 'overbought')),
);

// Pivot breakout: price crosses r1/s1 vs prev candle
const pivotBreakoutLogic: DSLExpression = callPut(
  and(exists('lab.pivots'),
    { type: 'prev_compare', currPath: 'candle.close', op: 'gt', prevPath: 'lab.pivots.r1' },
    { type: 'prev_compare', currPath: 'candle.prev.close', op: 'lte', prevPath: 'lab.pivots.r1' }),
  and(exists('lab.pivots'),
    { type: 'prev_compare', currPath: 'candle.close', op: 'lt', prevPath: 'lab.pivots.s1' },
    { type: 'prev_compare', currPath: 'candle.prev.close', op: 'gte', prevPath: 'lab.pivots.s1' }),
);

// MTF M1+M5 confluence
const mtfM1M5Logic: DSLExpression = callPut(
  and(exists('extra.ema'), exists('extra.stochastic'),
    eq('extra.ema.aligned', 'bullish'), isTrue('extra.ema.priceAboveEma50'),
    eq('extra.stochastic.zone', 'oversold')),
  and(exists('extra.ema'), exists('extra.stochastic'),
    eq('extra.ema.aligned', 'bearish'),
    { type: 'check', path: 'extra.ema.priceAboveEma50', op: 'eq', value: { type: 'literal', value: false } },
    eq('extra.stochastic.zone', 'overbought')),
);

// Hybrid: Ichimoku TK + setup confirmation (EMA or Stoch)
const hybridIchimokuSetupLogic: DSLExpression = callPut(
  and(exists('lab.ichimoku'), exists('extra.ema'), exists('extra.stochastic'),
    eq('lab.ichimoku.tkCross', 'bullish'), eq('lab.ichimoku.priceVsCloud', 'above'),
    or(eq('extra.ema.aligned', 'bullish'), eq('extra.stochastic.zone', 'oversold'))),
  and(exists('lab.ichimoku'), exists('extra.ema'), exists('extra.stochastic'),
    eq('lab.ichimoku.tkCross', 'bearish'), eq('lab.ichimoku.priceVsCloud', 'below'),
    or(eq('extra.ema.aligned', 'bearish'), eq('extra.stochastic.zone', 'overbought'))),
);

// Hybrid: HA continuation + EMA alignment
const hybridHaSetupLogic: DSLExpression = callPut(
  and(exists('extra.ema'), haPattern('continuation_bull', 3), eq('extra.ema.aligned', 'bullish')),
  and(exists('extra.ema'), haPattern('continuation_bear', 3), eq('extra.ema.aligned', 'bearish')),
);

// Hybrid: Williams %R + price action
const hybridWilliamsPaLogic: DSLExpression = callPut(
  and(exists('lab.williamsR'), isTrue('lab.williamsR.crossingUp'),
    or(isTrue('pa.nearSupport'), eq('pa.hasValidOrderBlock', 'bullish'))),
  and(exists('lab.williamsR'), isTrue('lab.williamsR.crossingDown'),
    or(isTrue('pa.nearResistance'), eq('pa.hasValidOrderBlock', 'bearish'))),
);

// Hybrid: Keltner reversion + divergence
const hybridKeltnerDivLogic: DSLExpression = callPut(
  and(exists('lab.keltner'), exists('lab.cci'), exists('lab.divergence'),
    prevCompare('candle.prev.close', 'lt', 'lab.keltner.lower'),
    { type: 'prev_compare', currPath: 'candle.close', op: 'gte', prevPath: 'lab.keltner.lower' },
    isTrue('lab.divergence.bullishRegular')),
  and(exists('lab.keltner'), exists('lab.cci'), exists('lab.divergence'),
    prevCompare('candle.prev.close', 'gt', 'lab.keltner.upper'),
    { type: 'prev_compare', currPath: 'candle.close', op: 'lte', prevPath: 'lab.keltner.upper' },
    isTrue('lab.divergence.bearishRegular')),
);

// Hybrid: 3+ indicator confluence
const hybridConfluenceLogic: DSLExpression = or(
  call(confluence(3,
    isTrue('lab.williamsR.crossingUp'),
    isTrue('lab.cci.crossingAboveMinus100'),
    and(eq('extra.stochastic.zone', 'oversold'), isTrue('extra.stochastic.crossingUp')),
    eq('extra.ema.crossover', 'bullish'),
    isTrue('pa.nearSupport'),
    isTrue('lab.divergence.bullishRegular'),
  )),
  put(confluence(3,
    isTrue('lab.williamsR.crossingDown'),
    isTrue('lab.cci.crossingBelowPlus100'),
    and(eq('extra.stochastic.zone', 'overbought'), isTrue('extra.stochastic.crossingDown')),
    eq('extra.ema.crossover', 'bearish'),
    isTrue('pa.nearResistance'),
    isTrue('lab.divergence.bearishRegular'),
  )),
);

// ─── Compiled Evaluators (registered at import time) ───
// Manifest V3 blocks new Function() in content scripts.
// These are compiled functions registered via registerCompiledEval().

const COMPILED_STRATEGY_IDS = ['atr_breakout', 'bb_squeeze', 'obv_divergence', 'session_momentum', 'inside_bar', 'pivot_bounce'] as const;

function evalAtrBreakout(ctx: DSLContext): 'CALL' | 'PUT' | null {
  const { candles } = ctx;
  if (candles.length < 16) return null;
  let atrSum = 0;
  for (let i = candles.length - 14; i < candles.length; i++) {
    const c = candles[i]!; const p = candles[i - 1]!;
    atrSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  const atr = atrSum / 14;
  const curr = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  const currRange = curr.high - curr.low;
  const prevRange = prev.high - prev.low;
  if (currRange < 2 * atr || prevRange >= atr) return null;
  const bodyTop = Math.max(curr.open, curr.close);
  const bodyBottom = Math.min(curr.open, curr.close);
  const range = curr.high - curr.low;
  if (bodyTop > curr.high - range * 0.25) return 'CALL';
  if (bodyBottom < curr.low + range * 0.25) return 'PUT';
  return null;
}

function evalBbSqueeze(ctx: DSLContext): 'CALL' | 'PUT' | null {
  const { candles, lab } = ctx;
  if (!lab.bbSqueeze || !lab.bbSqueeze.isSqueeze || candles.length < 22) return null;
  const closes = candles.slice(-20).map(c => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const std = Math.sqrt(closes.reduce((a, b) => a + (b - mean) ** 2, 0) / closes.length);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const price = candles[candles.length - 1]!.close;
  if (price > upper) return 'CALL';
  if (price < lower) return 'PUT';
  return null;
}

function evalObvDivergence(ctx: DSLContext): 'CALL' | 'PUT' | null {
  const { candles, lab } = ctx;
  if (lab.obv.length < 20 || candles.length < 20) return null;
  const priceSlice = candles.slice(-10);
  const obvSlice = lab.obv.slice(-10);
  const priceLows = priceSlice.map(c => c.low);
  const priceHighs = priceSlice.map(c => c.high);
  const minP = Math.min(...priceLows);
  const maxP = Math.max(...priceHighs);
  const minPIdx = priceLows.indexOf(minP);
  const maxPIdx = priceHighs.indexOf(maxP);
  const firstOBV = obvSlice.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const lastOBV = obvSlice.slice(-5).reduce((a, b) => a + b, 0) / 5;
  if (minPIdx > 5 && lastOBV > firstOBV * 1.05) return 'CALL';
  if (maxPIdx > 5 && lastOBV < firstOBV * 0.95) return 'PUT';
  return null;
}

function evalSessionMomentum(ctx: DSLContext): 'CALL' | 'PUT' | null {
  const { candles, extra } = ctx;
  const s = extra.session.session;
  if (s !== 'london' && s !== 'ny' && s !== 'london_ny_overlap') return null;
  if (candles.length < 35) return null;
  const prev30 = candles.slice(-35, -5);
  let prevHigh = -Infinity, prevLow = Infinity;
  for (const c of prev30) {
    if (c.high > prevHigh) prevHigh = c.high;
    if (c.low < prevLow) prevLow = c.low;
  }
  const price = candles[candles.length - 1]!.close;
  if (price > prevHigh) return 'CALL';
  if (price < prevLow) return 'PUT';
  return null;
}

function evalInsideBar(ctx: DSLContext): 'CALL' | 'PUT' | null {
  const { candles, lab } = ctx;
  if (!lab.insideBar || candles.length < 3) return null;
  const mother = candles[candles.length - 2]!;
  const price = candles[candles.length - 1]!.close;
  if (price > mother.high) return 'CALL';
  if (price < mother.low) return 'PUT';
  return null;
}

function evalPivotBounce(ctx: DSLContext): 'CALL' | 'PUT' | null {
  const { candles, lab } = ctx;
  if (!lab.pivots || candles.length < 3) return null;
  const price = candles[candles.length - 1]!.close;
  const prevPrice = candles[candles.length - 2]!.close;
  const { s1, s2, r1, r2 } = lab.pivots;
  const range = r1 - s1;
  if (range <= 0) return null;
  const tol = range * 0.05;
  const nearSupport = (Math.abs(price - s1) < tol || Math.abs(price - s2) < tol);
  const prevNearSupport = (Math.abs(prevPrice - s1) < tol || Math.abs(prevPrice - s2) < tol);
  const nearResist = (Math.abs(price - r1) < tol || Math.abs(price - r2) < tol);
  const prevNearResist = (Math.abs(prevPrice - r1) < tol || Math.abs(prevPrice - r2) < tol);
  if (nearSupport && !prevNearSupport) return 'CALL';
  if (nearResist && !prevNearResist) return 'PUT';
  return null;
}

// Register all compiled evaluators at import time
registerCompiledEval('atr_breakout', evalAtrBreakout);
registerCompiledEval('bb_squeeze', evalBbSqueeze);
registerCompiledEval('obv_divergence', evalObvDivergence);
registerCompiledEval('session_momentum', evalSessionMomentum);
registerCompiledEval('inside_bar', evalInsideBar);
registerCompiledEval('pivot_bounce', evalPivotBounce);

// ─── Build All Builtin Strategies ───

export function convertAllBuiltins(): readonly StrategyDefJSON[] {
  const strategies: StrategyDefJSON[] = [];

  // ── Entry timing variants (5) ──
  const timings: readonly [string, EntryTiming][] = [
    ['imm', 'immediate'], ['nm1', 'next_m1_candle'], ['nm5', 'next_m5_candle'],
    ['c2m', 'confirmation_2m1'], ['plb', 'pullback'],
  ];
  for (const [key, timing] of timings) {
    strategies.push(declStrat(
      `timing_${key}`, `2+ setups / ${timing}`, timing,
      [...EVENT_SETUPS], 2, true, 50, {},
      `Fires when 2+ setup signals agree with ${timing} entry timing.`,
    ));
  }

  // ── Single indicator strategies (5) ──
  const singles: readonly [string, string, string][] = [
    ['rsi_reversal', 'RSI only', 'Fires on RSI reversal signal alone with M5 alignment.'],
    ['macd_cross', 'MACD only', 'Fires on MACD cross signal alone with M5 alignment.'],
    ['candle_pattern', 'Candle only', 'Fires on candle pattern signal alone with M5 alignment.'],
    ['ma_trend', 'MA only', 'Fires on MA trend signal alone with M5 alignment.'],
    ['bb_squeeze', 'BB only', 'Fires on BB squeeze signal alone with M5 alignment.'],
  ];
  for (const [setup, name, desc] of singles) {
    strategies.push(declStrat(
      `single_${setup}`, name, 'next_m1_candle',
      [setup], 1, true, 0, {}, desc,
    ));
  }

  // ── Indicator combos: 10 pairs + 2 triples ──
  const combos: readonly [readonly string[], string][] = [
    [['rsi_reversal', 'macd_cross'], 'RSI+MACD'],
    [['rsi_reversal', 'candle_pattern'], 'RSI+Candle'],
    [['rsi_reversal', 'ma_trend'], 'RSI+MA'],
    [['rsi_reversal', 'bb_squeeze'], 'RSI+BB'],
    [['macd_cross', 'candle_pattern'], 'MACD+Candle'],
    [['macd_cross', 'ma_trend'], 'MACD+MA'],
    [['macd_cross', 'bb_squeeze'], 'MACD+BB'],
    [['candle_pattern', 'ma_trend'], 'Candle+MA'],
    [['candle_pattern', 'bb_squeeze'], 'Candle+BB'],
    [['ma_trend', 'bb_squeeze'], 'MA+BB'],
    [['rsi_reversal', 'macd_cross', 'candle_pattern'], 'RSI+MACD+Candle'],
    [['bb_squeeze', 'rsi_reversal', 'macd_cross'], 'BB+RSI+MACD'],
  ];
  for (const [setups, name] of combos) {
    strategies.push(declStrat(
      `combo_${setups.join('_')}`, name, 'next_m1_candle',
      [...setups], setups.length, true, 50, {},
      `Requires all ${setups.length} indicators: ${name}.`,
    ));
  }

  // ── No M5 alignment variants (3) ──
  const noM5: readonly [readonly string[], string][] = [
    [['rsi_reversal', 'macd_cross'], 'RSI+MACD'],
    [['rsi_reversal', 'candle_pattern'], 'RSI+Candle'],
    [['rsi_reversal', 'bb_squeeze'], 'RSI+BB'],
  ];
  for (const [setups, name] of noM5) {
    strategies.push(declStrat(
      `noM5_${setups.join('_')}`, `${name} (no M5)`, 'next_m1_candle',
      [...setups], setups.length, false, 50, {},
      `${name} without M5 alignment requirement.`,
    ));
  }

  // ── Confidence thresholds (3) ──
  for (const t of [50, 60, 70]) {
    strategies.push(declStrat(
      `conf_${t}`, `2+ / conf${t}`, 'next_m1_candle',
      [...EVENT_SETUPS], 2, true, t, {},
      `2+ setups with minimum confidence ${t}%.`,
    ));
  }

  // ── Price action (4) ──
  strategies.push(
    declStrat('pa_sr', 'Near S/R + 2 setups', 'next_m1_candle', [...EVENT_SETUPS], 2, true, 50, { nearSR: true }, 'Requires price near S/R zone.'),
    declStrat('pa_ob', 'Order block + setup', 'next_m1_candle', [...EVENT_SETUPS], 1, true, 40, { orderBlock: true }, 'Requires valid order block.'),
    declStrat('pa_fvg', 'FVG fill + setup', 'next_m1_candle', [...EVENT_SETUPS], 1, true, 40, { fvg: true }, 'Requires unfilled fair value gap.'),
    declStrat('pa_msb', 'Structure break + setup', 'next_m1_candle', [...EVENT_SETUPS], 1, true, 40, { structureBreak: true }, 'Requires recent market structure break.'),
  );

  // ── Stochastic (3) ──
  strategies.push(
    declStrat('stoch_extreme', 'Stoch extreme + 2 setups', 'next_m1_candle', [...EVENT_SETUPS], 2, true, 50, { stochExtreme: true }, 'Requires stochastic in extreme zone.'),
    declStrat('bb_stoch', 'BB + Stoch reversion', 'next_m1_candle', ['bb_squeeze'], 1, false, 0, { stochExtreme: true, adxRange: true }, 'BB squeeze + stochastic extreme in ranging market.'),
    declStrat('sr_stoch_candle', 'S/R + Stoch + candle', 'next_m1_candle', ['candle_pattern'], 1, true, 0, { nearSR: true, stochExtreme: true }, 'Near S/R + stochastic extreme + candle pattern.'),
  );

  // ── EMA (3) ──
  strategies.push(
    declStrat('ema_triple', 'Triple EMA aligned + Stoch', 'next_m1_candle', [...EVENT_SETUPS], 1, true, 0, { emaAlignment: true, stochExtreme: true }, 'Triple EMA alignment + stochastic extreme.'),
    declStrat('ema_cross_adx', 'EMA crossover + ADX trend', 'next_m1_candle', [...EVENT_SETUPS], 0, false, 0, { emaCrossover: true, adxTrend: true }, 'EMA 8/21 crossover confirmed by ADX trending.'),
    declStrat('ema_align_m5', 'EMA aligned + M5 trend', 'next_m1_candle', [...EVENT_SETUPS], 1, true, 40, { emaAlignment: true }, 'Triple EMA alignment with M5 trend confirmation.'),
  );

  // ── ADX / Regime (3) ──
  strategies.push(
    declStrat('adx_strong', 'ADX strong trend + MACD', 'next_m1_candle', ['macd_cross'], 1, true, 0, { adxTrend: true, emaAlignment: true }, 'ADX strong trend + MACD cross + EMA alignment.'),
    declStrat('regime_trend', 'Regime: trend mode (EMA+ADX)', 'next_m1_candle', [...EVENT_SETUPS], 0, false, 0, { regimeMode: 'trend' }, 'Regime-based: only fires in trending markets.'),
    declStrat('regime_range', 'Regime: range mode (BB+RSI)', 'next_m1_candle', [...EVENT_SETUPS], 0, false, 0, { regimeMode: 'range' }, 'Regime-based: only fires in ranging markets.'),
  );

  // ── Session-filtered (2) ──
  strategies.push(
    declStrat('session_london', 'London session + 2 setups', 'next_m1_candle', [...EVENT_SETUPS], 2, true, 50, { session: 'london' }, 'London session only.'),
    declStrat('session_overlap', 'London/NY overlap + setup', 'next_m1_candle', [...EVENT_SETUPS], 1, true, 40, { session: 'london_ny_overlap' }, 'London/NY overlap session only.'),
  );

  // ── Custom evaluator strategies (DSL) ──
  strategies.push(
    customStrat('williams_r', 'Williams %R reversal', 'next_m1_candle', williamsRLogic, null, 'Williams %R extreme reversal: CALL on crossing up from oversold, PUT on crossing down from overbought.'),
    customStrat('cci_bounce', 'CCI bounce', 'next_m1_candle', cciBounceLogic, null, 'CCI zero-line bounce: CALL on crossing above -100, PUT on crossing below +100.'),
    customStrat('williams_cci', 'Williams %R + CCI', 'next_m1_candle', williamsCciLogic, null, 'Double confirmation: Williams %R zone + CCI crossing.'),
    customStrat('ichimoku_tk', 'Ichimoku TK cross', 'next_m1_candle', ichimokuTkLogic, null, 'Ichimoku Tenkan-Kijun cross with price above/below cloud.'),
    customStrat('ichimoku_kumo', 'Ichimoku Kumo breakout', 'next_m1_candle', ichimokuKumoLogic, null, 'Ichimoku cloud breakout transition detection.'),
    customStrat('ha_continuation', 'Heikin Ashi continuation', 'next_m1_candle', haContinuationLogic, null, '3 consecutive bullish/bearish HA candles with no opposing wick.'),
    customStrat('ha_color_ema', 'HA color change + EMA', 'next_m1_candle', haColorEmaLogic, null, 'HA color change confirmed by EMA50 position.'),
    customStrat('sar_ema', 'SAR + EMA', 'next_m1_candle', sarEmaLogic, null, 'Parabolic SAR flip + EMA50 alignment + candle color.'),
    customStrat('keltner_breakout', 'Keltner breakout', 'next_m1_candle', keltnerBreakoutLogic, null, 'Keltner Channel breakout transition detection.'),
    customStrat('keltner_revert', 'Keltner reversion', 'next_m1_candle', keltnerRevertLogic, null, 'Price returns inside Keltner from outside, confirmed by CCI zone.'),
    customStrat('donchian_breakout', 'Donchian breakout', 'next_m1_candle', donchianBreakoutLogic, null, 'Donchian Channel breakout (close above previous high/below previous low).'),
    customStrat('rsi_divergence', 'RSI divergence', 'next_m1_candle', rsiDivergenceLogic, null, 'RSI regular divergence: price makes new extreme but RSI diverges.'),
    customStrat('hidden_divergence', 'Hidden divergence', 'next_m1_candle', hiddenDivergenceLogic, null, 'RSI hidden divergence (continuation) confirmed by EMA50.'),
    customStrat('three_soldiers', '3 soldiers/crows', 'next_m1_candle', threeSoldiersLogic, null, 'Three white soldiers or three black crows candlestick pattern.'),
    customStrat('pivot_breakout', 'Pivot breakout', 'next_m1_candle', pivotBreakoutLogic, null, 'Price breaks above R1 or below S1 pivot level.'),
    customStrat('mtf_m1m5', 'MTF M1+M5 confluence', 'next_m1_candle', mtfM1M5Logic, null, 'Multi-timeframe: M5 EMA trend + M1 stochastic timing.'),
  );

  // ── Hybrid strategies (DSL) ──
  strategies.push(
    customStrat('hybrid_ichimoku_setup', 'Ichimoku TK + setup', 'next_m1_candle', hybridIchimokuSetupLogic, null, 'Ichimoku TK cross confirmed by EMA alignment or stochastic.', 120_000),
    customStrat('hybrid_ha_setup', 'HA cont + setup', 'next_m1_candle', hybridHaSetupLogic, null, 'HA continuation confirmed by EMA alignment.', 120_000),
    customStrat('hybrid_williams_pa', 'Williams %R + PA', 'next_m1_candle', hybridWilliamsPaLogic, null, 'Williams %R crossing + price action (support/resistance or order block).', 120_000),
    customStrat('hybrid_keltner_div', 'Keltner rev + divergence', 'next_m1_candle', hybridKeltnerDivLogic, null, 'Keltner mean reversion confirmed by RSI divergence.', 120_000),
    customStrat('hybrid_confluence', '3+ indicator confluence', 'next_m1_candle', hybridConfluenceLogic, null, 'Requires 3+ indicators agreeing on direction.', 120_000),
  );

  // ── Compiled evaluator strategies (registered via registerCompiledEval) ──
  // customCode field = strategy ID (key into compiled evaluator registry)
  strategies.push(
    customStrat('atr_breakout', 'ATR volatility breakout', 'immediate', null, 'atr_breakout', 'ATR 2x expansion with price closing in top/bottom 25% of range.'),
    customStrat('bb_squeeze', 'BB squeeze breakout', 'next_m1_candle', null, 'bb_squeeze', 'Bollinger Band squeeze (low width percentile) with price band breakout.'),
    customStrat('obv_divergence', 'OBV divergence', 'next_m1_candle', null, 'obv_divergence', 'On-Balance Volume divergence: volume trend disagrees with price trend.'),
    customStrat('session_momentum', 'Session open momentum', 'next_m1_candle', null, 'session_momentum', 'London/NY session open momentum: price breaks 30-candle high/low.'),
    customStrat('inside_bar', 'Inside bar breakout', 'next_m1_candle', null, 'inside_bar', 'Inside bar pattern: current candle contained within previous, trade breakout.'),
    customStrat('pivot_bounce', 'Pivot bounce', 'next_m1_candle', null, 'pivot_bounce', 'Price arrives at pivot support/resistance level (transition to near level).'),
  );

  // ── M5 variants ──
  const m5Candidates = [
    'williams_r', 'cci_bounce', 'williams_cci', 'ichimoku_tk', 'ichimoku_kumo',
    'pivot_bounce', 'pivot_breakout', 'ha_continuation', 'sar_ema',
    'keltner_revert', 'donchian_breakout', 'bb_squeeze', 'rsi_divergence',
    'hidden_divergence', 'atr_breakout', 'session_momentum', 'inside_bar',
    'three_soldiers', 'obv_divergence',
    'hybrid_ichimoku_setup', 'hybrid_ha_setup', 'hybrid_williams_pa',
    'hybrid_keltner_div', 'hybrid_confluence',
  ];

  const baseStrategies = [...strategies];
  for (const strat of baseStrategies) {
    if (m5Candidates.includes(strat.id)) {
      strategies.push({
        ...strat,
        id: `${strat.id}_m5`,
        name: `${strat.name} (M5)`,
        entryTiming: 'next_m5_candle' as EntryTiming,
      });
    }
  }

  // ── M5+M1 optimized variants ──
  const m5m1Candidates = ['sar_ema', 'bb_squeeze', 'three_soldiers'];
  for (const strat of baseStrategies) {
    if (m5m1Candidates.includes(strat.id)) {
      strategies.push({
        ...strat,
        id: `${strat.id}_m5_m1opt`,
        name: `${strat.name} (M5+M1)`,
        entryTiming: 'm5_m1_optimized' as EntryTiming,
      });
    }
  }

  // ── M5-gated M1-signal variants ──
  const m5gCandidates = ['sar_ema', 'bb_squeeze', 'three_soldiers', 'donchian_breakout', 'ha_continuation'];
  for (const strat of baseStrategies) {
    if (m5gCandidates.includes(strat.id)) {
      strategies.push({
        ...strat,
        id: `${strat.id}_m5g`,
        name: `${strat.name} (M5g)`,
        entryTiming: 'm5_gate_m1_signal' as EntryTiming,
      });
    }
  }

  return strategies;
}

/**
 * Get count of strategies by type for diagnostics.
 */
export function getConversionStats(): { total: number; declarative: number; dsl: number; customCode: number; m5Variants: number } {
  const all = convertAllBuiltins();
  const declarative = all.filter(s => !s.customLogic && !s.customCode).length;
  const dsl = all.filter(s => s.customLogic !== null).length;
  const customCode = all.filter(s => s.customCode !== null).length;
  const m5Variants = all.filter(s => s.id.includes('_m5')).length;
  return { total: all.length, declarative, dsl, customCode, m5Variants };
}
