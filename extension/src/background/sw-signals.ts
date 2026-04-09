/**
 * Signal processing, polling, and content script communication.
 */

import type { Signal } from '../types';
import {
  API_BASE, SIGNAL_STALE_MS, STALE_BUFFER_MS,
  POLL_INTERVAL_MS, POLL_BACKOFF_MAX_MS,
} from '../lib/constants';
import { getSettings, updateSettings } from '../lib/storage';
import {
  settings, dailyState, pollingActive, pollingTimer, pollFailures,
  isConnected, contentScriptReady, pendingSignals, openTrades,
  seenSignalIds, executedSignalIds, symbolCooldowns, symbolLossCooldowns,
  SYMBOL_COOLDOWN_MS, SYMBOL_LOSS_COOLDOWN_MS,
  setIsConnected, setPollingActive, setPollingTimer, setPollFailures,
  setContentScriptReady, setSettings,
  normalizeAsset, pruneIdSets, checkRiskLimits, getTradeAmount,
  checkRegimeCircuitBreaker, broadcastToAll, broadcastStatus,
} from './sw-state';
import { executeSignal, pauseTrading, log } from './sw-execution';

// Internal channel slugs that bypass isEnabled/executionMode/enabledChannels filters
export const INTERNAL_CHANNEL_SLUGS = new Set(['st_indicators', 'ai_analyst']);

export function isInternalSignal(signal: Signal): boolean {
  return INTERNAL_CHANNEL_SLUGS.has(signal.channel?.slug ?? '');
}

// === Backend Connection (polling with backoff) ===
export function connectToBackend(): void {
  if (pollingActive) return;
  setPollingActive(true);
  setIsConnected(true);
  setPollFailures(0);
  broadcastStatus();
  pollSignals();
}

export function disconnectBackend(): void {
  setPollingActive(false);
  setIsConnected(false);
  setPollFailures(0);
  if (pollingTimer) { clearTimeout(pollingTimer); setPollingTimer(null); }
}

export async function pollSignals(): Promise<void> {
  if (!pollingActive || !settings.extensionToken) {
    setPollingActive(false); setIsConnected(false); return;
  }

  try {
    const resp = await fetch(`${API_BASE}/signals?limit=10`, {
      headers: { 'Authorization': `Bearer ${settings.extensionToken}` },
    });
    if (resp.ok) {
      setIsConnected(true);
      setPollFailures(0);
      const data = await resp.json();
      const signals = data.signals || [];
      for (const raw of signals) {
        if (raw.id && !seenSignalIds.has(raw.id)) {
          seenSignalIds.add(raw.id);
          if (!executedSignalIds.has(raw.id)) {
            processNewSignal(mapSignal(raw));
          }
        }
      }
      pruneIdSets();
    } else if (resp.status === 401) {
      setIsConnected(false); setPollingActive(false);
      await updateSettings({ isAuthenticated: false });
      setSettings({ ...settings, isAuthenticated: false });
    } else {
      setIsConnected(false);
      setPollFailures(pollFailures + 1);
    }
  } catch {
    setIsConnected(false);
    setPollFailures(pollFailures + 1);
  }

  if (pollingActive) {
    const delay = pollFailures > 0
      ? Math.min(POLL_INTERVAL_MS * Math.pow(2, pollFailures), POLL_BACKOFF_MAX_MS)
      : POLL_INTERVAL_MS;
    setPollingTimer(setTimeout(pollSignals, delay));
  }
  broadcastStatus();
}

// === Content Script Status ===
export async function refreshContentScriptStatus(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://pocketoption.com/*', '*://po.trade/*', '*://*.pocketoption.com/*']
    });
    if (tabs.length === 0) { setContentScriptReady(false); return; }

    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        const resp = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
        if (resp && resp.alive) { setContentScriptReady(true); return; }
      } catch { /* tab doesn't have content script */ }
    }
    setContentScriptReady(false);
  } catch { setContentScriptReady(false); }
}

export async function pingContentScript(): Promise<boolean> {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://pocketoption.com/*', '*://po.trade/*', '*://*.pocketoption.com/*']
    });
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
        if (res?.alive) { setContentScriptReady(true); return true; }
      } catch { /* no content script */ }
    }
    setContentScriptReady(false);
    return false;
  } catch { return false; }
}

// === Signal Processing ===
export function mapSignal(raw: Record<string, unknown>): Signal {
  const channel = raw.channel as { name: string; slug: string } | null;
  const galeLevel = (raw.galeLevel as number) ?? 0;
  const isWin = raw.result === 'win';
  let resultType: string | null = null;
  if (raw.status === 'resolved' && raw.result) {
    resultType = isWin && galeLevel === 0 ? 'direct_victory' : isWin ? 'victory_at_gale' : 'loss';
  }
  return {
    id: raw.id as string, asset: raw.asset as string,
    direction: raw.direction as 'CALL' | 'PUT', signalType: 'scheduled',
    entryTime: (raw.entryTimeUtc as string) || null,
    entryTimestamp: (raw.entryTimeUtc as string) || null, timeframe: 'M5',
    expirationMinutes: (raw.expirationMinutes as number) || 5,
    martingaleSchedule: ((raw.martingaleTimes as string[]) || []).map((t, i) => ({ level: i + 1, time: t })),
    status: (raw.status as Signal['status']) || 'active',
    visibility: (raw.visibility as 'free' | 'premium') || 'premium',
    resultType, resultGaleLevel: raw.status === 'resolved' ? galeLevel : null,
    isWin: raw.status === 'resolved' ? isWin : null, channel: channel || null,
    createdAt: (raw.createdAt as string) || new Date().toISOString(),
  };
}

export async function processNewSignal(signal: Signal): Promise<void> {
  if (executedSignalIds.has(signal.id)) return;

  // Mark immediately to prevent duplicates
  executedSignalIds.add(signal.id);
  seenSignalIds.add(signal.id);

  const internal = isInternalSignal(signal);

  // Symbol-level cooldown for ALL signals
  {
    const normAsset = normalizeAsset(signal.asset);
    const lastTrade = symbolCooldowns.get(normAsset) ?? 0;
    if (Date.now() - lastTrade < SYMBOL_COOLDOWN_MS) {
      await log('info', `Skipped: ${signal.asset} symbol cooldown (${Math.round((Date.now() - lastTrade) / 1000)}s ago)`);
      return;
    }
    const lastLoss = symbolLossCooldowns.get(normAsset) ?? 0;
    if (Date.now() - lastLoss < SYMBOL_LOSS_COOLDOWN_MS) {
      await log('info', `Skipped: ${signal.asset} loss cooldown (${Math.round((SYMBOL_LOSS_COOLDOWN_MS - (Date.now() - lastLoss)) / 1000)}s left)`);
      return;
    }
  }

  // Skip stale signals
  if (signal.entryTime) {
    const entryMs = new Date(signal.entryTime).getTime();
    const expirationMs = (signal.expirationMinutes ?? 5) * 60 * 1000;
    if (Date.now() > entryMs + expirationMs + STALE_BUFFER_MS) return;
  } else if (signal.createdAt) {
    const age = Date.now() - new Date(signal.createdAt).getTime();
    if (age > SIGNAL_STALE_MS) return;
  }

  await log('info', `Signal: ${signal.asset} ${signal.direction} mode=${settings.executionMode} internal=${internal}`);

  if (!internal) {
    if (!settings.isEnabled) { await log('info', 'Skipped: not enabled'); return; }
  }
  if (dailyState?.isPaused) { await log('info', 'Skipped: paused'); return; }

  await log('info', 'Trading mode: ' + settings.tradingMode);

  // enabledPairs filter
  if (!internal && settings.enabledPairs.length > 0) {
    const norm = signal.asset.toLowerCase().replace(/[\s_/]/g, '');
    const matched = settings.enabledPairs.some(p => p.toLowerCase().replace(/[\s_/]/g, '') === norm);
    if (!matched) return;
  }

  // Check blocked hours (UTC)
  if (settings.blockedHours && settings.blockedHours.length > 0) {
    const currentHour = new Date().getUTCHours();
    if (settings.blockedHours.includes(currentHour)) {
      await log('info', `Skipped: blocked hour ${currentHour} UTC`);
      return;
    }
  }

  // Check enabled channels
  if (!internal && settings.enabledChannels && settings.enabledChannels.length > 0) {
    const slug = signal.channel?.slug ?? '';
    if (!settings.enabledChannels.includes(slug)) {
      await log('info', `Skipped: channel ${slug} not in enabledChannels`);
      return;
    }
  }

  const risk = checkRiskLimits();
  if (!risk.canTrade) { await pauseTrading(risk.reason!); return; }

  const regime = checkRegimeCircuitBreaker();
  if (!regime.ok) {
    await log('info', `Skipped: ${signal.asset} — ${regime.reason}`);
    return;
  }

  // Max 1 active trade per pair
  const normAssetForCheck = normalizeAsset(signal.asset);
  if (openTrades.some(ot => normalizeAsset(ot.asset) === normAssetForCheck)) {
    await log('info', `Skipped: ${signal.asset} already has an active trade`);
    return;
  }

  const amount = getTradeAmount(signal);
  if (settings.maxSingleTradeAmount > 0 && amount > settings.maxSingleTradeAmount) return;

  pendingSignals.set(signal.id, signal);
  await chrome.storage.local.set({
    pendingSignalsList: Array.from(pendingSignals.values()),
    executedIds: Array.from(executedSignalIds),
  });
  broadcastToAll({ type: 'SIGNAL_NEW', signal });

  if (settings.browserNotifications) {
    chrome.notifications.create(signal.id, {
      type: 'basic', iconUrl: 'assets/icon-128.png',
      title: `${signal.asset} ${signal.direction}`,
      message: `Signal from ${signal.channel?.name || 'SnapTrade'} | $${amount.toFixed(2)}`,
      priority: 2,
    });
  }

  await log('info', 'Amount: $' + amount.toFixed(2) + ' strategy=' + settings.strategy);

  // Internal signals always auto-execute; external signals respect executionMode
  if (internal || settings.executionMode === 'auto') {
    symbolCooldowns.set(normalizeAsset(signal.asset), Date.now());
    await log('info', internal ? 'Auto-executing internal signal...' : 'Auto-executing...');
    if (signal.entryTime) {
      const delay = Math.max(0, new Date(signal.entryTime).getTime() - Date.now() - settings.instantDelay * 1000);
      if (delay > 0) {
        chrome.alarms.create(`execute-${signal.id}`, { when: Date.now() + delay });
      } else {
        await executeSignal(signal, amount, 0);
      }
    } else {
      setTimeout(() => executeSignal(signal, amount, 0), settings.instantDelay * 1000);
    }
  }
}
