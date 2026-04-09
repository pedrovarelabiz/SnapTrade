// Read version from manifest.json — single source of truth, no more hardcoded version drift
export const EXTENSION_VERSION = typeof chrome !== 'undefined' && chrome.runtime?.getManifest
  ? chrome.runtime.getManifest().version
  : '3.9.5';

import type { ExtensionSettings } from '../types';

export const API_BASE = 'https://snaptrade.faroldigital.pt/api';

// --- Timing constants ---
export const SIGNAL_STALE_MS = 120_000;       // 2 min — LEGACY, kept for reference
export const STALE_BUFFER_MS = 30_000;        // 30s grace after entry + expiration
export const POLL_INTERVAL_MS = 5_000;        // Signal polling interval
export const POLL_BACKOFF_MAX_MS = 30_000;    // Max backoff on consecutive poll failures
export const WS_TRADE_TIMEOUT_MS = 15_000;    // WS trade response timeout
export const KEEPALIVE_INTERVAL_MIN = 1;      // Chrome alarm keepalive period
export const DAILY_RESET_INTERVAL_MIN = 1440; // 24h for daily reset alarm
export const FLOATING_POLL_INTERVAL_MS = 3_000; // Floating window poll (fallback)
export const CONTENT_POLL_INTERVAL_MS = 2_000;  // Content script DOM poll
export const PO_READY_ANNOUNCE_MS = 15_000;     // Re-announce PO_READY interval
export const TAB_SWITCH_FREEZE_CYCLES = 3;      // Freeze balance detection after tab switch

// --- Limits ---
export const MAX_LOG_ENTRIES = 200;
export const MAX_TRADE_HISTORY = 100;
export const MAX_SEEN_SIGNAL_IDS = 200;
export const MAX_EXECUTED_SIGNAL_IDS = 500;
export const MAX_STATUS_RETRY = 10;           // useStatus max retries
export const API_MAX_RETRIES = 2;             // API fetch retry count

// --- Payout ---
export const DEFAULT_PAYOUT_RATE = 0.88;

// Per-channel Masaniello params (tpd/ew based on historical WR)
export const DEFAULT_MASANIELLO_PARAMS: Record<string, { tpd: number; ew: number }> = {
  private_team:   { tpd: 5,  ew: 3 },   // WR 68.1% × 5  = 3.4
  sinais_mil:     { tpd: 16, ew: 13 },   // WR 82.5% × 16 = 13.2
  blacklist:      { tpd: 16, ew: 11 },   // WR 70.1% × 16 = 11.2
  vip_otc_market: { tpd: 16, ew: 12 },   // WR 78.0% × 16 = 12.5
};

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
  masanielloTotalTrades: 5,
  masanielloExpectedWins: 3,
  masanielloMaxBetMultiplier: 5,
  sorosMaxLevels: 3,
  simpleMaxGale: 0,
  simpleMultiplier: 2.5,
  autoExecuteGale: true,
  galeMode: 'per-signal' as const,  // 'per-asset' = retry same pair, 'per-signal' = next trade any pair (recommended)
  maxDailyTrades: 0,  // 0 = unlimited (protected by maxConsecutiveLosses + minBalanceProtection)
  maxConsecutiveLosses: 5,
  maxDailyLoss: 0,    // 0 = disabled. Stop trading when daily P&L reaches -$X
  minBalanceProtection: 10,
  minPayoutPercent: 70,
  maxSingleTradeAmount: 50,
  soundAlerts: true,
  browserNotifications: true,
  showOverlay: true,
  enabledPairs: [],
  enabledChannels: [],
  blockedHours: [],
  tradingMode: 'demo',
  channelStrategies: {
    tyl_vip:        { strategy: 'simple',     maxGale: 1, multiplier: 1.5 },
    tyl_trading:    { strategy: 'simple',     maxGale: 1, multiplier: 1.5 },
    private_team:   { strategy: 'masaniello', maxGale: 0, multiplier: 2.5 },
    sinais_mil:     { strategy: 'masaniello', maxGale: 0, multiplier: 2.5 },
    blacklist:      { strategy: 'masaniello', maxGale: 0, multiplier: 2.5 },
    vip_otc_market: { strategy: 'masaniello', maxGale: 0, multiplier: 2.5 },
    // st_indicators and ai_analyst intentionally omitted — they inherit the global strategy
  },
  riskPercent: 0,
  minStake: 1.0,
  maxStake: 50.0,
  indicatorValidation: null,
};

export const CHANNEL_COLORS: Record<string, string> = {
  tyl_vip: '#2979ff',
  tyl_trading: '#7c4dff',
  sinais_mil: '#00e676',
  blacklist: '#ff9100',
  cole_carter: '#e040fb',
  private_team: '#00bcd4',
  pocket_vip: '#ff5252',
};

export const STRATEGY_LABELS: Record<string, string> = {
  masaniello: 'Optimal',
  soros: 'Growth',
  simple: 'Recovery',
  off: 'Fixed',
};
