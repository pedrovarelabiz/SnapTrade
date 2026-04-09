/**
 * Relay Protocol Types — Server/Client Extension Communication
 *
 * Transport: WebSocket (JSON messages)
 * Connection: wss://snaptrade.faroldigital.pt/ws/signals?token=st_ext_xxx
 */

// ─── Server → Client Messages ───────────────────────────────────────────────

export interface RelaySignalRaw {
  readonly type: "SIGNAL_RAW";
  readonly symbol: string;
  readonly direction: "BUY" | "SELL";
  readonly confidence: number;
  readonly setups: readonly string[];
  readonly indicators: RelayIndicatorSnapshot;
  readonly m5Trend: string;
  readonly timestamp: number;
}

export interface RelaySignalApproved {
  readonly type: "SIGNAL_APPROVED";
  readonly signalId: string;
  readonly symbol: string;
  readonly direction: "BUY" | "SELL";
  readonly confidence: number;
  readonly aiConfidence: number;
  readonly reasoning: string;
  readonly stake: number;
  readonly expiration: number;
  readonly timestamp: number;
  readonly validUntil: number;
}

export interface RelayTradeExec {
  readonly type: "TRADE_EXEC";
  readonly signalId: string;
  readonly symbol: string;
  readonly direction: "BUY" | "SELL";
  readonly amount: number;
  readonly expiration: number;
  readonly executeOn: "primary" | "all" | "none";
  readonly timestamp: number;
}

export interface RelayTradeResult {
  readonly type: "TRADE_RESULT";
  readonly signalId: string;
  readonly symbol: string;
  readonly direction: string;
  readonly result: "win" | "loss";
  readonly pnl: number;
  readonly galeLevel: number;
  readonly timestamp: number;
}

export interface RelayIndicatorSnapshot {
  readonly rsi?: number;
  readonly macdLine?: number;
  readonly signalLine?: number;
  readonly macdHistogram?: number;
  readonly histogramRising?: boolean;
  readonly sma20?: number;
  readonly sma80?: number;
  readonly alligatorState?: string;
  readonly m5Trend?: string;
  readonly volatilityRatio?: number;
  readonly price?: number;
}

export interface RelayPairSnapshot {
  readonly type: "INDICATOR_SNAPSHOT";
  readonly symbol: string;
  readonly indicators: RelayIndicatorSnapshot;
  readonly timestamp: number;
}

export interface RelayPairSummaries {
  readonly type: "PAIR_SUMMARIES";
  readonly summaries: readonly RelayPairSummary[];
  readonly timestamp: number;
}

export interface RelayPairSummary {
  readonly symbol: string;
  readonly direction: "BUY" | "SELL" | "NONE";
  readonly confidence: number;
  readonly canTrade: boolean;
  readonly setups: readonly string[];
}

export interface RelayShadowStats {
  readonly type: "SHADOW_STATS";
  readonly immM1WR: number;
  readonly immM5WR: number;
  readonly delayM1WR: number;
  readonly delayM5WR: number;
  readonly totalSignals: number;
  readonly timestamp: number;
}

export interface RelayStateSync {
  readonly type: "STATE_SYNC";
  readonly dailyState: {
    readonly tradesExecuted: number;
    readonly winsCount: number;
    readonly lossesCount: number;
    readonly totalPnl: number;
  };
  readonly masanielloState: {
    readonly dayTrades: number;
    readonly dayWins: number;
    readonly currentStake: number;
  } | null;
  readonly circuitBreaker: {
    readonly active: boolean;
    readonly rollingWR: number;
  };
  readonly isPaused: boolean;
  readonly recentSignals: readonly RelaySignalApproved[];
  readonly recentResults: readonly RelayTradeResult[];
  readonly activePairs: readonly string[];
  readonly timestamp: number;
}

export interface RelayDeviceStatus {
  readonly type: "DEVICE_STATUS";
  readonly isPrimary: boolean;
  readonly otherDevices: readonly {
    readonly id: string;
    readonly lastSeen: number;
  }[];
}

export interface RelayHeartbeat {
  readonly type: "HEARTBEAT";
  readonly ts: number;
  readonly connectedClients: number;
}

export interface RelayTierLimit {
  readonly type: "TIER_LIMIT";
  readonly reason: string;
  readonly tradesUsed: number;
  readonly tradesMax: number;
}

export interface RelayError {
  readonly type: "ERROR";
  readonly code: string;
  readonly message: string;
}

export type ServerToClientMessage =
  | RelaySignalRaw
  | RelaySignalApproved
  | RelayTradeExec
  | RelayTradeResult
  | RelayPairSnapshot
  | RelayPairSummaries
  | RelayShadowStats
  | RelayStateSync
  | RelayDeviceStatus
  | RelayHeartbeat
  | RelayTierLimit
  | RelayError;

// ─── Client → Server Messages ───────────────────────────────────────────────

export interface ClientAuth {
  readonly type: "AUTH";
  readonly token: string;
  readonly poUserId?: number;
  readonly machineId: string;
}

export interface ClientTradeClaim {
  readonly type: "TRADE_CLAIM";
  readonly signalId: string;
  readonly machineId: string;
}

export interface ClientTradeConfirmed {
  readonly type: "TRADE_CONFIRMED";
  readonly signalId: string;
  readonly success: boolean;
  readonly error?: string;
}

export interface ClientTradeResultLocal {
  readonly type: "TRADE_RESULT_LOCAL";
  readonly signalId: string;
  readonly result: "win" | "loss";
  readonly pnl: number;
}

export interface ClientHeartbeat {
  readonly type: "HEARTBEAT";
  readonly ts: number;
}

export interface ClientPreferences {
  readonly type: "PREFERENCES";
  readonly pairs?: readonly string[];
  readonly minConfidence?: number;
  readonly notifications?: boolean;
}

export interface ClientManualTradeRequest {
  readonly type: "MANUAL_TRADE_REQUEST";
  readonly signalId: string;
  readonly symbol: string;
  readonly direction: "BUY" | "SELL";
}

export type ClientToServerMessage =
  | ClientAuth
  | ClientTradeClaim
  | ClientTradeConfirmed
  | ClientTradeResultLocal
  | ClientHeartbeat
  | ClientPreferences
  | ClientManualTradeRequest;

// ─── Relay Internal Types ───────────────────────────────────────────────────

export interface RelayClient {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly role: string;
  readonly machineId: string;
  readonly poUserId?: number;
  readonly isPrimary: boolean;
  readonly connectedAt: number;
  lastHeartbeat: number;
  lastMessageAt: number;
  readonly preferences: {
    pairs?: readonly string[];
    minConfidence?: number;
    notifications?: boolean;
  };
  // ws instance stored separately in relay module
}

export interface RelayPublishPayload {
  readonly message: ServerToClientMessage;
  readonly filter?: {
    readonly tier?: "demo" | "basic" | "pro" | "custom";
    readonly userId?: string;
  };
}

export interface RelayStatus {
  readonly connectedClients: number;
  readonly clientsByRole: Record<string, number>;
  readonly uptimeSeconds: number;
  readonly messagesPublished: number;
  readonly startedAt: number;
}
