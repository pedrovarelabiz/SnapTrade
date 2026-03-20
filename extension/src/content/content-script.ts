import { PocketOptionBridge } from './pocket-option-bridge';
import { OverlayManager } from './overlay';
import type { Signal, TradeExecution, ExtensionMessage, ExtensionSettings } from '../types';
import { getSettings } from '../lib/storage';
import { DEFAULT_PAYOUT_RATE, CONTENT_POLL_INTERVAL_MS, PO_READY_ANNOUNCE_MS } from '../lib/constants';

// Trade execution dedup (survives service worker restarts)
const executedTradeIds = new Set<string>();



// WS capture: listen for messages from ws-interceptor.js (MAIN world)
window.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;
  const { type, data } = event.data;

  if (type === 'ST_WS_OUT' || type === 'ST_WS_TRADE') {
    const s = String(data).toLowerCase();
    if (s.includes('openorder') || s.includes('closeorder')) {
      console.log('[SnapTrade WS ' + (type === 'ST_WS_OUT' ? 'OUT' : 'IN') + ']', String(data).substring(0, 200));
    }
  }

  if (type === 'ST_WS_BINARY' || type === 'ST_WS_DEALS') {
    try {
      const raw = String(data);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const trades = parsed.filter((d: Record<string, unknown>) => d && d.id && d.asset).map((d: Record<string, unknown>) => ({
          id: String(d.id),
          asset: String(d.asset || ''),
          direction: d.call_put === 'call' ? 'CALL' : 'PUT',
          amount: Number(d.amount || 0),
          openTime: Number(d.openTimestamp || d.created || 0) * 1000,
          closeTime: Number(d.closeTimestamp || d.expCloseTimestamp || 0) * 1000,
          profit: d.profit != null ? Number(d.profit) : undefined,
          isWin: d.profit != null ? Number(d.profit) > 0 : undefined,
        }));
        if (trades.length > 0) {
          state.overlay.updateOpenTrades(trades);
          chrome.runtime.sendMessage({ type: 'UPDATE_TRADES', trades } as ExtensionMessage).catch(() => {});
        }
      }
    } catch { /* not parseable */ }
  }
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ContentState {
  readonly bridge: PocketOptionBridge;
  readonly overlay: OverlayManager;
  readonly pendingSignals: Map<string, Signal>;
  readonly activeGales: Map<string, { signal: Signal; level: number; lastAmount: number }>;
  settings: ExtensionSettings | null;
}

const state: ContentState = {
  bridge: new PocketOptionBridge(),
  overlay: new OverlayManager(),
  pendingSignals: new Map(),
  activeGales: new Map(),
  settings: null,
};

// ---------------------------------------------------------------------------
// Balance-based result detection state
// ---------------------------------------------------------------------------

interface PendingClosure {
  numClosed: number;
  balanceBefore: number;
  assets: string[];
  amounts: number[];
  cyclesWaited: number;
}

let prevBalance: number | null = null;
let prevTradeCount = 0;
let prevTradeAssets: string[] = [];
let prevTradeAmounts: number[] = [];
let pendingClosure: PendingClosure | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sendToBackground(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {});
}

async function loadSettings(): Promise<ExtensionSettings> {
  const settings = await getSettings();
  state.settings = settings;
  return settings;
}

function computeGaleAmount(baseAmount: number, level: number, multiplier: number): number {
  if (level <= 0) return baseAmount;
  return Math.round(baseAmount * Math.pow(multiplier, level) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Trade execution
// ---------------------------------------------------------------------------

async function executeTrade(
  signal: Signal,
  amount: number,
  galeLevel: number,
): Promise<void> {
  if (executedTradeIds.has(signal.id + '_g' + galeLevel)) {
    console.log('[SnapTrade] Trade already executed (dedup):', signal.id, 'gale:', galeLevel);
    return;
  }
  executedTradeIds.add(signal.id + '_g' + galeLevel);

  const settings = state.settings ?? (await loadSettings());

  // tradingMode: force demo/real via WS regardless of PO's visual state
  const forceDemo = settings.tradingMode === 'demo';

  // Balance protection
  const balance = state.bridge.getBalance();
  if (balance !== null && settings.minBalanceProtection > 0 && balance < settings.minBalanceProtection) {
    sendToBackground({
      type: 'PAUSE_TRADING',
      reason: `Balance ($${balance.toFixed(2)}) below minimum ($${settings.minBalanceProtection})`,
    });
    return;
  }

  const tradeAmount = settings.maxSingleTradeAmount > 0 ? Math.min(amount, settings.maxSingleTradeAmount) : amount;

  const result = await state.bridge.executeTrade(
    signal.asset,
    signal.direction,
    tradeAmount,
    signal.expirationMinutes || 5,
    forceDemo,
  );

  const execution: TradeExecution = {
    id: generateExecutionId(),
    signalId: signal.id,
    asset: signal.asset,
    direction: signal.direction,
    amount: tradeAmount,
    galeLevel,
    mode: settings.executionMode === 'auto' ? 'auto' : settings.executionMode === 'semi-auto' ? 'semi' : 'manual',
    strategy: settings.strategy,
    executedAt: new Date().toISOString(),
    result: result.success ? 'pending' : null,
    payout: null,
    netPnl: null,
  };

  if (result.success) {
    console.log('[SnapTrade] Trade opened:', signal.asset, signal.direction, '$' + tradeAmount);

    const now = Date.now();
    chrome.runtime.sendMessage({ type: 'UPDATE_TRADES', trades: [{
      id: 'st_' + signal.id, asset: signal.asset, direction: signal.direction,
      amount: tradeAmount, openTime: now, closeTime: now + (signal.expirationMinutes || 5) * 60000,
    }]} as ExtensionMessage).catch(() => {});

    state.overlay.addOpenTrade({
      id: 'st_' + signal.id,
      asset: signal.asset.replace(/\//g, '').replace(/\s+OTC/i, '_otc'),
      direction: signal.direction,
      amount: tradeAmount,
      openTime: now,
      closeTime: now + (signal.expirationMinutes || 5) * 60 * 1000,
    });

    if (settings.strategy === 'simple' && settings.simpleMaxGale > 0) {
      state.activeGales.set(signal.id, {
        signal,
        level: galeLevel,
        lastAmount: tradeAmount,
      });
    }

    sendToBackground({ type: 'TRADE_EXECUTED', execution });
  } else {
    sendToBackground({ type: 'TRADE_EXECUTED', execution: { ...execution, result: null } });
    console.warn('[SnapTrade] Trade execution failed:', result.error);
  }
}

// ---------------------------------------------------------------------------
// Trade result handler (gale logic ONLY — result reporting done by balance poll)
// ---------------------------------------------------------------------------

function handleTradeResult(resultData: { win: boolean; amount: number; asset?: string }): void {
  const settings = state.settings;
  if (!settings) return;

  // NOTE: sendToBackground(TRADE_RESULT) and state.overlay.showResult() are intentionally
  // NOT called here. Result reporting is handled by the balance-based detection in the
  // setInterval poll below to avoid double-counting (WS binary frames are unreliable).

  // Handle gale logic for 'simple' strategy
  const entries = Array.from(state.activeGales.entries());
  if (entries.length === 0) return;

  const [signalId, galeInfo] = entries[0];

  if (resultData.win) {
    state.activeGales.delete(signalId);
  } else {
    const nextLevel = galeInfo.level + 1;
    if (
      settings.strategy === 'simple' &&
      nextLevel <= settings.simpleMaxGale &&
      settings.autoExecuteGale
    ) {
      const nextAmount = computeGaleAmount(settings.defaultAmount, nextLevel, settings.simpleMultiplier);
      state.activeGales.set(signalId, {
        ...galeInfo,
        level: nextLevel,
        lastAmount: nextAmount,
      });
      executeTrade(galeInfo.signal, nextAmount, nextLevel);
    } else {
      state.activeGales.delete(signalId);
    }
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

function handleMessage(
  message: ExtensionMessage | { type: 'PING' },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): boolean {
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
      }
      sendResponse({ ok: true });
      return false;
    }

    case 'STATUS_UPDATE': {
      const statMsg = msg as ExtensionMessage & { status: { dailyState: any; isConnected: boolean } };
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
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  console.log('[SnapTrade] Content script initializing...');

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

  const ready = await state.bridge.waitForReady(30000);
  sendToBackground({ type: 'PO_READY', ready });

  if (!ready) {
    console.warn('[SnapTrade] Pocket Option did not become ready within timeout.');
    chrome.runtime.onMessage.addListener(handleMessage);
    return;
  }

  console.log('[SnapTrade] Pocket Option is ready.');

  if (settings.showOverlay) {
    state.overlay.init();
    state.overlay.setExecutionMode(settings.executionMode);
    state.overlay.setConnectionStatus(true);
  }

  state.bridge.watchForResult(handleTradeResult);
  chrome.runtime.onMessage.addListener(handleMessage);

  // Listen for storage changes
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
    }

    if (changes.dailyState?.newValue) {
      state.overlay.updateDailyState(changes.dailyState.newValue);
    }
  });

  // Log account info
  const balance = state.bridge.getBalance();
  const isDemo = state.bridge.isDemoAccount();
  console.log(`[SnapTrade] Account: ${isDemo ? 'DEMO' : 'REAL'} | Balance: ${balance}`);
  state.overlay.setAccountInfo(isDemo, balance || 0);
  sendToBackground({ type: 'UPDATE_ACCOUNT', accountInfo: { isDemo, balance: balance || 0 } } as ExtensionMessage);
}

// === DOM polling for open trades display + account info + balance-based result detection ===
setInterval(() => {
  try {
    const trades = state.bridge.getOpenTrades();

    const currentAssets = trades.map(t => t.asset);
    const currentAmounts = trades.map(t => t.amount);
    const currentCount = trades.length;

    const mapped = trades.map(t => ({
      id: t.asset + t.timer,
      asset: t.asset,
      direction: t.direction,
      amount: t.amount,
      openTime: 0,
      closeTime: 0,
      profit: parseFloat(t.profit.replace(/[^0-9.-]/g, '')) || 0,
      isWin: t.isPositive,
      payout: t.payout,
      timer: t.timer,
      returnAmount: t.returnAmount,
      isPositive: t.isPositive,
    }));

    state.overlay.updateOpenTrades(mapped);
    if (mapped.length > 0) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_TRADES',
        trades: mapped.map(t => ({
          id: t.id, asset: t.asset, direction: t.direction,
          amount: t.amount, openTime: 0, closeTime: 0,
          profit: t.profit, isPositive: t.isPositive, payout: t.payout,
          timer: t.timer, returnAmount: t.returnAmount,
        })),
      } as ExtensionMessage).catch(() => {});
    }

    // --- Balance-based result detection ---
    const currentBalance = state.bridge.getBalance();

    if (currentBalance !== null) {
      const isDemo = state.bridge.isDemoAccount();
      state.overlay.setAccountInfo(isDemo, currentBalance);

      if (pendingClosure !== null) {
        // We have trades that just closed — wait for balance to change
        const balanceDelta = Math.abs(currentBalance - pendingClosure.balanceBefore);
        if (balanceDelta > 0.01) {
          // Balance changed: determine win/loss from delta
          const netPnl = currentBalance - pendingClosure.balanceBefore;
          const perTradePnl = netPnl / pendingClosure.numClosed;
          const isWin = netPnl > 0;
          const settings = state.settings;

          for (let i = 0; i < pendingClosure.numClosed; i++) {
            const asset = pendingClosure.assets[i] || pendingClosure.assets[0] || 'Unknown';
            const tradeAmount = pendingClosure.amounts[i] || pendingClosure.amounts[0] || Math.abs(perTradePnl);
            const absProfit = Math.abs(perTradePnl);

            state.overlay.showResult(asset, isWin, absProfit);

            const resultExecution: TradeExecution = {
              id: generateExecutionId(),
              signalId: 'bal_' + Date.now() + '_' + i,
              asset,
              direction: 'CALL',
              amount: tradeAmount,
              galeLevel: 0,
              mode: settings
                ? (settings.executionMode === 'auto' ? 'auto' : settings.executionMode === 'semi-auto' ? 'semi' : 'manual')
                : 'manual',
              strategy: settings?.strategy || 'simple',
              executedAt: new Date().toISOString(),
              result: isWin ? 'win' : 'loss',
              payout: isWin ? absProfit : 0,
              netPnl: isWin ? absProfit : -tradeAmount,
            };
            sendToBackground({ type: 'TRADE_RESULT', execution: resultExecution });
            console.log('[SnapTrade] Balance-detected result:', asset, isWin ? 'WIN' : 'LOSS', '$' + absProfit.toFixed(2));
          }

          pendingClosure = null;
          // Update prevBalance to current after processing
          prevBalance = currentBalance;
        } else {
          // Balance not changed yet — increment wait counter
          pendingClosure = { ...pendingClosure, cyclesWaited: pendingClosure.cyclesWaited + 1 };

          if (pendingClosure.cyclesWaited >= 3) {
            // Timeout: report as loss using last known trade amounts
            const settings = state.settings;
            for (let i = 0; i < pendingClosure.numClosed; i++) {
              const asset = pendingClosure.assets[i] || pendingClosure.assets[0] || 'Unknown';
              const tradeAmount = pendingClosure.amounts[i] || pendingClosure.amounts[0] || 1;

              state.overlay.showResult(asset, false, tradeAmount);

              const resultExecution: TradeExecution = {
                id: generateExecutionId(),
                signalId: 'bal_timeout_' + Date.now() + '_' + i,
                asset,
                direction: 'CALL',
                amount: tradeAmount,
                galeLevel: 0,
                mode: settings
                  ? (settings.executionMode === 'auto' ? 'auto' : settings.executionMode === 'semi-auto' ? 'semi' : 'manual')
                  : 'manual',
                strategy: settings?.strategy || 'simple',
                executedAt: new Date().toISOString(),
                result: 'loss',
                payout: 0,
                netPnl: -tradeAmount,
              };
              sendToBackground({ type: 'TRADE_RESULT', execution: resultExecution });
              console.log('[SnapTrade] Balance timeout — reporting loss for:', asset, '$' + tradeAmount.toFixed(2));
            }
            pendingClosure = null;
            prevBalance = currentBalance;
          }
          // Do NOT update prevBalance while waiting for balance change
        }
      } else {
        // No pending closure: check if trade count dropped
        if (prevBalance !== null && currentCount < prevTradeCount && prevTradeCount > 0) {
          const numClosed = prevTradeCount - currentCount;
          // Determine which assets/amounts closed: they were in prev but not in current
          const closedAssets: string[] = [];
          const closedAmounts: number[] = [];
          const currentAssetSet = new Set(currentAssets);
          for (let i = 0; i < prevTradeAssets.length; i++) {
            if (!currentAssetSet.has(prevTradeAssets[i]!)) {
              closedAssets.push(prevTradeAssets[i]!);
              closedAmounts.push(prevTradeAmounts[i] ?? 0);
            }
          }
          // Fill up to numClosed if we couldn't identify all closed trades
          while (closedAssets.length < numClosed && prevTradeAssets.length > 0) {
            closedAssets.push(prevTradeAssets[0]!);
            closedAmounts.push(prevTradeAmounts[0] ?? 0);
          }

          pendingClosure = {
            numClosed,
            balanceBefore: prevBalance,
            assets: closedAssets,
            amounts: closedAmounts,
            cyclesWaited: 0,
          };
          console.log('[SnapTrade] Detected', numClosed, 'closed trade(s), waiting for balance change from', prevBalance);
          // Do NOT update prevBalance here — we need it as the baseline
        } else {
          // No closure detected — safe to update prevBalance
          prevBalance = currentBalance;
        }
      }
    }

    // Always update prev-state tracking (except when waiting on pendingClosure)
    if (pendingClosure === null) {
      prevTradeCount = currentCount;
      prevTradeAssets = currentAssets;
      prevTradeAmounts = currentAmounts;
    }
  } catch { /* skip */ }
}, CONTENT_POLL_INTERVAL_MS);

// Re-announce PO_READY periodically
setInterval(() => {
  try {
    chrome.runtime.sendMessage({ type: 'PO_READY', ready: state.bridge.isReady() } as ExtensionMessage).catch(() => {});
  } catch { /* extension context invalid */ }
}, PO_READY_ANNOUNCE_MS);

// Start
init().catch(err => {
  console.error('[SnapTrade] Content script init error:', err);
});
