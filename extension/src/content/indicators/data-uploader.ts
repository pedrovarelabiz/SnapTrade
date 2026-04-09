/**
 * Data Uploader — Sends candle snapshots to the backend for analysis.
 * Called on every M1 candle close with data from ALL tracked assets.
 *
 * Uses shared-promise pattern: when 74 candle-close handlers all call
 * uploadMarketData() simultaneously, only ONE fetch is made. All handlers
 * receive the same result via the shared promise or TTL-based cache.
 */

import { getCandles, getLastPrice, getTrackedSymbols, type Timeframe } from './candle-collector';
import { API_BASE } from '../../lib/constants';

const MIN_UPLOAD_INTERVAL = 55000; // Once per M1 candle cycle
const CACHE_TTL = 30000; // 30s — covers all handlers in same candle close

export interface UploadResult {
  analyzed: number;
  signals: number;
  results?: Array<{
    symbol: string;
    direction: 'CALL' | 'PUT' | null;
    confidence: number;
    setups: string[];
    m5Trend: string;
  }>;
}

// --- Shared state ---
let lastUploadTime = 0;
let cachedResult: UploadResult | null = null;
let cachedResultTime = 0;
let activeUpload: Promise<UploadResult | null> | null = null;

/**
 * Upload market data for all tracked symbols to the backend.
 * Shared-promise pattern: concurrent callers join the same in-flight request.
 * Cache: result is reused for CACHE_TTL ms so all symbols get backend results.
 */
export async function uploadMarketData(): Promise<UploadResult | null> {
  const now = Date.now();

  // Return cached result if still fresh (covers handlers 2-74 in same candle close)
  if (cachedResult && now - cachedResultTime < CACHE_TTL) {
    return cachedResult;
  }

  // Join in-flight upload if one exists (handles race between first few handlers)
  if (activeUpload) {
    return activeUpload;
  }

  // Throttle: don't upload more than once per M1 cycle
  if (now - lastUploadTime < MIN_UPLOAD_INTERVAL) {
    return cachedResult; // Return stale cache or null
  }

  // Start new upload — all subsequent callers will join via activeUpload
  activeUpload = performUpload();
  try {
    const result = await activeUpload;
    cachedResult = result;
    cachedResultTime = Date.now();
    return result;
  } finally {
    activeUpload = null;
  }
}

async function performUpload(): Promise<UploadResult | null> {
  lastUploadTime = Date.now();

  const symbols = getTrackedSymbols();
  if (symbols.length === 0) return null;

  // Get extension token
  let token: string | null = null;
  try {
    const settings = await chrome.storage.local.get('settings');
    token = settings.settings?.extensionToken;
  } catch { /* storage not available */ }

  if (!token) return null;

  try {
    // Build snapshots for all symbols that have enough data
    const snapshots = symbols
      .map(sym => {
        const m1 = getCandles(sym, 'M1');
        const m5 = getCandles(sym, 'M5');
        if (m1.length < 5) return null;

        return {
          symbol: sym,
          candlesM1: m1.slice(-50).map(c => ({ o: c.open, h: c.high, l: c.low, c: c.close, t: c.time })),
          candlesM5: m5.slice(-20).map(c => ({ o: c.open, h: c.high, l: c.low, c: c.close, t: c.time })),
          price: getLastPrice(sym),
        };
      })
      .filter(Boolean);

    if (snapshots.length === 0) return null;

    console.log(`[SnapTrade] Uploading market data: ${snapshots.length} symbols`);

    const response = await fetch(`${API_BASE}/extension/market-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ snapshots, timestamp: Date.now() }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[SnapTrade] Upload failed ${response.status}:`, errText.slice(0, 100));
      return null;
    }

    const result: UploadResult = await response.json();
    console.log(`[SnapTrade] Backend analyzed ${result.analyzed} symbols, generated ${result.signals} signals`);

    return result;
  } catch (err) {
    console.warn('[SnapTrade] Upload error:', err);
    return null;
  }
}
