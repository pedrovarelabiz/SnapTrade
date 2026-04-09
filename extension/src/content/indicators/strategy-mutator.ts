/**
 * Strategy Mutator — Phase 3 component.
 *
 * Creates variations of top-performing strategies by adjusting DSL parameters:
 * - Threshold shifts (RSI 30→25, CCI 100→120)
 * - Period changes (RSI 14→12, EMA 21→18)
 * - Operator swaps (gte→gt, lt→lte)
 * - Entry timing changes (next_m1→next_m5, etc.)
 *
 * All mutations produce valid StrategyDefJSON objects injectable via strategy-loader.
 */

import type { DSLExpression, DSLOp, DSLValue, StrategyDefJSON } from './strategy-dsl';
import type { PerformanceReport } from './strategy-analyzer';
import type { EntryTiming } from './strategy-lab';

// ─── Types ───

export interface MutationResult {
  readonly original: PerformanceReport;
  readonly mutations: readonly StrategyDefJSON[];
  readonly mutationType: string;
}

// ─── Configuration ───

/** Max mutations per strategy per cycle. */
const MAX_MUTATIONS_PER_STRATEGY = 3;

/** Variation range for numeric thresholds (±percentage). */
const THRESHOLD_VARIATION = 0.15; // ±15%

/** Common indicator thresholds and their valid ranges. */
const THRESHOLD_RANGES: Record<string, { min: number; max: number }> = {
  'lab.rsi.value': { min: 5, max: 95 },
  'lab.cci.value': { min: -300, max: 300 },
  'lab.williamsR.value': { min: -100, max: 0 },
  'lab.stochastic.k': { min: 0, max: 100 },
  'lab.stochastic.d': { min: 0, max: 100 },
  'lab.adx.value': { min: 0, max: 100 },
  'lab.aroon.oscillator': { min: -100, max: 100 },
  'lab.demarker.value': { min: 0, max: 1 },
  'lab.awesomeOscillator.value': { min: -100, max: 100 },
  'extra.rsi': { min: 5, max: 95 },
  'extra.adx': { min: 0, max: 100 },
};

/** Entry timing variants for mutation. */
const ENTRY_TIMINGS: readonly EntryTiming[] = [
  'next_m1_candle',
  'next_m5_candle',
  'm5_gate_m1_signal',
];

// ─── DSL Tree Manipulation ───

/**
 * Deep-clone a DSL expression tree (already immutable, but ensure independent copy).
 */
function cloneExpression(expr: DSLExpression): DSLExpression {
  return JSON.parse(JSON.stringify(expr));
}

/**
 * Find all 'check' nodes in a DSL tree with numeric literal values.
 */
function findNumericChecks(expr: DSLExpression): Array<{
  path: string;
  op: DSLOp;
  value: number;
  node: DSLExpression;
}> {
  const results: Array<{ path: string; op: DSLOp; value: number; node: DSLExpression }> = [];

  function walk(node: DSLExpression): void {
    if (node.type === 'check' && node.value.type === 'literal' && typeof node.value.value === 'number') {
      results.push({ path: node.path, op: node.op, value: node.value.value, node });
    }
    if (node.type === 'and' || node.type === 'or') {
      for (const child of node.children) walk(child);
    }
    if (node.type === 'not') walk(node.child);
    if (node.type === 'direction') walk(node.condition);
    if (node.type === 'confluence') {
      for (const check of node.checks) walk(check);
    }
  }

  walk(expr);
  return results;
}

/**
 * Create a mutated DSL tree by shifting a numeric threshold.
 */
function mutateThreshold(
  expr: DSLExpression,
  targetPath: string,
  newValue: number,
): DSLExpression {
  function mutate(node: DSLExpression): DSLExpression {
    if (node.type === 'check' && node.path === targetPath &&
        node.value.type === 'literal' && typeof node.value.value === 'number') {
      const clampedValue = clampToRange(targetPath, newValue);
      return {
        ...node,
        value: { type: 'literal' as const, value: Math.round(clampedValue * 100) / 100 },
      };
    }

    if (node.type === 'and') return { ...node, children: node.children.map(mutate) };
    if (node.type === 'or') return { ...node, children: node.children.map(mutate) };
    if (node.type === 'not') return { ...node, child: mutate(node.child) };
    if (node.type === 'direction') return { ...node, condition: mutate(node.condition) };
    if (node.type === 'confluence') return { ...node, checks: node.checks.map(mutate) };

    return node;
  }

  return mutate(expr);
}

/**
 * Clamp a value to the valid range for an indicator path.
 */
function clampToRange(path: string, value: number): number {
  const range = THRESHOLD_RANGES[path];
  if (!range) return value;
  return Math.max(range.min, Math.min(range.max, value));
}

// ─── Mutation Strategies ───

/**
 * Generate threshold shift mutations for a strategy.
 * Shifts numeric thresholds up and down by THRESHOLD_VARIATION.
 */
function mutateThresholds(
  def: StrategyDefJSON,
  report: PerformanceReport,
): readonly StrategyDefJSON[] {
  if (!def.customLogic) return [];

  const checks = findNumericChecks(def.customLogic);
  if (checks.length === 0) return [];

  const mutations: StrategyDefJSON[] = [];

  for (const check of checks) {
    if (mutations.length >= MAX_MUTATIONS_PER_STRATEGY) break;

    const delta = Math.max(Math.abs(check.value) * THRESHOLD_VARIATION, 1);
    const shifts = [check.value + delta, check.value - delta];

    for (const newVal of shifts) {
      if (mutations.length >= MAX_MUTATIONS_PER_STRATEGY) break;

      const mutatedLogic = mutateThreshold(
        cloneExpression(def.customLogic),
        check.path,
        newVal,
      );

      const mutId = `evolved_${def.id}_${check.path.split('.').pop()}_${Math.round(newVal * 100)}`;

      mutations.push({
        ...def,
        id: mutId,
        name: `${def.name} (${check.path.split('.').pop()} ${Math.round(newVal)})`,
        version: 1,
        source: 'evolved',
        customLogic: mutatedLogic,
        description: `Mutation of ${def.id}: ${check.path} ${check.value}→${Math.round(newVal * 100) / 100}`,
        aiPrompt: `Evolved from "${def.name}". Threshold ${check.path} shifted from ${check.value} to ${Math.round(newVal * 100) / 100}. Check if this threshold makes technical sense for the current market conditions.`,
        tags: [...def.tags, 'evolved', 'threshold_mutation'],
        parentIds: [def.id],
        createdAt: Date.now(),
        disabledAt: null,
      });
    }
  }

  return mutations;
}

/**
 * Generate entry timing mutations.
 * Creates variants with different entry timing modes.
 */
function mutateEntryTiming(
  def: StrategyDefJSON,
): readonly StrategyDefJSON[] {
  const mutations: StrategyDefJSON[] = [];

  for (const timing of ENTRY_TIMINGS) {
    if (timing === def.entryTiming) continue;
    if (mutations.length >= 2) break;

    // Skip M5 variants of M5 strategies
    if (def.id.includes('_m5') && timing === 'next_m5_candle') continue;

    const mutId = `evolved_${def.id}_${timing.replace(/[^a-z0-9]/g, '')}`;

    mutations.push({
      ...def,
      id: mutId,
      name: `${def.name} (${timing.replace(/_/g, ' ')})`,
      version: 1,
      source: 'evolved',
      entryTiming: timing,
      description: `Timing mutation of ${def.id}: ${def.entryTiming}→${timing}`,
      aiPrompt: `Evolved from "${def.name}". Entry timing changed from ${def.entryTiming} to ${timing}. Validate if this timing works for the current trend/volatility.`,
      tags: [...def.tags, 'evolved', 'timing_mutation'],
      parentIds: [def.id],
      createdAt: Date.now(),
      disabledAt: null,
    });
  }

  return mutations;
}

// ─── Main Mutation API ───

/**
 * Generate mutations for top-performing strategies.
 * Returns new StrategyDefJSON objects ready for injection via strategy-loader.
 */
export function generateMutations(
  candidates: readonly PerformanceReport[],
  existingDefs: readonly StrategyDefJSON[],
): readonly MutationResult[] {
  const existingIds = new Set(existingDefs.map(d => d.id));
  const results: MutationResult[] = [];

  for (const candidate of candidates) {
    const def = existingDefs.find(d => d.id === candidate.strategyId);
    if (!def) continue;

    // Skip if already an evolved strategy (no recursive mutation for now)
    if (def.source === 'evolved') continue;

    // Threshold mutations
    const thresholdMuts = mutateThresholds(def, candidate)
      .filter(m => !existingIds.has(m.id));

    // Timing mutations
    const timingMuts = mutateEntryTiming(def)
      .filter(m => !existingIds.has(m.id));

    const allMuts = [...thresholdMuts, ...timingMuts].slice(0, MAX_MUTATIONS_PER_STRATEGY);

    if (allMuts.length > 0) {
      results.push({
        original: candidate,
        mutations: allMuts,
        mutationType: thresholdMuts.length > 0 ? 'threshold+timing' : 'timing',
      });
    }
  }

  return results;
}

/**
 * Quick summary for logging.
 */
export function formatMutationSummary(results: readonly MutationResult[]): string {
  const totalMutations = results.reduce((s, r) => s + r.mutations.length, 0);
  const lines = [`Mutations: ${totalMutations} from ${results.length} parents`];

  for (const r of results) {
    lines.push(`  ${r.original.strategyId} → ${r.mutations.length} mutations (${r.mutationType})`);
  }

  return lines.join('\n');
}
