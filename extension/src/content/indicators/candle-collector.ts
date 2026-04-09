/**
 * Candle Collector — Builds OHLC candles from PO WebSocket tick data.
 * Listens for ST_WS_BINARY tick messages and aggregates into candles
 * at multiple timeframes simultaneously.
 */

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  time: number; // unix seconds (start of candle)
  volume: number;
}

export type Timeframe = 'S5' | 'S10' | 'S15' | 'S30' | 'M1' | 'M2' | 'M3' | 'M5' | 'M10' | 'M15' | 'M30' | 'H1';

const TF_SECONDS: Record<Timeframe, number> = {
  S5: 5, S10: 10, S15: 15, S30: 30,
  M1: 60, M2: 120, M3: 180, M5: 300,
  M10: 600, M15: 900, M30: 1800, H1: 3600,
};

const MAX_CANDLES = 300; // Enough for SMA(100) with 200 data points + margin

interface AssetData {
  candles: Map<Timeframe, Candle[]>;
  currentCandle: Map<Timeframe, Candle>;
  lastPrice: number;
  lastTick: number;
}

const assets = new Map<string, AssetData>();

function getOrCreateAsset(symbol: string): AssetData {
  let data = assets.get(symbol);
  if (!data) {
    data = { candles: new Map(), currentCandle: new Map(), lastPrice: 0, lastTick: 0 };
    assets.set(symbol, data);
  }
  return data;
}

function getCandleStart(timestamp: number, tfSeconds: number): number {
  return Math.floor(timestamp / tfSeconds) * tfSeconds;
}

/**
 * Process a single tick for an asset.
 */
export function processTick(symbol: string, timestamp: number, price: number): void {
  const data = getOrCreateAsset(symbol);
  data.lastPrice = price;
  data.lastTick = timestamp;

  for (const [tf, seconds] of Object.entries(TF_SECONDS) as [Timeframe, number][]) {
    const candleStart = getCandleStart(timestamp, seconds);

    let current = data.currentCandle.get(tf);

    if (!current || current.time !== candleStart) {
      // Close previous candle
      if (current) {
        let arr = data.candles.get(tf);
        if (!arr) { arr = []; data.candles.set(tf, arr); }
        arr.push({ ...current });
        if (arr.length > MAX_CANDLES) arr.shift();
      }
      // New candle
      current = { open: price, high: price, low: price, close: price, time: candleStart, volume: 1 };
      data.currentCandle.set(tf, current);
    } else {
      current.high = Math.max(current.high, price);
      current.low = Math.min(current.low, price);
      current.close = price;
      current.volume++;
    }
  }
}

/**
 * Get closed candles + current incomplete candle for a symbol/timeframe.
 */
export function getCandles(symbol: string, tf: Timeframe): Candle[] {
  const data = assets.get(symbol);
  if (!data) return [];
  const closed = data.candles.get(tf) || [];
  const current = data.currentCandle.get(tf);
  return current ? [...closed, current] : [...closed];
}

/**
 * Get the last price for an asset.
 */
export function getLastPrice(symbol: string): number {
  return assets.get(symbol)?.lastPrice ?? 0;
}

/**
 * Get all tracked symbols.
 */
export function getTrackedSymbols(): string[] {
  return Array.from(assets.keys());
}

/**
 * Initialize tick listener from WS interceptor messages.
 */
export function initCandleCollector(): void {
  let tickCount = 0;
  let lastLog = 0;
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const { type, data } = event.data ?? {};

    // Tick data from ws-interceptor: ST_WS_BINARY contains price arrays
    if (type === 'ST_WS_BINARY') {
      try {
        const raw = String(data);
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (Array.isArray(item) && item.length >= 3) {
              const [symbol, timestamp, price] = item;
              if (typeof symbol === 'string' && typeof price === 'number') {
                processTick(symbol, timestamp, price);
                tickCount++;
                // Log every 60s
                const now = Date.now();
                if (now - lastLog > 60000) {
                  const symbols = getTrackedSymbols();
                  console.log(`[SnapTrade] ${symbols.length} symbols, ${tickCount} ticks`);
                  lastLog = now;
                }
              }
            }
          }
        }
      } catch { /* not tick data */ }
    }

    // Accept explicit tick messages from indicator-bridge
    if (type === 'ST_TICK_DATA') {
      const { symbol, timestamp, price } = event.data;
      if (symbol && timestamp && price) {
        processTick(symbol, timestamp, price);
        tickCount++;
      }
    }

    // Accept historical candles from indicator-bridge (seeds from PO's chart)
    if (type === 'ST_HISTORICAL_CANDLES') {
      const { symbol, timeframe, candles: histCandles } = event.data;
      if (symbol && timeframe && Array.isArray(histCandles) && histCandles.length > 0) {
        seedHistoricalCandles(symbol, timeframe as Timeframe, histCandles);
        console.log(`[SnapTrade] Seeded ${histCandles.length} ${timeframe} candles for ${symbol}`);
      }
    }
  });
}

/**
 * Seed historical candles from PO's chart data.
 * Replaces existing candles for the given symbol/timeframe.
 */
function seedHistoricalCandles(symbol: string, tf: Timeframe, candles: Candle[]): void {
  const data = getOrCreateAsset(symbol);
  // Replace candles for this timeframe with historical data
  data.candles.set(tf, candles.slice(-MAX_CANDLES));
  // Set current candle to the last one
  if (candles.length > 0) {
    const last = candles[candles.length - 1]!;
    data.currentCandle.set(tf, { ...last });
    data.lastPrice = last.close;
    data.lastTick = last.time;
  }
}
