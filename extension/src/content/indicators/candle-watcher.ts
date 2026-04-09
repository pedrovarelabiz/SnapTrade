/**
 * Candle Watcher — Detects candle closes for ALL tracked symbols.
 * Only fires ONCE per candle close per symbol. Stable, not tick-based.
 *
 * v2: Multi-symbol support — watches all symbols from candle-collector,
 * not just the visible chart symbol.
 */

import { getCandles, getTrackedSymbols, type Candle, type Timeframe } from './candle-collector';

export type CandleCloseHandler = (symbol: string, tf: Timeframe, candles: Candle[]) => void;

// Per-symbol last known candle time
const lastCandleTimes = new Map<string, Map<Timeframe, number>>();
const handlers: CandleCloseHandler[] = [];

let watchInterval: ReturnType<typeof setInterval> | null = null;
let watchedTimeframes: Timeframe[] = ['M1', 'M5'];
let primarySymbol = ''; // The visible chart symbol (gets priority logging)

function getSymbolState(symbol: string): Map<Timeframe, number> {
  let times = lastCandleTimes.get(symbol);
  if (!times) {
    times = new Map();
    lastCandleTimes.set(symbol, times);
  }
  return times;
}

function checkForClose(): void {
  const symbols = getTrackedSymbols();
  if (symbols.length === 0) return;

  for (const symbol of symbols) {
    const times = getSymbolState(symbol);

    for (const tf of watchedTimeframes) {
      const candles = getCandles(symbol, tf);
      if (candles.length < 2) continue;

      // The second-to-last candle is the most recently CLOSED candle
      const closedCandle = candles[candles.length - 2]!;
      const lastKnown = times.get(tf) ?? 0;

      if (closedCandle.time > lastKnown) {
        times.set(tf, closedCandle.time);

        // Skip the very first detection (initialization)
        if (lastKnown === 0) continue;

        // Fire handlers with closed candles (exclude current incomplete)
        const closedCandles = candles.slice(0, -1);
        for (const handler of handlers) {
          try {
            handler(symbol, tf, closedCandles);
          } catch (err) {
            console.warn('[SnapTrade] CandleWatcher handler error:', symbol, tf, err);
          }
        }
      }
    }
  }
}

/**
 * Start watching for candle closes across all tracked symbols.
 * @param symbol Primary symbol (visible chart) — used for backwards compatibility
 * @param timeframes Timeframes to monitor (default: M1, M5)
 */
export function startCandleWatcher(symbol: string, timeframes?: Timeframe[]): void {
  primarySymbol = symbol;
  if (timeframes) watchedTimeframes = timeframes;

  if (watchInterval) clearInterval(watchInterval);
  watchInterval = setInterval(checkForClose, 1000);
  console.log(`[SnapTrade] CandleWatcher started: primary=${symbol} [${watchedTimeframes.join(',')}]`);
}

/**
 * Update the primary symbol (e.g., when chart changes).
 * Does NOT stop watching other symbols.
 */
export function setWatchSymbol(symbol: string): void {
  if (symbol !== primarySymbol) {
    primarySymbol = symbol;
  }
}

/**
 * Register a handler for candle close events.
 */
export function onCandleClose(handler: CandleCloseHandler): void {
  handlers.push(handler);
}

/**
 * Stop watching.
 */
export function stopCandleWatcher(): void {
  if (watchInterval) { clearInterval(watchInterval); watchInterval = null; }
  handlers.length = 0;
  lastCandleTimes.clear();
  primarySymbol = '';
}

/**
 * Get the timestamp of the last closed candle for a symbol/timeframe.
 */
export function getLastCloseTime(tf: Timeframe, symbol?: string): number {
  const sym = symbol ?? primarySymbol;
  return lastCandleTimes.get(sym)?.get(tf) ?? 0;
}
