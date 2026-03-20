export const EXTENSION_VERSION = '2.0.2';

import type { ExtensionSettings } from '../types';

export const API_BASE = 'https://snaptrade.faroldigital.pt/api';

// --- Timing constants ---
export const SIGNAL_STALE_MS = 120_000;       // 2 min — signals older than this are skipped
export const POLL_INTERVAL_MS = 5_000;        // Signal polling interval
export const POLL_BACKOFF_MAX_MS = 30_000;    // Max backoff on consecutive poll failures
export const WS_TRADE_TIMEOUT_MS = 15_000;    // WS trade response timeout
export const KEEPALIVE_INTERVAL_MIN = 1;      // Chrome alarm keepalive period
export const DAILY_RESET_INTERVAL_MIN = 1440; // 24h for daily reset alarm
export const FLOATING_POLL_INTERVAL_MS = 3_000; // Floating window poll (fallback)
export const CONTENT_POLL_INTERVAL_MS = 2_000;  // Content script DOM poll
export const PO_READY_ANNOUNCE_MS = 15_000;     // Re-announce PO_READY interval

// --- Limits ---
export const MAX_LOG_ENTRIES = 200;
export const MAX_TRADE_HISTORY = 100;
export const MAX_SEEN_SIGNAL_IDS = 200;
export const MAX_EXECUTED_SIGNAL_IDS = 500;
export const MAX_STATUS_RETRY = 10;           // useStatus max retries
export const API_MAX_RETRIES = 2;             // API fetch retry count

// --- Payout ---
export const DEFAULT_PAYOUT_RATE = 0.88;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  extensionToken: null,
  isAuthenticated: false,
  userEmail: null,
  userRole: null,
  subscriptionStatus: null,
  isEnabled: false,
  executionMode: 'manual',
  acceptScheduled: true,
  acceptInstant: true,
  defaultAmount: 1,
  instantDelay: 3,
  strategy: 'masaniello',
  masanielloTotalTrades: 20,
  masanielloExpectedWins: 17,
  masanielloMaxBetMultiplier: 5,
  sorosMaxLevels: 3,
  simpleMaxGale: 2,
  simpleMultiplier: 2.2,
  autoExecuteGale: false,
  maxDailyTrades: 30,
  maxConsecutiveLosses: 3,
  minBalanceProtection: 10,
  maxSingleTradeAmount: 50,
  soundAlerts: true,
  browserNotifications: true,
  showOverlay: true,
  enabledPairs: [],
  tradingMode: 'demo',
};

export const CHANNEL_COLORS: Record<string, string> = {
  tyl_vip: '#2979ff',
  tyl_trading: '#7c4dff',
  sinais_mil: '#00e676',
  blacklist: '#ff9100',
};

export const STRATEGY_LABELS: Record<string, string> = {
  masaniello: 'Optimal',
  soros: 'Growth',
  simple: 'Recovery',
  off: 'Fixed',
};
