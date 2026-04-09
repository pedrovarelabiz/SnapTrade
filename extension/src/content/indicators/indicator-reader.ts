/**
 * Indicator Reader — Content script side.
 * Listens for snapshots from the MAIN world indicator-bridge
 * and exposes the latest indicator state.
 */

export interface IndicatorSnapshot {
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  sma: number | null;
  alligator: { jaws: number; teeth: number; lips: number } | null;
  donchian: { upper: number; lower: number; mid: number } | null;
  price: number;
  candles: Array<{ open: number; close: number; high: number; low: number; time: number }>;
  timeframe: number;
}

const EMPTY_SNAPSHOT: IndicatorSnapshot = {
  rsi: null, macd: null, sma: null, alligator: null, donchian: null,
  price: 0, candles: [], timeframe: 1,
};

let latestSnapshot: IndicatorSnapshot = { ...EMPTY_SNAPSHOT };
let lastUpdateTime = 0;
let initialized = false;

function handleSnapshotMessage(event: MessageEvent): void {
  if (event.source !== window) return;
  if (event.data?.type !== 'ST_INDICATOR_SNAPSHOT') return;
  const data = event.data.data;
  if (!data || typeof data !== 'object') return;

  latestSnapshot = {
    rsi: typeof data.rsi === 'number' ? data.rsi : null,
    macd: data.macd && typeof data.macd.macd === 'number' ? data.macd : null,
    sma: typeof data.sma === 'number' ? data.sma : null,
    alligator: data.alligator && typeof data.alligator.jaws === 'number' ? data.alligator : null,
    donchian: data.donchian && typeof data.donchian.upper === 'number' ? data.donchian : null,
    price: typeof data.price === 'number' ? data.price : 0,
    candles: Array.isArray(data.candles) ? data.candles : [],
    timeframe: typeof data.timeframe === 'number' ? data.timeframe : 1,
  };
  lastUpdateTime = Date.now();
}

/**
 * Initialize the indicator reader. Call once from content-script init.
 */
export function initIndicatorReader(): void {
  if (initialized) return;
  initialized = true;
  window.addEventListener('message', handleSnapshotMessage);
}

/**
 * Request a fresh snapshot and wait for it (max 3s).
 * Falls back to last cached snapshot if timeout.
 */
export async function requestIndicatorSnapshot(): Promise<IndicatorSnapshot> {
  window.postMessage({ type: 'ST_REQUEST_INDICATORS' }, '*');

  const snapshotBefore = lastUpdateTime;

  return new Promise<IndicatorSnapshot>((resolve) => {
    let attempts = 0;
    const maxAttempts = 15; // 15 × 200ms = 3s

    const check = (): void => {
      if (lastUpdateTime > snapshotBefore) {
        resolve(latestSnapshot);
        return;
      }
      attempts++;
      if (attempts >= maxAttempts) {
        resolve(latestSnapshot); // fallback to cached
        return;
      }
      setTimeout(check, 200);
    };

    check();
  });
}

/**
 * Get the last cached snapshot without requesting a new one.
 */
export function getLatestSnapshot(): IndicatorSnapshot {
  return latestSnapshot;
}

/**
 * Returns true if indicator data is fresh (updated within last 5s).
 */
export function isSnapshotFresh(): boolean {
  return Date.now() - lastUpdateTime < 5000;
}
