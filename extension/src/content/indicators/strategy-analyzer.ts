/**
 * Strategy Analyzer — Phase 3 component.
 *
 * Ranks strategies by multiple performance dimensions:
 * Sharpe ratio, max drawdown, consistency, recent momentum.
 * Identifies top performers for mutation and crossbreeding.
 */

import type { StrategyStats } from './strategy-lab';
import { getRoutingTable } from './lab-to-trade';

// ─── Types ───

export interface PerformanceReport {
  readonly strategyId: string;
  readonly name: string;
  readonly totalTrades: number;
  readonly gatedTrades: number;
  readonly winRate: number;
  readonly gatedWinRate: number;
  readonly recentWinRate: number;     // last 50 trades
  readonly sharpeRatio: number;
  readonly maxDrawdown: number;
  readonly consistency: number;       // 0-1 (1 = perfectly consistent)
  readonly profitFactor: number;
  readonly flatPnl: number;
  readonly score: number;             // existing lab score
  readonly compositeRank: number;     // 0-1 combined ranking
  readonly tags: readonly string[];   // ['top_performer', 'consistent', 'recovering', etc.]
}

export interface PairInsight {
  readonly pair: string;
  readonly bestStrategyId: string;
  readonly bestWR: number;
  readonly totalTrades: number;
}

export interface AnalysisResult {
  readonly timestamp: number;
  readonly totalAnalyzed: number;
  readonly topPerformers: readonly PerformanceReport[];   // top 10 by composite rank
  readonly bottomPerformers: readonly PerformanceReport[]; // bottom 10
  readonly mutationCandidates: readonly PerformanceReport[]; // top performers suitable for mutation
  readonly crossbreedPairs: readonly [PerformanceReport, PerformanceReport][]; // pairs for crossbreeding
  readonly pairInsights: readonly PairInsight[]; // best strategy per pair
}

// ─── Configuration ───

const MIN_TRADES_FOR_ANALYSIS = 50;
const MIN_TRADES_FOR_MUTATION = 100;
const TOP_N = 10;
const CROSSBREED_PAIRS = 5;

// ─── Sharpe Ratio ───

/**
 * Simplified Sharpe ratio for binary options:
 * Returns = payout on win, -1 on loss.
 * Sharpe = mean(returns) / stddev(returns)
 */
function computeSharpeRatio(stats: StrategyStats): number {
  const total = stats.gatedWins + stats.gatedLosses;
  if (total < 10) return 0;

  const avgPayout = stats.gatedPayout / Math.max(stats.gatedWins, 1);
  const winRate = stats.gatedWins / total;

  // Expected return per trade
  const meanReturn = winRate * avgPayout - (1 - winRate);

  // Variance of returns (binary distribution)
  const winReturn = avgPayout;
  const lossReturn = -1;
  const variance = winRate * (winReturn - meanReturn) ** 2 +
    (1 - winRate) * (lossReturn - meanReturn) ** 2;

  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;

  return meanReturn / stdDev;
}

// ─── Consistency ───

/**
 * Measures how stable the win rate is over time.
 * Compares overall WR vs recent WR — lower divergence = higher consistency.
 */
function computeConsistency(stats: StrategyStats): number {
  const total = stats.gatedWins + stats.gatedLosses;
  if (total < 20) return 0;

  const overallWR = stats.gatedWins / total;
  const recent = stats.recentResults.slice(-50);
  const recentWR = recent.length > 0
    ? recent.filter(r => r === 'W').length / recent.length
    : overallWR;

  return Math.max(0, 1 - Math.abs(overallWR - recentWR) * 3);
}

// ─── Profit Factor ───

function computeProfitFactor(stats: StrategyStats): number {
  const grossProfit = stats.gatedPayout;
  const grossLoss = stats.gatedLosses; // 1.0 per loss
  if (grossLoss === 0) return grossProfit > 0 ? 10 : 0;
  return grossProfit / grossLoss;
}

// ─── Recent Win Rate ───

function computeRecentWR(stats: StrategyStats): number {
  const recent = stats.recentResults.slice(-50);
  if (recent.length === 0) return 0;
  return recent.filter(r => r === 'W').length / recent.length;
}

// ─── Composite Rank ───

/**
 * Multi-dimensional ranking: combines Sharpe, consistency, drawdown, volume.
 * Returns 0-1 where 1 = best.
 */
function computeCompositeRank(
  sharpe: number,
  consistency: number,
  maxDrawdown: number,
  totalRisked: number,
  gatedWR: number,
): number {
  // Normalize Sharpe to 0-1 range (typical range: -1 to 1)
  const sharpeFactor = Math.min(1, Math.max(0, (sharpe + 1) / 2));

  // Volume factor (log scale, 500 trades = 1.0)
  const totalTrades = totalRisked;
  const volumeFactor = Math.min(1, Math.log10(Math.max(totalTrades, 1)) / 2.7);

  // Drawdown factor (0 = bad, 1 = no drawdown). Normalize against 20-trade expected max DD.
  const ddFactor = Math.max(0, 1 - maxDrawdown / 20);

  // Win rate bonus (above break-even)
  const wrFactor = Math.min(1, Math.max(0, (gatedWR - 0.5) * 5));

  return sharpeFactor * 0.3 + consistency * 0.25 + ddFactor * 0.15 +
    volumeFactor * 0.15 + wrFactor * 0.15;
}

// ─── Tag Assignment ───

function assignTags(report: PerformanceReport): readonly string[] {
  const tags: string[] = [];

  if (report.compositeRank >= 0.7) tags.push('top_performer');
  if (report.consistency >= 0.8) tags.push('consistent');
  if (report.sharpeRatio >= 0.5) tags.push('high_sharpe');
  if (report.recentWinRate > report.winRate + 0.05) tags.push('improving');
  if (report.recentWinRate < report.winRate - 0.05) tags.push('declining');
  if (report.profitFactor >= 1.5) tags.push('profitable');
  if (report.maxDrawdown > report.totalTrades * 0.3) tags.push('high_drawdown');
  if (report.gatedWinRate >= 0.55) tags.push('above_breakeven');

  return tags;
}

// ─── Main Analysis ───

/**
 * Analyze all strategies and produce a performance report.
 * Called before mutation/crossbreeding to identify candidates.
 */
export function analyzeStrategies(allStats: readonly StrategyStats[]): AnalysisResult {
  const reports: PerformanceReport[] = [];

  for (const stats of allStats) {
    const total = stats.wins + stats.losses;
    const gatedTotal = stats.gatedWins + stats.gatedLosses;

    if (total < MIN_TRADES_FOR_ANALYSIS) continue;

    const sharpe = computeSharpeRatio(stats);
    const consistency = computeConsistency(stats);
    const profitFactor = computeProfitFactor(stats);
    const recentWR = computeRecentWR(stats);
    const gatedWR = gatedTotal > 0 ? stats.gatedWins / gatedTotal : 0;
    const compositeRank = computeCompositeRank(
      sharpe, consistency, stats.maxDrawdown, stats.totalRisked, gatedWR,
    );

    const report: PerformanceReport = {
      strategyId: stats.id,
      name: stats.name,
      totalTrades: total,
      gatedTrades: gatedTotal,
      winRate: total > 0 ? stats.wins / total : 0,
      gatedWinRate: gatedWR,
      recentWinRate: recentWR,
      sharpeRatio: sharpe,
      maxDrawdown: stats.maxDrawdown,
      consistency,
      profitFactor,
      flatPnl: stats.flatPnl,
      score: stats.score,
      compositeRank,
      tags: [],
    };

    // Assign tags (immutable: create new report with tags)
    const tagged: PerformanceReport = { ...report, tags: assignTags(report) };
    reports.push(tagged);
  }

  // Sort by composite rank
  const sorted = [...reports].sort((a, b) => b.compositeRank - a.compositeRank);

  const topPerformers = sorted.slice(0, TOP_N);
  const bottomPerformers = sorted.slice(-TOP_N).reverse();

  // Mutation candidates: top performers with enough trades
  const mutationCandidates = topPerformers.filter(
    r => r.totalTrades >= MIN_TRADES_FOR_MUTATION && r.gatedWinRate >= 0.53,
  );

  // Crossbreed pairs: pair top performers by complementary traits
  const crossbreedPairs = selectCrossbreedPairs(topPerformers);

  // Pair-specific insights: find best strategy per currency pair
  const pairInsights = computePairInsights(allStats);

  return {
    timestamp: Date.now(),
    totalAnalyzed: reports.length,
    topPerformers,
    bottomPerformers,
    mutationCandidates,
    crossbreedPairs,
    pairInsights,
  };
}

// ─── Pair-Specific Analysis ───

/**
 * Find the best-performing strategy for each currency pair.
 */
function computePairInsights(allStats: readonly StrategyStats[]): readonly PairInsight[] {
  const pairBest = new Map<string, { strategyId: string; wr: number; trades: number }>();

  // Primary source: routing table (already computed best-per-pair)
  const rt = getRoutingTable();
  for (const [pair, route] of rt) {
    pairBest.set(pair, { strategyId: route.strategyId, wr: route.pairWR / 100, trades: route.trades });
  }

  // Fallback: pairs not in routing table — local calculation
  for (const stats of allStats) {
    if (!stats.pairStats) continue;

    for (const [pair, pairStat] of stats.pairStats) {
      if (pairBest.has(pair)) continue; // already from routing table
      const total = pairStat.wins + pairStat.losses;
      if (total < 10) continue;

      const wr = pairStat.wins / total;
      const current = pairBest.get(pair);

      if (!current || wr > current.wr) {
        pairBest.set(pair, { strategyId: stats.id, wr, trades: total });
      }
    }
  }

  return Array.from(pairBest.entries())
    .map(([pair, best]) => ({
      pair,
      bestStrategyId: best.strategyId,
      bestWR: best.wr,
      totalTrades: best.trades,
    }))
    .sort((a, b) => b.bestWR - a.bestWR);
}

/**
 * Pair top strategies for crossbreeding.
 * Prefer pairing strategies with different indicator families.
 */
function selectCrossbreedPairs(
  top: readonly PerformanceReport[],
): readonly [PerformanceReport, PerformanceReport][] {
  if (top.length < 2) return [];

  const pairs: [PerformanceReport, PerformanceReport][] = [];
  const used = new Set<string>();

  for (let i = 0; i < top.length && pairs.length < CROSSBREED_PAIRS; i++) {
    if (used.has(top[i]!.strategyId)) continue;

    for (let j = i + 1; j < top.length; j++) {
      if (used.has(top[j]!.strategyId)) continue;

      // Don't pair variants of the same base strategy
      const baseA = top[i]!.strategyId.replace(/_m5$|_m5g$|_m5_m1opt$/, '');
      const baseB = top[j]!.strategyId.replace(/_m5$|_m5g$|_m5_m1opt$/, '');
      if (baseA === baseB) continue;

      pairs.push([top[i]!, top[j]!]);
      used.add(top[i]!.strategyId);
      used.add(top[j]!.strategyId);
      break;
    }
  }

  return pairs;
}

/**
 * Quick summary for logging.
 */
export function formatAnalysisSummary(result: AnalysisResult): string {
  const lines = [
    `Strategy Analysis: ${result.totalAnalyzed} analyzed`,
    `Top 5:`,
  ];

  for (const r of result.topPerformers.slice(0, 5)) {
    lines.push(
      `  ${r.strategyId}: WR=${(r.gatedWinRate * 100).toFixed(1)}% ` +
      `Sharpe=${r.sharpeRatio.toFixed(2)} ` +
      `DD=${r.maxDrawdown.toFixed(1)} ` +
      `[${r.tags.join(',')}]`,
    );
  }

  lines.push(`Mutation candidates: ${result.mutationCandidates.length}`);
  lines.push(`Crossbreed pairs: ${result.crossbreedPairs.length}`);

  return lines.join('\n');
}
