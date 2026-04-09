/**
 * Relay Publisher — Publishes signals, results, and snapshots to the backend relay server.
 *
 * Uses direct fetch from content script. MV3 host_permissions for
 * snaptrade.faroldigital.pt allows cross-origin requests.
 */

import { API_BASE } from '../../lib/constants';

// ─── State ──────────────────────────────────────────────────────────────────

let extensionToken: string | null = null;
let publishEnabled = false;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 10;
const FAILURE_BACKOFF_MS = 60_000;
let pausedUntil = 0;
const PUBLISH_URL = `${API_BASE}/relay/publish`;

// ─── Initialization ─────────────────────────────────────────────────────────

export async function initRelayPublisher(): Promise<void> {
  try {
    const storage = await chrome.storage.local.get(['settings']);
    const token = storage.settings?.extensionToken;
    if (!token) {
      console.log('[Relay] No extension token — publisher disabled');
      return;
    }
    extensionToken = token;
    publishEnabled = true;
    consecutiveFailures = 0;

    // Test publish on init to verify connectivity
    try {
      const testResp = await fetch(PUBLISH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message: { type: 'STATE_SYNC', dailyState: { tradesExecuted: 0, winsCount: 0, lossesCount: 0, totalPnl: 0 }, masanielloState: null, circuitBreaker: { active: false, rollingWR: 0 }, isPaused: false, recentSignals: [], recentResults: [], activePairs: [], timestamp: Date.now() } }),
      });
      console.log('[Relay] Publisher initialized, test publish status:', testResp.status);
    } catch (e: any) {
      console.warn('[Relay] Publisher initialized but test publish failed:', e.message);
    }
  } catch (err: any) {
    console.warn('[Relay] Init failed:', err.message);
  }
}

// ─── Core publish (direct fetch from content script) ────────────────────────

function publish(message: Record<string, unknown>): void {
  if (!publishEnabled || !extensionToken) return;

  const now = Date.now();
  if (now < pausedUntil) return;

  fetch(PUBLISH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${extensionToken}`,
    },
    body: JSON.stringify({ message }),
  }).then(r => {
    if (r.ok) {
      consecutiveFailures = 0;
    } else if (r.status === 403) {
      console.warn('[Relay] 403 — disabling');
      publishEnabled = false;
    } else {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        pausedUntil = Date.now() + FAILURE_BACKOFF_MS;
        console.warn('[Relay] Too many failures — pausing 60s');
        consecutiveFailures = 0;
      }
    }
  }).catch(() => {
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      pausedUntil = Date.now() + FAILURE_BACKOFF_MS;
      consecutiveFailures = 0;
    }
  });
}

// ─── Publisher Functions ────────────────────────────────────────────────────

export function publishSignalRaw(
  symbol: string, direction: 'CALL' | 'PUT', confidence: number,
  setups: string[], indicators: Record<string, unknown>, m5Trend: string,
): void {
  publish({ type: 'SIGNAL_RAW', symbol, direction: direction === 'CALL' ? 'BUY' : 'SELL', confidence, setups, indicators, m5Trend, timestamp: Date.now() });
}

export function publishSignalApproved(
  signalId: string, symbol: string, direction: 'CALL' | 'PUT',
  confidence: number, aiConfidence: number, reasoning: string, stake: number, expiration: number,
): void {
  publish({ type: 'SIGNAL_APPROVED', signalId, symbol, direction: direction === 'CALL' ? 'BUY' : 'SELL', confidence, aiConfidence, reasoning, stake, expiration, timestamp: Date.now(), validUntil: Date.now() + 30_000 });
}

export function publishTradeResult(
  signalId: string, symbol: string, direction: string,
  result: 'win' | 'loss', pnl: number, galeLevel: number,
): void {
  publish({ type: 'TRADE_RESULT', signalId, symbol, direction, result, pnl, galeLevel, timestamp: Date.now() });
}

export function publishPairSummaries(
  summaries: Array<{ symbol: string; direction: string; confidence: number; canTrade: boolean; setups: string[] }>,
): void {
  publish({ type: 'PAIR_SUMMARIES', summaries, timestamp: Date.now() });
}

export function publishShadowStats(stats: {
  immM1WR: number; immM5WR: number; delayM1WR: number; delayM5WR: number; totalSignals: number;
}): void {
  publish({ type: 'SHADOW_STATS', ...stats, timestamp: Date.now() });
}

export function publishStateSync(state: {
  tradesExecuted: number; winsCount: number; lossesCount: number; totalPnl: number; isPaused: boolean;
}): void {
  publish({
    type: 'STATE_SYNC',
    dailyState: { tradesExecuted: state.tradesExecuted, winsCount: state.winsCount, lossesCount: state.lossesCount, totalPnl: state.totalPnl },
    masanielloState: null, circuitBreaker: { active: false, rollingWR: 0 },
    isPaused: state.isPaused, recentSignals: [], recentResults: [], activePairs: [], timestamp: Date.now(),
  });
}
