/**
 * Background service worker — MV3 lifecycle-aware.
 * Entry point: message handling, event listeners, and bootstrap.
 * State and logic split across sw-state, sw-signals, sw-execution.
 */

import type {
  ExtensionMessage, Signal, TradeExecution,
} from '../types';
import {
  API_BASE, DEFAULT_PAYOUT_RATE, EXTENSION_VERSION,
  KEEPALIVE_INTERVAL_MIN, DAILY_RESET_INTERVAL_MIN,
} from '../lib/constants';
import {
  getSettings, updateSettings, getDailyState, updateDailyState,
} from '../lib/storage';
import {
  masanielloRecordTrade, masanielloGetStake, masanielloGetState,
} from '../lib/masaniello';
import { sorosRecordTrade, sorosGetState } from '../lib/soros';
import { sorosgaleRecordTrade, sorosgaleGetState } from '../lib/sorosgale';
import { reportTrade } from '../lib/api';
import { initSentry } from '../config/sentry';
import * as Sentry from '@sentry/browser';

// State & calculators
import {
  settings, masaniello, masanielloStates, soros, sorosgale,
  pendingSignals, openTrades, executedSignalIds, pendingTradeMap, tradeChannelMap,
  symbolCooldowns, symbolLossCooldowns, swTradeLogCounter,
  listenersSetUp,
  SYMBOL_COOLDOWN_MS, SYMBOL_LOSS_COOLDOWN_MS, OPEN_TRADE_MAX_AGE_MS,
  REGIME_PAUSE_MS,
  setSettings, setDailyState, setMasaniello, setSoros, setSorosgale,
  setOpenTrades, setAccountInfo, setContentScriptReady,
  setSwTradeLogCounter, setListenersSetUp, setRegimePauseUntil,
  withStateLock, initCalculators, resyncCalculators,
  pruneIdSets, getNextMidnightUTC, checkForUpdates,
  normalizeAsset, getChannelStrategy, getTradeAmount, checkRiskLimits,
  checkRegimeCircuitBreaker,
  broadcastToAll, broadcastStatus, getStatus,
} from './sw-state';

// Signals & polling
import {
  connectToBackend, disconnectBackend,
  refreshContentScriptStatus, processNewSignal,
} from './sw-signals';

// Execution & risk
import {
  executeSignal, pauseTrading, resumeTrading, handleDailyReset,
  log, recordResultForRegime,
} from './sw-execution';

// Initialize Sentry before anything else
initSentry();

// Re-export broadcast functions so other modules that need them can get them
// (kept here for backward compatibility if anything imports from service-worker)
export { broadcastToAll, broadcastStatus, getStatus } from './sw-state';

// === Initialization ===
async function initialize(): Promise<void> {
  setSettings(await getSettings());
  setDailyState(await getDailyState());
  initCalculators();

  // Restore pending signals and executed IDs from storage
  try {
    const stored = await chrome.storage.local.get(['pendingSignalsList', 'executedIds']);
    const now = Date.now();
    const MAX_SIGNAL_AGE = 5 * 60 * 1000;
    let staleCount = 0;
    for (const sig of (stored.pendingSignalsList || [])) {
      const sigTime = new Date(sig.createdAt).getTime();
      if (now - sigTime < MAX_SIGNAL_AGE) {
        pendingSignals.set(sig.id, sig);
      } else {
        staleCount++;
      }
    }
    if (staleCount > 0) {
      console.log(`[SnapTrade] Cleared ${staleCount} stale pending signals on startup`);
      await chrome.storage.local.set({ pendingSignalsList: Array.from(pendingSignals.values()) });
    }
    for (const id of (stored.executedIds || [])) {
      executedSignalIds.add(id);
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

// === Listeners ===
function setupListeners(): void {
  if (listenersSetUp) return;
  setListenersSetUp(true);

  chrome.runtime.onMessage.addListener((msg: ExtensionMessage, _sender, sendResponse) => {
    withStateLock(async () => handleMessage(msg)).then(sendResponse);
    return true;
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    setSettings(await getSettings());
    setDailyState(await getDailyState());
    resyncCalculators();

    if (alarm.name === 'keepalive') {
      if (Math.random() < 0.017) checkForUpdates();
      if (settings.isAuthenticated && settings.extensionToken) {
        // connectToBackend is idempotent — checks pollingActive internally
        connectToBackend();
      }
      // Clean up expired symbol cooldowns
      const cutoff = Date.now() - SYMBOL_COOLDOWN_MS;
      for (const [asset, ts] of symbolCooldowns) {
        if (ts < cutoff) symbolCooldowns.delete(asset);
      }
      const lossCutoff = Date.now() - SYMBOL_LOSS_COOLDOWN_MS;
      for (const [asset, ts] of symbolLossCooldowns) {
        if (ts < lossCutoff) symbolLossCooldowns.delete(asset);
      }
      // Evict stale open trades
      const tradeCutoff = Date.now() - OPEN_TRADE_MAX_AGE_MS;
      const beforeCount = openTrades.length;
      setOpenTrades(openTrades.filter(ot => (ot.openTime || 0) > tradeCutoff));
      if (openTrades.length < beforeCount) {
        console.log(`[SW] Keepalive evicted ${beforeCount - openTrades.length} stale open trades`);
      }
      await refreshContentScriptStatus();
      broadcastStatus();
      // Upload tradeLog every 5 min
      setSwTradeLogCounter((swTradeLogCounter ?? 0) + 1);
      if (settings.extensionToken && swTradeLogCounter >= 5) {
        setSwTradeLogCounter(0);
        try {
          const data = await chrome.storage.local.get(['labTradeLog']);
          const tradeLog = Array.isArray(data.labTradeLog) ? data.labTradeLog : [];
          if (tradeLog.length > 0) {
            await fetch(`${API_BASE}/extension/stats-upload`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.extensionToken}` },
              body: JSON.stringify({ timestamp: Date.now(), tradeLog: tradeLog.slice(-50) }),
            });
          }
        } catch { /* non-critical */ }
      }
    } else if (alarm.name === 'daily-reset') {
      await handleDailyReset();
    } else if (alarm.name.startsWith('execute-')) {
      const sig = pendingSignals.get(alarm.name.replace('execute-', ''));
      if (sig) await executeSignal(sig, getTradeAmount(sig), 0);
    }
  });

  chrome.notifications.onClicked.addListener((id) => {
    chrome.action.openPopup?.();
    chrome.notifications.clear(id);
  });
}

// === Message Handler ===
async function handleMessage(msg: ExtensionMessage): Promise<unknown> {
  setSettings(await getSettings());
  setDailyState(await getDailyState());
  resyncCalculators();

  switch (msg.type) {
    case 'GET_STATUS': {
      if (settings.isAuthenticated && settings.extensionToken) {
        connectToBackend();
      }
      await refreshContentScriptStatus();
      return getStatus();
    }
    case 'SETTINGS_UPDATED': {
      await updateSettings(msg.settings);
      setSettings(await getSettings());
      if ('extensionToken' in msg.settings || 'isEnabled' in msg.settings || 'isAuthenticated' in msg.settings) {
        disconnectBackend();
        if (settings.isAuthenticated && settings.extensionToken) connectToBackend();
      }
      if ('strategy' in msg.settings || 'defaultAmount' in msg.settings) initCalculators();
      broadcastToAll({ type: 'SETTINGS_UPDATED', settings: msg.settings });
      broadcastStatus(); return { ok: true };
    }
    case 'PAUSE_TRADING': await pauseTrading(msg.reason); return { ok: true };
    case 'RESUME_TRADING': await resumeTrading(); return { ok: true };
    case 'CONFIRM_TRADE': {
      const sig = pendingSignals.get(msg.signalId);
      if (sig) await executeSignal(sig, getTradeAmount(sig), 0);
      return { ok: true };
    }
    case 'CANCEL_TRADE': pendingSignals.delete(msg.signalId); broadcastStatus(); return { ok: true };
    case 'PO_READY': setContentScriptReady(msg.ready); broadcastStatus(); return { ok: true };
    case 'SESSION_EXPIRED':
      setContentScriptReady(false);
      broadcastStatus();
      try {
        chrome.notifications.create('session-expired', {
          type: 'basic', iconUrl: 'assets/icon-128.png',
          title: 'SnapTrade - Session Expired',
          message: 'PocketOption session expired. Please log in again.',
          priority: 2,
        });
      } catch { /* notifications may not be available */ }
      return { ok: true };
    case 'WS_DISCONNECTED':
      console.warn('[SW] WebSocket disconnected — result detection unavailable');
      chrome.notifications.create('ws-disconnect', {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'SnapTrade — WebSocket Lost',
        message: 'Connection to Pocket Option lost. Results cannot be detected. Check the trading tab.',
      });
      break;
    case 'SIGNAL_NEW': {
      const sigMsg = msg as ExtensionMessage & { signal: Signal };
      if (sigMsg.signal) {
        await log('info', `Internal signal received: ${sigMsg.signal.asset} ${sigMsg.signal.direction} (${sigMsg.signal.channel?.name || 'unknown'})`);
        await processNewSignal(sigMsg.signal);
      }
      return { ok: true };
    }
    case 'RELAY_PUBLISH': {
      const relayMsg = msg as ExtensionMessage & { payload: any; token: string };
      if (relayMsg.payload?.message?.type && relayMsg.token) {
        const url = `${API_BASE}/relay/publish`;
        console.log('[SW] RELAY_PUBLISH:', relayMsg.payload.message.type);
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${relayMsg.token}` },
          body: JSON.stringify(relayMsg.payload),
        }).then(r => {
          console.log('[SW] Relay publish response:', r.status);
        }).catch(err => {
          console.warn('[SW] Relay publish error:', err.message);
        });
      } else {
        console.warn('[SW] RELAY_PUBLISH missing payload or token');
      }
      return { ok: true };
    }
    case 'TRADE_EXECUTED': return { ok: true };
    case 'GET_TRADE_LOG': {
      const data = await chrome.storage.local.get(['labTradeLog']);
      return { tradeLog: Array.isArray(data.labTradeLog) ? data.labTradeLog : [] };
    }
    case 'TRADE_RESULT': {
      const trMsg = msg as ExtensionMessage & { execution: TradeExecution; channelSlug?: string };
      const exec = trMsg.execution;
      if (!exec || !exec.result || (exec.result !== 'win' && exec.result !== 'loss')) return { ok: true };

      {
        const freshState = await getDailyState();
        if (!freshState) return;

        const isWin = exec.result === 'win';
        const netPnl = exec.netPnl ?? (isWin ? (exec.payout ?? 0) - exec.amount : -exec.amount);

        setOpenTrades(openTrades.filter(ot => ot.id !== exec.id && ot.id !== exec.signalId && ot.asset !== exec.asset));

        if (exec.asset) {
          symbolCooldowns.set(normalizeAsset(exec.asset), Date.now());
        }
        if (!isWin && exec.asset) {
          symbolLossCooldowns.set(normalizeAsset(exec.asset), Date.now());
        }

        setDailyState(freshState);
        resyncCalculators();

        const resultSignal = pendingSignals.get(exec.signalId) ?? null;
        const assetDirKey = exec.asset ? `${normalizeAsset(exec.asset)}_${exec.direction || 'CALL'}` : '';
        const resolvedSlug = trMsg.channelSlug
          || resultSignal?.channel?.slug
          || tradeChannelMap.get(exec.signalId ?? '')
          || tradeChannelMap.get(assetDirKey)
          || '';
        const resultSlug = resolvedSlug
          || (exec.signalId && (exec.signalId.startsWith('llm_') || exec.signalId.startsWith('ws_') || exec.signalId.startsWith('auto_')) ? 'ai_analyst' : '');
        if (exec.signalId) tradeChannelMap.delete(exec.signalId);
        if (assetDirKey) tradeChannelMap.delete(assetDirKey);
        const resultCs = getChannelStrategy(resultSignal);
        if (resultCs.strategy === 'masaniello') {
          if (resultSlug && masanielloStates[resultSlug]) {
            const before = masanielloGetStake(masanielloStates[resultSlug]!);
            masanielloStates[resultSlug] = masanielloRecordTrade(masanielloStates[resultSlug]!, isWin, exec.amount);
            const after = masanielloGetStake(masanielloStates[resultSlug]!);
            console.log(`[SnapTrade] Masaniello record: ${isWin ? 'WIN' : 'LOSS'} slug=${resultSlug} stake $${before.toFixed(2)}→$${after.toFixed(2)} (trades=${masanielloStates[resultSlug]!.dayTrades}/${masanielloStates[resultSlug]!.tradesPerDay})`);
          } else if (masaniello) {
            const before = masanielloGetStake(masaniello);
            setMasaniello(masanielloRecordTrade(masaniello, isWin, exec.amount));
            const after = masaniello ? masanielloGetStake(masaniello) : 0;
            console.log(`[SnapTrade] Masaniello record: ${isWin ? 'WIN' : 'LOSS'} slug=global stake $${before.toFixed(2)}→$${after.toFixed(2)} (trades=${masaniello.dayTrades}/${masaniello.tradesPerDay})`);
          }
        }
        if (resultCs.strategy === 'soros' && soros) {
          setSoros(sorosRecordTrade(soros, isWin));
        }
        if (resultCs.strategy === 'sorosgale' && sorosgale) {
          setSorosgale(sorosgaleRecordTrade(sorosgale, isWin));
        }

        const newTradesExecuted = freshState.tradesExecuted + 1;

        const tradeKey = `${exec.asset}_${exec.direction || 'CALL'}`;
        const realSignalId = pendingTradeMap.get(tradeKey) ?? exec.signalId ?? `bal_${Date.now()}`;
        pendingTradeMap.delete(tradeKey);

        const resultTrade: TradeExecution = {
          id: exec.id || `bal_${Date.now()}`,
          signalId: realSignalId,
          asset: exec.asset, direction: exec.direction || 'CALL',
          amount: exec.amount, galeLevel: exec.galeLevel ?? 0,
          mode: exec.mode || 'auto', strategy: exec.strategy || settings.strategy,
          executedAt: exec.executedAt || new Date().toISOString(),
          result: exec.result, payout: exec.payout ?? (isWin ? exec.amount * (1 + DEFAULT_PAYOUT_RATE) : 0),
          netPnl,
        };

        await updateDailyState({
          tradesExecuted: newTradesExecuted,
          winsCount: freshState.winsCount + (isWin ? 1 : 0),
          lossesCount: freshState.lossesCount + (isWin ? 0 : 1),
          consecutiveLosses: isWin ? 0 : freshState.consecutiveLosses + 1,
          totalPnl: freshState.totalPnl + netPnl,
          trades: [...freshState.trades, resultTrade],
          masanielloState: masaniello ? masanielloGetState(masaniello) : null,
          masanielloChannelStates: Object.fromEntries(
            Object.entries(masanielloStates).map(([k, v]) => [k, masanielloGetState(v)])
          ),
          sorosState: soros ? sorosGetState(soros) : null,
          sorosgaleState: sorosgale ? sorosgaleGetState(sorosgale) : null,
        });
        setDailyState(await getDailyState());
        resyncCalculators();

        const dailyStateNow = await getDailyState();
        await log('info', `Result #${newTradesExecuted}: ${exec.asset} ${exec.result} $${Math.abs(netPnl).toFixed(2)} PnL=$${dailyStateNow!.totalPnl.toFixed(2)}`);

        recordResultForRegime(isWin);
        const regime = checkRegimeCircuitBreaker();
        if (!regime.ok) {
          setRegimePauseUntil(Date.now() + REGIME_PAUSE_MS);
          await log('warn', `REGIME SHIFT DETECTED: ${regime.reason} — pausing ${REGIME_PAUSE_MS / 60000} min`);
        }

        const risk = checkRiskLimits();
        if (!risk.canTrade) await pauseTrading(risk.reason!);

        broadcastStatus();

        try {
          const s = await getSettings();
          if (s.extensionToken) {
            reportTrade(exec, s.extensionToken).catch(err =>
              console.warn('[SW] reportTrade failed:', err.message)
            );
          }
        } catch (e) {
          console.warn('[SW] reportTrade setup error:', e);
        }
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
      const incoming = (msg as ExtensionMessage & { trades: typeof openTrades }).trades || [];
      const now = Date.now();
      setOpenTrades(incoming.filter(ot => now - (ot.openTime || 0) < OPEN_TRADE_MAX_AGE_MS));
      if (incoming.length !== openTrades.length) {
        console.log(`[SW] Evicted ${incoming.length - openTrades.length} stale open trades (>${OPEN_TRADE_MAX_AGE_MS / 60000}min old)`);
      }
      broadcastStatus();
      return { ok: true };
    }
    case 'UPDATE_ACCOUNT': {
      setAccountInfo((msg as ExtensionMessage & { accountInfo: {isDemo:boolean;balance:number} }).accountInfo || { isDemo: true, balance: 0 });
      broadcastStatus();
      return { ok: true };
    }
    case 'GET_LOGS': {
      const { activityLog = [] } = await chrome.storage.local.get('activityLog');
      return activityLog.slice(-20);
    }
    case 'TEST_SENTRY': {
      Sentry.captureException(new Error('Test error from extension'));
      return { success: true };
    }
    default: return { ok: false };
  }
}

// === Bootstrap ===
chrome.runtime.onStartup.addListener(() => { initialize().catch(console.error); });
chrome.runtime.onInstalled.addListener(() => { initialize().catch(console.error); });
initialize().catch(console.error);
