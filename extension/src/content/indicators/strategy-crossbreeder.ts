/**
 * Strategy Crossbreeder — Phase 3 component.
 *
 * Combines indicator logic from two top-performing strategies into a new hybrid.
 * Uses DSL builder functions to construct valid expression trees.
 *
 * Crossbreeding modes:
 * - AND merge: both strategies must agree (higher precision, fewer signals)
 * - OR merge: either strategy fires (higher recall, more signals)
 * - Confluence: N of M sub-conditions must be true
 */

import type { DSLExpression, StrategyDefJSON } from './strategy-dsl';
import type { PerformanceReport } from './strategy-analyzer';

// ─── Types ───

export interface CrossbreedResult {
  readonly parentA: PerformanceReport;
  readonly parentB: PerformanceReport;
  readonly offspring: readonly StrategyDefJSON[];
}

// ─── Configuration ───

const MAX_OFFSPRING_PER_PAIR = 2;

// ─── DSL Extraction ───

/**
 * Extract the top-level conditions from a DSL expression.
 * For 'or' nodes with 'direction' children: extracts the CALL and PUT conditions separately.
 * For other structures: wraps the whole expression.
 */
function extractConditions(expr: DSLExpression): {
  call: DSLExpression | null;
  put: DSLExpression | null;
} {
  if (expr.type === 'or') {
    let callCond: DSLExpression | null = null;
    let putCond: DSLExpression | null = null;

    for (const child of expr.children) {
      if (child.type === 'direction') {
        if (child.dir === 'CALL') callCond = child.condition;
        if (child.dir === 'PUT') putCond = child.condition;
      }
    }

    return { call: callCond, put: putCond };
  }

  if (expr.type === 'direction') {
    return {
      call: expr.dir === 'CALL' ? expr.condition : null,
      put: expr.dir === 'PUT' ? expr.condition : null,
    };
  }

  // Non-directional expression — treat as both
  return { call: expr, put: expr };
}

/**
 * Get the leaf condition nodes from a condition expression.
 * Flattens AND/OR trees into individual check/exists/transition nodes.
 */
function getLeafConditions(expr: DSLExpression): readonly DSLExpression[] {
  if (expr.type === 'and' || expr.type === 'or') {
    return expr.children.flatMap(c => getLeafConditions(c));
  }
  if (expr.type === 'confluence') {
    return expr.checks.flatMap(c => getLeafConditions(c));
  }
  if (expr.type === 'not') {
    return [expr]; // preserve negation as atomic leaf for confluence
  }
  return [expr];
}

// ─── Crossbreeding Modes ───

/**
 * AND merge: both strategies' conditions must be true.
 * Produces a high-precision, low-signal hybrid.
 */
function crossbreedAnd(
  exprA: DSLExpression,
  exprB: DSLExpression,
): DSLExpression {
  const condsA = extractConditions(exprA);
  const condsB = extractConditions(exprB);

  const children: DSLExpression[] = [];

  if (condsA.call && condsB.call) {
    children.push({
      type: 'direction',
      dir: 'CALL',
      condition: {
        type: 'and',
        children: [condsA.call, condsB.call],
      },
    });
  }

  if (condsA.put && condsB.put) {
    children.push({
      type: 'direction',
      dir: 'PUT',
      condition: {
        type: 'and',
        children: [condsA.put, condsB.put],
      },
    });
  }

  if (children.length === 0) return exprA; // fallback
  if (children.length === 1) return children[0]!;
  return { type: 'or', children };
}

/**
 * Confluence merge: at least N of the combined conditions must be true.
 * Produces a balanced hybrid with tunable strictness.
 */
function crossbreedConfluence(
  exprA: DSLExpression,
  exprB: DSLExpression,
  minRatio = 0.6, // 60% of conditions must agree
): DSLExpression {
  const condsA = extractConditions(exprA);
  const condsB = extractConditions(exprB);

  const children: DSLExpression[] = [];

  // CALL confluence
  if (condsA.call && condsB.call) {
    const leafsA = getLeafConditions(condsA.call);
    const leafsB = getLeafConditions(condsB.call);
    const allChecks = [...leafsA, ...leafsB];
    const minCount = Math.max(2, Math.ceil(allChecks.length * minRatio));

    children.push({
      type: 'direction',
      dir: 'CALL',
      condition: {
        type: 'confluence',
        checks: allChecks,
        minCount,
      },
    });
  }

  // PUT confluence
  if (condsA.put && condsB.put) {
    const leafsA = getLeafConditions(condsA.put);
    const leafsB = getLeafConditions(condsB.put);
    const allChecks = [...leafsA, ...leafsB];
    const minCount = Math.max(2, Math.ceil(allChecks.length * minRatio));

    children.push({
      type: 'direction',
      dir: 'PUT',
      condition: {
        type: 'confluence',
        checks: allChecks,
        minCount,
      },
    });
  }

  if (children.length === 0) return exprA;
  if (children.length === 1) return children[0]!;
  return { type: 'or', children };
}

// ─── Main Crossbreeding API ───

/**
 * Generate crossbred strategy definitions from a pair of top performers.
 */
export function crossbreedStrategies(
  defA: StrategyDefJSON,
  defB: StrategyDefJSON,
  reportA: PerformanceReport,
  reportB: PerformanceReport,
  existingIds: ReadonlySet<string>,
): CrossbreedResult {
  const offspring: StrategyDefJSON[] = [];

  // Only crossbreed strategies with DSL logic
  if (!defA.customLogic || !defB.customLogic) {
    return { parentA: reportA, parentB: reportB, offspring: [] };
  }

  const baseId = `hybrid_${defA.id.substring(0, 12)}_${defB.id.substring(0, 12)}`;

  // Mode 1: AND merge (high precision)
  const andId = `${baseId}_and`;
  if (!existingIds.has(andId)) {
    const andLogic = crossbreedAnd(defA.customLogic, defB.customLogic);

    offspring.push({
      id: andId,
      name: `${shortName(defA.name)} & ${shortName(defB.name)} (AND)`,
      version: 1,
      source: 'evolved',
      entryTiming: reportA.gatedWinRate >= reportB.gatedWinRate
        ? defA.entryTiming : defB.entryTiming,
      minIntervalMs: Math.max(defA.minIntervalMs, defB.minIntervalMs),
      requiredSetups: [],
      minSetupCount: 0,
      requireM5Alignment: defA.requireM5Alignment || defB.requireM5Alignment,
      minConfidence: 0,
      filters: mergeFilters(defA.filters, defB.filters),
      customLogic: andLogic,
      customCode: null,
      description: `Crossbreed (AND) of ${defA.id} × ${defB.id}. Both conditions must agree.`,
      aiPrompt: `Hybrid strategy combining "${defA.name}" AND "${defB.name}". Both parent strategies must signal the same direction. Check if combining these indicators creates excessive filtering or contradictory conditions.`,
      tags: [...new Set([...defA.tags, ...defB.tags, 'evolved', 'crossbreed', 'and_merge'])],
      parentIds: [defA.id, defB.id],
      createdAt: Date.now(),
      disabledAt: null,
    });
  }

  // Mode 2: Confluence merge (balanced)
  if (offspring.length < MAX_OFFSPRING_PER_PAIR) {
    const confId = `${baseId}_conf`;
    if (!existingIds.has(confId)) {
      const confLogic = crossbreedConfluence(defA.customLogic, defB.customLogic, 0.6);

      offspring.push({
        id: confId,
        name: `${shortName(defA.name)} × ${shortName(defB.name)} (Confluence)`,
        version: 1,
        source: 'evolved',
        entryTiming: reportA.gatedWinRate >= reportB.gatedWinRate
          ? defA.entryTiming : defB.entryTiming,
        minIntervalMs: Math.max(defA.minIntervalMs, defB.minIntervalMs),
        requiredSetups: [],
        minSetupCount: 0,
        requireM5Alignment: defA.requireM5Alignment || defB.requireM5Alignment,
        minConfidence: 0,
        filters: mergeFilters(defA.filters, defB.filters),
        customLogic: confLogic,
        customCode: null,
        description: `Crossbreed (Confluence 60%) of ${defA.id} × ${defB.id}. 60% of combined conditions must agree.`,
        aiPrompt: `Hybrid strategy using confluence of "${defA.name}" and "${defB.name}". 60% of combined indicator checks must agree. Evaluate if the confluence threshold is appropriate for current conditions.`,
        tags: [...new Set([...defA.tags, ...defB.tags, 'evolved', 'crossbreed', 'confluence'])],
        parentIds: [defA.id, defB.id],
        createdAt: Date.now(),
        disabledAt: null,
      });
    }
  }

  return { parentA: reportA, parentB: reportB, offspring };
}

// ─── Helpers ───

function shortName(name: string): string {
  return name.length > 20 ? name.substring(0, 20) : name;
}

function mergeFilters(
  a: StrategyDefJSON['filters'],
  b: StrategyDefJSON['filters'],
): StrategyDefJSON['filters'] {
  return {
    ...a,
    nearSR: a.nearSR || b.nearSR,
    orderBlock: a.orderBlock || b.orderBlock,
    fvg: a.fvg || b.fvg,
    structureBreak: a.structureBreak || b.structureBreak,
    stochExtreme: a.stochExtreme || b.stochExtreme,
    adxTrend: a.adxTrend || b.adxTrend,
    adxRange: a.adxRange || b.adxRange,
    emaAlignment: a.emaAlignment || b.emaAlignment,
    emaCrossover: a.emaCrossover || b.emaCrossover,
    session: a.session ?? b.session,
    regimeMode: a.regimeMode ?? b.regimeMode,
  };
}

/**
 * Run crossbreeding for multiple pairs.
 */
export function runCrossbreeding(
  pairs: readonly [PerformanceReport, PerformanceReport][],
  allDefs: readonly StrategyDefJSON[],
): readonly CrossbreedResult[] {
  const existingIds = new Set(allDefs.map(d => d.id));
  const results: CrossbreedResult[] = [];

  for (const [reportA, reportB] of pairs) {
    const defA = allDefs.find(d => d.id === reportA.strategyId);
    const defB = allDefs.find(d => d.id === reportB.strategyId);

    if (!defA || !defB) continue;

    const result = crossbreedStrategies(defA, defB, reportA, reportB, existingIds);

    if (result.offspring.length > 0) {
      results.push(result);
      // Add new IDs to prevent duplicates within same cycle
      for (const o of result.offspring) {
        existingIds.add(o.id);
      }
    }
  }

  return results;
}

/**
 * Quick summary for logging.
 */
export function formatCrossbreedSummary(results: readonly CrossbreedResult[]): string {
  const totalOffspring = results.reduce((s, r) => s + r.offspring.length, 0);
  const lines = [`Crossbreeds: ${totalOffspring} offspring from ${results.length} pairs`];

  for (const r of results) {
    lines.push(`  ${r.parentA.strategyId} × ${r.parentB.strategyId} → ${r.offspring.length} hybrids`);
  }

  return lines.join('\n');
}
