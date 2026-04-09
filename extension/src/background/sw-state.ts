/**
 * Service worker shared state, initialization, and calculators.
 * All other sw-* modules import state from here to avoid circular deps.
 */

import type {
  ExtensionSettings, DailyState, Signal, ExtensionMessage, ExtensionStatus,
} from '../types';
import type { MasanielloSnapshot } from '../lib/masaniello';
import type { SorosSnapshot } from '../lib/soros';
import type { SorosgaleSnapshot } from '../lib/sorosgale';
import {
  DEFAULT_SETTINGS, API_BASE, DEFAULT_PAYOUT_RATE, EXTENSION_VERSION,
  POLL_INTERVAL_MS, POLL_BACKOFF_MAX_MS,
  MAX_SEEN_SIGNAL_IDS, MAX_EXECUTED_SIGNAL_IDS,
  DEFAULT_MASANIELLO_PARAMS,
} from '../lib/constants';
import {
  getSettings, getDailyState,
} from '../lib/storage';
import {
  masanielloCreate, masanielloRestore, masanielloGetStake,
  masanielloGetState,
} from '../lib/masaniello';
import {
  sorosCreate, sorosRestore, sorosGetStake, sorosGetState,
} from '../lib/soros';
import {
  sorosgaleCreate, sorosgaleRestore, sorosgaleGetStake, sorosgaleGetState,
} from '../lib/sorosgale';

// === Cooldown & regime constants ===
export const SYMBOL_COOLDOWN_MS = 120_000;
export const SYMBOL_LOSS_COOLDOWN_MS = 300_000;
export const OPEN_TRADE_MAX_AGE_MS = 600_000;
export const REGIME_WINDOW_SIZE = 10;
export const REGIME_MIN_WIN_RATE = 0.40;
export const REGIME_PAUSE_MS = 900_000;

// === State variables ===
export let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
export let dailyState: DailyState | null = null;
export let masaniello: MasanielloSnapshot | null = null;
export const masanielloStates: Record<string, MasanielloSnapshot> = {};
export let soros: SorosSnapshot | null = null;
export let sorosgale: SorosgaleSnapshot | null = null;
export let isConnected = false;
export let pollingActive = false;
export let pollingTimer: ReturnType<typeof setTimeout> | null = null;
export let pollFailures = 0;
export let contentScriptReady = false;
export const pendingSignals = new Map<string, Signal>();
export let openTrades: Array<{id:string;asset:string;direction:string;amount:number;openTime:number;closeTime:number;source?:string}> = [];
export let accountInfo: {isDemo:boolean;balance:number} = {isDemo:true,balance:0};
export let swTradeLogCounter = 0;
export const seenSignalIds = new Set<string>();
export const executedSignalIds = new Set<string>();
export const pendingTradeMap = new Map<string, string>();
export const tradeChannelMap = new Map<string, string>();
export const symbolCooldowns = new Map<string, number>();
export const symbolLossCooldowns = new Map<string, number>();
export const recentResults: Array<{ win: boolean; ts: number }> = [];
export let regimePauseUntil = 0;
export let updateAvailable: { version: string; url: string; changelog: string } | null = null;
export let listenersSetUp = false;

// === State setters (avoid direct mutation of `let` exports) ===
export function setSettings(v: ExtensionSettings): void { settings = v; }
export function setDailyState(v: DailyState | null): void { dailyState = v; }
export function setMasaniello(v: MasanielloSnapshot | null): void { masaniello = v; }
export function setSoros(v: SorosSnapshot | null): void { soros = v; }
export function setSorosgale(v: SorosgaleSnapshot | null): void { sorosgale = v; }
export function setIsConnected(v: boolean): void { isConnected = v; }
export function setPollingActive(v: boolean): void { pollingActive = v; }
export function setPollingTimer(v: ReturnType<typeof setTimeout> | null): void { pollingTimer = v; }
export function setPollFailures(v: number): void { pollFailures = v; }
export function setContentScriptReady(v: boolean): void { contentScriptReady = v; }
export function setOpenTrades(v: typeof openTrades): void { openTrades = v; }
export function setAccountInfo(v: typeof accountInfo): void { accountInfo = v; }
export function setSwTradeLogCounter(v: number): void { swTradeLogCounter = v; }
export function setRegimePauseUntil(v: number): void { regimePauseUntil = v; }
export function setUpdateAvailable(v: typeof updateAvailable): void { updateAvailable = v; }
export function setListenersSetUp(v: boolean): void { listenersSetUp = v; }

// === Mutex for serializing state-mutating operations ===
let stateLock: Promise<void> = Promise.resolve();
export function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = stateLock;
  let resolve: () => void;
  stateLock = new Promise<void>(r => { resolve = r; });
  return prev.then(fn).finally(() => resolve!());
}

// === Calculators ===
export function calcBaseStake(): number {
  if (settings.riskPercent > 0 && accountInfo.balance > 0) {
    const base = (accountInfo.balance * settings.riskPercent) / 100;
    return Math.round(Math.max(settings.minStake ?? 1, Math.min(settings.maxStake ?? 50, base)) * 100) / 100;
  }
  return settings.defaultAmount;
}

export function initCalculators(): void {
  const base = calcBaseStake();
  const masOpts = {
    baseAmount: base, payoutRate: DEFAULT_PAYOUT_RATE,
    tradesPerDay: settings.masanielloTotalTrades,
    expectedWins: settings.masanielloExpectedWins,
    maxBet: base * settings.masanielloMaxBetMultiplier,
  };
  const sorosOpts = {
    baseAmount: base, payoutRate: DEFAULT_PAYOUT_RATE,
    maxLevels: settings.sorosMaxLevels,
  };
  const sgOpts = {
    baseAmount: base, payoutRate: DEFAULT_PAYOUT_RATE,
    sorosMaxLevels: settings.sorosMaxLevels,
    galeMaxLevels: settings.simpleMaxGale,
    galeMultiplier: settings.simpleMultiplier,
  };

  masaniello = dailyState?.masanielloState
    ? masanielloRestore(masOpts, dailyState.masanielloState)
    : masanielloCreate(masOpts);

  soros = dailyState?.sorosState
    ? sorosRestore(sorosOpts, dailyState.sorosState)
    : sorosCreate(sorosOpts);

  sorosgale = dailyState?.sorosgaleState
    ? sorosgaleRestore(sgOpts, dailyState.sorosgaleState)
    : sorosgaleCreate(sgOpts);
}

export function resyncCalculators(): void {
  const base = calcBaseStake();
  const masOpts = {
    baseAmount: base, payoutRate: DEFAULT_PAYOUT_RATE,
    tradesPerDay: settings.masanielloTotalTrades,
    expectedWins: settings.masanielloExpectedWins,
    maxBet: base * settings.masanielloMaxBetMultiplier,
  };
  const sorosOpts = {
    baseAmount: base, payoutRate: DEFAULT_PAYOUT_RATE,
    maxLevels: settings.sorosMaxLevels,
  };

  // Restore per-channel Masaniello states
  if (dailyState?.masanielloChannelStates) {
    for (const [slug, chState] of Object.entries(dailyState.masanielloChannelStates)) {
      const params = DEFAULT_MASANIELLO_PARAMS[slug] ?? { tpd: settings.masanielloTotalTrades, ew: settings.masanielloExpectedWins };
      masanielloStates[slug] = masanielloRestore({
        baseAmount: base, tradesPerDay: params.tpd, expectedWins: params.ew,
        maxBet: base * settings.masanielloMaxBetMultiplier,
      }, chState);
    }
  }

  masaniello = dailyState?.masanielloState
    ? masanielloRestore(masOpts, dailyState.masanielloState)
    : masanielloCreate(masOpts);

  soros = dailyState?.sorosState
    ? sorosRestore(sorosOpts, dailyState.sorosState)
    : sorosCreate(sorosOpts);

  const sgOpts = {
    baseAmount: base, payoutRate: DEFAULT_PAYOUT_RATE,
    sorosMaxLevels: settings.sorosMaxLevels,
    galeMaxLevels: settings.simpleMaxGale,
    galeMultiplier: settings.simpleMultiplier,
  };
  sorosgale = dailyState?.sorosgaleState
    ? sorosgaleRestore(sgOpts, dailyState.sorosgaleState)
    : sorosgaleCreate(sgOpts);
}

export function pruneIdSets(): void {
  while (seenSignalIds.size > MAX_SEEN_SIGNAL_IDS) {
    const first = seenSignalIds.values().next().value;
    if (first) seenSignalIds.delete(first);
  }
  while (executedSignalIds.size > MAX_EXECUTED_SIGNAL_IDS) {
    const first = executedSignalIds.values().next().value;
    if (first) executedSignalIds.delete(first);
  }
}

export function getNextMidnightUTC(): number {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 1)).getTime();
}

export async function checkForUpdates(): Promise<void> {
  try {
    const resp = await fetch(API_BASE + '/extension/version');
    if (resp.ok) {
      const data = await resp.json();
      if (data.latestVersion && data.latestVersion !== EXTENSION_VERSION) {
        updateAvailable = { version: data.latestVersion, url: data.downloadUrl, changelog: data.changelog };
      } else {
        updateAvailable = null;
      }
    }
  } catch { /* skip */ }
}

export function normalizeAsset(asset: string): string {
  return asset.toLowerCase().replace(/[\s_/]/g, '');
}

export function getChannelStrategy(signal?: Signal | null): { strategy: string; maxGale: number; multiplier: number } {
  const slug = signal?.channel?.slug ?? '';
  const INTERNAL = new Set(['st_indicators', 'ai_analyst']);
  const override = (slug && !INTERNAL.has(slug)) ? settings.channelStrategies?.[slug] : undefined;
  return override ?? {
    strategy: settings.strategy,
    maxGale: settings.simpleMaxGale,
    multiplier: settings.simpleMultiplier,
  };
}

export function getOrCreateChannelMasaniello(slug: string): MasanielloSnapshot {
  if (!masanielloStates[slug]) {
    const params = DEFAULT_MASANIELLO_PARAMS[slug] ?? {
      tpd: settings.masanielloTotalTrades,
      ew: settings.masanielloExpectedWins,
    };
    const base = calcBaseStake();
    const saved = dailyState?.masanielloChannelStates?.[slug];
    masanielloStates[slug] = saved
      ? masanielloRestore({
          baseAmount: base, tradesPerDay: params.tpd, expectedWins: params.ew,
          maxBet: base * settings.masanielloMaxBetMultiplier,
        }, saved)
      : masanielloCreate({
          baseAmount: base, tradesPerDay: params.tpd, expectedWins: params.ew,
          maxBet: base * settings.masanielloMaxBetMultiplier,
        });
  }
  return masanielloStates[slug];
}

export function getTradeAmount(signal?: Signal | null): number {
  const cs = getChannelStrategy(signal);
  const slug = signal?.channel?.slug ?? '';
  switch (cs.strategy) {
    case 'masaniello': {
      const snap = slug ? getOrCreateChannelMasaniello(slug) : masaniello;
      if (snap) {
        const stake = masanielloGetStake(snap);
        console.log(`[SnapTrade] Masaniello stake: $${stake.toFixed(2)} (dayTrades=${snap.dayTrades}/${snap.tradesPerDay} dayWins=${snap.dayWins}/${snap.expectedWins} target=$${snap.targetProfit.toFixed(2)} slug=${slug || 'global'})`);
        return stake;
      }
      return calcBaseStake();
    }
    case 'soros':
      return soros ? sorosGetStake(soros) : calcBaseStake();
    case 'sorosgale':
      return sorosgale ? sorosgaleGetStake(sorosgale) : calcBaseStake();
    default:
      return calcBaseStake();
  }
}

export function checkRiskLimits(): { canTrade: boolean; reason?: string } {
  if (!dailyState) return { canTrade: true };
  if (settings.maxDailyTrades > 0 && dailyState.tradesExecuted >= settings.maxDailyTrades)
    return { canTrade: false, reason: `Max daily trades (${dailyState.tradesExecuted}/${settings.maxDailyTrades})` };
  if (settings.maxConsecutiveLosses > 0 && dailyState.consecutiveLosses >= settings.maxConsecutiveLosses)
    return { canTrade: false, reason: `Max consecutive losses (${dailyState.consecutiveLosses})` };
  const maxLoss = (settings as any).maxDailyLoss ?? 0;
  if (maxLoss > 0 && dailyState.totalPnl < 0 && Math.abs(dailyState.totalPnl) >= maxLoss)
    return { canTrade: false, reason: `Max daily loss ($${Math.abs(dailyState.totalPnl).toFixed(2)} >= $${maxLoss})` };
  if (settings.minBalanceProtection > 0 && accountInfo.balance > 0 &&
      !accountInfo.isDemo && accountInfo.balance < settings.minBalanceProtection) {
    return { canTrade: false, reason: `Balance (${accountInfo.balance.toFixed(2)}) below minimum (${settings.minBalanceProtection})` };
  }
  return { canTrade: true };
}

// === Regime Detection / Circuit Breaker ===
export function checkRegimeCircuitBreaker(): { ok: boolean; reason?: string } {
  if (Date.now() < regimePauseUntil) {
    const secsLeft = Math.round((regimePauseUntil - Date.now()) / 1000);
    return { ok: false, reason: `Regime pause (${secsLeft}s left)` };
  }
  if (recentResults.length < REGIME_WINDOW_SIZE) return { ok: true };
  const recentWindow = recentResults.slice(-REGIME_WINDOW_SIZE);
  const wins = recentWindow.filter(r => r.win).length;
  const winRate = wins / recentWindow.length;
  if (winRate < REGIME_MIN_WIN_RATE) {
    return { ok: false, reason: `Rolling win rate ${(winRate * 100).toFixed(0)}% < ${(REGIME_MIN_WIN_RATE * 100).toFixed(0)}% (${wins}/${recentWindow.length})` };
  }
  return { ok: true };
}

// === Messaging ===
export function broadcastToAll(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {});
  chrome.tabs.query({ url: ['*://pocketoption.com/*', '*://po.trade/*', '*://*.pocketoption.com/*'] }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  });
}

export function broadcastStatus(): void {
  broadcastToAll({ type: 'STATUS_UPDATE', status: getStatus() });
}

export function getStatus(): ExtensionStatus {
  const emptyDay: DailyState = {
    date: new Date().toISOString().slice(0, 10), tradesExecuted: 0,
    winsCount: 0, lossesCount: 0, consecutiveLosses: 0, totalPnl: 0,
    trades: [], masanielloState: null, masanielloChannelStates: null, sorosState: null, sorosgaleState: null, isPaused: false, pauseReason: null,
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
