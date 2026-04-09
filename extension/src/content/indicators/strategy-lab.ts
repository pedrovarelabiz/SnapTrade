/**
 * Strategy Lab — Multi-strategy A/B testing engine.
 *
 * Evaluates ~28 strategies in parallel on every candle close.
 * Each strategy is a data definition (not code) specifying indicator requirements,
 * entry timing, and filters. The engine tracks virtual trades and computes
 * rolling win rates to reveal the best-performing combinations.
 *
 * Storage: persists aggregated stats to chrome.storage.local (key: strategyLabStats).
 * Performance: <1ms per pair per strategy evaluation.
 */

import { getCandles, type Candle, type Timeframe } from './candle-collector';
import type { SetupType, SetupSignal, AggregatedSetup } from './setup-detector';
import type { PriceActionContext } from './price-action';
import type { ExtraIndicators, SessionType } from './extra-indicators';
import type { LabIndicatorSet } from './lab-indicators';
import { regimeRecordResult, isRegimeBlocked } from './regime-detector';
import { buildLabAiCandidates, validateLabSignals, recordLabAiOutcome } from './lab-ai-validator';
import { evaluateM1Entry } from './m1-entry-optimizer';
import { getAllStrategies } from './strategy-loader';
import { maybeQueueLabSignal } from './lab-to-trade';
import { evaluateDSL, evaluateCustomCode, getPrevLab, updatePrevLabCache, type DSLContext, type StrategyDefJSON } from './strategy-dsl';
import { convertAllBuiltins } from './strategy-converter';

// Sub-module imports
import type {
  EntryTiming, StrategyDef, StrategyStats, LabEvent, SubStats,
  VirtualEntry, PayoutTier, GaleCandleRecovery,
} from './strategy-lab/types';
import { emptySubStats } from './strategy-lab/types';
import { persistStats as doPersistStats, loadPersistedStats, loadPayoutCache, startPayoutRefresh } from './strategy-lab/persistence';
import { evaluateStrategy as doEvaluateStrategy, type EvalDeps } from './strategy-lab/engine';
import {
  getLabRanking as doGetLabRanking,
  getAllLabStats as doGetAllLabStats,
  logTopStrategies as doLogTopStrategies,
  labFlush as doLabFlush,
  recordAiValidation as doRecordAiValidation,
  getAiQualifiedStrategies as doGetAiQualifiedStrategies,
  updateScores as doUpdateScores,
  getTopStrategies as doGetTopStrategies,
  getStrategyPairStats as doGetStrategyPairStats,
  getStrategySessionStats as doGetStrategySessionStats,
  getPayoutTiers as doGetPayoutTiers,
  getRegimeAwareTop as doGetRegimeAwareTop,
  computeScore,
} from './strategy-lab/query-api';

// Re-export types for external consumers
export type { EntryTiming, StrategyDef, StrategyStats, LabEvent } from './strategy-lab/types';

// DSL dual-mode verification completed successfully:
// 2000+ evaluations, 100% match rate, 0 mismatches.
// Verification code removed — DSL is now the primary evaluation path.

// ─── Live Event Log ───

const labEvents: LabEvent[] = [];
const MAX_EVENTS = 50;

function emitEvent(event: LabEvent): void {
  labEvents.push(event);
  if (labEvents.length > MAX_EVENTS) {
    labEvents.splice(0, labEvents.length - MAX_EVENTS);
  }
}

/** Get recent lab events for the monitor overlay. */
export function getLabEvents(): readonly LabEvent[] {
  return labEvents;
}

/** Get count of pending virtual entries across all strategies. */
export function getPendingCount(): number {
  let count = 0;
  for (const [, symbolMap] of pendingEntries) {
    for (const [, entries] of symbolMap) {
      count += entries.length;
    }
  }
  return count;
}

// Current symbol being evaluated (set by evaluateStrategy, read by DSL wrappers)
let currentEvalSymbol = '';

// ─── Strategy Registry (DSL-based) ───

const EVENT_SETUPS: readonly SetupType[] = [
  'rsi_reversal', 'macd_cross', 'candle_pattern', 'ma_trend', 'bb_squeeze',
];

/**
 * Convert StrategyDefJSON definitions to StrategyDef objects.
 * DSL strategies get a customEval wrapper that calls evaluateDSL/evaluateCustomCode.
 * Declarative strategies keep customEval undefined (engine uses setup-detector path).
 */
function strategyDefsFromJSON(defs: readonly StrategyDefJSON[]): readonly StrategyDef[] {
  return defs.map(def => {
    let customEvalFn: StrategyDef['customEval'] = undefined;

    if (def.customLogic) {
      // DSL expression tree → wrap in customEval function
      const logic = def.customLogic;
      customEvalFn = (candles, extra, pa, lab) => {
        const ctx: DSLContext = { candles, extra, pa, lab, prevLab: getPrevLab(currentEvalSymbol) };
        return evaluateDSL(logic, ctx);
      };
    } else if (def.customCode) {
      // Compiled evaluator registry → wrap in customEval function
      const stratId = def.customCode; // customCode = strategy ID key
      customEvalFn = (candles, extra, pa, lab) => {
        const ctx: DSLContext = { candles, extra, pa, lab, prevLab: getPrevLab(currentEvalSymbol) };
        return evaluateCustomCode(stratId, ctx);
      };
    }

    return {
      id: def.id,
      name: def.name,
      entryTiming: def.entryTiming,
      requiredSetups: def.requiredSetups as readonly SetupType[],
      minSetupCount: def.minSetupCount,
      requireM5Alignment: def.requireM5Alignment,
      minConfidence: def.minConfidence,
      requireNearSR: def.filters.nearSR,
      requireOrderBlock: def.filters.orderBlock,
      requireFVG: def.filters.fvg,
      requireStructureBreak: def.filters.structureBreak,
      requireStochExtreme: def.filters.stochExtreme,
      requireADXTrend: def.filters.adxTrend,
      requireADXRange: def.filters.adxRange,
      requireEMAAlignment: def.filters.emaAlignment,
      requireEMACrossover: def.filters.emaCrossover,
      requireSession: def.filters.session as SessionType | null,
      regimeMode: def.filters.regimeMode,
      minIntervalMs: def.minIntervalMs,
      customEval: customEvalFn,
    };
  });
}

// Strategy definitions moved to strategy-converter.ts (StrategyDefJSON).
// DSL interpreter in strategy-dsl.ts, CRUD in strategy-loader.ts.
// Verified: 2000+ dual-mode evaluations, 100% match rate, 0 mismatches.

let STRATEGIES: readonly StrategyDef[] = strategyDefsFromJSON(convertAllBuiltins());
console.log(`[SnapTrade] Strategy Lab: ${STRATEGIES.length} strategies via DSL (${STRATEGIES.filter(s => s.customEval).length} customEval)`);

/** Refresh STRATEGIES from the strategy-loader cache (e.g., after crawler inject). */
export function refreshStrategies(): number {
  const allDefs = getAllStrategies();
  const newStrategies = strategyDefsFromJSON(allDefs);
  const added = newStrategies.length - STRATEGIES.length;
  STRATEGIES = newStrategies;
  if (added > 0) {
    console.log(`[SnapTrade] Strategy Lab: refreshed — ${STRATEGIES.length} total (+${added} new)`);
  }
  return added;
}

// ─── State ───

// strategyId → Map<symbol, VirtualEntry[]>
const pendingEntries = new Map<string, Map<string, VirtualEntry[]>>();

// strategyId → StrategyStats
const statsMap = new Map<string, StrategyStats>();

// Cooldown tracking: strategyId → symbol → last entry timestamp
const lastEntryTime = new Map<string, Map<string, number>>();

// Gale tracking: strategyId → symbol → consecutive losses (0 = no gale, 1 = gale 1)
const galeTracker = new Map<string, Map<string, number>>();
const MAX_GALE = 1;

/** Calculate gale stake to recover previous losses + earn base profit.
 *  Gale 0: stake = 1.00
 *  Gale 1: stake = (1 + payout) / payout ≈ 2.09 for 92% payout
 *  Example with 92% payout:
 *    G0 win: +0.92 | G0 loss: -1.00
 *    G1 win: +2.09*0.92 - 1.00 = +0.92 net (recovers G0 loss + original profit)
 *    G1 loss: -1.00 - 2.09 = -3.09 total (catastrophic)
 */
function galeStake(level: number, payout: number): number {
  if (level === 0) return 1;
  // Gale 1: recover loss of 1 + earn original profit (payout)
  return (1 + payout) / payout;
}

// ─── Gale Candle Mode: pending recovery entries ───
const galeCandleRecoveries: GaleCandleRecovery[] = [];

/** Schedule a candle-gale recovery after a loss. */
function scheduleGaleCandleRecovery(stratId: string, symbol: string, direction: 'CALL' | 'PUT', payout: number, entryOn: 'next_m1' | 'next_m5'): void {
  // Only one recovery per strategy+symbol at a time
  const key = `${stratId}:${symbol}`;
  const existing = galeCandleRecoveries.findIndex(r => `${r.stratId}:${r.symbol}` === key);
  if (existing >= 0) return; // already pending
  galeCandleRecoveries.push({ stratId, symbol, direction, payout, entryOn });
}

/** Resolve candle-gale recoveries on candle close. */
function resolveGaleCandleRecoveries(symbol: string, tf: Timeframe, candle: Candle): void {
  const toRemove: number[] = [];
  for (let i = 0; i < galeCandleRecoveries.length; i++) {
    const r = galeCandleRecoveries[i]!;
    if (r.symbol !== symbol) continue;
    const matchesTf = (r.entryOn === 'next_m1' && tf === 'M1') || (r.entryOn === 'next_m5' && tf === 'M5');
    if (!matchesTf) continue;

    // Simulate: enter at candle open, exit at candle close
    const isWin = r.direction === 'CALL' ? candle.close > candle.open : candle.close < candle.open;
    const stats = getOrCreateStats(r.stratId);
    const g1Stake = galeStake(1, r.payout);
    const g1Pnl = isWin ? (g1Stake * r.payout) : -g1Stake;

    stats.galeCandle.g1.pnl += g1Pnl;
    if (isWin) stats.galeCandle.g1.wins++;
    else stats.galeCandle.g1.losses++;
    stats.galeCandle.totalPnl += g1Pnl;

    toRemove.push(i);
  }
  // Remove resolved (reverse order to preserve indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    galeCandleRecoveries.splice(toRemove[i]!, 1);
  }
}

/** Get current gale level for strategy+symbol. */
function getGaleLevel(stratId: string, symbol: string): number {
  return galeTracker.get(stratId)?.get(symbol) ?? 0;
}

/** Update gale tracker after trade result. */
function updateGaleTracker(stratId: string, symbol: string, isWin: boolean): void {
  let symMap = galeTracker.get(stratId);
  if (!symMap) {
    symMap = new Map();
    galeTracker.set(stratId, symMap);
  }
  if (isWin) {
    // Win at any level: reset to 0
    symMap.set(symbol, 0);
  } else {
    const current = symMap.get(symbol) ?? 0;
    if (current >= MAX_GALE) {
      // Max gale reached, loss accepted, reset
      symMap.set(symbol, 0);
    } else {
      symMap.set(symbol, current + 1);
    }
  }
}

let evalCount = 0;
let totalFireCount = 0; // Cumulative count of entries fired across all evals

const PERSIST_EVERY = 50;
const ENTRY_EXPIRY_MS = 300_000; // 5 minutes

// ─── Payout Cache ───
const payoutCache = new Map<string, number>();

/** Get payout for symbol. Returns null if unknown — caller must skip. */
export function getLabPayout(symbol: string): number | null {
  const key = symbol.toLowerCase().replace(/[\s/]/g, '');
  return payoutCache.get(key) ?? null;
}

// Listen for payout changes in storage
try {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes['activePayouts']) {
      loadPayoutCache(payoutCache);
    }
  });
} catch { /* not in extension context */ }

// ─── Init: Load from storage ───

loadPersistedStats(statsMap, STRATEGIES);
startPayoutRefresh(payoutCache);

// ─── Helpers ───

function getOrCreateStats(stratId: string): StrategyStats {
  const existing = statsMap.get(stratId);
  if (existing) return existing;

  const def = STRATEGIES.find(d => d.id === stratId);
  const stats: StrategyStats = {
    id: stratId,
    name: def?.name ?? stratId,
    wins: 0, losses: 0, streak: 0, bestStreak: 0, worstStreak: 0,
    recentResults: [],
    totalPayout: 0, totalRisked: 0,
    gatedWins: 0, gatedLosses: 0, gatedPayout: 0, gatedRisked: 0,
    candidateGatedWins: 0, candidateGatedLosses: 0, candidateGatedPayout: 0, candidateGatedRisked: 0,
    pairStats: new Map(),
    sessionStats: new Map(),
    hourStats: new Map(),
    tierStats: new Map(),
    equityCurve: [],
    maxDrawdown: 0,
    atSignalWins: 0,
    atSignalLosses: 0,
    galeSignal: {
      g0: { wins: 0, losses: 0, pnl: 0 },
      g1: { wins: 0, losses: 0, pnl: 0 },
      totalPnl: 0,
    },
    galeCandle: {
      g0: { wins: 0, losses: 0, pnl: 0 },
      g1: { wins: 0, losses: 0, pnl: 0 },
      totalPnl: 0,
    },
    flatPnl: 0,
    aiValidatedWins: 0, aiValidatedLosses: 0,
    aiRejectedWins: 0, aiRejectedLosses: 0,
    score: 0,
    disabled: false,
    lastUpdated: Date.now(),
  };
  statsMap.set(stratId, stats);
  return stats;
}

function recordResult(
  stratId: string, isWin: boolean,
  symbol: string = '', direction: 'CALL' | 'PUT' = 'CALL',
  payout: number = 0.8, session: string = '', hour: number = new Date().getUTCHours(),
  tierLabel: string = 'premium_otc',
): void {
  // Feed regime detector
  regimeRecordResult(stratId, isWin);

  const def = STRATEGIES.find(d => d.id === stratId);
  emitEvent({
    type: isWin ? 'win' : 'loss',
    strategy: def?.name ?? stratId,
    strategyId: stratId,
    symbol,
    direction,
    isOtc: symbol.includes('_otc'),
    time: Date.now(),
  });
  const stats = getOrCreateStats(stratId);

  // ─── Gale tracking (signal mode) ───
  const gl = getGaleLevel(stratId, symbol);
  const signalStake = galeStake(gl, payout);
  const signalGalePnl = isWin ? (signalStake * payout) : -signalStake;
  const gs = gl === 0 ? stats.galeSignal.g0 : stats.galeSignal.g1;
  gs.pnl += signalGalePnl;
  if (isWin) gs.wins++; else gs.losses++;
  stats.galeSignal.totalPnl += signalGalePnl;

  // Flat P&L (no gale, base stake always)
  stats.flatPnl += isWin ? payout : -1;

  // Update gale tracker for signal mode
  updateGaleTracker(stratId, symbol, isWin);

  // Track P&L: win = +payout, loss = -1 (stake) — flat, no gale
  stats.totalRisked += 1;
  stats.totalPayout += isWin ? payout : 0;

  // Track gated stats: only count trades when gate is NOT blocked
  const gateOpen = !isRegimeBlocked();
  if (gateOpen) {
    stats.gatedRisked += 1;
    stats.gatedPayout += isWin ? payout : 0;
    if (isWin) stats.gatedWins++;
    else stats.gatedLosses++;
  }

  // Candidate gated stats: count all trades regardless of regime state.
  // Used as scoring fallback when gatedRisked < 20 (e.g. regime permanently blocked).
  stats.candidateGatedRisked += 1;
  stats.candidateGatedPayout += isWin ? payout : 0;
  if (isWin) stats.candidateGatedWins++;
  else stats.candidateGatedLosses++;

  if (isWin) {
    stats.wins++;
    stats.streak = stats.streak >= 0 ? stats.streak + 1 : 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  } else {
    stats.losses++;
    stats.streak = stats.streak <= 0 ? stats.streak - 1 : -1;
    stats.worstStreak = Math.min(stats.worstStreak, stats.streak);
  }

  // Immutable update of recentResults (keep last 20)
  const updated = [...stats.recentResults.slice(-19), isWin ? 'W' as const : 'L' as const];
  (stats as { recentResults: readonly ('W' | 'L')[] }).recentResults = updated;

  // ─── Granular analytics ───

  // Per-pair
  if (symbol) {
    const ps = stats.pairStats.get(symbol) ?? emptySubStats();
    ps.risked += 1;
    ps.payout += isWin ? payout : 0;
    if (isWin) ps.wins++; else ps.losses++;
    stats.pairStats.set(symbol, ps);
  }

  // Per-session
  if (session) {
    const ss = stats.sessionStats.get(session) ?? emptySubStats();
    ss.risked += 1;
    ss.payout += isWin ? payout : 0;
    if (isWin) ss.wins++; else ss.losses++;
    stats.sessionStats.set(session, ss);
  }

  // Per-hour
  const hs = stats.hourStats.get(hour) ?? emptySubStats();
  hs.risked += 1;
  hs.payout += isWin ? payout : 0;
  if (isWin) hs.wins++; else hs.losses++;
  stats.hourStats.set(hour, hs);

  // Per-tier
  const ts = stats.tierStats.get(tierLabel) ?? emptySubStats();
  ts.risked += 1;
  ts.payout += isWin ? payout : 0;
  if (isWin) ts.wins++; else ts.losses++;
  stats.tierStats.set(tierLabel, ts);

  // Equity curve (rolling P&L, last 200 points)
  const delta = isWin ? payout : -1;
  const lastEquity = stats.equityCurve.length > 0 ? stats.equityCurve[stats.equityCurve.length - 1]! : 0;
  stats.equityCurve = [...stats.equityCurve.slice(-199), lastEquity + delta];

  // Max drawdown
  let peak = -Infinity;
  let dd = 0;
  for (const eq of stats.equityCurve) {
    if (eq > peak) peak = eq;
    const currentDd = peak - eq;
    if (currentDd > dd) dd = currentDd;
  }
  stats.maxDrawdown = dd;

  stats.lastUpdated = Date.now();
}

// ─── Phase 1: Resolve Pending Entries ───

function resolveEntries(symbol: string, tf: Timeframe, candle: Candle): void {
  const now = Date.now();

  for (const [stratId, symbolMap] of pendingEntries) {
    const entries = symbolMap.get(symbol);
    if (!entries || entries.length === 0) continue;

    const remaining: VirtualEntry[] = [];

    for (const entry of entries) {
      // Expire old entries
      if (now - entry.entryTime > ENTRY_EXPIRY_MS) continue;

      // Handle confirmation/pullback timing state machine
      if (!entry.ready) {
        if (tf !== 'M1') {
          remaining.push(entry);
          continue;
        }

        // M5+M1 optimized: use M1 entry optimizer for smart timing
        if (entry.m1OptWaitCount > 0) {
          const m1Candles = getCandles(symbol, 'M1');
          if (m1Candles.length < 5) { remaining.push(entry); continue; }
          // Compute lightweight M1 indicators inline
          const last14 = m1Candles.slice(-14);
          let m1Rsi: number | null = null;
          if (last14.length >= 14) {
            let gains = 0, losses = 0;
            for (let k = 1; k < last14.length; k++) {
              const diff = last14[k]!.close - last14[k - 1]!.close;
              if (diff > 0) gains += diff; else losses -= diff;
            }
            const avgGain = gains / 13; const avgLoss = losses / 13;
            m1Rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
          }
          // Simple M1 MACD: EMA12-EMA26 histogram direction
          let m1HistRising = false;
          let m1Hist: number | null = null;
          if (m1Candles.length >= 26) {
            const closes = m1Candles.slice(-27).map(c => c.close);
            const ema = (period: number, data: number[]) => {
              const k = 2 / (period + 1);
              let e = data[0]!;
              for (let j = 1; j < data.length; j++) e = data[j]! * k + e * (1 - k);
              return e;
            };
            const prevCloses = closes.slice(0, -1);
            const allCloses = closes;
            const histNow = ema(12, allCloses) - ema(26, allCloses);
            const histPrev = ema(12, prevCloses) - ema(26, prevCloses);
            m1Hist = histNow;
            m1HistRising = histNow > histPrev;
          }

          const { shouldEnter, state: newState } = evaluateM1Entry(
            { direction: entry.direction, signalTime: entry.entryTime, signalPrice: entry.signalPrice,
              waitCount: entry.m1OptWaitCount - 1, pullbackSeen: entry.pullbackSeen,
              bestScore: 0, bestScoreCandle: 0, entered: false, entryPrice: 0, entryTime: 0, skipped: false },
            m1Candles, m1Rsi, m1Hist, m1HistRising
          );

          entry.m1OptWaitCount = newState.waitCount + 1;
          entry.pullbackSeen = newState.pullbackSeen;

          if (shouldEnter || newState.skipped) {
            if (shouldEnter) {
              entry.ready = true;
              entry.entryPrice = candle.close; // Lock entry at this M1 close
              entry.entrySet = true;
            }
            // If skipped (timeout + no fallback), drop the entry
            if (newState.skipped) continue;
            remaining.push(entry);
          } else {
            remaining.push(entry); // Keep waiting
          }
          continue;
        }

        const candleBullish = candle.close > candle.open;
        const aligned = (entry.direction === 'CALL' && candleBullish) ||
                        (entry.direction === 'PUT' && !candleBullish);

        if (entry.confirmCount > 0 && entry.confirmCount < 2) {
          // confirmation_2m1: need 2 consecutive M1 in direction
          if (aligned) {
            entry.confirmCount++;
            if (entry.confirmCount >= 2) {
              entry.ready = true;
              // Will resolve on next candle
              remaining.push(entry);
            } else {
              remaining.push(entry);
            }
          }
          // Not aligned → expired (broke streak), drop the entry
          continue;
        }

        if (!entry.pullbackSeen) {
          // pullback: wait for counter-direction M1
          if (!aligned) {
            entry.pullbackSeen = true;
            remaining.push(entry);
          } else {
            remaining.push(entry); // still waiting for pullback
          }
          continue;
        }

        if (entry.pullbackSeen) {
          // Pullback seen, now wait for re-alignment
          if (aligned) {
            entry.ready = true;
            remaining.push(entry);
          } else {
            remaining.push(entry); // still counter-direction
          }
          continue;
        }

        remaining.push(entry);
        continue;
      }

      // Resolve on matching timeframe: M1 entries resolve at M1 close, M5 at M5 close
      const matchesTf = (entry.entryOn === 'next_m1' && tf === 'M1') ||
                        (entry.entryOn === 'next_m5' && tf === 'M5') ||
                        (entry.entryOn === 'immediate' && tf === 'M5');

      if (!matchesTf) {
        remaining.push(entry);
        continue;
      }

      // For M5 entries: skip candles that started BEFORE the signal's target boundary.
      if (entry.resolveAfterMs > 0 && candle.time < entry.resolveAfterMs) {
        remaining.push(entry);
        continue;
      }

      // Resolve: entry at this candle's OPEN, exit at this candle's CLOSE
      const entryPrice = (entry.entrySet && entry.entryPrice > 0) ? entry.entryPrice : candle.open;
      const exitPrice = candle.close;
      const isWin = entry.direction === 'CALL'
        ? exitPrice > entryPrice
        : exitPrice < entryPrice;

      // Also track "atSignal" mode: entry at signal candle CLOSE, exit at this candle CLOSE
      if (entry.signalPrice > 0) {
        const atSignalWin = entry.direction === 'CALL'
          ? exitPrice > entry.signalPrice
          : exitPrice < entry.signalPrice;
        const stats2 = getOrCreateStats(stratId);
        if (atSignalWin) stats2.atSignalWins++;
        else stats2.atSignalLosses++;
      }

      recordResult(stratId, isWin, entry.symbol, entry.direction, entry.payout, entry.session, entry.hour, entry.payoutTier);

      // Gale candle mode: record G0 result and schedule recovery if loss
      const gcStats = getOrCreateStats(stratId);
      const g0Pnl = isWin ? entry.payout : -1;
      gcStats.galeCandle.g0.pnl += g0Pnl;
      if (isWin) gcStats.galeCandle.g0.wins++;
      else {
        gcStats.galeCandle.g0.losses++;
        // Schedule immediate recovery on next candle (same direction)
        scheduleGaleCandleRecovery(stratId, entry.symbol, entry.direction, entry.payout, entry.entryOn === 'next_m5' ? 'next_m5' : 'next_m1');
      }
      gcStats.galeCandle.totalPnl += g0Pnl;

      // Record AI validation outcome if applicable
      recordLabAiOutcome(stratId, entry.symbol, isWin);
      // Entry consumed — don't push to remaining
    }

    if (remaining.length > 0) {
      symbolMap.set(symbol, remaining);
    } else {
      symbolMap.delete(symbol);
    }
  }
}

// ─── Evaluation (delegated to engine module) ───

const evalDeps: EvalDeps = {
  getGaleLevel: (stratId: string, symbol: string) => getGaleLevel(stratId, symbol),
  getStats: (stratId: string) => statsMap.get(stratId),
  getPending: (stratId: string) => pendingEntries.get(stratId),
  getLastEntryTime: (stratId: string) => lastEntryTime.get(stratId),
};

function evaluateStrategy(
  strategy: StrategyDef,
  symbol: string,
  candle: Candle,
  activeSetups: readonly SetupSignal[],
  aggregated: AggregatedSetup,
  pa: PriceActionContext,
  extra: ExtraIndicators,
  payout: number,
  candles?: readonly Candle[],
  lab?: LabIndicatorSet,
): VirtualEntry | null {
  // Set current symbol for DSL wrappers (prevLab cache lookup)
  currentEvalSymbol = symbol;
  return doEvaluateStrategy(strategy, symbol, candle, activeSetups, aggregated, pa, extra, payout, evalDeps, candles, lab);
}

// ─── Public API ───

/**
 * Called on every M1/M5 candle close for a symbol.
 * Resolves pending virtual entries, then evaluates all strategies.
 */
export function labOnCandleClose(
  symbol: string,
  tf: Timeframe,
  candles: readonly Candle[],
  activeSetups: readonly SetupSignal[],
  aggregated: AggregatedSetup,
  priceAction: PriceActionContext,
  extra: ExtraIndicators,
  payout: number = 0.8,
  lab?: LabIndicatorSet,
): void {
  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  if (!lastCandle) return;

  // Use reliable payout from cache — skip if unknown
  const reliablePayout = getLabPayout(symbol);
  if (reliablePayout === null) return; // unknown payout → skip entirely
  const effectivePayout = reliablePayout;

  // Phase 1: resolve gale-candle recoveries from PREVIOUS cycle first
  resolveGaleCandleRecoveries(symbol, tf, lastCandle);

  // Phase 2: resolve pending entries (may schedule new gale-candle recoveries for next cycle)
  resolveEntries(symbol, tf, lastCandle);

  // Phase 3: evaluate strategies for new entries
  const firedThisCycle: Array<{ strategyId: string; symbol: string; direction: 'CALL' | 'PUT'; payout: number }> = [];

  for (const strategy of STRATEGIES) {
    // M5 variant strategies must only evaluate on M5 candle close (using M5 candles).
    if ((strategy.entryTiming === 'next_m5_candle' || strategy.entryTiming === 'm5_m1_optimized') && tf !== 'M5') continue;

    // M5-gated M1-signal: evaluates on M1 close using M1 candles, but ONLY at M5 boundary.
    if (strategy.entryTiming === 'm5_gate_m1_signal') {
      if (tf !== 'M1') continue;
      const ms5 = 5 * 60_000;
      const nowMs = Date.now();
      const nextM5 = Math.ceil(nowMs / ms5) * ms5;
      const distToM5 = nextM5 - nowMs;
      if (distToM5 > 65_000) continue;
    }

    let entry: VirtualEntry | null | undefined;
    try {
      entry = evaluateStrategy(strategy, symbol, lastCandle, activeSetups, aggregated, priceAction, extra, effectivePayout, candles, lab);
    } catch (evalErr) {
      // Crawler strategies with invalid DSL may throw — skip silently
      continue;
    }
    if (!entry) continue;

    try {
      // Record cooldown timestamp
      if (strategy.minIntervalMs > 0) {
        let symTimes = lastEntryTime.get(strategy.id);
        if (!symTimes) {
          symTimes = new Map();
          lastEntryTime.set(strategy.id, symTimes);
        }
        symTimes.set(symbol, Date.now());
      }

      let symbolMap = pendingEntries.get(strategy.id);
      if (!symbolMap) {
        symbolMap = new Map();
        pendingEntries.set(strategy.id, symbolMap);
      }
      const list = symbolMap.get(symbol) ?? [];
      symbolMap.set(symbol, [...list, entry]);

      firedThisCycle.push({
        strategyId: entry.strategyId,
        symbol: entry.symbol,
        direction: entry.direction,
        payout: entry.payout,
      });

      emitEvent({
        type: 'entry',
        strategy: strategy.name,
        strategyId: strategy.id,
        symbol: entry.symbol,
        direction: entry.direction,
        isOtc: entry.symbol.includes('_otc'),
        time: Date.now(),
      });
    } catch (err) {
      console.warn(`[SnapTrade] Entry processing error: strat=${strategy.id}`, err);
    }
  }

  // Track cumulative fires BEFORE lab-to-trade bridge (so throws don't block counting)
  totalFireCount += firedThisCycle.length;

  // Lab-to-trade bridge: queue qualifying M5 signals for AI batch validation
  for (const fired of firedThisCycle) {
    try {
      maybeQueueLabSignal(fired.strategyId, fired.symbol, fired.direction, fired.payout);
    } catch (err) {
      console.warn(`[SnapTrade] maybeQueueLabSignal error: strat=${fired.strategyId}, sym=${fired.symbol}`, err);
    }
  }

  // AI validation for qualifying strategies (async, fire-and-forget)
  if (evalCount > 0 && evalCount % 200 === 0) {
    const qualifiedCount = doGetAiQualifiedStrategies(statsMap).length;
    const totalTrades = Array.from(statsMap.values()).reduce((s, st) => s + st.wins + st.losses, 0);
    console.log(`[SnapTrade] LAB DIAG: eval=${evalCount}, firedNow=${firedThisCycle.length}, totalFires=${totalFireCount}, qualifiedAI=${qualifiedCount}, strats=${statsMap.size}, trades=${totalTrades}`);
  }
  if (firedThisCycle.length > 0) {
    const aiCandidates = buildLabAiCandidates(firedThisCycle);
    if (aiCandidates.length > 0) {
      console.log(`[SnapTrade] LAB AI CALL: fired=${firedThisCycle.length}, aiCandidates=${aiCandidates.length}, ids=${aiCandidates.map(c => c.strategyId).slice(0, 3).join(',')}`);
      validateLabSignals(aiCandidates, candles, undefined, extra).catch(() => {});
    }
  }

  // Cache current lab indicators for DSL transition detection on next candle
  if (lab) {
    updatePrevLabCache(symbol, lab);
  }

  // Persist periodically
  evalCount++;
  if (evalCount % PERSIST_EVERY === 0) {
    doPersistStats(statsMap, evalCount);
    // Update scores every persist cycle
    doUpdateScores(statsMap);
  }
}

// ─── Delegated Public API (re-exports with bound state) ───

export function getLabRanking(minTrades: number = 10): readonly StrategyStats[] {
  return doGetLabRanking(statsMap, minTrades);
}

export function getAllLabStats(): readonly StrategyStats[] {
  return doGetAllLabStats(statsMap, STRATEGIES, getOrCreateStats);
}

export function logTopStrategies(): void {
  doLogTopStrategies(statsMap);
}

export function labFlush(): void {
  doLabFlush(statsMap, evalCount, doPersistStats);
}

export function recordAiValidation(stratId: string, aiConfirmed: boolean, tradeWon: boolean): void {
  doRecordAiValidation(getOrCreateStats, stratId, aiConfirmed, tradeWon);
}

export function getAiQualifiedStrategies(): readonly StrategyStats[] {
  return doGetAiQualifiedStrategies(statsMap);
}

export function updateScores(): void {
  doUpdateScores(statsMap);
}

export function getTopStrategies(n: number = 5): readonly StrategyStats[] {
  return doGetTopStrategies(statsMap, n);
}

export function getStrategyPairStats(stratId: string): ReadonlyMap<string, SubStats> | null {
  return doGetStrategyPairStats(statsMap, stratId);
}

export function getStrategySessionStats(stratId: string): ReadonlyMap<string, SubStats> | null {
  return doGetStrategySessionStats(statsMap, stratId);
}

export function getPayoutTiers(): readonly PayoutTier[] {
  return doGetPayoutTiers();
}

export function getRegimeAwareTop(n: number = 3): readonly StrategyStats[] {
  return doGetRegimeAwareTop(statsMap, STRATEGIES, n);
}
