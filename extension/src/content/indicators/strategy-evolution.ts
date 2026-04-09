/**
 * Strategy Evolution Engine — Phase 3 orchestrator.
 *
 * Coordinates the evolution cycle:
 * 1. Analyze all strategies (ranking, Sharpe, drawdown)
 * 2. Mutate top performers (threshold shifts, timing variants)
 * 3. Crossbreed complementary top strategies (AND merge, confluence)
 * 4. Inject offspring via strategy-loader
 * 5. Prune old evolved strategies that underperform
 *
 * Cycle runs weekly (or on-demand). Cap: 300 total strategies, 30 evolved max.
 */

import { getAllLabStats } from './strategy-lab';
import { getActiveStrategies, addStrategy, removeStrategy } from './strategy-loader';
import { analyzeStrategies, formatAnalysisSummary, type AnalysisResult } from './strategy-analyzer';
import { generateMutations, formatMutationSummary } from './strategy-mutator';
import { runCrossbreeding, formatCrossbreedSummary } from './strategy-crossbreeder';
import { evaluatePruning } from './strategy-pruner';
import { generateHypotheses } from './strategy-hypothesis';
import { backtestFilter } from './strategy-backtest';

// ─── Configuration ───

/** Maximum total strategies (builtin + crawler + evolved). */
const MAX_TOTAL_STRATEGIES = 300;

/** Maximum evolved strategies at any time. */
const MAX_EVOLVED = 30;

/** Minimum trades before an evolved strategy can be pruned. */
const MIN_EVOLVED_TRADES_TO_PRUNE = 30;

/** New strategies injected per cycle. */
const MAX_NEW_PER_CYCLE = 10;

/** How often to run (ms). Default: 1 day (was 7 days — accelerated to generate data faster). */
const CYCLE_INTERVAL_MS = 1 * 24 * 60 * 60 * 1000;

// ─── State (persisted to chrome.storage) ───

let lastCycleAt = 0;
let cycleCount = 0;

interface EvolutionPersisted {
  readonly lastCycleAt: number;
  readonly cycleCount: number;
}

async function loadEvolutionState(): Promise<void> {
  try {
    const data = await chrome.storage.local.get('evolutionState');
    const state = data.evolutionState as EvolutionPersisted | undefined;
    if (state) {
      lastCycleAt = state.lastCycleAt;
      cycleCount = state.cycleCount;
      console.log(`[Evolution] Restored state: cycle #${cycleCount}, last run ${new Date(lastCycleAt).toISOString()}`);
    }
  } catch { /* first run */ }
}

function saveEvolutionState(): void {
  const state: EvolutionPersisted = { lastCycleAt, cycleCount };
  chrome.storage.local.set({ evolutionState: state }).catch(() => {});
}

// ─── Evolution Cycle ───

export interface EvolutionCycleResult {
  readonly cycleNumber: number;
  readonly timestamp: number;
  readonly analysis: AnalysisResult;
  readonly mutationsGenerated: number;
  readonly crossbreedsGenerated: number;
  readonly injected: number;
  readonly pruned: number;
  readonly totalStrategies: number;
  readonly evolvedCount: number;
}

/**
 * Run a full evolution cycle.
 * Safe to call repeatedly — will skip if not enough time has passed.
 */
export async function runEvolutionCycle(force = false): Promise<EvolutionCycleResult | null> {
  const now = Date.now();

  // Check cooldown (unless forced)
  if (!force && lastCycleAt > 0 && (now - lastCycleAt) < CYCLE_INTERVAL_MS) {
    return null;
  }

  console.log('[Evolution] Starting cycle...');
  lastCycleAt = now;
  cycleCount++;

  const allStats = getAllLabStats();
  const allDefs = getActiveStrategies();

  // ─── Phase 1: Analyze ───
  const analysis = analyzeStrategies(allStats);
  console.log('[Evolution]', formatAnalysisSummary(analysis));

  // ─── Phase 2: Count existing evolved ───
  const evolvedDefs = allDefs.filter(d => d.source === 'evolved');
  let evolvedCount = evolvedDefs.length;

  // ─── Phase 3: Prune underperforming evolved strategies ───
  let pruned = 0;
  const evolvedStats = allStats.filter(
    s => evolvedDefs.some(d => d.id === s.id),
  );

  for (const stats of evolvedStats) {
    const total = stats.gatedWins + stats.gatedLosses;
    if (total < MIN_EVOLVED_TRADES_TO_PRUNE) continue;

    const pruneResult = evaluatePruning(stats);
    if (pruneResult.state === 'disabled' || pruneResult.state === 'removed') {
      if (removeStrategy(stats.id)) {
        pruned++;
        evolvedCount--;
        console.log(`[Evolution] Pruned evolved: ${stats.id} (WR=${((stats.gatedWins / total) * 100).toFixed(1)}%)`);
      }
    }
  }

  // ─── Phase 4: Generate new strategies ───
  const budgetRemaining = Math.min(
    MAX_NEW_PER_CYCLE,
    MAX_EVOLVED - evolvedCount,
    MAX_TOTAL_STRATEGIES - allDefs.length + pruned,
  );

  if (budgetRemaining <= 0) {
    console.log('[Evolution] No budget for new strategies');
    return buildResult(analysis, 0, 0, 0, pruned, allDefs.length - pruned, evolvedCount);
  }

  // Mutations
  const mutations = generateMutations(analysis.mutationCandidates, allDefs);
  console.log('[Evolution]', formatMutationSummary(mutations));

  // Crossbreeds
  const crossbreeds = runCrossbreeding(analysis.crossbreedPairs, allDefs);
  console.log('[Evolution]', formatCrossbreedSummary(crossbreeds));

  // ─── Phase 5: Backtest + Inject (respect budget) ───
  const allNewDefs = [
    ...mutations.flatMap(m => m.mutations),
    ...crossbreeds.flatMap(c => c.offspring),
  ];

  // Quality gate: backtest against historical candles before injecting
  const { passed: backtestPassed } = backtestFilter(allNewDefs);
  console.log(`[Evolution] Backtest: ${backtestPassed.length}/${allNewDefs.length} passed`);

  let injected = 0;
  for (const def of backtestPassed) {
    if (injected >= budgetRemaining) break;

    if (addStrategy(def)) {
      injected++;
      console.log(`[Evolution] Injected: ${def.id}`);
    }
  }

  // ─── Phase 6: AI Hypothesis (Phase 3b) ───
  const hypothesisBudget = Math.max(0, budgetRemaining - injected);
  let hypothesesInjected = 0;
  if (hypothesisBudget > 0) {
    try {
      hypothesesInjected = await generateHypotheses(analysis, hypothesisBudget);
      injected += hypothesesInjected;
    } catch (err) {
      console.error('[Evolution] Hypothesis error:', String(err).substring(0, 100));
    }
  }

  const totalAfter = allDefs.length - pruned + injected;
  const evolvedAfter = evolvedCount + injected;

  console.log(
    `[Evolution] Cycle #${cycleCount} complete: ` +
    `${injected} injected (${hypothesesInjected} hypotheses), ${pruned} pruned, ` +
    `${totalAfter} total (${evolvedAfter} evolved)`,
  );

  saveEvolutionState();

  return buildResult(
    analysis,
    mutations.reduce((s, m) => s + m.mutations.length, 0),
    crossbreeds.reduce((s, c) => s + c.offspring.length, 0),
    injected,
    pruned,
    totalAfter,
    evolvedAfter,
  );
}

function buildResult(
  analysis: AnalysisResult,
  mutationsGenerated: number,
  crossbreedsGenerated: number,
  injected: number,
  pruned: number,
  totalStrategies: number,
  evolvedCount: number,
): EvolutionCycleResult {
  return {
    cycleNumber: cycleCount,
    timestamp: Date.now(),
    analysis,
    mutationsGenerated,
    crossbreedsGenerated,
    injected,
    pruned,
    totalStrategies,
    evolvedCount,
  };
}

// ─── Scheduling ───

let evolutionTimer: ReturnType<typeof setInterval> | null = null;
let warmupTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Start the weekly evolution cycle.
 * First cycle runs after a 1-hour warmup (to accumulate fresh data).
 */
export function startEvolutionScheduler(): void {
  if (evolutionTimer) return;

  console.log('[Evolution] Scheduler started (weekly cycle)');

  // Restore persisted state before scheduling
  loadEvolutionState().then(() => {
    // Check if a cycle is overdue (e.g., Chrome was down for days)
    const timeSinceLast = Date.now() - lastCycleAt;
    if (lastCycleAt > 0 && timeSinceLast >= CYCLE_INTERVAL_MS) {
      console.log('[Evolution] Overdue cycle detected — running now');
      runEvolutionCycle(true);
      return;
    }
  }).catch(() => {});

  // First cycle after 10 min warmup (was 60 min — accelerated)
  warmupTimer = setTimeout(() => {
    warmupTimer = null;
    runEvolutionCycle(true);
  }, 10 * 60 * 1000);

  // Weekly cycle
  evolutionTimer = setInterval(() => {
    runEvolutionCycle();
  }, CYCLE_INTERVAL_MS);
}

/**
 * Stop the evolution scheduler.
 */
export function stopEvolutionScheduler(): void {
  if (warmupTimer) { clearTimeout(warmupTimer); warmupTimer = null; }
  if (evolutionTimer) {
    clearInterval(evolutionTimer);
    evolutionTimer = null;
    console.log('[Evolution] Scheduler stopped');
  }
}

/**
 * Get current evolution state for monitoring.
 */
export function getEvolutionState(): {
  cycleCount: number;
  lastCycleAt: number;
  nextCycleIn: number;
  isRunning: boolean;
} {
  return {
    cycleCount,
    lastCycleAt,
    nextCycleIn: lastCycleAt > 0
      ? Math.max(0, CYCLE_INTERVAL_MS - (Date.now() - lastCycleAt))
      : 0,
    isRunning: evolutionTimer !== null,
  };
}
