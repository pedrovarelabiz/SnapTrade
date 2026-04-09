/**
 * Strategy Hypothesis — Phase 3b component.
 *
 * Uses the backend LLM (Gemini/Claude) to analyze top/bottom strategy performance
 * and suggest NEW strategy combinations that aren't currently being tested.
 *
 * Called after each evolution cycle to generate AI-driven hypotheses.
 * Suggested strategies are converted to DSL and injected via strategy-loader.
 */

import { API_BASE } from '../../lib/constants';
import type { PerformanceReport, AnalysisResult } from './strategy-analyzer';
import { addStrategy } from './strategy-loader';
import type { StrategyDefJSON, DSLExpression } from './strategy-dsl';
import type { EntryTiming } from './strategy-lab';

// ─── Types ───

interface HypothesisStrategy {
  readonly name: string;
  readonly description: string;
  readonly indicators: readonly string[];
  readonly entryConditionCall: string;
  readonly entryConditionPut: string;
  readonly entryTiming: string;
  readonly confidence: number;
  readonly reasoning: string;
}

interface HypothesisResponse {
  readonly strategies: readonly HypothesisStrategy[];
  readonly model: string;
  readonly timestamp: number;
}

// ─── Configuration ───

const MAX_HYPOTHESES_PER_CYCLE = 5;
const MIN_HYPOTHESIS_CONFIDENCE = 70;

// ─── Available indicators for the prompt ───

const AVAILABLE_INDICATORS = [
  'rsi', 'macd', 'stochastic', 'ema', 'adx', 'cci', 'bollingerBands',
  'williamsR', 'ichimoku', 'sar', 'keltner', 'donchian', 'heikinAshi',
  'pivots', 'divergence', 'bbSqueeze', 'obv', 'aroon', 'demarker',
  'vortex', 'alligator', 'fractal', 'awesomeOscillator', 'supertrend',
];

// ─── API Call ───

/**
 * Call the backend hypothesis endpoint with performance data.
 */
async function fetchHypotheses(
  analysis: AnalysisResult,
  maxBudget: number,
): Promise<HypothesisResponse | null> {
  try {
    const settings = await chrome.storage.local.get('settings');
    const token = settings.settings?.extensionToken;
    if (!token) {
      console.log('[Hypothesis] No extension token — skipping');
      return null;
    }

    const topStrategies = analysis.topPerformers.slice(0, 10).map(r => ({
      id: r.strategyId,
      name: r.name,
      gatedWinRate: r.gatedWinRate,
      sharpeRatio: r.sharpeRatio,
      totalTrades: r.totalTrades,
      consistency: r.consistency,
      flatPnl: r.flatPnl,
      tags: r.tags,
      maxDrawdown: r.maxDrawdown,
    }));

    const bottomStrategies = analysis.bottomPerformers.slice(0, 5).map(r => ({
      id: r.strategyId,
      name: r.name,
      gatedWinRate: r.gatedWinRate,
      totalTrades: r.totalTrades,
      tags: r.tags,
    }));

    const response = await fetch(`${API_BASE}/extension/evolve-hypothesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        topStrategies,
        bottomStrategies,
        availableIndicators: AVAILABLE_INDICATORS,
        currentEvolvedCount: 0, // Will be filled by caller
        maxBudget,
      }),
    });

    if (!response.ok) {
      console.log(`[Hypothesis] Backend error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data as HypothesisResponse;
  } catch (err) {
    console.error('[Hypothesis] Fetch error:', String(err).substring(0, 100));
    return null;
  }
}

// ─── DSL Conversion ───

/**
 * Convert an AI-suggested strategy into a StrategyDefJSON.
 * Uses the DSL converter to transform natural language conditions to expression trees.
 */
function hypothesisToStrategyDef(
  hyp: HypothesisStrategy,
  index: number,
): StrategyDefJSON {
  // Generate unique ID from name
  const idBase = hyp.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .substring(0, 30);
  const id = `hypothesis_${idBase}_${Date.now().toString(36).slice(-4)}`;

  // Map entry timing
  const timingMap: Record<string, EntryTiming> = {
    'next_m1_candle': 'next_m1_candle',
    'next_m5_candle': 'next_m5_candle',
    'm5_gate_m1_signal': 'm5_gate_m1_signal',
    'immediate': 'immediate',
  };
  const entryTiming = timingMap[hyp.entryTiming] ?? 'next_m1_candle';

  // Build a simple placeholder DSL — the actual DSL will be generated
  // by the crawler's DSL converter on the VPS, or we build a basic one here
  const callCondition = buildBasicDSL(hyp.entryConditionCall, 'CALL');
  const putCondition = buildBasicDSL(hyp.entryConditionPut, 'PUT');

  const customLogic: DSLExpression | null = callCondition && putCondition
    ? { type: 'or', children: [callCondition, putCondition] }
    : callCondition ?? putCondition ?? null;

  return {
    id,
    name: hyp.name,
    version: 1,
    source: 'evolved',
    entryTiming,
    minIntervalMs: 60000,
    requiredSetups: [],
    minSetupCount: 0,
    requireM5Alignment: false,
    minConfidence: 0,
    filters: {
      nearSR: false,
      orderBlock: false,
      fvg: false,
      structureBreak: false,
      stochExtreme: false,
      adxTrend: false,
      adxRange: false,
      emaAlignment: false,
      emaCrossover: false,
      session: null,
      regimeMode: null,
    },
    customLogic,
    customCode: null,
    description: `AI Hypothesis: ${hyp.description}`,
    aiPrompt: `AI-generated strategy: "${hyp.name}". ${hyp.reasoning}. Validate if current market conditions match the hypothesis.`,
    tags: ['evolved', 'hypothesis', ...hyp.indicators],
    parentIds: [],
    createdAt: Date.now(),
    disabledAt: null,
  };
}

/**
 * Build a basic DSL expression from natural language conditions.
 * Parses common patterns like "RSI < 30", "CCI crosses above 0", etc.
 */
function buildBasicDSL(condition: string, dir: 'CALL' | 'PUT'): DSLExpression | null {
  const checks: DSLExpression[] = [];
  const lower = condition.toLowerCase();

  // RSI patterns
  const rsiMatch = lower.match(/rsi\s*[<>]=?\s*(\d+)/);
  if (rsiMatch) {
    const val = parseFloat(rsiMatch[1]!);
    const op = lower.includes('>') ? 'gt' : 'lt';
    checks.push({ type: 'check', path: 'lab.rsi.value', op, value: { type: 'literal', value: val } });
  }

  // CCI patterns
  const cciMatch = lower.match(/cci\s*[<>]=?\s*(-?\d+)/);
  if (cciMatch) {
    const val = parseFloat(cciMatch[1]!);
    const op = lower.includes('>') ? 'gt' : 'lt';
    checks.push({ type: 'check', path: 'lab.cci.value', op, value: { type: 'literal', value: val } });
  }

  // Stochastic patterns
  const stochMatch = lower.match(/stochastic\s*[k%]?\s*[<>]=?\s*(\d+)/);
  if (stochMatch) {
    const val = parseFloat(stochMatch[1]!);
    const op = lower.includes('>') ? 'gt' : 'lt';
    checks.push({ type: 'check', path: 'extra.stochastic.k', op, value: { type: 'literal', value: val } });
  }

  // Williams %R patterns
  const wrMatch = lower.match(/williams\s*%?r?\s*[<>]=?\s*(-?\d+)/);
  if (wrMatch) {
    const val = parseFloat(wrMatch[1]!);
    const op = lower.includes('>') ? 'gt' : 'lt';
    checks.push({ type: 'check', path: 'lab.williamsR.value', op, value: { type: 'literal', value: val } });
  }

  // ADX patterns
  const adxMatch = lower.match(/adx\s*[<>]=?\s*(\d+)/);
  if (adxMatch) {
    const val = parseFloat(adxMatch[1]!);
    const op = lower.includes('>') ? 'gt' : 'lt';
    checks.push({ type: 'check', path: 'extra.adx', op, value: { type: 'literal', value: val } });
  }

  // Bollinger Band patterns
  if (lower.includes('bollinger') && lower.includes('lower')) {
    checks.push({ type: 'check', path: 'lab.bbSqueeze.percentile', op: 'lt', value: { type: 'literal', value: 20 } });
  }
  if (lower.includes('bollinger') && lower.includes('upper')) {
    checks.push({ type: 'check', path: 'lab.bbSqueeze.percentile', op: 'gt', value: { type: 'literal', value: 80 } });
  }

  // SAR patterns
  if (lower.includes('sar') && (lower.includes('flip') || lower.includes('below') || lower.includes('bullish'))) {
    checks.push({ type: 'check', path: 'lab.sar.bullish', op: 'eq', value: { type: 'literal', value: true } });
  }

  // EMA patterns
  if (lower.includes('ema') && lower.includes('cross')) {
    checks.push({ type: 'exists', path: 'extra.emaCrossover' });
  }

  // MACD patterns
  if (lower.includes('macd') && lower.includes('cross')) {
    checks.push({ type: 'exists', path: 'extra.macdCrossover' });
  }
  if (lower.includes('macd') && (lower.includes('histogram') || lower.includes('hist'))) {
    const rising = lower.includes('rising') || lower.includes('positive') || lower.includes('above');
    checks.push({ type: 'check', path: 'extra.histogramRising', op: 'eq', value: { type: 'literal', value: rising } });
  }

  // Aroon patterns
  const aroonMatch = lower.match(/aroon\s*(?:oscillator)?\s*[<>]=?\s*(-?\d+)/);
  if (aroonMatch) {
    const val = parseFloat(aroonMatch[1]!);
    const op = lower.includes('>') ? 'gt' : 'lt';
    checks.push({ type: 'check', path: 'lab.aroon.oscillator', op, value: { type: 'literal', value: val } });
  }

  // DeMarker patterns
  const demarkerMatch = lower.match(/demarker\s*[<>]=?\s*([\d.]+)/);
  if (demarkerMatch) {
    const val = parseFloat(demarkerMatch[1]!);
    const op = lower.includes('>') ? 'gt' : 'lt';
    checks.push({ type: 'check', path: 'lab.demarker.value', op, value: { type: 'literal', value: val } });
  }

  // Vortex patterns
  if (lower.includes('vortex') && (lower.includes('bullish') || lower.includes('vi+ > vi-'))) {
    checks.push({ type: 'check', path: 'lab.vortex.trend', op: 'eq', value: { type: 'literal', value: 'bullish' } });
  }
  if (lower.includes('vortex') && (lower.includes('bearish') || lower.includes('vi- > vi+'))) {
    checks.push({ type: 'check', path: 'lab.vortex.trend', op: 'eq', value: { type: 'literal', value: 'bearish' } });
  }

  // Supertrend patterns
  if (lower.includes('supertrend') && lower.includes('bullish')) {
    checks.push({ type: 'check', path: 'lab.supertrend.direction', op: 'eq', value: { type: 'literal', value: 'up' } });
  }
  if (lower.includes('supertrend') && lower.includes('bearish')) {
    checks.push({ type: 'check', path: 'lab.supertrend.direction', op: 'eq', value: { type: 'literal', value: 'down' } });
  }

  // Awesome Oscillator patterns
  if (lower.includes('awesome') && lower.includes('positive')) {
    checks.push({ type: 'check', path: 'lab.awesomeOscillator.value', op: 'gt', value: { type: 'literal', value: 0 } });
  }
  if (lower.includes('awesome') && lower.includes('negative')) {
    checks.push({ type: 'check', path: 'lab.awesomeOscillator.value', op: 'lt', value: { type: 'literal', value: 0 } });
  }

  // Ichimoku patterns
  if (lower.includes('ichimoku') && lower.includes('above cloud')) {
    checks.push({ type: 'check', path: 'lab.ichimoku.cloudPosition', op: 'eq', value: { type: 'literal', value: 'above' } });
  }
  if (lower.includes('ichimoku') && lower.includes('below cloud')) {
    checks.push({ type: 'check', path: 'lab.ichimoku.cloudPosition', op: 'eq', value: { type: 'literal', value: 'below' } });
  }
  if (lower.includes('ichimoku') && lower.includes('tk cross')) {
    checks.push({ type: 'check', path: 'lab.ichimoku.tkCross', op: 'eq', value: { type: 'literal', value: true } });
  }

  // Donchian patterns
  if (lower.includes('donchian') && lower.includes('breakout')) {
    checks.push({ type: 'check', path: 'lab.donchian.breakout', op: 'eq', value: { type: 'literal', value: true } });
  }

  // Keltner patterns
  if (lower.includes('keltner') && lower.includes('above upper')) {
    checks.push({ type: 'prev_compare', currPath: 'candle.close', op: 'gt', prevPath: 'lab.keltner.upper' });
  }
  if (lower.includes('keltner') && lower.includes('below lower')) {
    checks.push({ type: 'prev_compare', currPath: 'candle.close', op: 'lt', prevPath: 'lab.keltner.lower' });
  }

  // Heikin Ashi patterns
  if (lower.includes('heikin') && lower.includes('bullish')) {
    checks.push({ type: 'ha_pattern', pattern: 'continuation_bull', minCandles: 3 });
  }
  if (lower.includes('heikin') && lower.includes('bearish')) {
    checks.push({ type: 'ha_pattern', pattern: 'continuation_bear', minCandles: 3 });
  }

  // Pivot patterns
  if (lower.includes('pivot') && lower.includes('support')) {
    checks.push({ type: 'exists', path: 'lab.pivots.nearS1' });
  }
  if (lower.includes('pivot') && lower.includes('resistance')) {
    checks.push({ type: 'exists', path: 'lab.pivots.nearR1' });
  }

  if (checks.length === 0) return null;

  const condition_expr: DSLExpression = checks.length === 1
    ? checks[0]!
    : { type: 'and', children: checks };

  return {
    type: 'direction',
    dir,
    condition: condition_expr,
  };
}

// ─── Main API ───

/**
 * Generate AI hypotheses and inject them as new strategies.
 * Called after each evolution cycle.
 */
export async function generateHypotheses(
  analysis: AnalysisResult,
  budgetRemaining: number,
): Promise<number> {
  const maxBudget = Math.min(budgetRemaining, MAX_HYPOTHESES_PER_CYCLE);
  if (maxBudget <= 0) return 0;

  console.log(`[Hypothesis] Requesting ${maxBudget} AI hypotheses...`);

  const response = await fetchHypotheses(analysis, maxBudget);
  if (!response || response.strategies.length === 0) {
    console.log('[Hypothesis] No hypotheses returned');
    return 0;
  }

  console.log(`[Hypothesis] Got ${response.strategies.length} hypotheses from ${response.model}`);

  let injected = 0;

  for (const hyp of response.strategies) {
    if (injected >= maxBudget) break;
    if (hyp.confidence < MIN_HYPOTHESIS_CONFIDENCE) {
      console.log(`[Hypothesis] Skipping "${hyp.name}" (confidence ${hyp.confidence} < ${MIN_HYPOTHESIS_CONFIDENCE})`);
      continue;
    }

    const def = hypothesisToStrategyDef(hyp, injected);

    if (def.customLogic === null) {
      console.log(`[Hypothesis] Skipping "${hyp.name}" — could not parse conditions to DSL`);
      continue;
    }

    if (addStrategy(def)) {
      injected++;
      console.log(`[Hypothesis] Injected: ${def.id} ("${hyp.name}")`);
    }
  }

  console.log(`[Hypothesis] ${injected} hypotheses injected`);
  return injected;
}
