/**
 * Strategy Lab — Query/reporting functions.
 *
 * All functions receive state (statsMap, STRATEGIES) as parameters
 * to keep this module free of mutable module-level state.
 */

import type { StrategyStats, StrategyDef, PayoutTier, SubStats } from './types';
import { PAYOUT_TIERS } from './types';
import { getRegimeSnapshot, regimeNotifyStrategyDisabled } from '../regime-detector';
import { runPruningCycle } from '../strategy-pruner';

// ─── Ranking & Querying ───

/**
 * Get strategy stats sorted by win rate (min signals for ranking).
 */
export function getLabRanking(
  statsMap: ReadonlyMap<string, StrategyStats>,
  minTrades: number = 10,
): readonly StrategyStats[] {
  return Array.from(statsMap.values())
    .filter(s => s.wins + s.losses >= minTrades)
    .sort((a, b) => {
      const rateA = a.wins / (a.wins + a.losses);
      const rateB = b.wins / (b.wins + b.losses);
      return rateB - rateA;
    });
}

/**
 * Get all strategy stats (including those with few trades).
 */
export function getAllLabStats(
  statsMap: Map<string, StrategyStats>,
  strategies: readonly StrategyDef[],
  getOrCreateStats: (stratId: string) => StrategyStats,
): readonly StrategyStats[] {
  // Ensure all strategies have stats entries
  for (const def of strategies) {
    getOrCreateStats(def.id);
  }
  return Array.from(statsMap.values());
}

/**
 * Log top 5 and worst 3 strategies to console.
 */
export function logTopStrategies(statsMap: ReadonlyMap<string, StrategyStats>): void {
  const all = Array.from(statsMap.values()).filter(s => s.wins + s.losses > 0);
  if (all.length === 0) return;

  const sorted = all
    .map(s => {
      const total = s.wins + s.losses;
      const rate = total > 0 ? Math.round((s.wins / total) * 100) : 0;
      return { ...s, total, rate };
    })
    .sort((a, b) => b.rate - a.rate);

  const top5 = sorted.slice(0, 5);
  const worst3 = sorted.slice(-3).reverse();

  const format = (s: typeof sorted[0]) => {
    const recent = s.recentResults.slice(-10).join('');
    return `  ${s.name}: ${s.rate}% (${s.wins}W/${s.losses}L) [${recent}]`;
  };

  const topLines = top5.map(format);
  const worstLines = worst3.map(format);

  console.log(
    `[SnapTrade] STRATEGY LAB (${all.length} active):\n` +
    `  TOP:\n${topLines.join('\n')}\n` +
    `  WORST:\n${worstLines.join('\n')}`
  );
}

// ─── AI Validation ───

/** Record AI validation result for a strategy trade. */
export function recordAiValidation(
  getOrCreateStats: (stratId: string) => StrategyStats,
  stratId: string,
  aiConfirmed: boolean,
  tradeWon: boolean,
): void {
  const stats = getOrCreateStats(stratId);
  if (aiConfirmed) {
    if (tradeWon) stats.aiValidatedWins++;
    else stats.aiValidatedLosses++;
  } else {
    if (tradeWon) stats.aiRejectedWins++;
    else stats.aiRejectedLosses++;
  }
}

/** Get strategies qualifying for AI validation (20+ trades, not disabled). */
export function getAiQualifiedStrategies(
  statsMap: ReadonlyMap<string, StrategyStats>,
): readonly StrategyStats[] {
  return Array.from(statsMap.values()).filter(s => {
    // Any active strategy with 15+ trades qualifies for AI validation (lowered from 20)
    // AI gate uses fail-open (trade proceeds if AI doesn't respond in 15s)
    const total = s.wins + s.losses;
    return total >= 15 && !s.disabled;
  });
}

// ─── Scoring & Adaptive Selection ───

/** Compute strategy score (higher = better). */
export function computeScore(s: StrategyStats): number {
  // Use gated* when it has enough samples; fall back to candidateGated* when regime is blocked.
  const gatedTotal = s.gatedWins + s.gatedLosses;
  const useGated = gatedTotal >= 20;
  const total = useGated ? gatedTotal : (s.candidateGatedWins + s.candidateGatedLosses);
  const wins = useGated ? s.gatedWins : s.candidateGatedWins;
  if (total < 20) return 0;

  const wr = wins / total;
  // Consistency: lower stddev of recent results = better
  const recent = s.recentResults.slice(-50);
  const recentWins = recent.filter(r => r === 'W').length;
  const recentWR = recent.length > 0 ? recentWins / recent.length : 0;
  const consistency = 1 - Math.abs(wr - recentWR); // 0-1, higher = more consistent

  // Volume bonus (log scale)
  const volumeScore = Math.min(1, Math.log10(total) / 3); // 1000 trades = 1.0

  // Drawdown penalty
  const ddPenalty = s.maxDrawdown > 0 ? Math.min(1, s.maxDrawdown / Math.max(s.totalRisked, 1)) : 0;

  return wr * 0.4 + consistency * 0.3 + volumeScore * 0.2 - ddPenalty * 0.1;
}

/** Update scores for all strategies. Run graduated pruning. */
export function updateScores(statsMap: Map<string, StrategyStats>): void {
  for (const stats of statsMap.values()) {
    stats.score = computeScore(stats);
  }

  // Graduated pruning replaces the old simple auto-disable
  const allStats = Array.from(statsMap.values());
  runPruningCycle(
    allStats,
    (stratId) => {
      const s = statsMap.get(stratId);
      if (s) s.disabled = true;
      regimeNotifyStrategyDisabled(stratId); // purge from regime rolling WR
    },
    (stratId) => { const s = statsMap.get(stratId); if (s) s.disabled = false; },
  );
}

/** Get top N strategies by score. */
export function getTopStrategies(
  statsMap: ReadonlyMap<string, StrategyStats>,
  n: number = 5,
): readonly StrategyStats[] {
  return Array.from(statsMap.values())
    .filter(s => !s.disabled && s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/** Get per-pair stats for a strategy. */
export function getStrategyPairStats(
  statsMap: ReadonlyMap<string, StrategyStats>,
  stratId: string,
): ReadonlyMap<string, SubStats> | null {
  return statsMap.get(stratId)?.pairStats ?? null;
}

/** Get session stats for a strategy. */
export function getStrategySessionStats(
  statsMap: ReadonlyMap<string, StrategyStats>,
  stratId: string,
): ReadonlyMap<string, SubStats> | null {
  return statsMap.get(stratId)?.sessionStats ?? null;
}

/** Get payout tiers configuration. */
export function getPayoutTiers(): readonly PayoutTier[] {
  return PAYOUT_TIERS;
}

/** Get regime-aware top strategies. Boosts score based on current regime. */
export function getRegimeAwareTop(
  statsMap: ReadonlyMap<string, StrategyStats>,
  strategies: readonly StrategyDef[],
  n: number = 3,
): readonly StrategyStats[] {
  const snapshot = getRegimeSnapshot();
  const regimeStyle = !snapshot?.tradingAllowed ? 'blocked' : 'stable';

  return Array.from(statsMap.values())
    .filter(s => !s.disabled && s.score > 0)
    .map(s => {
      const def = strategies.find(d => d.id === s.id);
      let boost = 0;
      if (regimeStyle === 'stable') {
        // Boost trend strategies in stable regime
        if (def?.requireADXTrend || def?.regimeMode === 'trend') boost = 0.05;
      }
      return { stats: s, adjustedScore: s.score + boost };
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore)
    .slice(0, n)
    .map(x => x.stats);
}

/** Force persist stats to chrome.storage.local. */
export function labFlush(
  statsMap: ReadonlyMap<string, StrategyStats>,
  evalCount: number,
  doPersist: (statsMap: ReadonlyMap<string, StrategyStats>, evalCount: number) => void,
): void {
  doPersist(statsMap, evalCount);
}
