/**
 * Background service worker — MV3 lifecycle-aware.
 * All state loaded from chrome.storage on every wake-up.
 */

import type {
  ExtensionSettings, DailyState, Signal, TradeExecution,
  ExtensionMessage, ExtensionStatus,
} from '../types';
import {
  DEFAULT_SETTINGS, API_BASE, DEFAULT_PAYOUT_RATE, EXTENSION_VERSION,
  SIGNAL_STALE_MS, POLL_INTERVAL_MS, POLL_BACKOFF_MAX_MS,
  KEEPALIVE_INTERVAL_MIN, DAILY_RESET_INTERVAL_MIN,
  MAX_LOG_ENTRIES, MAX_SEEN_SIGNAL_IDS, MAX_EXECUTED_SIGNAL_IDS,
} from '../lib/constants';
import {
  getSettings, updateSettings, getDailyState, updateDailyState,
  resetDailyState, addTrade,
} from '../lib/storage';
import {
  masanielloCreate, masanielloRestore, masanielloResetDay,
  masanielloGetStake, masanielloRecordTrade, masanielloGetState,
  type MasanielloSnapshot,
} from '../lib/masaniello';
import {
  sorosCreate, sorosRestore, sorosResetDay,
  sorosGetStake, sorosRecordTrade, sorosGetState,
  type SorosSnapshot,
} from '../lib/soros';

// === State (reloaded from storage on every wake) ===
let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let dailyState: DailyState | null = null;
let masaniello: MasanielloSnapshot | null = null;
let soros: SorosSnapshot | null = null;
let isConnected = false;
let pollingActive = false;
let pollingTimer: ReturnType<typeof setTimeout> | null = null;
let pollFailures = 0;
let contentScriptReady = false;
const pendingSignals = new Map<string, Signal>();
let openTrades: Array<{id:string;asset:string;direction:string;amount:number;openTime:number;closeTime:number}> = [];
let accountInfo: {isDemo:boolean;balance:number} = {isDemo:true,balance:0};
const seenSignalIds = new Set<string>();
const executedSignalIds = new Set<string>();

// === Logging ===
async function log(lvl: string, msg: string, data?: unknown): Promise<void> {
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push({ ts: new Date().toISOString(), lvl, msg, d: data ? JSON.stringify(data).slice(0, 200) : undefined });
    if (activityLog.length > MAX_LOG_ENTRIES) activityLog.splice(0, activityLog.length - MAX_LOG_ENTRIES);
    await chrome.storage.local.set({ activityLog });
  } catch { /* skip */ }
}

// === Initialization ===

let updateAvailable: { version: string; url: string; changelog: string } | null = null;

async function checkForUpdates(): Promise<void> {
  try {
    const resp = await fetch(API_BASE + '/extension/version');
    if (resp.ok) {
      const data = await resp.json();
      if (data.latestVersion && data.latestVersion !== EXTENSION_VERSION) {
        updateAvailable = { version: data.latestVersion, url: data.downloadUrl, changelog: data.changelog };
        await log('info', 'Update available: v' + data.latestVersion);
      } else {
        updateAvailable = null;
      }
    }
  } catch { /* skip */ }
}

async function initialize(): Promise<void> {
  settings = await getSettings();
  dailyState = await getDailyState();
  initCalculators();

  // Restore pending signals and executed IDs from storage
  try {
    const stored = await chrome.storage.local.get(['pendingSignalsList', 'executedIds']);
    for (const sig of (stored.pendingSignalsList || [])) {
      pendingSignals.set(sig.id, sig);
    }
    for (const id of (stored.executedIds || [])) {
      executedSignalIds.add(id);
      seenSignalIds.add(id);
    }
    pruneIdSets();
  } catch { /* skip */ }

  if (settings.isAuthenticated && settings.extensionToken) {
    connectToBackend();
  }

  await refreshContentScriptStatus();

  chrome.alarms.create('keepalive', { periodInMinutes: KEEPALIVE_INTERVAL_MIN });
  checkForUpdates();
  chrome.alarms.create('daily-reset', { when: getNextMidnightUTC(), periodInMinutes: DAILY_RESET_INTERVAL_MIN });

  setupListeners();
  await log('info', 'Service worker initialized');
}

function initCalculators(): void {
  const masOpts = {
    baseAmount: settings.defaultAmount, payoutRate: DEFAULT_PAYOUT_RATE,
    tradesPerDay: settings.masanielloTotalTrades,
    expectedWins: settings.masanielloExpectedWins,
    maxBet: settings.defaultAmount * settings.masanielloMaxBetMultiplier,
  };
  const sorosOpts = {
    baseAmount: settings.defaultAmount, payoutRate: DEFAULT_PAYOUT_RATE,
    maxLevels: settings.sorosMaxLevels,
  };

  masaniello = dailyState?.masanielloState
    ? masanielloRestore(masOpts, dailyState.masanielloState)
    : masanielloCreate(masOpts);

  soros = dailyState?.sorosState
    ? sorosRestore(sorosOpts, dailyState.sorosState)
    : sorosCreate(sorosOpts);
}

function pruneIdSets(): void {
  while (seenSignalIds.size > MAX_SEEN_SIGNAL_IDS) {
    const first = seenSignalIds.values().next().value;
    if (first) seenSignalIds.delete(first);
  }
  while (executedSignalIds.size > MAX_EXECUTED_SIGNAL_IDS) {
    const first = executedSignalIds.values().next().value;
    if (first) executedSignalIds.delete(first);
  }
}

function getNextMidnightUTC(): number {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 1)).getTime();
}

// === Backend Connection (polling with backoff) ===
function connectToBackend(): void {
  if (pollingActive) return;
  pollingActive = true;
  isConnected = true;
  pollFailures = 0;
  broadcastStatus();
  pollSignals();
}

function disconnectBackend(): void {
  pollingActive = false;
  isConnected = false;
  pollFailures = 0;
  if (pollingTimer) { clearTimeout(pollingTimer); pollingTimer = null; }
}

async function pollSignals(): Promise<void> {
  if (!pollingActive || !settings.extensionToken) {
    pollingActive = false; isConnected = false; return;
  }

  try {
    const resp = await fetch(`${API_BASE}/signals?limit=10`, {
      headers: { 'Authorization': `Bearer ${settings.extensionToken}` },
    });
    if (resp.ok) {
      isConnected = true;
      pollFailures = 0;
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
      isConnected = false; pollingActive = false;
      await updateSettings({ isAuthenticated: false });
      settings.isAuthenticated = false;
    } else {
      isConnected = false;
      pollFailures++;
    }
  } catch {
    isConnected = false;
    pollFailures++;
  }

  if (pollingActive) {
    // Exponential backoff on failures
    const delay = pollFailures > 0
      ? Math.min(POLL_INTERVAL_MS * Math.pow(2, pollFailures), POLL_BACKOFF_MAX_MS)
      : POLL_INTERVAL_MS;
    pollingTimer = setTimeout(pollSignals, delay);
  }
  broadcastStatus();
}

// === Content Script Status ===
async function refreshContentScriptStatus(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://pocketoption.com/*', '*://po.trade/*', '*://*.pocketoption.com/*']
    });
    if (tabs.length === 0) { contentScriptReady = false; return; }

    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        const resp = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
        if (resp && resp.alive) { contentScriptReady = true; return; }
      } catch { /* tab doesn't have content script */ }
    }
    contentScriptReady = false;
  } catch { contentScriptReady = false; }
}

// === Signal Processing ===
function mapSignal(raw: Record<string, unknown>): Signal {
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

async function processNewSignal(signal: Signal): Promise<void> {
  if (executedSignalIds.has(signal.id)) return;

  // Mark immediately to prevent duplicates
  executedSignalIds.add(signal.id);
  seenSignalIds.add(signal.id);

  // Skip stale signals
  if (signal.createdAt) {
    const age = Date.now() - new Date(signal.createdAt).getTime();
    if (age > SIGNAL_STALE_MS) return;
  }

  await log('info', 'Signal: ' + signal.asset + ' ' + signal.direction + ' mode=' + settings.executionMode);
  if (!settings.isEnabled) { await log('info', 'Skipped: not enabled'); return; }
  if (dailyState?.isPaused) { await log('info', 'Skipped: paused'); return; }

  // tradingMode is enforced at WS level (isDemo flag in openOrder message)
  await log('info', 'Trading mode: ' + settings.tradingMode);

  if (settings.enabledPairs.length > 0) {
    const norm = signal.asset.toLowerCase().replace(/[\s_/]/g, '');
    const matched = settings.enabledPairs.some(p => p.toLowerCase().replace(/[\s_/]/g, '') === norm);
    if (!matched) return;
  }

  const risk = checkRiskLimits();
  if (!risk.canTrade) { await pauseTrading(risk.reason!); return; }

  const amount = getTradeAmount();
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

  if (settings.executionMode === 'auto') {
    await log('info', 'Auto-executing...');
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

function getTradeAmount(): number {
  switch (settings.strategy) {
    case 'masaniello':
      return masaniello ? masanielloGetStake(masaniello) : settings.defaultAmount;
    case 'soros':
      return soros ? sorosGetStake(soros) : settings.defaultAmount;
    default:
      return settings.defaultAmount;
  }
}

function checkRiskLimits(): { canTrade: boolean; reason?: string } {
  if (!dailyState) return { canTrade: true };
  if (settings.maxDailyTrades > 0 && dailyState.tradesExecuted >= settings.maxDailyTrades)
    return { canTrade: false, reason: `Max daily trades (${dailyState.tradesExecuted}/${settings.maxDailyTrades})` };
  if (settings.maxConsecutiveLosses > 0 && dailyState.consecutiveLosses >= settings.maxConsecutiveLosses)
    return { canTrade: false, reason: `Max consecutive losses (${dailyState.consecutiveLosses})` };
  return { canTrade: true };
}

async function pingContentScript(): Promise<boolean> {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://pocketoption.com/*', '*://po.trade/*', '*://*.pocketoption.com/*']
    });
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
        if (res?.alive) { contentScriptReady = true; return true; }
      } catch { /* no content script */ }
    }
    contentScriptReady = false;
    return false;
  } catch { return false; }
}

async function executeSignal(signal: Signal, amount: number, galeLevel: number): Promise<void> {
  const wsKey = 'ws_' + signal.id + '_g' + galeLevel;
  if (executedSignalIds.has(wsKey)) return;
  executedSignalIds.add(wsKey);

  // tradingMode enforced via WS isDemo flag — no blocking needed

  const poReady = await pingContentScript();
  if (!poReady) {
    await log('warn', 'Cannot execute: PO not ready');
    chrome.notifications.create(signal.id + '-err', {
      type: 'basic', iconUrl: 'assets/icon-128.png',
      title: 'Trade Not Executed',
      message: signal.asset + ' ' + signal.direction + ' — Open Pocket Option trading page',
    });
    return;
  }

  const execution: TradeExecution = {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    signalId: signal.id, asset: signal.asset, direction: signal.direction,
    amount, galeLevel,
    mode: settings.executionMode === 'auto' ? 'auto' : settings.executionMode === 'semi-auto' ? 'semi' : 'manual',
    strategy: settings.strategy, executedAt: new Date().toISOString(),
    result: 'pending', payout: null, netPnl: null,
  };

  const poTabs = await chrome.tabs.query({
    url: ['*://pocketoption.com/*', '*://po.trade/*', '*://*.pocketoption.com/*']
  });
  let executed = false;
  for (const tab of poTabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'EXECUTE_TRADE', signal, amount, galeLevel });
      executed = true;
      break;
    } catch (e) { await log('error', 'Execute tab error: ' + String(e)); }
  }
  if (!executed) { await log('warn', 'No PO tab accepted the trade'); return; }

  if (dailyState) {
    await updateDailyState({
      tradesExecuted: dailyState.tradesExecuted + 1,
      trades: [...dailyState.trades, execution],
    });
    dailyState = await getDailyState();
  }

  await addTrade(execution);
  pendingSignals.delete(signal.id);
  await chrome.storage.local.set({
    pendingSignalsList: Array.from(pendingSignals.values()),
    executedIds: Array.from(executedSignalIds),
  });
  await log('info', `Trade executed: ${signal.asset} ${signal.direction} $${amount}`);
  broadcastStatus();
}

async function processResult(signal: Signal): Promise<void> {
  if (!dailyState || signal.isWin === null) return;
  const isWin = signal.isWin;

  const tradeIdx = dailyState.trades.findIndex(t => t.signalId === signal.id && t.result === 'pending');
  if (tradeIdx === -1) return;

  const trade = dailyState.trades[tradeIdx];
  const netPnl = isWin ? trade.amount * DEFAULT_PAYOUT_RATE : -trade.amount;
  const updatedTrade: TradeExecution = {
    ...trade, result: isWin ? 'win' : 'loss',
    payout: isWin ? trade.amount * (1 + DEFAULT_PAYOUT_RATE) : 0, netPnl,
  };

  const updatedTrades = [...dailyState.trades];
  updatedTrades[tradeIdx] = updatedTrade;

  // Immutable calculator updates
  if (masaniello) masaniello = masanielloRecordTrade(masaniello, isWin);
  if (soros) soros = sorosRecordTrade(soros, isWin);

  await updateDailyState({
    winsCount: dailyState.winsCount + (isWin ? 1 : 0),
    lossesCount: dailyState.lossesCount + (isWin ? 0 : 1),
    consecutiveLosses: isWin ? 0 : dailyState.consecutiveLosses + 1,
    totalPnl: dailyState.totalPnl + netPnl,
    trades: updatedTrades,
    masanielloState: masaniello ? masanielloGetState(masaniello) : null,
    sorosState: soros ? sorosGetState(soros) : null,
  });
  dailyState = await getDailyState();

  const risk = checkRiskLimits();
  if (!risk.canTrade) await pauseTrading(risk.reason!);

  broadcastToAll({ type: 'TRADE_RESULT', execution: updatedTrade });
  broadcastStatus();
}

// === Risk / Daily Reset ===
async function pauseTrading(reason: string): Promise<void> {
  await updateDailyState({ isPaused: true, pauseReason: reason });
  dailyState = await getDailyState();
  broadcastStatus();
}

async function resumeTrading(): Promise<void> {
  await updateDailyState({ isPaused: false, pauseReason: null, consecutiveLosses: 0 });
  dailyState = await getDailyState();
  broadcastStatus();
}

async function handleDailyReset(): Promise<void> {
  await resetDailyState();
  dailyState = await getDailyState();
  if (masaniello) masaniello = masanielloResetDay(masaniello);
  if (soros) soros = sorosResetDay(soros);
  initCalculators();
  broadcastStatus();
}

// === Messaging ===
function broadcastToAll(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {});
  chrome.tabs.query({ url: ['*://pocketoption.com/*', '*://po.trade/*', '*://*.pocketoption.com/*'] }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  });
}

function broadcastStatus(): void {
  broadcastToAll({ type: 'STATUS_UPDATE', status: getStatus() });
}

function getStatus(): ExtensionStatus {
  const emptyDay: DailyState = {
    date: new Date().toISOString().slice(0, 10), tradesExecuted: 0,
    winsCount: 0, lossesCount: 0, consecutiveLosses: 0, totalPnl: 0,
    trades: [], masanielloState: null, sorosState: null, isPaused: false, pauseReason: null,
  };
  return {
    isConnected, isPocketOptionOpen: contentScriptReady,
    isPocketOptionReady: contentScriptReady,
    isEnabled: settings.isEnabled, isPaused: dailyState?.isPaused ?? false,
    pauseReason: dailyState?.pauseReason ?? null,
    dailyState: dailyState ?? emptyDay,
    pendingSignals: Array.from(pendingSignals.values()), lastSignalAt: null,
    openTrades, accountInfo,
    updateAvailable,
    extensionVersion: EXTENSION_VERSION,
  };
}

// === Listeners ===
let listenersSetUp = false;

function setupListeners(): void {
  if (listenersSetUp) return;
  listenersSetUp = true;

  chrome.runtime.onMessage.addListener((msg: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(msg).then(sendResponse);
    return true;
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    settings = await getSettings();
    dailyState = await getDailyState();

    if (alarm.name === 'keepalive') {
      if (Math.random() < 0.017) checkForUpdates();
      if (settings.isAuthenticated && settings.extensionToken && !pollingActive) {
        connectToBackend();
      }
      await refreshContentScriptStatus();
      broadcastStatus();
    } else if (alarm.name === 'daily-reset') {
      await handleDailyReset();
    } else if (alarm.name.startsWith('execute-')) {
      const sig = pendingSignals.get(alarm.name.replace('execute-', ''));
      if (sig) await executeSignal(sig, getTradeAmount(), 0);
    }
  });

  chrome.notifications.onClicked.addListener((id) => {
    chrome.action.openPopup?.();
    chrome.notifications.clear(id);
  });
}

async function handleMessage(msg: ExtensionMessage): Promise<unknown> {
  settings = await getSettings();
  dailyState = await getDailyState();

  switch (msg.type) {
    case 'GET_STATUS': {
      if (settings.isAuthenticated && settings.extensionToken && !pollingActive) {
        connectToBackend();
      }
      await refreshContentScriptStatus();
      return getStatus();
    }
    case 'SETTINGS_UPDATED': {
      await updateSettings(msg.settings);
      settings = await getSettings();
      if ('extensionToken' in msg.settings || 'isEnabled' in msg.settings || 'isAuthenticated' in msg.settings) {
        disconnectBackend();
        if (settings.isAuthenticated && settings.extensionToken) connectToBackend();
      }
      if ('strategy' in msg.settings || 'defaultAmount' in msg.settings) initCalculators();
      broadcastStatus(); return { ok: true };
    }
    case 'PAUSE_TRADING': await pauseTrading(msg.reason); return { ok: true };
    case 'RESUME_TRADING': await resumeTrading(); return { ok: true };
    case 'CONFIRM_TRADE': {
      const sig = pendingSignals.get(msg.signalId);
      if (sig) await executeSignal(sig, getTradeAmount(), 0);
      return { ok: true };
    }
    case 'CANCEL_TRADE': pendingSignals.delete(msg.signalId); broadcastStatus(); return { ok: true };
    case 'PO_READY': contentScriptReady = msg.ready; broadcastStatus(); return { ok: true };
    case 'TRADE_EXECUTED': return { ok: true };
    case 'TRADE_RESULT': {
      // Handle trade results from content script (WS detection + DOM tracking)
      const trMsg = msg as ExtensionMessage & { execution: TradeExecution };
      const exec = trMsg.execution;
      if (exec && dailyState) {
        const isWin = exec.result === 'win';
        const netPnl = exec.netPnl ?? (isWin ? (exec.payout ?? 0) - exec.amount : -exec.amount);

        // Update calculators
        if (masaniello) masaniello = masanielloRecordTrade(masaniello, isWin);
        if (soros) soros = sorosRecordTrade(soros, isWin);

        await updateDailyState({
          tradesExecuted: dailyState.tradesExecuted + 1,
          winsCount: dailyState.winsCount + (isWin ? 1 : 0),
          lossesCount: dailyState.lossesCount + (isWin ? 0 : 1),
          consecutiveLosses: isWin ? 0 : dailyState.consecutiveLosses + 1,
          totalPnl: dailyState.totalPnl + netPnl,
          masanielloState: masaniello ? masanielloGetState(masaniello) : null,
          sorosState: soros ? sorosGetState(soros) : null,
        });
        dailyState = await getDailyState();

        await log('info', 'Result: ' + exec.asset + ' ' + exec.result + ' $' + Math.abs(netPnl).toFixed(2));

        // Check risk limits
        const risk = checkRiskLimits();
        if (!risk.canTrade) await pauseTrading(risk.reason!);

        broadcastStatus();
      }
      return { ok: true };
    }
    case 'OPEN_FLOATING': {
      chrome.windows.create({
        url: 'floating.html', type: 'popup',
        width: 280, height: 320, top: 50, left: 50, focused: false,
      });
      return { ok: true };
    }
    case 'UPDATE_TRADES': {
      openTrades = (msg as ExtensionMessage & { trades: typeof openTrades }).trades || [];
      broadcastStatus();
      return { ok: true };
    }
    case 'UPDATE_ACCOUNT': {
      accountInfo = (msg as ExtensionMessage & { accountInfo: typeof accountInfo }).accountInfo || { isDemo: true, balance: 0 };
      broadcastStatus();
      return { ok: true };
    }
    case 'GET_LOGS': {
      const { activityLog = [] } = await chrome.storage.local.get('activityLog');
      return activityLog.slice(-20);
    }
    default: return { ok: false };
  }
}

// === Bootstrap ===
chrome.runtime.onStartup.addListener(() => { initialize().catch(console.error); });
chrome.runtime.onInstalled.addListener(() => { initialize().catch(console.error); });
initialize().catch(console.error);
