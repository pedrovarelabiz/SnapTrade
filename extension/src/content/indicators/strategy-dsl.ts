/**
 * Strategy DSL — Domain-Specific Language for serializable strategy definitions.
 *
 * Replaces hardcoded `customEval` functions with a JSON-serializable expression tree
 * that the engine interprets at runtime. Enables dynamic strategy injection, storage,
 * and evolution without rebuilding the extension.
 *
 * Hybrid approach:
 *   - DSL expressions handle ~85% of strategies (indicator checks, transitions, patterns)
 *   - `customCode` escape hatch for ~15% complex strategies (loops, slicing)
 */

import type { Candle } from './candle-collector';
import type { ExtraIndicators } from './extra-indicators';
import type { PriceActionContext } from './price-action';
import type { LabIndicatorSet } from './lab-indicators';
import { computeIchimoku, computeKeltner } from './lab-indicators';
import type { EntryTiming } from './strategy-lab';
import type { SetupType } from './setup-detector';
import type { SessionType } from './extra-indicators';

// ─── DSL Expression Types ───

/** Comparison operators for indicator values. */
export type DSLOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';

/** A resolvable value — either a literal or a path to a context field. */
export type DSLValue =
  | { type: 'literal'; value: string | number | boolean }
  | { type: 'path'; path: string };  // e.g. 'lab.keltner.lower', 'candle.prev.close'

/** DSL expression node — composable, JSON-serializable. */
export type DSLExpression =
  // Logic combinators
  | { readonly type: 'and'; readonly children: readonly DSLExpression[] }
  | { readonly type: 'or'; readonly children: readonly DSLExpression[] }
  | { readonly type: 'not'; readonly child: DSLExpression }
  // Indicator field check: resolve path, compare with op
  | { readonly type: 'check'; readonly path: string; readonly op: DSLOp; readonly value: DSLValue }
  // Null guard: check that a path resolves to a non-null value
  | { readonly type: 'exists'; readonly path: string }
  // Transition: previous candle had different value than current for an indicator field
  | { readonly type: 'transition'; readonly path: string; readonly from: readonly string[]; readonly to: string }
  // Candle comparison: compare current candle field vs previous candle field or indicator value
  | { readonly type: 'prev_compare'; readonly currPath: string; readonly op: DSLOp; readonly prevPath: string }
  // Heikin Ashi pattern matching
  | { readonly type: 'ha_pattern'; readonly pattern: 'continuation_bull' | 'continuation_bear' | 'color_change_bull' | 'color_change_bear'; readonly minCandles: number }
  // Confluence: count how many sub-expressions are true, require minCount
  | { readonly type: 'confluence'; readonly checks: readonly DSLExpression[]; readonly minCount: number }
  // Direction gate: if condition is true, emit the specified direction
  | { readonly type: 'direction'; readonly dir: 'CALL' | 'PUT'; readonly condition: DSLExpression };

// ─── Serializable Strategy Definition ───

export interface StrategyDefJSON {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly source: 'builtin' | 'crawler' | 'evolved' | 'manual';
  readonly entryTiming: EntryTiming;
  readonly minIntervalMs: number;

  // Declarative filters (same as current StrategyDef boolean flags)
  readonly requiredSetups: readonly string[];
  readonly minSetupCount: number;
  readonly requireM5Alignment: boolean;
  readonly minConfidence: number;
  readonly filters: {
    readonly nearSR: boolean;
    readonly orderBlock: boolean;
    readonly fvg: boolean;
    readonly structureBreak: boolean;
    readonly stochExtreme: boolean;
    readonly adxTrend: boolean;
    readonly adxRange: boolean;
    readonly emaAlignment: boolean;
    readonly emaCrossover: boolean;
    readonly session: SessionType | null;
    readonly regimeMode: 'trend' | 'range' | null;
  };

  // DSL expression tree (replaces customEval for ~85% of strategies)
  readonly customLogic: DSLExpression | null;

  // Escape hatch: raw JS code string for complex strategies (~15%)
  // Evaluated via sandboxed Function() with restricted scope.
  readonly customCode: string | null;

  // Metadata
  readonly description: string;
  readonly aiPrompt: string | null;
  readonly tags: readonly string[];
  readonly parentIds: readonly string[];
  readonly createdAt: number;
  readonly disabledAt: number | null;
}

// ─── DSL Evaluation Context ───

export interface DSLContext {
  readonly candles: readonly Candle[];
  readonly extra: ExtraIndicators;
  readonly pa: PriceActionContext;
  readonly lab: LabIndicatorSet;
  readonly prevLab: LabIndicatorSet | null;  // Cached previous candle indicators (for transitions)
}

// ─── Path Resolution ───

/**
 * Resolve a dot-separated path to a value from the DSL context.
 *
 * Supported root prefixes:
 *   lab.{indicator}.{field}       — LabIndicatorSet fields
 *   extra.{indicator}.{field}     — ExtraIndicators fields
 *   pa.{field}                    — PriceActionContext fields
 *   candle.{field}                — Current (last) candle
 *   candle.prev.{field}           — Previous (second-to-last) candle
 *   prevLab.{indicator}.{field}   — Previous candle's LabIndicatorSet
 */
function resolvePath(path: string, ctx: DSLContext): unknown {
  const parts = path.split('.');
  const root = parts[0];

  if (root === 'candle') {
    if (parts[1] === 'prev') {
      const candle = ctx.candles.length >= 2 ? ctx.candles[ctx.candles.length - 2] : null;
      if (!candle) return undefined;
      return getNestedField(candle, parts.slice(2));
    }
    const candle = ctx.candles.length > 0 ? ctx.candles[ctx.candles.length - 1] : null;
    if (!candle) return undefined;
    return getNestedField(candle, parts.slice(1));
  }

  if (root === 'lab') return getNestedField(ctx.lab, parts.slice(1));
  if (root === 'prevLab') return ctx.prevLab ? getNestedField(ctx.prevLab, parts.slice(1)) : undefined;
  if (root === 'extra') return getNestedField(ctx.extra, parts.slice(1));
  if (root === 'pa') return getNestedField(ctx.pa, parts.slice(1));

  return undefined;
}

function getNestedField(obj: unknown, parts: readonly string[]): unknown {
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ─── DSLValue Resolution ───

function resolveValue(val: DSLValue, ctx: DSLContext): unknown {
  if (val.type === 'literal') return val.value;
  return resolvePath(val.path, ctx);
}

// ─── Comparison ───

function compare(left: unknown, op: DSLOp, right: unknown): boolean {
  if (left == null || right == null) return false;

  // Numeric comparison
  if (typeof left === 'number' && typeof right === 'number') {
    switch (op) {
      case 'eq': return left === right;
      case 'neq': return left !== right;
      case 'gt': return left > right;
      case 'gte': return left >= right;
      case 'lt': return left < right;
      case 'lte': return left <= right;
    }
  }

  // String/boolean comparison (eq/neq only meaningful)
  switch (op) {
    case 'eq': return left === right;
    case 'neq': return left !== right;
    default: return false;
  }
}

// ─── Heikin Ashi Pattern Matching ───

function matchHAPattern(
  ha: readonly { readonly isBullish: boolean; readonly hasNoLowerWick: boolean; readonly hasNoUpperWick: boolean }[],
  pattern: string,
  minCandles: number,
): boolean {
  if (ha.length < minCandles + 1) return false;
  const slice = ha.slice(-minCandles);

  switch (pattern) {
    case 'continuation_bull':
      return slice.every(c => c.isBullish && c.hasNoLowerWick);
    case 'continuation_bear':
      return slice.every(c => !c.isBullish && c.hasNoUpperWick);
    case 'color_change_bull': {
      if (ha.length < 3) return false;
      const curr = ha[ha.length - 1]!;
      const prev = ha[ha.length - 2]!;
      return curr.isBullish && !prev.isBullish;
    }
    case 'color_change_bear': {
      if (ha.length < 3) return false;
      const curr = ha[ha.length - 1]!;
      const prev = ha[ha.length - 2]!;
      return !curr.isBullish && prev.isBullish;
    }
    default:
      return false;
  }
}

// ─── Transition Detection ───

/**
 * Detect a transition: previous value was in `from` set, current value is `to`.
 * Uses prevLab cache when available, falls back to recomputing for specific indicators.
 */
function checkTransition(path: string, from: readonly string[], to: string, ctx: DSLContext): boolean {
  const currentVal = String(resolvePath(path, ctx) ?? '');
  if (currentVal !== to) return false;

  // Try prevLab cache first
  if (ctx.prevLab) {
    const prevPath = path.replace(/^lab\./, 'prevLab.');
    const prevVal = String(resolvePath(prevPath, ctx) ?? '');
    return from.includes(prevVal);
  }

  // Fallback: recompute for known indicators that support it
  const parts = path.split('.');
  if (parts[0] === 'lab' && ctx.candles.length >= 3) {
    const prevCandles = ctx.candles.slice(0, -1);
    const indicator = parts[1];

    if (indicator === 'ichimoku') {
      const prevIchi = computeIchimoku(prevCandles);
      if (!prevIchi) return false;
      const prevVal = String(getNestedField(prevIchi, parts.slice(2)) ?? '');
      return from.includes(prevVal);
    }
    if (indicator === 'keltner') {
      const prevKelt = computeKeltner(prevCandles);
      if (!prevKelt) return false;
      const prevVal = String(getNestedField(prevKelt, parts.slice(2)) ?? '');
      return from.includes(prevVal);
    }
  }

  return false;
}

// ─── Core DSL Evaluator ───

/**
 * Evaluate a DSL expression against the given context.
 * Returns true if the expression matches, false otherwise.
 */
function evaluateExpr(expr: DSLExpression, ctx: DSLContext): boolean {
  switch (expr.type) {
    case 'and':
      return expr.children.every(child => evaluateExpr(child, ctx));

    case 'or':
      return expr.children.some(child => evaluateExpr(child, ctx));

    case 'not':
      return !evaluateExpr(expr.child, ctx);

    case 'exists':
      return resolvePath(expr.path, ctx) != null;

    case 'check': {
      const left = resolvePath(expr.path, ctx);
      const right = resolveValue(expr.value, ctx);
      return compare(left, expr.op, right);
    }

    case 'transition':
      return checkTransition(expr.path, expr.from, expr.to, ctx);

    case 'prev_compare': {
      const currVal = resolvePath(expr.currPath, ctx);
      const prevVal = resolvePath(expr.prevPath, ctx);
      return compare(currVal, expr.op, prevVal);
    }

    case 'ha_pattern':
      return matchHAPattern(ctx.lab.heikinAshi, expr.pattern, expr.minCandles);

    case 'confluence': {
      let count = 0;
      for (const check of expr.checks) {
        if (evaluateExpr(check, ctx)) count++;
        if (count >= expr.minCount) return true;  // early exit
      }
      return false;
    }

    case 'direction':
      // Direction nodes are evaluated by evaluateDSL, not here
      return evaluateExpr(expr.condition, ctx);

    default:
      return false;
  }
}

// ─── Public API: Evaluate DSL → Direction ───

/**
 * Evaluate a DSL expression tree and return the trade direction, or null if no signal.
 *
 * The expression tree should contain `direction` nodes that specify CALL or PUT.
 * The evaluator finds the first matching direction node.
 */
export function evaluateDSL(expr: DSLExpression, ctx: DSLContext): 'CALL' | 'PUT' | null {
  // Top-level OR: check each branch for a direction match
  if (expr.type === 'or') {
    for (const child of expr.children) {
      const result = evaluateDSL(child, ctx);
      if (result) return result;
    }
    return null;
  }

  // Direction node: if condition is true, emit direction
  if (expr.type === 'direction') {
    if (evaluateExpr(expr.condition, ctx)) return expr.dir;
    return null;
  }

  // AND at top level: all children must be true, return first direction found in children
  if (expr.type === 'and') {
    if (!expr.children.every(child => evaluateExpr(child, ctx))) return null;
    // Find a direction node in children
    for (const child of expr.children) {
      if (child.type === 'direction') return child.dir;
    }
    return null;
  }

  return null;
}

// ─── Compiled Custom Evaluators Registry ───

/**
 * Registry of compiled evaluator functions for strategies too complex for DSL.
 *
 * In Manifest V3, `new Function()` is blocked by CSP in content scripts.
 * Instead, complex strategies register their evaluators here at build time.
 * The strategy-converter uses the `customCode` field as a KEY into this registry.
 *
 * For crawler/evolved strategies that can't use this registry, they must use
 * DSL expressions (the DSL handles ~85% of patterns).
 */
const compiledEvaluators = new Map<string, (ctx: DSLContext) => 'CALL' | 'PUT' | null>();

/**
 * Register a compiled evaluator function for a strategy.
 * Called by strategy-converter during initialization.
 */
export function registerCompiledEval(strategyId: string, fn: (ctx: DSLContext) => 'CALL' | 'PUT' | null): void {
  compiledEvaluators.set(strategyId, fn);
}

/**
 * Evaluate using a compiled evaluator registered for this strategy ID.
 * Falls back to null if no evaluator is registered.
 */
export function evaluateCustomCode(
  strategyId: string,
  ctx: DSLContext,
): 'CALL' | 'PUT' | null {
  const fn = compiledEvaluators.get(strategyId);
  if (!fn) return null;
  try {
    return fn(ctx);
  } catch {
    return null;
  }
}

// ─── Previous Lab Indicator Cache ───

const prevLabCache = new Map<string, LabIndicatorSet>();

/**
 * Get the cached previous-candle LabIndicatorSet for a symbol.
 */
export function getPrevLab(symbol: string): LabIndicatorSet | null {
  return prevLabCache.get(symbol) ?? null;
}

/**
 * Update the prev lab cache. Call AFTER evaluating strategies for a candle close.
 * The current lab becomes the "prev" for next candle.
 */
export function updatePrevLabCache(symbol: string, currentLab: LabIndicatorSet): void {
  prevLabCache.set(symbol, currentLab);
}

// ─── DSL Builder Helpers (for strategy-converter.ts) ───

/** Create a literal DSLValue. */
export const lit = (value: string | number | boolean): DSLValue => ({ type: 'literal', value });

/** Create a path DSLValue. */
export const ref = (path: string): DSLValue => ({ type: 'path', path });

/** Shorthand: check that path equals a literal value. */
export const eq = (path: string, value: string | number | boolean): DSLExpression =>
  ({ type: 'check', path, op: 'eq', value: lit(value) });

/** Shorthand: check that path is true (boolean). */
export const isTrue = (path: string): DSLExpression =>
  ({ type: 'check', path, op: 'eq', value: lit(true) });

/** Shorthand: check that path is non-null. */
export const exists = (path: string): DSLExpression =>
  ({ type: 'exists', path });

/** Shorthand: AND combinator. */
export const and = (...children: readonly DSLExpression[]): DSLExpression =>
  ({ type: 'and', children });

/** Shorthand: OR combinator. */
export const or = (...children: readonly DSLExpression[]): DSLExpression =>
  ({ type: 'or', children });

/** Shorthand: direction gate. */
export const call = (condition: DSLExpression): DSLExpression =>
  ({ type: 'direction', dir: 'CALL', condition });

/** Shorthand: direction gate. */
export const put = (condition: DSLExpression): DSLExpression =>
  ({ type: 'direction', dir: 'PUT', condition });

/** Shorthand: transition detection. */
export const transition = (path: string, from: readonly string[], to: string): DSLExpression =>
  ({ type: 'transition', path, from, to });

/** Shorthand: previous candle comparison (currPath op prevPath). */
export const prevCompare = (currPath: string, op: DSLOp, prevPath: string): DSLExpression =>
  ({ type: 'prev_compare', currPath, op, prevPath });

/** Shorthand: Heikin Ashi pattern. */
export const haPattern = (pattern: 'continuation_bull' | 'continuation_bear' | 'color_change_bull' | 'color_change_bear', minCandles = 3): DSLExpression =>
  ({ type: 'ha_pattern', pattern, minCandles });

/** Shorthand: confluence counter. */
export const confluence = (minCount: number, ...checks: readonly DSLExpression[]): DSLExpression =>
  ({ type: 'confluence', checks, minCount });

/** Shorthand: standard CALL/PUT pair — the most common pattern. */
export const callPut = (callCondition: DSLExpression, putCondition: DSLExpression): DSLExpression =>
  or(call(callCondition), put(putCondition));
