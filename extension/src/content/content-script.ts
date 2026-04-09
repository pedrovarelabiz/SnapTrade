// ---------------------------------------------------------------------------
// content-script.ts — Orchestrator (delegates to focused modules)
// ---------------------------------------------------------------------------
import type { Signal, ExtensionMessage, ExtensionSettings, DailyState } from '../types';
import { CONTENT_POLL_INTERVAL_MS, PO_READY_ANNOUNCE_MS, TAB_SWITCH_FREEZE_CYCLES } from '../lib/constants';
import { initSentry } from '../config/sentry';
import * as Sentry from '@sentry/browser';
import { initCandleCollector } from './indicators/candle-collector';
import { initRelayPublisher } from './indicators/relay-publisher';
import { labFlush } from './indicators/strategy-lab';
import { shadowFlush } from './indicators/shadow-tracker';
import { setTradeExecutor, setPendingTradeExecutor, setDemoChecker } from './indicators/lab-to-trade';

// Module imports
import { state, sendToBackground, loadSettings, enrichTradesWithSource, normalizeAssetForGuard } from './content-state';
import { restoreExecutedIds, restoreGaleLevels } from './gale-persistence';
import { executeTrade, balanceState } from './trade-executor';
import { initWsMessageHandler, setWsHandlerDeps } from './ws-message-handler';
import { handleIndicatorSettingsChange, subscribeMonitoredPairs, initIndicatorListeners, initMarketHoursCheck, chartRotationComplete, lastSubscribedHash, setChartRotationComplete, setLastSubscribedHash } from './indicator-controller';

// Initialize Sentry for error tracking
initSentry();

// Wire up WS handler ↔ indicator-controller shared state
setWsHandlerDeps({
  getChartRotationComplete: () => chartRotationComplete,
  setChartRotationComplete,
  getLastSubscribedHash: () => lastSubscribedHash,
  setLastSubscribedHash,
  subscribeMonitoredPairs,
});

// Initialize WS message handler (listens for messages from ws-interceptor.js)
initWsMessageHandler();

// Initialize indicator-related event listeners
initIndicatorListeners();
initMarketHoursCheck();

// Register trade executor + payout checker for lab-to-trade bridge
setTradeExecutor(
  async (asset, direction, amount, expiry, demo) => {
    try {
      if (!state.bridge.isReady()) (state.bridge as any).wsReady = true;
      const result = await state.bridge.executeTrade(asset, direction, amount, expiry, demo);
      return result.success;
    } catch { return false; }
  },
  (symbol) => state.bridge.getPayoutRate(symbol),
);

setPendingTradeExecutor(
  async (asset, direction, amount, expiryMin, openTimeUTC, demo, minPayout) => {
    try {
      if (!state.bridge.isReady()) (state.bridge as any).wsReady = true;
      return await state.bridge.executePendingTrade(asset, direction, amount, expiryMin, openTimeUTC, demo, minPayout);
    } catch { return { success: false }; }
  },
);

setDemoChecker(() => state.bridge.isDemoAccount());

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

function handleMessage(
  message: ExtensionMessage | { type: 'PING' },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): boolean {
  try {
    if (message.type === 'PING') {
      sendResponse({ alive: true, poReady: state.bridge.isReady() });
      return true;
    }

    const msg = message as ExtensionMessage;
    switch (msg.type) {
    case 'EXECUTE_TRADE': {
      const execMsg = msg as ExtensionMessage & { signal: Signal; amount: number; galeLevel: number };
      executeTrade(execMsg.signal, execMsg.amount, execMsg.galeLevel)
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    case 'SIGNAL_NEW': {
      const newMsg = msg as ExtensionMessage & { signal: Signal };
      state.pendingSignals.set(newMsg.signal.id, newMsg.signal);
      sendResponse({ ok: true });
      return false;
    }

    case 'SIGNAL_RESULT': {
      const resMsg = msg as ExtensionMessage & { signal: Signal };
      state.pendingSignals.delete(resMsg.signal.id);
      sendResponse({ ok: true });
      return false;
    }

    case 'SETTINGS_UPDATED': {
      const setMsg = msg as ExtensionMessage & { settings: Partial<ExtensionSettings> };
      if (state.settings && setMsg.settings) {
        state.settings = { ...state.settings, ...setMsg.settings };
        state.overlay.setExecutionMode(state.settings.executionMode);
        state.overlay.updateSettings(state.settings);
      }
      sendResponse({ ok: true });
      return false;
    }

    case 'STATUS_UPDATE': {
      const statMsg = msg as ExtensionMessage & { status: { dailyState: DailyState; isConnected: boolean } };
      if (statMsg.status) {
        state.overlay.updateDailyState(statMsg.status.dailyState);
        state.overlay.setConnectionStatus(statMsg.status.isConnected);
      }
      sendResponse({ ok: true });
      return false;
    }

    case 'GET_STATUS': {
      const balance = state.bridge.getBalance();
      const isDemo = state.bridge.isDemoAccount();
      sendResponse({ poReady: state.bridge.isReady(), balance, isDemo, pendingSignals: state.pendingSignals.size });
      return false;
    }

    default: {
      sendResponse({ ok: true });
      return false;
    }
    }
  } catch (err) {
    console.error('[SnapTrade] handleMessage error:', err);
    Sentry.captureException(err);
    sendResponse({ ok: false, error: String(err) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  console.log('[SnapTrade] Content script initializing...');

  await restoreExecutedIds();
  await restoreGaleLevels();
  const settings = await loadSettings();

  const isPocketOptionPage =
    window.location.hostname.includes('pocketoption') ||
    window.location.hostname.includes('po.trade') ||
    document.title.toLowerCase().includes('pocket option');

  if (!isPocketOptionPage) {
    console.log('[SnapTrade] Not a Pocket Option page, content script idle.');
    chrome.runtime.onMessage.addListener(handleMessage);
    return;
  }

  initRelayPublisher().catch(() => {});

  const ready = await state.bridge.waitForReady(30000);
  sendToBackground({ type: 'PO_READY', ready });

  if (!ready) {
    console.warn('[SnapTrade] Pocket Option did not become ready within timeout.');
    chrome.runtime.onMessage.addListener(handleMessage);
    return;
  }

  console.log('[SnapTrade] Pocket Option is ready.');

  initCandleCollector();
  handleIndicatorSettingsChange(settings);

  if (settings.showOverlay) {
    state.overlay.init();
    state.overlay.setExecutionMode(settings.executionMode);
    state.overlay.setConnectionStatus(true);
  }

  chrome.runtime.onMessage.addListener(handleMessage);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes.settings?.newValue) {
      const newSettings: ExtensionSettings = changes.settings.newValue;
      state.settings = newSettings;
      state.overlay.setExecutionMode(newSettings.executionMode);

      if (newSettings.showOverlay) {
        state.overlay.init();
        state.overlay.setExecutionMode(newSettings.executionMode);
      } else {
        state.overlay.hide();
      }

      handleIndicatorSettingsChange(newSettings);
    }

    if (changes.dailyState?.newValue) {
      state.overlay.updateDailyState(changes.dailyState.newValue);
    }
  });

  const balance = state.bridge.getBalance();
  const isDemo = state.bridge.isDemoAccount();
  console.log(`[SnapTrade] Account: ${isDemo ? 'DEMO' : 'REAL'} | Balance: ${balance}`);
  state.overlay.setAccountInfo(isDemo, balance || 0);
  sendToBackground({ type: 'UPDATE_ACCOUNT', accountInfo: { isDemo, balance: balance || 0 } } as ExtensionMessage);
}

// === DOM polling for open trades display + account info ===
setInterval(() => {
  try {
    const currentTabState = state.bridge.getTabState();
    if (currentTabState !== balanceState.lastKnownTabState && currentTabState !== 'unknown' && balanceState.lastKnownTabState !== 'unknown') {
      balanceState.tabSwitchFreezeRemaining = TAB_SWITCH_FREEZE_CYCLES;
      if (balanceState.pendingClosure !== null) {
        console.log('[SnapTrade] Tab switch detected — cancelling pending closure');
        balanceState.pendingClosure = null;
      }
    }
    balanceState.lastKnownTabState = currentTabState;

    if (currentTabState === 'closed') {
      const currentBalance = state.bridge.getBalance();
      if (currentBalance !== null) {
        const isDemo = state.bridge.isDemoAccount();
        state.overlay.setAccountInfo(isDemo, currentBalance);
        balanceState.prevBalance = currentBalance;
      }
      return;
    }

    if (balanceState.tabSwitchFreezeRemaining > 0) {
      balanceState.tabSwitchFreezeRemaining--;
      const trades = state.bridge.getOpenTrades();
      const mapped = trades.map(t => ({
        id: t.asset + t.timer,
        asset: t.asset, direction: t.direction, amount: t.amount,
        openTime: 0, closeTime: 0,
        profit: parseFloat(t.profit.replace(/[^0-9.-]/g, '')) || 0,
        isWin: t.isPositive, payout: t.payout, timer: t.timer,
        returnAmount: t.returnAmount, isPositive: t.isPositive,
      }));
      state.overlay.updateOpenTrades(enrichTradesWithSource(mapped));
      const currentBalance = state.bridge.getBalance();
      if (currentBalance !== null) {
        const isDemo = state.bridge.isDemoAccount();
        state.overlay.setAccountInfo(isDemo, currentBalance);
        balanceState.prevBalance = currentBalance;
      }
      balanceState.prevTradeCount = trades.length;
      balanceState.prevTradeAssets = trades.map(t => t.asset);
      balanceState.prevTradeAmounts = trades.map(t => t.amount);
      balanceState.prevTradeDirections = trades.map(t => (t.direction === 'PUT' ? 'PUT' : 'CALL') as 'CALL' | 'PUT');
      return;
    }

    const trades = state.bridge.getOpenTrades();
    const mapped = trades.map(t => {
      let closeTime = 0;
      if (t.timer) {
        const parts = t.timer.split(':');
        if (parts.length === 2) {
          const secs = parseInt(parts[0]!) * 60 + parseInt(parts[1]!);
          if (secs > 0) closeTime = Date.now() + secs * 1000;
        }
      }
      return {
        id: t.asset + t.timer,
        asset: t.asset, direction: t.direction, amount: t.amount,
        openTime: Date.now() - (closeTime > 0 ? closeTime - Date.now() : 300000),
        closeTime,
        profit: parseFloat(t.profit.replace(/[^0-9.-]/g, '')) || 0,
        isWin: t.isPositive, payout: t.payout, timer: t.timer,
        returnAmount: t.returnAmount, isPositive: t.isPositive,
      };
    });

    state.overlay.updateOpenTrades(enrichTradesWithSource(mapped));
    chrome.runtime.sendMessage({
      type: 'UPDATE_TRADES',
      trades: enrichTradesWithSource(mapped).map((t, i) => ({
        id: t.asset + '_' + i,
        asset: t.asset, direction: t.direction,
        amount: t.amount, openTime: 0, closeTime: t.closeTime || 0,
        profit: t.profit,
        source: (t as any).source,
      })),
    } as ExtensionMessage).catch((err) => {
      Sentry.captureException(err);
    });

    const currentBalance = state.bridge.getBalance();
    if (currentBalance !== null) {
      const isDemo = state.bridge.isDemoAccount();
      state.overlay.setAccountInfo(isDemo, currentBalance);
      sendToBackground({ type: 'UPDATE_ACCOUNT', accountInfo: { isDemo, balance: currentBalance } } as ExtensionMessage);
    }
  } catch { /* skip */ }
}, CONTENT_POLL_INTERVAL_MS);

// Session expiry detection
setInterval(() => {
  try {
    const url = window.location.href;
    if (url.includes('/login') || url.includes('/auth') || url.includes('/signin')) {
      console.warn('[SnapTrade] Session expired — PO redirected to login page');
      sendToBackground({ type: 'PO_READY', ready: false } as ExtensionMessage);
      chrome.runtime.sendMessage({ type: 'SESSION_EXPIRED' } as ExtensionMessage).catch(() => {});
    }
  } catch { /* skip */ }
}, 30000);

// Re-announce PO_READY periodically
setInterval(() => {
  try {
    chrome.runtime.sendMessage({ type: 'PO_READY', ready: state.bridge.isReady() } as ExtensionMessage).catch((err) => {
      Sentry.captureException(err);
    });
  } catch (err) {
    console.warn('[SnapTrade] PO_READY announce failed:', err);
    Sentry.captureException(err);
  }
}, PO_READY_ANNOUNCE_MS);

// Best-effort flush before page unload
window.addEventListener('beforeunload', () => {
  labFlush();
  shadowFlush();
});

// Start
init().catch(err => {
  console.error('[SnapTrade] Content script init error:', err);
  Sentry.captureException(err);
});
