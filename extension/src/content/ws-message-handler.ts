import type { TradeExecution, ExtensionMessage } from '../types';
import * as Sentry from '@sentry/browser';
import { state, openTradeAssets, tradeSourceMap, normalizeAssetForGuard, enrichTradesWithSource, getTradeSource, generateExecutionId, sendToBackground } from './content-state';
import { wsClosedDealIds, wsResolvedAssets, recentTradeGaleLevels, persistGaleLevels } from './gale-persistence';
import { handleTradeResult, balanceState } from './trade-executor';
import { publishTradeResult } from './indicators/relay-publisher';
import { shadowUpdateActualResult } from './indicators/shadow-tracker';
import { logAiFeedback } from './indicators/llm-analyst';
import { getActiveLabTradeAsset, notifyTradeClose } from './indicators/lab-to-trade';

// ---------------------------------------------------------------------------
// WS state
// ---------------------------------------------------------------------------

let lastWsReadyTime = 0;
let lastWsUrl = '';

// These are set by the indicator-controller module
let _chartRotationComplete = false;
let _lastSubscribedHash = '';
let _subscribeMonitoredPairs: ((settings: any) => void) | null = null;

export function setWsHandlerDeps(deps: {
  getChartRotationComplete: () => boolean;
  setChartRotationComplete: (v: boolean) => void;
  getLastSubscribedHash: () => string;
  setLastSubscribedHash: (v: string) => void;
  subscribeMonitoredPairs: (settings: any) => void;
}): void {
  _subscribeMonitoredPairs = deps.subscribeMonitoredPairs;
  // We use getters/setters to bridge mutable state
  Object.defineProperty(wsHandlerState, 'chartRotationComplete', {
    get: deps.getChartRotationComplete,
    set: deps.setChartRotationComplete,
    configurable: true,
  });
  Object.defineProperty(wsHandlerState, 'lastSubscribedHash', {
    get: deps.getLastSubscribedHash,
    set: deps.setLastSubscribedHash,
    configurable: true,
  });
}

const wsHandlerState = {
  chartRotationComplete: false,
  lastSubscribedHash: '',
};

// ---------------------------------------------------------------------------
// WS message listener
// ---------------------------------------------------------------------------

export function initWsMessageHandler(): void {
  window.addEventListener('message', (event) => {
    try {
      if (!event.data || typeof event.data !== 'object') return;
      const { type, data } = event.data;

      // Chart rotation complete — all pairs now have equal candle data
      if (type === 'ST_ROTATION_COMPLETE') {
        wsHandlerState.chartRotationComplete = true;
        const seeded = (event.data as any)?.seeded ?? 0;
        console.log(`[SnapTrade] Chart rotation complete — ${seeded} pairs seeded. Signal detection unblocked.`);
        return;
      }

      // Handle WS disconnection
      if (type === 'ST_WS_CLOSED') {
        console.warn('[CS] WebSocket disconnected — result detection unavailable');
        chrome.runtime.sendMessage({ type: 'WS_DISCONNECTED' }).catch((err) => {
          Sentry.captureException(err);
        });
        if (state.overlay) {
          state.overlay.setConnectionStatus?.(false);
        }
        return;
      }

      // WS reconnect — re-subscribe to monitored pairs
      if (type === 'ST_WS_READY') {
        const wsUrl = (event.data as any)?.url || '';
        const now = Date.now();

        if (wsUrl && wsUrl === lastWsUrl) {
          if (state.overlay) state.overlay.setConnectionStatus?.(true);
          return;
        }

        if (now - lastWsReadyTime < 10000) return;
        lastWsReadyTime = now;
        lastWsUrl = wsUrl;

        console.log('[SnapTrade] WS reconnected, re-subscribing assets...');
        wsHandlerState.lastSubscribedHash = '';
        if (state.settings && _subscribeMonitoredPairs) {
          _subscribeMonitoredPairs(state.settings);
        }
        if (state.overlay) {
          state.overlay.setConnectionStatus?.(true);
        }
      }

      // Binary frames: pure JSON arrays for overlay trade display
      if (type === 'ST_WS_BINARY') {
        try {
          const raw = String(data);
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const trades = parsed.filter((d: Record<string, unknown>) => d && d.id && d.asset).map((d: Record<string, unknown>) => ({
              id: String(d.id),
              asset: String(d.asset || ''),
              direction: (d.call_put === 'call' || d.call_put === 'Call' || d.call_put === 'CALL' || d.call_put === true || d.call_put === 1 || d.cmd === 0) ? 'CALL' as const : 'PUT' as const,
              amount: Number(d.amount || 0),
              openTime: Number(d.openTimestamp || d.created || 0) * 1000,
              closeTime: Number(d.closeTimestamp || d.expCloseTimestamp || 0) * 1000,
              profit: d.profit != null ? Number(d.profit) : undefined,
              isWin: d.profit != null ? Number(d.profit) > 0 : undefined,
            }));
            if (trades.length > 0) {
              state.overlay.updateOpenTrades(enrichTradesWithSource(trades));
              chrome.runtime.sendMessage({ type: 'UPDATE_TRADES', trades } as ExtensionMessage).catch((err) => {
                Sentry.captureException(err);
              });
            }
          }
        } catch { /* not parseable */ }
      }

      // Socket.IO frames: updateOpenedDeals / updateClosedDeals / successcloseOrder
      if (type === 'ST_WS_DEALS') {
        handleWsDeals(data);
      }
    } catch (err) {
      console.error('[SnapTrade] Window message handler error:', err);
      Sentry.captureException(err);
    }
  });
}

// ---------------------------------------------------------------------------
// ST_WS_DEALS handler (extracted for readability)
// ---------------------------------------------------------------------------

function handleWsDeals(data: unknown): void {
  try {
    const raw = String(data);
    const jsonStart = raw.indexOf('[');
    if (jsonStart < 0) return;
    const parsed = JSON.parse(raw.substring(jsonStart));
    if (!Array.isArray(parsed) || parsed.length < 2) return;

    const eventName = String(parsed[0]);
    const payload = parsed[1];

    let dealsRaw: Record<string, unknown>[];
    if (Array.isArray(payload)) {
      dealsRaw = payload;
    } else if (payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).deals)) {
      dealsRaw = (payload as Record<string, unknown>).deals as Record<string, unknown>[];
    } else if (payload && typeof payload === 'object' && (payload as Record<string, unknown>).id) {
      dealsRaw = [payload as Record<string, unknown>];
    } else {
      return;
    }

    const trades = dealsRaw
      .filter((d) => d && d.id && d.asset)
      .map((d) => {
        const openTs = Number(d.openTimestamp || d.created || 0) * 1000;
        const rawCloseTs = Number(d.closeTimestamp || d.expCloseTimestamp || 0) * 1000;
        let closeTs = rawCloseTs;
        if (openTs > 0 && closeTs > 0 && closeTs - openTs < 60000) {
          closeTs = openTs + 5 * 60 * 1000;
        }
        if (closeTs <= 0) {
          closeTs = (openTs || Date.now()) + 5 * 60 * 1000;
        }
        const rawDir = d.call_put;
        const isCall = rawDir === 'call' || rawDir === 'Call' || rawDir === 'CALL' || rawDir === true || rawDir === 1 || d.cmd === 0;
        return {
          id: String(d.id),
          asset: String(d.asset || ''),
          direction: isCall ? 'CALL' as const : 'PUT' as const,
          amount: Number(d.amount || 0),
          openTime: openTs || Date.now(),
          closeTime: closeTs,
          rawCloseTimestamp: rawCloseTs,
          profit: d.profit != null ? Number(d.profit) : undefined,
          isWin: d.profit != null ? Number(d.profit) > 0 : undefined,
          result_iteration: d.level !== undefined ? Number(d.level) : (d.martingale_level !== undefined ? Number(d.martingale_level) : (d.gale_level !== undefined ? Number(d.gale_level) : undefined)),
        };
      });

    // Update overlay with open trade data + track open trade assets
    if (trades.length > 0 && (eventName === 'updateOpenedDeals' || eventName === 'successopenOrder')) {
      console.log('[SnapTrade] Open trades:', eventName, trades.length);
      if (eventName === 'updateOpenedDeals') {
        openTradeAssets.clear();
        for (const t of trades) {
          openTradeAssets.add(normalizeAssetForGuard(t.asset));
        }
      } else {
        for (const t of trades) {
          openTradeAssets.add(normalizeAssetForGuard(t.asset));
        }
      }
      state.overlay.updateOpenTrades(enrichTradesWithSource(trades));
      chrome.runtime.sendMessage({ type: 'UPDATE_TRADES', trades } as ExtensionMessage).catch((err) => {
        Sentry.captureException(err);
      });
    }

    // Generate TRADE_RESULT ONLY from successcloseOrder (live event)
    if (eventName === 'successcloseOrder') {
      processCloseOrders(trades);
    }
  } catch (err) {
    console.warn('[SnapTrade] ST_WS_DEALS parse error:', err);
    Sentry.captureException(err);
  }
}

function processCloseOrders(trades: Array<{ id: string; asset: string; direction: 'CALL' | 'PUT'; amount: number; openTime: number; closeTime: number; profit?: number; isWin?: boolean }>): void {
  const settings = state.settings;
  for (const t of trades) {
    openTradeAssets.delete(normalizeAssetForGuard(t.asset));
    tradeSourceMap.delete(normalizeAssetForGuard(t.asset));
    if (t.profit === undefined || wsClosedDealIds.has(t.id)) continue;
    wsClosedDealIds.add(t.id);
    if (wsClosedDealIds.size > 200) {
      const oldest = wsClosedDealIds.values().next().value;
      if (oldest !== undefined) wsClosedDealIds.delete(oldest);
    }

    const isWin = t.profit > 0;
    wsResolvedAssets.set(t.asset, Date.now());

    // Lookup gale level from recent trades
    const normAsset = normalizeAssetForGuard(t.asset);
    const tradeKeyPut = `${normAsset}:PUT:${t.amount}`;
    const tradeKeyCall = `${normAsset}:CALL:${t.amount}`;
    const galeLookup = recentTradeGaleLevels.get(tradeKeyPut) ?? recentTradeGaleLevels.get(tradeKeyCall);
    const tradeKey = galeLookup
      ? (recentTradeGaleLevels.has(tradeKeyPut) ? tradeKeyPut : tradeKeyCall)
      : tradeKeyPut;
    const resolvedDirection = galeLookup ? (tradeKey.includes(':CALL:') ? 'CALL' : 'PUT') : t.direction;
    const actualGaleLevel = galeLookup?.galeLevel ?? 0;
    const actualSignalId = galeLookup?.signalId ?? `ws_${t.id}`;

    // Clean up old gale tracking entries (>10 minutes)
    const now = Date.now();
    for (const [key, val] of recentTradeGaleLevels.entries()) {
      if (now - val.timestamp > 600000) recentTradeGaleLevels.delete(key);
    }
    if (galeLookup) recentTradeGaleLevels.delete(tradeKey);
    persistGaleLevels();

    // Cancel matching pendingClosure (immutable pattern)
    if (balanceState.pendingClosure !== null) {
      const assetIdx = balanceState.pendingClosure.assets.indexOf(t.asset);
      if (assetIdx >= 0) {
        if (balanceState.pendingClosure.numClosed <= 1) {
          balanceState.pendingClosure = null;
          balanceState.prevBalance = state.bridge.getBalance();
        } else {
          balanceState.pendingClosure = {
            numClosed: balanceState.pendingClosure.numClosed - 1,
            balanceBefore: balanceState.pendingClosure.balanceBefore,
            assets: balanceState.pendingClosure.assets.filter((_, i) => i !== assetIdx),
            amounts: balanceState.pendingClosure.amounts.filter((_, i) => i !== assetIdx),
            directions: balanceState.pendingClosure.directions.filter((_, i) => i !== assetIdx),
            cyclesWaited: balanceState.pendingClosure.cyclesWaited,
          };
        }
      }
    }

    const resultExecution: TradeExecution = {
      id: generateExecutionId(),
      signalId: actualSignalId,
      asset: t.asset,
      direction: resolvedDirection as 'CALL' | 'PUT',
      amount: t.amount,
      galeLevel: actualGaleLevel,
      mode: settings?.executionMode === 'auto' ? 'auto'
        : settings?.executionMode === 'semi-auto' ? 'semi' : 'manual',
      strategy: settings?.strategy || 'masaniello',
      executedAt: new Date().toISOString(),
      result: isWin ? 'win' : 'loss',
      payout: isWin ? t.amount + t.profit : 0,
      netPnl: t.profit,
    };

    const resultChannelSlug = galeLookup?.channelSlug ?? '';
    sendToBackground({ type: 'TRADE_RESULT', execution: resultExecution, channelSlug: resultChannelSlug });
    publishTradeResult(actualSignalId, t.asset, t.direction, isWin ? 'win' : 'loss', t.profit, actualGaleLevel);
    state.overlay.showResult(t.asset, isWin, Math.abs(t.profit));
    handleTradeResult({ win: isWin, amount: t.amount, asset: t.asset, galeLevel: actualGaleLevel });

    // Notify lab-to-trade bridge
    const labAsset = getActiveLabTradeAsset();
    if (labAsset && normalizeAssetForGuard(labAsset) === normalizeAssetForGuard(t.asset)) {
      notifyTradeClose(isWin);
    }

    // Update shadow tracker
    const poSym = t.asset.replace(/[\s/]/g, '').replace(/OTC/i, '_otc');
    shadowUpdateActualResult(poSym, (resultExecution.direction as 'CALL' | 'PUT') || 'CALL', isWin ? 'win' : 'loss', Date.now());

    // AI accuracy feedback
    if (actualSignalId.startsWith('llm_') || actualSignalId.startsWith('auto_')) {
      logAiFeedback(actualSignalId, isWin ? 'win' : 'loss');
      console.log(`[SnapTrade] AI feedback sent: ${actualSignalId} → ${isWin ? 'win' : 'loss'}`);
    }

    console.log('[SnapTrade] TRADE_RESULT sent:', t.asset, isWin ? 'WIN' : 'LOSS',
      'amount=$' + t.amount.toFixed(2), 'profit=$' + t.profit.toFixed(2),
      'gale=' + actualGaleLevel, 'signalId=' + actualSignalId);
  }
}
