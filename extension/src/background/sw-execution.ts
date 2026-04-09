/**
 * Trade execution, result processing, risk management, and daily reset.
 */

import type { Signal, TradeExecution, DailyState } from '../types';
import {
  DEFAULT_PAYOUT_RATE, MAX_LOG_ENTRIES,
} from '../lib/constants';
import {
  getSettings, getDailyState, updateDailyState, resetDailyState, addTrade,
} from '../lib/storage';
import {
  masanielloResetDay, masanielloRecordTrade, masanielloGetState, masanielloGetStake,
} from '../lib/masaniello';
import { sorosResetDay, sorosRecordTrade, sorosGetState } from '../lib/soros';
import { sorosgaleResetDay, sorosgaleRecordTrade, sorosgaleGetState } from '../lib/sorosgale';
import { reportTrade } from '../lib/api';
import * as Sentry from '@sentry/browser';
import {
  settings, dailyState, masaniello, masanielloStates, soros, sorosgale,
  pendingSignals, openTrades, executedSignalIds, pendingTradeMap, tradeChannelMap,
  symbolCooldowns, symbolLossCooldowns, recentResults,
  regimePauseUntil, REGIME_WINDOW_SIZE, REGIME_MIN_WIN_RATE, REGIME_PAUSE_MS,
  setDailyState, setMasaniello, setSoros, setSorosgale, setOpenTrades,
  setRegimePauseUntil,
  normalizeAsset, initCalculators, resyncCalculators,
  checkRiskLimits, getChannelStrategy, getTradeAmount,
  checkRegimeCircuitBreaker, broadcastToAll, broadcastStatus,
} from './sw-state';
import { pingContentScript } from './sw-signals';

// === Logging ===
export async function log(lvl: string, msg: string, data?: unknown): Promise<void> {
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push({ ts: new Date().toISOString(), lvl, msg, d: data ? JSON.stringify(data).slice(0, 200) : undefined });
    if (activityLog.length > MAX_LOG_ENTRIES) activityLog.splice(0, activityLog.length - MAX_LOG_ENTRIES);
    await chrome.storage.local.set({ activityLog });
  } catch { /* skip */ }
}

export function recordResultForRegime(win: boolean): void {
  recentResults.push({ win, ts: Date.now() });
  while (recentResults.length > 50) recentResults.shift();
}

// === Trade Execution ===
export async function executeSignal(signal: Signal, amount: number, galeLevel: number): Promise<void> {
  const wsKey = 'ws_' + signal.id + '_g' + galeLevel;
  if (executedSignalIds.has(wsKey)) return;
  executedSignalIds.add(wsKey);

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

  // Track channel for masaniello per-channel routing
  const execSlug = signal.channel?.slug ?? '';
  if (execSlug) {
    tradeChannelMap.set(signal.id, execSlug);
    tradeChannelMap.set(`${normalizeAsset(signal.asset)}_${signal.direction}`, execSlug);
  }

  const execution: TradeExecution = {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    signalId: signal.id, asset: signal.asset, direction: signal.direction,
    amount, galeLevel,
    mode: settings.executionMode === 'auto' ? 'auto' : settings.executionMode === 'semi-auto' ? 'semi' : 'manual',
    strategy: settings.strategy, executedAt: new Date().toISOString(),
    result: 'pending', payout: null, netPnl: null,
  };

  try {
    const poTabs = await chrome.tabs.query({
      url: ['*://pocketoption.com/*', '*://po.trade/*', '*://*.pocketoption.com/*']
    });
    let executed = false;
    for (const tab of poTabs) {
      if (!tab.id) continue;
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXECUTE_TRADE', signal, amount, galeLevel });
        if (response && response.success === false && response.error === 'Timeout') {
          Sentry.captureMessage('Trade execution timeout', {
            level: 'warning',
            tags: { trade_issue: 'timeout' },
            extra: {
              signalId: signal.id, asset: signal.asset, direction: signal.direction,
              amount, galeLevel, tabId: tab.id,
            },
          });
          await log('warn', `Trade execution timeout: ${signal.asset} ${signal.direction} $${amount}`);
        }
        executed = true;
        break;
      } catch (e) {
        Sentry.captureException(e, {
          tags: { context: 'trade_execution_tab' },
          extra: { signalId: signal.id, asset: signal.asset, amount, tabId: tab.id },
        });
        await log('error', 'Execute tab error: ' + String(e));
      }
    }

    if (!executed) { await log('warn', 'No PO tab accepted the trade'); return; }

    pendingTradeMap.set(`${signal.asset}_${signal.direction}`, signal.id);
    setTimeout(() => pendingTradeMap.delete(`${signal.asset}_${signal.direction}`), 600_000);

    if (dailyState) {
      setDailyState(await getDailyState());
    }

    await addTrade(execution);
    pendingSignals.delete(signal.id);
    await chrome.storage.local.set({
      pendingSignalsList: Array.from(pendingSignals.values()),
      executedIds: Array.from(executedSignalIds),
    });
    await log('info', `Trade executed: ${signal.asset} ${signal.direction} $${amount}`);
    broadcastStatus();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { context: 'trade_execution' },
      extra: { signalId: signal.id, asset: signal.asset, direction: signal.direction, amount, galeLevel },
    });
    await log('error', `Trade execution failed: ${String(error)}`);
    throw error;
  }
}

// === Result Processing (possibly dead code — preserved) ===
export async function processResult(signal: Signal): Promise<void> {
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

  if (masaniello) setMasaniello(masanielloRecordTrade(masaniello, isWin));
  if (soros) setSoros(sorosRecordTrade(soros, isWin));
  if (sorosgale) setSorosgale(sorosgaleRecordTrade(sorosgale, isWin));

  await updateDailyState({
    winsCount: dailyState.winsCount + (isWin ? 1 : 0),
    lossesCount: dailyState.lossesCount + (isWin ? 0 : 1),
    consecutiveLosses: isWin ? 0 : dailyState.consecutiveLosses + 1,
    totalPnl: dailyState.totalPnl + netPnl,
    trades: updatedTrades,
    masanielloState: masaniello ? masanielloGetState(masaniello) : null,
    masanielloChannelStates: Object.fromEntries(
      Object.entries(masanielloStates).map(([k, v]) => [k, masanielloGetState(v)])
    ),
    sorosState: soros ? sorosGetState(soros) : null,
    sorosgaleState: sorosgale ? sorosgaleGetState(sorosgale) : null,
  });
  setDailyState(await getDailyState());

  const risk = checkRiskLimits();
  if (!risk.canTrade) await pauseTrading(risk.reason!);

  broadcastToAll({ type: 'TRADE_RESULT', execution: updatedTrade });
  broadcastStatus();
}

// === Risk / Daily Reset ===
export async function pauseTrading(reason: string): Promise<void> {
  await updateDailyState({ isPaused: true, pauseReason: reason });
  setDailyState(await getDailyState());
  broadcastStatus();
}

export async function resumeTrading(): Promise<void> {
  await updateDailyState({ isPaused: false, pauseReason: null, consecutiveLosses: 0 });
  setDailyState(await getDailyState());
  broadcastStatus();
}

export async function handleDailyReset(): Promise<void> {
  await resetDailyState();
  setDailyState(await getDailyState());
  if (masaniello) setMasaniello(masanielloResetDay(masaniello));
  for (const slug of Object.keys(masanielloStates)) {
    masanielloStates[slug] = masanielloResetDay(masanielloStates[slug]!);
  }
  if (soros) setSoros(sorosResetDay(soros));
  if (sorosgale) setSorosgale(sorosgaleResetDay(sorosgale));
  initCalculators();
  broadcastStatus();
}
