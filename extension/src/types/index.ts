export interface ChannelStrategy {
  strategy: 'masaniello' | 'simple' | 'off';
  maxGale: number;
  multiplier: number;
}

export interface IndicatorValidationConfig {
  enabled: boolean;
  validateSignals: boolean;
  minConfidence: number;
  noSetupAction: 'allow' | 'block';
  autoTradeEnabled: boolean;
  autoTradeMinConfidence: number;
  autoTradeExpirationMinutes: number;
  autoTradePairs: string[];
  enabledSetups: ('rsi_reversal' | 'macd_cross' | 'candle_pattern' | 'ma_trend' | 'bb_squeeze' | 'trend_confirm')[];
  indicators: IndicatorSettingItem[];
  showOverlay: boolean;
  monitoredPairs: string[];
  llmAnalyst: {
    enabled: boolean;
    minConfidence: number;
    autoExecute: boolean;
  } | null;
}

export interface IndicatorSettingItem {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, number>;
  color: string;
  secondaryColor?: string;
  tertiaryColor?: string;
}

export interface ExtensionSettings {
  extensionToken: string | null;
  isAuthenticated: boolean;
  userEmail: string | null;
  userRole: 'admin' | 'premium' | 'free' | null;
  subscriptionStatus: string | null;
  isEnabled: boolean;
  executionMode: 'manual' | 'semi-auto' | 'auto';
  acceptScheduled: boolean;
  acceptInstant: boolean;
  defaultAmount: number;
  instantDelay: number;
  strategy: 'off' | 'masaniello' | 'soros' | 'sorosgale' | 'simple';
  masanielloTotalTrades: number;
  masanielloExpectedWins: number;
  masanielloMaxBetMultiplier: number;
  sorosMaxLevels: number;
  simpleMaxGale: number;
  simpleMultiplier: number;
  autoExecuteGale: boolean;
  galeMode: 'per-asset' | 'per-signal';
  maxDailyTrades: number;
  maxConsecutiveLosses: number;
  maxDailyLoss: number;
  minBalanceProtection: number;
  minPayoutPercent: number;
  maxSingleTradeAmount: number;
  soundAlerts: boolean;
  browserNotifications: boolean;
  showOverlay: boolean;
  enabledPairs: string[];
  enabledChannels: string[];
  blockedHours: number[];
  tradingMode: 'demo' | 'real';
  channelStrategies: Record<string, ChannelStrategy>;
  riskPercent: number;
  minStake: number;
  maxStake: number;
  indicatorValidation: IndicatorValidationConfig | null;
}

export interface Signal {
  id: string;
  asset: string;
  direction: 'CALL' | 'PUT';
  signalType: 'scheduled' | 'instant';
  entryTime: string | null;
  entryTimestamp: string | null;
  timeframe: string;
  expirationMinutes: number;
  martingaleSchedule: { level: number; time: string }[] | null;
  status: 'pending' | 'active' | 'resolved';
  visibility: 'free' | 'premium';
  resultType: string | null;
  resultGaleLevel: number | null;
  isWin: boolean | null;
  channel: { name: string; slug: string } | null;
  createdAt: string;
  confidence?: number; // AI or local confidence score (0-100)
}

export interface TradeExecution {
  id: string;
  signalId: string;
  asset: string;
  direction: 'CALL' | 'PUT';
  amount: number;
  galeLevel: number;
  mode: 'auto' | 'semi' | 'manual';
  strategy: string;
  executedAt: string;
  result: 'win' | 'loss' | 'pending' | null;
  payout: number | null;
  netPnl: number | null;
}

export interface DailyState {
  date: string;
  tradesExecuted: number;
  winsCount: number;
  lossesCount: number;
  consecutiveLosses: number;
  totalPnl: number;
  trades: TradeExecution[];
  masanielloState: MasanielloState | null;
  masanielloChannelStates: Record<string, MasanielloState> | null;
  sorosState: SorosState | null;
  sorosgaleState: SorosgaleState | null;
  isPaused: boolean;
  pauseReason: string | null;
}

export interface MasanielloState {
  dayTrades: number;
  dayWins: number;
  targetProfit: number;
}

export interface SorosState {
  currentBet: number;
  winStreak: number;
}

export interface SorosgaleState {
  sorosLevel: number;
  currentBet: number;
  isRecovering: boolean;
  galeLevel: number;
  totalLost: number;
  recoveryBaseAmount: number;
}

export type ExtensionMessage =
  | { type: 'SIGNAL_NEW'; signal: Signal }
  | { type: 'SIGNAL_ACTIVE'; signalId: string }
  | { type: 'SIGNAL_RESULT'; signal: Signal }
  | { type: 'EXECUTE_TRADE'; signal: Signal; amount: number; galeLevel: number }
  | { type: 'TRADE_EXECUTED'; execution: TradeExecution }
  | { type: 'TRADE_RESULT'; execution: TradeExecution; channelSlug?: string }
  | { type: 'SKIP_SIGNAL'; signalId: string }
  | { type: 'GET_STATUS' }
  | { type: 'STATUS_UPDATE'; status: ExtensionStatus }
  | { type: 'SETTINGS_UPDATED'; settings: Partial<ExtensionSettings> }
  | { type: 'PAUSE_TRADING'; reason: string }
  | { type: 'RESUME_TRADING' }
  | { type: 'PO_READY'; ready: boolean }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'CONFIRM_TRADE'; signalId: string }
  | { type: 'CANCEL_TRADE'; signalId: string }
  | { type: 'GET_LOGS' }
  | { type: 'PING' }
  | { type: 'OPEN_FLOATING' }
  | { type: 'UPDATE_TRADES'; trades: any[] }
  | { type: 'UPDATE_ACCOUNT'; accountInfo: {isDemo:boolean;balance:number} }
  | { type: 'WS_DISCONNECTED' }
  | { type: 'TEST_SENTRY' }
  | { type: 'RELAY_PUBLISH'; payload: any; token: string }
  | { type: 'GET_TRADE_LOG' };

export interface ExtensionStatus {
  isConnected: boolean;
  isPocketOptionOpen: boolean;
  isPocketOptionReady: boolean;
  isEnabled: boolean;
  isPaused: boolean;
  pauseReason: string | null;
  dailyState: DailyState;
  pendingSignals: Signal[];
  lastSignalAt: string | null;
  openTrades?: Array<{id:string;asset:string;direction:string;amount:number;openTime:number;closeTime:number;profit?:number;source?:string}>;
  accountInfo?: {isDemo:boolean;balance:number};
  executionMode?: string;
  updateAvailable: { version: string; url: string; changelog: string } | null;
  extensionVersion: string;
}
