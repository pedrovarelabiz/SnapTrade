/**
 * Strategy Pruner — Graduated pruning system with statistical significance.
 *
 * Uses Wilson score intervals for confidence bounds on win rate.
 * Graduated states: healthy → warning → probation → disabled → removed.
 * Supports pair-specific pruning and time-decay weighting.
 *
 * Called from updateScores() in strategy-lab.ts on every persist cycle.
 */

import type { StrategyStats } from './strategy-lab';

// ─── Types ───

export type PruneState = 'healthy' | 'warning' | 'probation' | 'disabled' | 'removed';

export interface PruneResult {
  readonly strategyId: string;
  readonly state: PruneState;
  readonly reason: string;
  readonly wilsonLower: number;  // Lower bound of 95% CI for WR
  readonly wilsonUpper: number;  // Upper bound
  readonly breakEven: number;    // Break-even WR for current payout tier
  readonly recentWR: number;     // WR of last 50 trades (time-decay proxy)
}

// ─── Configuration ───

/** Minimum trades before any pruning decision. */
const MIN_TRADES_FOR_PRUNING = 50;

/** Minimum trades before strategy is considered statistically significant. */
const MIN_TRADES_SIGNIFICANT = 100;

/** Consecutive warning cycles before promotion to probation. */
const WARNING_CYCLES_TO_PROBATION = 3;

/** Consecutive probation cycles before auto-disable. */
const PROBATION_CYCLES_TO_DISABLE = 3;

/** Break-even WR for OTC 92% payout: 1/(1+0.92) = 0.521. Using 0.522 for margin. */
const CONSERVATIVE_BREAK_EVEN = 0.522;

/** How far below break-even to trigger immediate disable (skip graduated). */
const EMERGENCY_DISABLE_MARGIN = 0.15; // 15% below BE (was 10% — too aggressive for OTC with 80-92% payouts)

/** Recovery check: re-evaluate disabled strategies every N scoring cycles. */
const RECOVERY_CHECK_INTERVAL = 20;

// ─── Wilson Score Interval ───

/**
 * Wilson score interval — computes lower and upper bounds of a 95% confidence
 * interval for a proportion, accounting for sample size.
 *
 * Much more reliable than raw WR for small samples:
 * - 3W/0L raw = 100%, Wilson lower = 43.8%
 * - 50W/50L raw = 50%, Wilson lower = 40.4%
 * - 500W/500L raw = 50%, Wilson lower = 46.8%
 */
function wilsonScore(wins: number, total: number, z = 1.96): { lower: number; upper: number } {
  if (total === 0) return { lower: 0, upper: 1 };

  const phat = wins / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;

  const centre = phat + z2 / (2 * total);
  const spread = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);

  return {
    lower: Math.max(0, (centre - spread) / denom),
    upper: Math.min(1, (centre + spread) / denom),
  };
}

// ─── Pruning State Machine ───

// Per-strategy pruning state persistence (in-memory, resets on extension reload)
const pruneStates = new Map<string, {
  state: PruneState;
  warningCycles: number;
  probationCycles: number;
  disabledAtCycle: number;
  totalCycles: number;
}>();

function getOrCreatePruneState(stratId: string) {
  let ps = pruneStates.get(stratId);
  if (!ps) {
    ps = { state: 'healthy', warningCycles: 0, probationCycles: 0, disabledAtCycle: 0, totalCycles: 0 };
    pruneStates.set(stratId, ps);
  }
  return ps;
}

// ─── Recent WR (Time-Decay Proxy) ───

function computeRecentWR(results: readonly ('W' | 'L')[], window = 50): number {
  const recent = results.slice(-window);
  if (recent.length < 10) return -1; // Not enough data
  const wins = recent.filter(r => r === 'W').length;
  return wins / recent.length;
}

// ─── Core Pruning Logic ───

/**
 * Evaluate a single strategy and return its prune state.
 * Does NOT mutate the strategy — caller decides what to do.
 */
export function evaluatePruning(stats: StrategyStats, breakEven = CONSERVATIVE_BREAK_EVEN): PruneResult {
  // Use gated* when it has enough samples; fall back to candidateGated* when regime is blocked.
  const gatedTotal = stats.gatedWins + stats.gatedLosses;
  const useGated = gatedTotal >= 20;
  const total = useGated ? gatedTotal : (stats.candidateGatedWins + stats.candidateGatedLosses);
  const wins = useGated ? stats.gatedWins : stats.candidateGatedWins;
  const ps = getOrCreatePruneState(stats.id);
  ps.totalCycles++;

  const wilson = wilsonScore(wins, total);
  const recentWR = computeRecentWR(stats.recentResults);

  // Not enough data — always healthy
  if (total < MIN_TRADES_FOR_PRUNING) {
    ps.state = 'healthy';
    ps.warningCycles = 0;
    ps.probationCycles = 0;
    return {
      strategyId: stats.id, state: 'healthy',
      reason: `Insufficient data (${total}/${MIN_TRADES_FOR_PRUNING} trades)`,
      wilsonLower: wilson.lower, wilsonUpper: wilson.upper,
      breakEven, recentWR,
    };
  }

  // Emergency disable: Wilson lower bound far below break-even with significant sample
  if (total >= MIN_TRADES_SIGNIFICANT && wilson.lower < breakEven - EMERGENCY_DISABLE_MARGIN) {
    ps.state = 'disabled';
    ps.disabledAtCycle = ps.totalCycles;
    return {
      strategyId: stats.id, state: 'disabled',
      reason: `Emergency: Wilson lower ${(wilson.lower * 100).toFixed(1)}% far below BE ${(breakEven * 100).toFixed(1)}%`,
      wilsonLower: wilson.lower, wilsonUpper: wilson.upper,
      breakEven, recentWR,
    };
  }

  // Check if strategy is performing well
  const isAboveBE = wilson.lower >= breakEven;
  const isRecentlyGood = recentWR >= 0 && recentWR >= breakEven;
  const isLosingStreak = stats.worstStreak >= 8;

  if (isAboveBE && !isLosingStreak) {
    // Healthy — reset warning/probation counters
    ps.state = 'healthy';
    ps.warningCycles = 0;
    ps.probationCycles = 0;
    return {
      strategyId: stats.id, state: 'healthy',
      reason: `Wilson lower ${(wilson.lower * 100).toFixed(1)}% above BE ${(breakEven * 100).toFixed(1)}%`,
      wilsonLower: wilson.lower, wilsonUpper: wilson.upper,
      breakEven, recentWR,
    };
  }

  // Below break-even or on losing streak
  if (ps.state === 'healthy' || ps.state === 'warning') {
    ps.warningCycles++;
    if (ps.warningCycles >= WARNING_CYCLES_TO_PROBATION) {
      ps.state = 'probation';
      ps.probationCycles = 0;
      return {
        strategyId: stats.id, state: 'probation',
        reason: `${ps.warningCycles} warning cycles, promoted to probation`,
        wilsonLower: wilson.lower, wilsonUpper: wilson.upper,
        breakEven, recentWR,
      };
    }
    ps.state = 'warning';
    return {
      strategyId: stats.id, state: 'warning',
      reason: `Wilson lower ${(wilson.lower * 100).toFixed(1)}% below BE (cycle ${ps.warningCycles}/${WARNING_CYCLES_TO_PROBATION})`,
      wilsonLower: wilson.lower, wilsonUpper: wilson.upper,
      breakEven, recentWR,
    };
  }

  if (ps.state === 'probation') {
    // Check if recovering
    if (isRecentlyGood && isAboveBE) {
      ps.state = 'warning';
      ps.probationCycles = 0;
      return {
        strategyId: stats.id, state: 'warning',
        reason: 'Recovering from probation — recent WR improved',
        wilsonLower: wilson.lower, wilsonUpper: wilson.upper,
        breakEven, recentWR,
      };
    }

    ps.probationCycles++;
    if (ps.probationCycles >= PROBATION_CYCLES_TO_DISABLE) {
      ps.state = 'disabled';
      ps.disabledAtCycle = ps.totalCycles;
      return {
        strategyId: stats.id, state: 'disabled',
        reason: `${ps.probationCycles} probation cycles, auto-disabled`,
        wilsonLower: wilson.lower, wilsonUpper: wilson.upper,
        breakEven, recentWR,
      };
    }
    return {
      strategyId: stats.id, state: 'probation',
      reason: `Probation cycle ${ps.probationCycles}/${PROBATION_CYCLES_TO_DISABLE}`,
      wilsonLower: wilson.lower, wilsonUpper: wilson.upper,
      breakEven, recentWR,
    };
  }

  // Disabled — check for recovery periodically
  if (ps.state === 'disabled') {
    const cyclesSinceDisable = ps.totalCycles - ps.disabledAtCycle;
    if (cyclesSinceDisable > 0 && cyclesSinceDisable % RECOVERY_CHECK_INTERVAL === 0) {
      // Recovery: if recent WR is above break-even, give another chance
      if (isRecentlyGood) {
        ps.state = 'probation';
        ps.probationCycles = 0;
        return {
          strategyId: stats.id, state: 'probation',
          reason: `Recovery check: recent WR ${(recentWR * 100).toFixed(1)}% above BE, re-enabled on probation`,
          wilsonLower: wilson.lower, wilsonUpper: wilson.upper,
          breakEven, recentWR,
        };
      }
    }
    return {
      strategyId: stats.id, state: 'disabled',
      reason: `Disabled (next recovery check in ${RECOVERY_CHECK_INTERVAL - (cyclesSinceDisable % RECOVERY_CHECK_INTERVAL)} cycles)`,
      wilsonLower: wilson.lower, wilsonUpper: wilson.upper,
      breakEven, recentWR,
    };
  }

  return {
    strategyId: stats.id, state: ps.state,
    reason: 'Unknown state',
    wilsonLower: wilson.lower, wilsonUpper: wilson.upper,
    breakEven, recentWR,
  };
}

/**
 * Run pruning evaluation on all strategies. Returns results for logging/monitoring.
 * Call this from updateScores() in strategy-lab.ts.
 */
export function runPruningCycle(
  allStats: readonly StrategyStats[],
  applyDisable: (stratId: string) => void,
  applyEnable: (stratId: string) => void,
): readonly PruneResult[] {
  const results: PruneResult[] = [];

  for (const stats of allStats) {
    const result = evaluatePruning(stats);
    results.push(result);

    // Apply state changes
    if (result.state === 'disabled' && !stats.disabled) {
      applyDisable(stats.id);
    } else if ((result.state === 'healthy' || result.state === 'warning' || result.state === 'probation') && stats.disabled) {
      applyEnable(stats.id);
    }
  }

  // Log summary
  const counts = { healthy: 0, warning: 0, probation: 0, disabled: 0, removed: 0 };
  for (const r of results) {
    counts[r.state]++;
  }
  console.log(`[SnapTrade] Pruner: ${counts.healthy}H ${counts.warning}W ${counts.probation}P ${counts.disabled}D`);

  return results;
}

/**
 * Get the current prune state for a strategy (for dashboard display).
 */
export function getPruneState(stratId: string): PruneState {
  return pruneStates.get(stratId)?.state ?? 'healthy';
}

/**
 * Get Wilson score bounds for a strategy (for dashboard display).
 */
export function getWilsonBounds(wins: number, total: number): { lower: number; upper: number } {
  return wilsonScore(wins, total);
}
