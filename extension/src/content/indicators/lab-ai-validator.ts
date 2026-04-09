/**
 * Lab AI Validator — Claude-based validation for Strategy Lab signals.
 *
 * Only validates signals from strategies that qualify (100+ gated trades, WR >= 54%).
 * Uses the existing batch analysis endpoint for efficiency.
 * Tracks AI-validated vs non-validated WR for comparison.
 */

import type { Candle } from './candle-collector';
import type { ExtraIndicators } from './extra-indicators';
import {
  getAiQualifiedStrategies,
  getStrategyPairStats,
  recordAiValidation,
  type StrategyStats,
} from './strategy-lab';
import { convertAllBuiltins } from './strategy-converter';
import type { StrategyDefJSON } from './strategy-dsl';
import { batchAnalyze, type AnalystConfig, type BatchCandidate } from './llm-analyst';
import { computeM5Indicators } from './m5-indicators';
import { getAggregatedSetup, getDisplayState } from './setup-detector';

// ─── Market Context Helpers ───

/** Returns true if price is within 0.02% of a round level (X.X00 or X.XX0). */
export function isNearRoundLevel(price: number): boolean {
  if (price <= 0) return false;
  const thr = price * 0.0002;
  // Nearest X.X00 (0.01 step)
  const r01 = Math.round(price * 100) / 100;
  if (Math.abs(price - r01) <= thr) return true;
  // Nearest X.XX0 (every 10 pips = 0.001 step where last milli-digit is 0)
  const pInt = Math.round(price * 1000);
  const pRound = Math.round(pInt / 10) * 10;
  if (Math.abs(price - pRound / 1000) <= thr) return true;
  return false;
}

/**
 * Returns true if the last 3 M1 candles show a sharp reversal against the signal direction.
 * All 3 candles must close against signal, and avg body must be non-trivial (> 0.01% of price).
 */
export function detectRecentReversal(candles: readonly Candle[], direction: 'CALL' | 'PUT'): boolean {
  if (candles.length < 3) return false;
  const last3 = candles.slice(-3);
  let against = 0;
  for (const c of last3) {
    const bullish = c.close > c.open;
    const bearish = c.close < c.open;
    if (direction === 'CALL' && bearish) against++;
    if (direction === 'PUT' && bullish) against++;
  }
  if (against < 3) return false;
  const avgBody = last3.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / 3;
  const avgPrice = last3.reduce((sum, c) => sum + c.close, 0) / 3;
  return avgPrice > 0 && avgBody / avgPrice > 0.0001; // body > 0.01% of price
}

// Cache DSL defs for aiPrompt/description lookup
let dslDefsCache: ReadonlyMap<string, StrategyDefJSON> | null = null;
function getDSLDefs(): ReadonlyMap<string, StrategyDefJSON> {
  if (!dslDefsCache) {
    const map = new Map<string, StrategyDefJSON>();
    for (const d of convertAllBuiltins()) map.set(d.id, d);
    dslDefsCache = map;
  }
  return dslDefsCache;
}

// ─── Types ───

export interface LabAiCandidate {
  readonly strategyId: string;
  readonly strategyName: string;
  readonly symbol: string;
  readonly direction: 'CALL' | 'PUT';
  readonly strategyWR: number;
  readonly gatedWR: number;
  readonly recentResults: string; // 'WWLWWL' last 10
  readonly payout: number;
  readonly pairWR: number | null; // WR of this strategy on this specific pair
  readonly aiPrompt: string | null;    // Per-strategy AI validation prompt
  readonly description: string | null; // Strategy description for AI context
}

export interface LabAiResult {
  readonly strategyId: string;
  readonly symbol: string;
  readonly decision: 'CONFIRM' | 'REJECT' | 'WAIT';
  readonly confidence: number;
  readonly reasoning: string;
}

// ─── State ───

let validating = false;
let callCount = 0;
let hourStart = Date.now();
const MAX_CALLS_PER_HOUR = 150; // Conservative — shares budget with main AI
const pendingValidations = new Map<string, LabAiResult>(); // strategyId:symbol → result

// ─── Public API ───

/**
 * Validate a batch of strategy lab signals via Claude.
 * Uses the existing batchAnalyze from llm-analyst (same analyze-batch endpoint).
 * Per-strategy aiPrompt is passed in the setups field for personalized validation.
 */
export async function validateLabSignals(
  candidates: readonly LabAiCandidate[],
  candlesM1: readonly Candle[],
  candlesM5: readonly Candle[] | undefined,
  extra: ExtraIndicators,
): Promise<readonly LabAiResult[]> {
  if (validating || candidates.length === 0) return [];

  const now = Date.now();
  if (now - hourStart > 3_600_000) { callCount = 0; hourStart = now; }
  if (callCount >= MAX_CALLS_PER_HOUR) return [];

  // Get LLM config from settings
  const settings = await chrome.storage.local.get('settings');
  const llmConfig = settings.settings?.indicatorValidation?.llmAnalyst as AnalystConfig | undefined;
  if (!llmConfig?.enabled) return [];

  validating = true;
  try {
    // Build BatchCandidate[] with per-strategy aiPrompt in setups field
    const batchCandidates: BatchCandidate[] = candidates.map(c => {
      const m5 = candlesM5 ?? [];
      const m5Ind = m5.length >= 10 ? computeM5Indicators(m5 as any) : null;
      const agg = getAggregatedSetup(c.symbol, 0);
      const disp = getDisplayState(c.symbol);

      // Per-strategy prompt: ALWAYS include full context (WR, gatedWR, recent, pairWR, market context)
      const desc = c.aiPrompt ?? c.description ?? c.strategyName;
      const currentPrice = candlesM1.length > 0 ? candlesM1[candlesM1.length - 1]!.close : 0;
      const roundLevel = isNearRoundLevel(currentPrice) ? 'yes' : 'no';
      const reversal = detectRecentReversal(candlesM1, c.direction) ? 'yes' : 'no';
      const strategyContext = `lab-validate:${c.strategyId}|${desc}|WR:${c.strategyWR}%|gatedWR:${c.gatedWR}%|recent:${c.recentResults}|pairWR:${c.pairWR ?? 'N/A'}%|roundLevel:${roundLevel}|reversal:${reversal}`;

      return {
        symbol: c.symbol,
        direction: c.direction,
        confidence: c.strategyWR,
        setups: [strategyContext],
        m5Trend: agg.m5Trend,
        rsi: m5Ind?.rsi ?? null,
        macdHistogram: m5Ind?.macdHistogram ?? null,
        histogramRising: m5Ind?.histogramRising ?? false,
        sma20: m5Ind?.sma20 ?? null,
        sma80: disp.sma80 ?? null,
        alligatorState: disp.alligatorState ?? 'neutral',
        price: candlesM1.length > 0 ? candlesM1[candlesM1.length - 1]!.close : 0,
        candlesM1: candlesM1.slice(-20).map(cn => ({ o: cn.open, h: cn.high, l: cn.low, c: cn.close, t: cn.time })),
        candlesM5: m5.slice(-10).map(cn => ({ o: cn.open, h: cn.high, l: cn.low, c: cn.close, t: cn.time })),
        m5Indicators: m5Ind ? { rsi: m5Ind.rsi, macdHistogram: m5Ind.macdHistogram, histogramRising: m5Ind.histogramRising, sma20: m5Ind.sma20, trend: agg.m5Trend } : undefined,
      };
    });

    const response = await batchAnalyze(llmConfig, batchCandidates);
    if (!response || response.results.length === 0) return [];

    callCount++;

    // Map batch results back to LabAiResult — BUY/SELL/WAIT → CONFIRM/REJECT/WAIT
    const results: LabAiResult[] = response.results.map((r, i) => {
      const candidate = candidates[i] ?? candidates[0]!;
      const direction = candidate.direction;

      // AI agrees with trade direction → CONFIRM, disagrees → REJECT, WAIT → WAIT
      let decision: 'CONFIRM' | 'REJECT' | 'WAIT';
      if (r.action === 'WAIT') {
        decision = 'WAIT';
      } else {
        const agrees = (r.action === 'BUY' && direction === 'CALL') || (r.action === 'SELL' && direction === 'PUT');
        decision = agrees ? 'CONFIRM' : 'REJECT';
      }

      return {
        strategyId: candidate.strategyId,
        symbol: r.symbol || candidate.symbol,
        decision,
        confidence: r.confidence,
        reasoning: r.reasoning,
      };
    });

    // Cache results
    for (const result of results) {
      pendingValidations.set(`${result.strategyId}:${result.symbol}`, result);
    }

    console.log(`[SnapTrade] LAB AI: validated ${results.length} signals — ${results.filter(r => r.decision === 'CONFIRM').length} confirmed`);
    return results;
  } catch (err) {
    console.error('[SnapTrade] LAB AI validation failed:', err);
    return [];
  } finally {
    validating = false;
  }
}

/** Get cached AI validation for a strategy+symbol. */
export function getLabAiResult(strategyId: string, symbol: string): LabAiResult | null {
  return pendingValidations.get(`${strategyId}:${symbol}`) ?? null;
}

/** Record AI validation outcome when trade resolves. */
export function recordLabAiOutcome(
  strategyId: string,
  symbol: string,
  tradeWon: boolean,
): void {
  const aiResult = pendingValidations.get(`${strategyId}:${symbol}`);
  if (!aiResult) return;

  const aiConfirmed = aiResult.decision === 'CONFIRM';
  recordAiValidation(strategyId, aiConfirmed, tradeWon);

  // Clear from cache
  pendingValidations.delete(`${strategyId}:${symbol}`);
}

/** Build candidates from qualified strategies that just fired entries. */
export function buildLabAiCandidates(
  firedEntries: ReadonlyArray<{ strategyId: string; symbol: string; direction: 'CALL' | 'PUT'; payout: number }>,
): readonly LabAiCandidate[] {
  const qualified = getAiQualifiedStrategies();
  const qualifiedIds = new Set(qualified.map(s => s.id));

  return firedEntries
    .filter(e => qualifiedIds.has(e.strategyId))
    .map(e => {
      const stats = qualified.find(s => s.id === e.strategyId)!;
      const total = stats.wins + stats.losses;
      const gatedTotal = stats.gatedWins + stats.gatedLosses;
      const dslDef = getDSLDefs().get(e.strategyId);
      const pairMap = getStrategyPairStats(e.strategyId);
      const pairStats = pairMap?.get(e.symbol) ?? null;
      const pairTotal = pairStats ? pairStats.wins + pairStats.losses : 0;
      return {
        strategyId: e.strategyId,
        strategyName: stats.name,
        symbol: e.symbol,
        direction: e.direction,
        strategyWR: total > 0 ? Math.round((stats.wins / total) * 100) : 0,
        gatedWR: gatedTotal > 0 ? Math.round((stats.gatedWins / gatedTotal) * 100) : 0,
        recentResults: stats.recentResults.slice(-10).join(''),
        payout: e.payout,
        pairWR: pairTotal > 0 ? Math.round((pairStats!.wins / pairTotal) * 100) : null,
        aiPrompt: dslDef?.aiPrompt ?? null,
        description: dslDef?.description ?? null,
      };
    });
}

/** Get validation stats. */
export function getLabAiStats(): { calls: number; pending: number; disabled: boolean } {
  return {
    calls: callCount,
    pending: pendingValidations.size,
    disabled: false, // No longer uses separate endpoint — reuses batchAnalyze
  };
}
