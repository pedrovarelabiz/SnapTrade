/**
 * LLM Analyst — Uses Claude via SnapTrade backend (Claude Agent SDK).
 * No API key needed — uses the existing Claude subscription on the VPS.
 * Takes chart screenshot + indicator data, returns structured trading decisions.
 */

import type { Candle } from './candle-collector';
import { getCandles } from './candle-collector';
import type { AggregatedSetup } from './setup-detector';
import { API_BASE } from '../../lib/constants';

// ─── Types ───

export interface LlmAnalysis {
  action: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  expiration: number;
  patterns: string[];
  support: number | null;
  resistance: number | null;
  reasoning: string;
  timestamp: number;
  model: string;
}

export interface AnalystConfig {
  enabled: boolean;
  autoExecute: boolean;
  minConfidence: number;
}

export interface BatchCandidate {
  symbol: string;
  direction: 'CALL' | 'PUT';
  confidence: number;
  setups: string[];
  m5Trend: string;
  // Primary indicators — M1 in M1-Primary mode, M5 in M5-Primary mode
  rsi: number | null;
  macdHistogram: number | null;
  histogramRising: boolean;
  sma20: number | null;
  sma80: number | null;
  alligatorState: string;
  price: number;
  candlesM1: Array<{ o: number; h: number; l: number; c: number; t: number }>;
  candlesM5?: Array<{ o: number; h: number; l: number; c: number; t: number }>;
  m5Indicators?: { rsi: number | null; macdHistogram: number | null; histogramRising: boolean; sma20: number | null; trend: string };
  // M1 alignment context (M5-Primary mode only)
  m1Alignment?: { rsi: number | null; histogramRising: boolean; sma20: number | null };
  // Signal architecture for shadow tracker
  architecture?: 'm1-primary' | 'm5-primary';
}

export interface BatchResult {
  symbol: string;
  action: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  reasoning: string;
  rank: number;
}

export interface BatchAnalysisResponse {
  results: BatchResult[];
  model: string;
  timestamp: number;
}

// ─── State ───

let lastAnalysis: LlmAnalysis | null = null;
const analyzingSymbols = new Set<string>(); // Per-symbol mutex
const MAX_CONCURRENT = 10; // Max concurrent API calls — covers all high-confidence pairs per cycle
const MIN_CANDLES_FOR_AI = 10; // Skip AI if pair has fewer M1 candles
let callCount = 0;
let hourStart = Date.now();
let endpointDisabled = false; // Auto-disable after 404 (endpoint doesn't exist)

// ─── Chart Screenshot ───

function captureChart(): string | null {
  try {
    const chartEl = document.getElementById('chart-1');
    if (!chartEl) return null;

    const canvas = chartEl.querySelector('canvas') || chartEl as HTMLCanvasElement;
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) return null;

    const maxWidth = 800;
    const maxHeight = 600;
    const rect = canvas.getBoundingClientRect();

    const tempCanvas = document.createElement('canvas');
    const scale = Math.min(maxWidth / rect.width, maxHeight / rect.height, 1);
    tempCanvas.width = Math.floor(rect.width * scale);
    tempCanvas.height = Math.floor(rect.height * scale);

    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
    return tempCanvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}

// ─── Backend API Call ───

async function callBackend(
  token: string,
  symbol: string,
  candles: Candle[],
  chartImage: string | null,
  displayState: Record<string, unknown>,
  setup: AggregatedSetup,
): Promise<LlmAnalysis> {
  const response = await fetch(`${API_BASE}/extension/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      symbol,
      chartImage,
      // Multi-timeframe: M1 for entry timing, M5 for macro trend
      candlesM1: candles.slice(-20).map(c => ({
        open: c.open, high: c.high, low: c.low, close: c.close, time: c.time,
      })),
      candlesM5: getCandles(symbol, 'M5').slice(-20).map(c => ({
        open: c.open, high: c.high, low: c.low, close: c.close, time: c.time,
      })),
      indicatorData: {
        price: candles.length > 0 ? candles[candles.length - 1]!.close : 0,
        rsi: displayState.rsi,
        macdLine: displayState.macdLine,
        signalLine: displayState.signalLine,
        macdHistogram: displayState.macdHistogram,
        histogramRising: displayState.histogramRising,
        sma20: displayState.sma20,
        sma80: displayState.sma80,
        m5Trend: displayState.m5Trend,
        alligatorState: displayState.alligatorState,
        inSqueeze: displayState.inSqueeze,
        activeSetups: setup.activeSetups.map(s => `${s.type} ${s.direction}`).join(', '),
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Backend ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();

  return {
    action: data.action ?? 'WAIT',
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    expiration: data.expiration ?? 5,
    patterns: Array.isArray(data.patterns) ? data.patterns : [],
    support: typeof data.support === 'number' ? data.support : null,
    resistance: typeof data.resistance === 'number' ? data.resistance : null,
    reasoning: data.reasoning ?? '',
    timestamp: data.timestamp ?? Date.now(),
    model: data.model ?? 'claude-sonnet-4-6',
  };
}

// ─── Public API ───

/**
 * Analyze chart via backend Claude SDK.
 * Uses existing Claude subscription — no API key needed.
 */
export async function analyzeWithLlm(
  config: AnalystConfig,
  symbol: string,
  candles: Candle[],
  setup: AggregatedSetup,
  displayState: Record<string, unknown>,
): Promise<LlmAnalysis | null> {
  if (!config.enabled || endpointDisabled) return null;
  if (analyzingSymbols.has(symbol)) return null; // Already analyzing this symbol
  if (analyzingSymbols.size >= MAX_CONCURRENT) return null; // Too many concurrent calls

  // Skip pairs with insufficient candle data (AI will just say "insufficient data")
  if (candles.length < MIN_CANDLES_FOR_AI) return null;

  // Rate limit: max 300 calls/hour (~5/min covers 10 pairs per M1 cycle)
  const now = Date.now();
  if (now - hourStart > 3600000) { callCount = 0; hourStart = now; }
  if (callCount >= 300) {
    console.log('[SnapTrade] LLM rate limit reached (300/hr)');
    return null;
  }

  analyzingSymbols.add(symbol);
  try {
    console.log(`[SnapTrade] AI analyzing ${symbol}...`);

    // Get extension token from storage
    const settings = await chrome.storage.local.get('settings');
    const token = settings.settings?.extensionToken;
    if (!token) {
      console.warn('[SnapTrade] No extension token for AI analysis');
      return null;
    }

    const chartImage = captureChart();
    const analysis = await callBackend(token, symbol, candles, chartImage, displayState, setup);
    callCount++;

    lastAnalysis = analysis;

    console.log(`[SnapTrade] AI: ${analysis.action} ${analysis.confidence}% | ${analysis.patterns.join(', ')} | ${analysis.reasoning.slice(0, 100)}`);

    return analysis;
  } catch (err) {
    const errMsg = String(err);
    if (errMsg.includes('404')) {
      console.warn('[SnapTrade] AI endpoint not found (404) — disabling LLM analysis until reload');
      endpointDisabled = true;
    } else {
      console.error('[SnapTrade] AI analysis failed:', err);
    }
    return null;
  } finally {
    analyzingSymbols.delete(symbol);
  }
}

export function getLastAnalysis(): LlmAnalysis | null {
  return lastAnalysis;
}

export function getLlmStats(): { calls: number } {
  return { calls: callCount };
}

// ─── AI Accuracy Tracking ───

/**
 * Log an AI prediction to the backend for accuracy tracking.
 * Called when AI returns BUY/SELL and a trade is created.
 */
export async function logAiPrediction(params: {
  symbol: string;
  predictedAction: string;
  predictedConfidence: number;
  localConfidence: number;
  model: string;
  source: 'batch' | 'individual';
  tradeId: string;
}): Promise<void> {
  try {
    const settings = await chrome.storage.local.get('settings');
    const token = settings.settings?.extensionToken;
    if (!token) return;

    fetch(`${API_BASE}/extension/ai-prediction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(params),
    }).catch(() => {}); // Fire and forget
  } catch { /* ignore */ }
}

/**
 * Send trade result feedback for an AI prediction.
 * Called when trade result arrives (WIN/LOSS).
 */
export async function logAiFeedback(tradeId: string, result: 'win' | 'loss'): Promise<void> {
  try {
    const settings = await chrome.storage.local.get('settings');
    const token = settings.settings?.extensionToken;
    if (!token) return;

    fetch(`${API_BASE}/extension/ai-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ tradeId, result }),
    }).catch(() => {}); // Fire and forget
  } catch { /* ignore */ }
}

// ─── Batch Analysis ───

let batchInProgress = false;

/**
 * Analyze multiple pairs in a single API call.
 * Sends all candidates with their indicator data, receives ranked results.
 * 1 call instead of N — saves 80-90% of API usage.
 */
export async function batchAnalyze(
  config: AnalystConfig,
  candidates: BatchCandidate[],
): Promise<BatchAnalysisResponse | null> {
  if (!config.enabled || endpointDisabled) return null;
  if (batchInProgress) return null; // Only one batch at a time
  if (candidates.length === 0) return null;

  const now = Date.now();
  if (now - hourStart > 3600000) { callCount = 0; hourStart = now; }
  if (callCount >= 300) {
    console.log('[SnapTrade] LLM rate limit reached (300/hr)');
    return null;
  }

  batchInProgress = true;
  try {
    const settings = await chrome.storage.local.get('settings');
    const token = settings.settings?.extensionToken;
    if (!token) return null;

    console.log(`[SnapTrade] AI batch analyzing ${candidates.length} pairs: ${candidates.map(c => c.symbol).join(', ')}`);

    const response = await fetch(`${API_BASE}/extension/analyze-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        candidates: candidates.map(c => ({
          symbol: c.symbol,
          direction: c.direction,
          localConfidence: c.confidence,
          setups: c.setups,
          m5Trend: c.m5Trend,
          indicatorData: {
            price: c.price,
            rsi: c.rsi,
            macdHistogram: c.macdHistogram,
            histogramRising: c.histogramRising,
            sma20: c.sma20,
            sma80: c.sma80,
            alligatorState: c.alligatorState,
          },
          candlesM1: c.candlesM1,
          candlesM5: c.candlesM5,
          m5Indicators: c.m5Indicators,
        })),
        timestamp: now,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      // If batch endpoint doesn't exist (404), fall back to individual analysis
      if (response.status === 404) {
        console.log('[SnapTrade] Batch endpoint not found — falling back to individual analysis');
        return null;
      }
      throw new Error(`Backend ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    callCount++;

    const batchResult: BatchAnalysisResponse = {
      results: Array.isArray(data.results) ? data.results.map((r: any, i: number) => ({
        symbol: r.symbol ?? '',
        action: r.action ?? 'WAIT',
        confidence: typeof r.confidence === 'number' ? r.confidence : 0,
        reasoning: r.reasoning ?? '',
        rank: r.rank ?? i + 1,
      })) : [],
      model: data.model ?? 'unknown',
      timestamp: now,
    };

    console.log(`[SnapTrade] AI batch result: ${batchResult.results.map(r => `${r.symbol}=${r.action} ${r.confidence}%`).join(' | ')}`);

    return batchResult;
  } catch (err) {
    console.error('[SnapTrade] AI batch analysis failed:', err);
    return null;
  } finally {
    batchInProgress = false;
  }
}
