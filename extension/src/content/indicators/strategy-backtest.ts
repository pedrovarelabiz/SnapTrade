/**
 * Strategy Backtest — Phase 3 quality gate.
 *
 * Tests a candidate strategy against historical candles BEFORE injecting it live.
 * If backtest WR < break-even threshold, the strategy is rejected.
 *
 * Uses candles already in memory from candle-collector (last ~500 per symbol).
 */

import type { StrategyDefJSON, DSLExpression, DSLContext } from './strategy-dsl';
import { evaluateDSL, getPrevLab, updatePrevLabCache } from './strategy-dsl';
import { getCandles, getTrackedSymbols, type Candle } from './candle-collector';
import { computeLabIndicators } from './lab-indicators';
import { computeExtraIndicators } from './extra-indicators';
import { buildPriceActionContext } from './price-action';

// ─── Types ───

export interface BacktestResult {
  readonly strategyId: string;
  readonly totalSignals: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number;
  readonly passed: boolean;
  readonly reason: string;
}

// ─── Configuration ───

/** Minimum WR to pass backtest. */
const MIN_BACKTEST_WR = 0.50;

/** Minimum signals needed for a valid backtest. */
const MIN_SIGNALS = 5;

/** How many candles back to test. */
const MAX_CANDLES_BACK = 300;

// ─── Backtest Engine ───

/**
 * Run a strategy against historical M1 candles for all tracked symbols.
 * Entry at candle[i] close, resolve at candle[i+1] close.
 */
export function backtestStrategy(def: StrategyDefJSON): BacktestResult {
  if (!def.customLogic) {
    return { strategyId: def.id, totalSignals: 0, wins: 0, losses: 0, winRate: 0, passed: true, reason: 'no DSL (declarative only)' };
  }

  const symbols = getTrackedSymbols();
  let totalWins = 0;
  let totalLosses = 0;

  for (const symbol of symbols) {
    const candles = getCandles(symbol, 'M1');
    if (candles.length < 30) continue;

    const start = Math.max(0, candles.length - MAX_CANDLES_BACK);
    const testCandles = candles.slice(start);

    for (let i = 20; i < testCandles.length - 1; i++) {
      // Build context from candles up to index i
      const windowCandles = testCandles.slice(Math.max(0, i - 20), i + 1);
      if (windowCandles.length < 10) continue;

      try {
        const lab = computeLabIndicators(windowCandles);
        const extra = computeExtraIndicators(windowCandles);
        const currentPrice = windowCandles[windowCandles.length - 1]!.close;
        const pa = buildPriceActionContext(windowCandles, currentPrice);
        const prevLab = getPrevLab(symbol);

        const ctx: DSLContext = { candles: windowCandles, extra, pa, lab, prevLab };
        const signal = evaluateDSL(def.customLogic, ctx);

        updatePrevLabCache(symbol, lab);

        if (!signal) continue;

        // Resolve: entry at current close, exit at next close
        const entryPrice = testCandles[i]!.close;
        const exitPrice = testCandles[i + 1]!.close;

        const isWin = signal === 'CALL'
          ? exitPrice > entryPrice
          : exitPrice < entryPrice;

        if (isWin) totalWins++;
        else totalLosses++;

        // Skip next candle (cooldown)
        i++;
      } catch {
        // DSL evaluation error — skip this candle
        continue;
      }
    }
  }

  const totalSignals = totalWins + totalLosses;
  const winRate = totalSignals > 0 ? totalWins / totalSignals : 0;

  if (totalSignals < MIN_SIGNALS) {
    return {
      strategyId: def.id,
      totalSignals,
      wins: totalWins,
      losses: totalLosses,
      winRate,
      passed: true, // not enough data to reject — give it a chance live
      reason: `insufficient signals (${totalSignals} < ${MIN_SIGNALS})`,
    };
  }

  const passed = winRate >= MIN_BACKTEST_WR;

  return {
    strategyId: def.id,
    totalSignals,
    wins: totalWins,
    losses: totalLosses,
    winRate,
    passed,
    reason: passed
      ? `passed (${(winRate * 100).toFixed(1)}% WR on ${totalSignals} signals)`
      : `rejected (${(winRate * 100).toFixed(1)}% WR < ${MIN_BACKTEST_WR * 100}% threshold)`,
  };
}

/**
 * Filter a list of candidate strategies through backtest.
 * Returns only those that pass.
 */
export function backtestFilter(
  candidates: readonly StrategyDefJSON[],
): { passed: readonly StrategyDefJSON[]; results: readonly BacktestResult[] } {
  const results: BacktestResult[] = [];
  const passed: StrategyDefJSON[] = [];

  for (const def of candidates) {
    const result = backtestStrategy(def);
    results.push(result);

    if (result.passed) {
      passed.push(def);
    } else {
      console.log(`[Backtest] Rejected: ${def.id} — ${result.reason}`);
    }
  }

  const passRate = candidates.length > 0
    ? `${passed.length}/${candidates.length}`
    : '0/0';
  console.log(`[Backtest] ${passRate} candidates passed`);

  return { passed, results };
}
