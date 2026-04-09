/**
 * Lab AI Observer + Trade Log — Non-blocking AI opinion and trade log persistence.
 * Extracted from lab-to-trade.ts for file size compliance.
 */

import { getCandles } from './candle-collector';
import { batchAnalyze, type AnalystConfig, type BatchCandidate } from './llm-analyst';
import { computeM5Indicators } from './m5-indicators';
import { getAggregatedSetup, getDisplayState } from './setup-detector';

export interface CandidateSignal {
  id: string; sym: string; dir: string; wr: number; pairWR: number | null; payout: number;
}

/** Read current demo balance from PocketOption DOM. Returns null if element not found. */
export function readDemoBalance(): number | null {
  const el = document.querySelector('.balance-info-block__balance, .js-balance-amount');
  const text = el?.textContent?.trim().replace(/[^\d.]/g, '') ?? null;
  return text ? parseFloat(text) : null;
}

let lastAiOpinion: { symbol: string; action: string; confidence: number; reasoning: string; time: number } | null = null;

/** Get AI's last opinion for dashboard display. */
export function getAiOpinion() { return lastAiOpinion; }

/** Get the trade log from chrome.storage (async). */
export async function getLabTradeLog(): Promise<readonly Record<string, unknown>[]> {
  try {
    const r = await chrome.storage.local.get(['labTradeLog']);
    return Array.isArray(r.labTradeLog) ? r.labTradeLog : [];
  } catch { return []; }
}

// ─── Trade Log Helpers ───

/** Update the result field of the last trade in log, including balanceAfter. */
export function updateTradeLogResult(isWin: boolean): void {
  try {
    const balanceAfter = readDemoBalance();
    chrome.storage.local.get(['labTradeLog'], (r) => {
      const log = Array.isArray(r.labTradeLog) ? r.labTradeLog : [];
      if (log.length > 0) {
        const updated = [...log];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          result: isWin ? 'win' : 'loss',
          balanceAfter,
        };
        chrome.storage.local.set({ labTradeLog: updated });
      }
    });
  } catch (err) { console.warn('[SnapTrade] storage write failed:', err); }
}

/** Append a new trade entry to the log with competing signals and timing offset. */
export function appendTradeLog(entry: {
  s: string; sym: string; dir: string; wr: number;
  pairWR: number | null; stake: number; payout: number;
  candidates?: CandidateSignal[]; offset?: number;
  balanceBefore?: number | null;
  aiDecision?: string | null; aiConfidence?: number | null;
}): void {
  try {
    const { candidates, offset, balanceBefore, aiDecision, aiConfidence, ...rest } = entry;
    chrome.storage.local.get(['labTradeLog'], (r) => {
      const log = Array.isArray(r.labTradeLog) ? r.labTradeLog : [];
      chrome.storage.local.set({
        labTradeLog: [...log, {
          t: Date.now(), ...rest, result: null, ai: aiDecision ?? null,
          candidates: candidates ?? [], aiWouldBlock: null,
          offset: offset ?? null,
          balanceBefore: balanceBefore ?? null, balanceAfter: null,
          aiConfidence: aiConfidence ?? null,
        }].slice(-200),
      });
    });
  } catch (err) { console.warn('[SnapTrade] storage write failed:', err); }
}

/** Fire-and-forget AI opinion — does NOT block trade execution. */
export async function askAiOpinion(symbol: string, direction: 'CALL' | 'PUT', strategyId: string): Promise<void> {
  try {
    const settings = await chrome.storage.local.get('settings');
    const llmConfig = settings.settings?.indicatorValidation?.llmAnalyst as AnalystConfig | undefined;
    if (!llmConfig?.enabled) return;

    const m5 = getCandles(symbol, 'M5');
    const m1 = getCandles(symbol, 'M1');
    if (m5.length < 10) return;
    const m5Ind = computeM5Indicators(m5 as any);
    const agg = getAggregatedSetup(symbol, 0);
    const disp = getDisplayState(symbol);

    const candidates: BatchCandidate[] = [{
      symbol, direction, confidence: 80,
      setups: [`lab:${strategyId}`],
      m5Trend: agg.m5Trend,
      rsi: m5Ind.rsi, macdHistogram: m5Ind.macdHistogram,
      histogramRising: m5Ind.histogramRising, sma20: m5Ind.sma20,
      sma80: disp.sma80 ?? null, alligatorState: disp.alligatorState ?? 'neutral',
      price: m5[m5.length - 1]!.close,
      candlesM1: m1.slice(-20).map(c => ({ o: c.open, h: c.high, l: c.low, c: c.close, t: c.time })),
      candlesM5: m5.slice(-10).map(c => ({ o: c.open, h: c.high, l: c.low, c: c.close, t: c.time })),
    }];

    const result = await batchAnalyze(llmConfig, candidates);
    if (result && result.results.length > 0) {
      const r = result.results[0]!;
      lastAiOpinion = { symbol, action: r.action, confidence: r.confidence, reasoning: r.reasoning.slice(0, 120), time: Date.now() };
      const agrees = (r.action === 'BUY' && direction === 'CALL') || (r.action === 'SELL' && direction === 'PUT');
      console.log(`[SnapTrade] AI OBSERVER: ${r.action} ${r.confidence}% — ${agrees ? 'AGREES' : 'DISAGREES'} with ${direction} ${symbol} | ${r.reasoning.slice(0, 60)}`);
      // Persist AI opinion to last trade in log
      try {
        chrome.storage.local.get(['labTradeLog'], (res) => {
          const log = (res.labTradeLog as any[]) || [];
          if (log.length > 0) {
            const updated = [...log];
            const wouldBlock = r.action === 'WAIT' || (r.action === 'SELL' && direction === 'CALL') || (r.action === 'BUY' && direction === 'PUT');
            updated[updated.length - 1] = { ...updated[updated.length - 1], ai: { action: r.action, conf: r.confidence, agrees, reason: r.reasoning.slice(0, 200) }, aiWouldBlock: wouldBlock };
            chrome.storage.local.set({ labTradeLog: updated });
          }
        });
      } catch { /* */ }
    }
  } catch (err) { console.warn('[SnapTrade] AI observer error:', err); }
}
