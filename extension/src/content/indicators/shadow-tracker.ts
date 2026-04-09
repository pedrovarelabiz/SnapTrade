/**
 * Shadow Tracker — Simulates "next candle entry" without affecting real trades.
 *
 * For each signal generated, tracks what would happen if:
 *   1. We entered at the OPEN of the next M1 candle (instead of immediately)
 *   2. We entered at the OPEN of the next M5 candle
 *
 * Binary option result: if direction is CALL and close > open → WIN, else LOSS.
 *                       if direction is PUT  and close < open → WIN, else LOSS.
 *
 * Persists stats to chrome.storage.local for popup/log display.
 */

import type { Candle, Timeframe } from './candle-collector';

// ─── Types ───

interface ShadowSignal {
  readonly id: string;
  readonly symbol: string;
  readonly direction: 'CALL' | 'PUT';
  readonly confidence: number;
  readonly source: string; // 'high-conf' | 'ai-approved' | 'ai-vetoed' | 'pre-filter-vetoed'
  readonly signalTime: number;
  readonly priceAtSignal: number;
  readonly architecture: 'm1-primary' | 'm5-primary'; // signal generation mode
  // Actual trade result (null if not traded)
  actualResult: 'win' | 'loss' | null;
  // Immediate shadow results: enter at priceAtSignal, exit at current candle close
  immediateM1: 'win' | 'loss' | 'pending'; // exit at current M1 close
  immediateM5: 'win' | 'loss' | 'pending'; // exit at current M5 close
  // Delayed shadow results: enter at NEXT candle open, exit at that candle close
  m1Result: 'win' | 'loss' | 'pending' | null;
  m1EntryPrice: number | null;
  m1ExitPrice: number | null;
  m5Result: 'win' | 'loss' | 'pending' | null;
  m5EntryPrice: number | null;
  m5ExitPrice: number | null;
}

export interface ShadowStats {
  readonly totalSignals: number;
  readonly immediateM1: { wins: number; losses: number; rate: number };
  readonly immediateM5: { wins: number; losses: number; rate: number };
  readonly delayedM1: { wins: number; losses: number; rate: number };
  readonly delayedM5: { wins: number; losses: number; rate: number };
  readonly recentSignals: ReadonlyArray<{
    symbol: string;
    direction: string;
    confidence: number;
    source: string;
    immM1: string;
    immM5: string;
    m1: string;
    m5: string;
    time: string;
  }>;
}

// ─── State ───

const pendingImmediateM1 = new Map<string, ShadowSignal[]>(); // symbol → signals waiting for current M1 candle close
const pendingImmediateM5 = new Map<string, ShadowSignal[]>(); // symbol → signals waiting for current M5 candle close
const pendingM1 = new Map<string, ShadowSignal[]>(); // symbol → signals waiting for next M1
const pendingM5 = new Map<string, ShadowSignal[]>(); // symbol → signals waiting for next M5
const resolvedSignals: ShadowSignal[] = []; // all resolved signals (last 200)
const MAX_RESOLVED = 200;
let statsVersion = 0;

// ─── Public API ───

/**
 * Register a signal for shadow tracking.
 * Call this whenever a signal is generated, regardless of whether it's traded.
 */
export function shadowRegister(
  symbol: string,
  direction: 'CALL' | 'PUT',
  confidence: number,
  source: string,
  priceAtSignal: number,
  actualResult: 'win' | 'loss' | null,
  architecture: 'm1-primary' | 'm5-primary' = 'm1-primary',
): void {
  const signal: ShadowSignal = {
    id: `${symbol}_${Date.now()}`,
    symbol,
    direction,
    confidence,
    source,
    signalTime: Date.now(),
    priceAtSignal,
    architecture,
    actualResult,
    immediateM1: 'pending',
    immediateM5: 'pending',
    m1Result: 'pending',
    m1EntryPrice: null,
    m1ExitPrice: null,
    m5Result: 'pending',
    m5EntryPrice: null,
    m5ExitPrice: null,
  };

  // Queue for immediate resolution (entry at signal price, exit at current candle close)
  const immM1Queue = pendingImmediateM1.get(symbol) ?? [];
  pendingImmediateM1.set(symbol, [...immM1Queue, signal]);
  const immM5Queue = pendingImmediateM5.get(symbol) ?? [];
  pendingImmediateM5.set(symbol, [...immM5Queue, signal]);

  // Queue for delayed entry (next candle open → close)
  const m1Queue = pendingM1.get(symbol) ?? [];
  pendingM1.set(symbol, [...m1Queue, signal]);
  const m5Queue = pendingM5.get(symbol) ?? [];
  pendingM5.set(symbol, [...m5Queue, signal]);
}

/**
 * Called on each candle close. Resolves pending shadow signals.
 * The "next candle" for a signal is the candle that closes AFTER the signal was created.
 * Entry = candle open, exit = candle close.
 */
export function shadowOnCandleClose(symbol: string, tf: Timeframe, candle: Candle): void {
  // Resolve immediate results: signals created DURING this candle
  // (entered at priceAtSignal, compare against candle close)
  const immField = tf === 'M1' ? 'immediateM1' : tf === 'M5' ? 'immediateM5' : null;
  const immQueueMap = tf === 'M1' ? pendingImmediateM1 : tf === 'M5' ? pendingImmediateM5 : null;
  const candleDurationMs = tf === 'M1' ? 60_000 : tf === 'M5' ? 300_000 : 0;

  if (immField && immQueueMap) {
    const immQueue = immQueueMap.get(symbol);
    if (immQueue && immQueue.length > 0) {
      const candleStartMs = candle.time * 1000;
      const candleEndMs = candleStartMs + candleDurationMs;
      // Resolve signals created during this candle + any late signals
      for (const s of immQueue) {
        if (s[immField] === 'pending' && s.signalTime < candleEndMs) {
          const isWin = s.direction === 'CALL'
            ? candle.close > s.priceAtSignal
            : candle.close < s.priceAtSignal;
          s[immField] = isWin ? 'win' : 'loss';
        }
      }
      // Keep only unresolved signals
      immQueueMap.set(symbol, immQueue.filter(s => s[immField] === 'pending'));
    }
  }

  const queueMap = tf === 'M1' ? pendingM1 : tf === 'M5' ? pendingM5 : null;
  if (!queueMap) return;

  const queue = queueMap.get(symbol);
  if (!queue || queue.length === 0) return;

  // Only resolve signals that were created BEFORE this candle opened
  const toResolve = queue.filter(s => s.signalTime < candle.time * 1000);
  if (toResolve.length === 0) return;

  // Remove resolved from queue
  const remaining = queue.filter(s => s.signalTime >= candle.time * 1000);
  queueMap.set(symbol, remaining);

  for (const signal of toResolve) {
    const entryPrice = candle.open;
    const exitPrice = candle.close;
    const isWin = signal.direction === 'CALL'
      ? exitPrice > entryPrice
      : exitPrice < entryPrice;

    if (tf === 'M1') {
      signal.m1Result = isWin ? 'win' : 'loss';
      signal.m1EntryPrice = entryPrice;
      signal.m1ExitPrice = exitPrice;
    } else if (tf === 'M5') {
      signal.m5Result = isWin ? 'win' : 'loss';
      signal.m5EntryPrice = entryPrice;
      signal.m5ExitPrice = exitPrice;
    }

    // Check if fully resolved (both immediates + both delayed all done)
    if (signal.immediateM1 !== 'pending' && signal.immediateM5 !== 'pending' && signal.m1Result !== 'pending' && signal.m5Result !== 'pending') {
      resolvedSignals.push(signal);
      // Trim to max
      while (resolvedSignals.length > MAX_RESOLVED) resolvedSignals.shift();
    }
  }

  statsVersion++;
  // Persist stats periodically (every 10 updates)
  if (statsVersion % 10 === 0) persistStats();
}

/**
 * Update actual result for a signal (called when real trade result comes in).
 */
export function shadowUpdateActualResult(
  symbol: string,
  direction: 'CALL' | 'PUT',
  result: 'win' | 'loss',
  tradeTime: number,
): void {
  // Find in pending queues
  for (const queue of [pendingM1, pendingM5]) {
    const signals = queue.get(symbol) ?? [];
    for (const s of signals) {
      if (s.direction === direction && s.actualResult === null &&
        Math.abs(s.signalTime - tradeTime) < 120_000) {
        s.actualResult = result;
      }
    }
  }
  // Find in resolved
  for (const s of resolvedSignals) {
    if (s.symbol === symbol && s.direction === direction && s.actualResult === null &&
      Math.abs(s.signalTime - tradeTime) < 120_000) {
      s.actualResult = result;
    }
  }
}

/**
 * Get current shadow stats.
 */
export function getShadowStats(): ShadowStats {
  // Combine resolved + partially resolved from queues
  const allSignals = [
    ...resolvedSignals,
    ...Array.from(pendingM1.values()).flat().filter(s => s.m1Result !== 'pending'),
  ];

  const withImmM1 = allSignals.filter(s => s.immediateM1 === 'win' || s.immediateM1 === 'loss');
  const withImmM5 = allSignals.filter(s => s.immediateM5 === 'win' || s.immediateM5 === 'loss');
  const withM1 = allSignals.filter(s => s.m1Result === 'win' || s.m1Result === 'loss');
  const withM5 = allSignals.filter(s => s.m5Result === 'win' || s.m5Result === 'loss');

  const immM1W = withImmM1.filter(s => s.immediateM1 === 'win').length;
  const immM1L = withImmM1.filter(s => s.immediateM1 === 'loss').length;
  const immM5W = withImmM5.filter(s => s.immediateM5 === 'win').length;
  const immM5L = withImmM5.filter(s => s.immediateM5 === 'loss').length;
  const m1W = withM1.filter(s => s.m1Result === 'win').length;
  const m1L = withM1.filter(s => s.m1Result === 'loss').length;
  const m5W = withM5.filter(s => s.m5Result === 'win').length;
  const m5L = withM5.filter(s => s.m5Result === 'loss').length;

  const rate = (w: number, l: number) => w + l > 0 ? Math.round((w / (w + l)) * 100) : 0;

  const recent = allSignals.slice(-20).reverse().map(s => ({
    symbol: s.symbol,
    direction: s.direction,
    confidence: s.confidence,
    source: s.source,
    immM1: s.immediateM1 !== 'pending' ? s.immediateM1 : '-',
    immM5: s.immediateM5 !== 'pending' ? s.immediateM5 : '-',
    m1: s.m1Result ?? '-',
    m5: s.m5Result ?? '-',
    time: new Date(s.signalTime).toISOString().substring(11, 19),
  }));

  return {
    totalSignals: allSignals.length,
    immediateM1: { wins: immM1W, losses: immM1L, rate: rate(immM1W, immM1L) },
    immediateM5: { wins: immM5W, losses: immM5L, rate: rate(immM5W, immM5L) },
    delayedM1: { wins: m1W, losses: m1L, rate: rate(m1W, m1L) },
    delayedM5: { wins: m5W, losses: m5L, rate: rate(m5W, m5L) },
    recentSignals: recent,
  };
}

function persistStats(): void {
  const stats = getShadowStats();
  chrome.storage.local.set({ shadowStats: stats }).catch(() => {});
  // Log comparison periodically
  if (stats.totalSignals > 0 && stats.totalSignals % 20 === 0) {
    console.log(`[SnapTrade] SHADOW COMPARISON (${stats.totalSignals} signals): ImmM1 ${stats.immediateM1.rate}% (${stats.immediateM1.wins}W/${stats.immediateM1.losses}L) | ImmM5 ${stats.immediateM5.rate}% (${stats.immediateM5.wins}W/${stats.immediateM5.losses}L) | DelayM1 ${stats.delayedM1.rate}% (${stats.delayedM1.wins}W/${stats.delayedM1.losses}L) | DelayM5 ${stats.delayedM5.rate}% (${stats.delayedM5.wins}W/${stats.delayedM5.losses}L)`);
  }
}

/** Health metrics for the system health monitor. */
export function getShadowHealthMetrics(): {
  totalSignals: number;
  preFilterVetoed: number;
  preFilterPassed: number;
  passRate: number;
  sourceBreakdown: Record<string, number>;
} {
  const allSignals = [
    ...resolvedSignals,
    ...Array.from(pendingM1.values()).flat(),
    ...Array.from(pendingM5.values()).flat(),
    ...Array.from(pendingImmediateM1.values()).flat(),
    ...Array.from(pendingImmediateM5.values()).flat(),
  ];
  // Deduplicate by id
  const seen = new Set<string>();
  const unique = allSignals.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });

  const sourceBreakdown: Record<string, number> = {};
  let vetoed = 0;
  let passed = 0;
  for (const s of unique) {
    sourceBreakdown[s.source] = (sourceBreakdown[s.source] ?? 0) + 1;
    if (s.source === 'pre-filter-vetoed') vetoed++;
    else passed++;
  }
  const total = vetoed + passed;
  return {
    totalSignals: total,
    preFilterVetoed: vetoed,
    preFilterPassed: passed,
    passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
    sourceBreakdown,
  };
}

/** Force persist (call on session end) */
export function shadowFlush(): void {
  persistStats();
}
