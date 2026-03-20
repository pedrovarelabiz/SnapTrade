import type { DailyState, ExtensionSettings, TradeExecution } from '../types';
import { DEFAULT_SETTINGS, MAX_TRADE_HISTORY } from './constants';

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function createFreshDailyState(): DailyState {
  return {
    date: getTodayDate(),
    tradesExecuted: 0,
    winsCount: 0,
    lossesCount: 0,
    consecutiveLosses: 0,
    totalPnl: 0,
    trades: [],
    masanielloState: null,
    sorosState: null,
    isPaused: false,
    pauseReason: null,
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get('settings');
  const stored = result.settings ?? {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(
  partial: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await chrome.storage.local.set({ settings: updated });
  return updated;
}

// ---------------------------------------------------------------------------
// Daily state
// ---------------------------------------------------------------------------

export async function getDailyState(): Promise<DailyState> {
  const result = await chrome.storage.local.get('dailyState');
  const stored: DailyState | undefined = result.dailyState;

  if (!stored || stored.date !== getTodayDate()) {
    const fresh = createFreshDailyState();
    await chrome.storage.local.set({ dailyState: fresh });
    return fresh;
  }

  return stored;
}

export async function updateDailyState(
  partial: Partial<DailyState>,
): Promise<DailyState> {
  const current = await getDailyState();
  const updated = { ...current, ...partial };
  await chrome.storage.local.set({ dailyState: updated });
  return updated;
}

export async function resetDailyState(): Promise<DailyState> {
  const fresh = createFreshDailyState();
  await chrome.storage.local.set({ dailyState: fresh });
  return fresh;
}

// ---------------------------------------------------------------------------
// Trade history
// ---------------------------------------------------------------------------

export async function getTradeHistory(): Promise<TradeExecution[]> {
  const result = await chrome.storage.local.get('tradeHistory');
  return result.tradeHistory ?? [];
}

export async function addTrade(trade: TradeExecution): Promise<TradeExecution[]> {
  const history = await getTradeHistory();
  const updated = [...history, trade].slice(-MAX_TRADE_HISTORY);
  await chrome.storage.local.set({ tradeHistory: updated });
  return updated;
}

// ---------------------------------------------------------------------------
// Storage change listener — returns unsubscribe function
// ---------------------------------------------------------------------------

export function onStorageChange(
  callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void,
): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string): void => {
    if (areaName === 'local') {
      callback(changes);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
