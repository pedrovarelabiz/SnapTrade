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
  strategy: 'off' | 'masaniello' | 'soros' | 'simple';
  masanielloTotalTrades: number;
  masanielloExpectedWins: number;
  masanielloMaxBetMultiplier: number;
  sorosMaxLevels: number;
  simpleMaxGale: number;
  simpleMultiplier: number;
  autoExecuteGale: boolean;
  maxDailyTrades: number;
  maxConsecutiveLosses: number;
  minBalanceProtection: number;
  maxSingleTradeAmount: number;
  soundAlerts: boolean;
  browserNotifications: boolean;
  showOverlay: boolean;
  enabledPairs: string[];
  tradingMode: 'demo' | 'real';
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
  sorosState: SorosState | null;
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

export type ExtensionMessage =
  | { type: 'SIGNAL_NEW'; signal: Signal }
  | { type: 'SIGNAL_ACTIVE'; signalId: string }
  | { type: 'SIGNAL_RESULT'; signal: Signal }
  | { type: 'EXECUTE_TRADE'; signal: Signal; amount: number; galeLevel: number }
  | { type: 'TRADE_EXECUTED'; execution: TradeExecution }
  | { type: 'TRADE_RESULT'; execution: TradeExecution }
  | { type: 'SKIP_SIGNAL'; signalId: string }
  | { type: 'GET_STATUS' }
  | { type: 'STATUS_UPDATE'; status: ExtensionStatus }
  | { type: 'SETTINGS_UPDATED'; settings: Partial<ExtensionSettings> }
  | { type: 'PAUSE_TRADING'; reason: string }
  | { type: 'RESUME_TRADING' }
  | { type: 'PO_READY'; ready: boolean }
  | { type: 'CONFIRM_TRADE'; signalId: string }
  | { type: 'CANCEL_TRADE'; signalId: string }
  | { type: 'GET_LOGS' }
  | { type: 'PING' }
  | { type: 'OPEN_FLOATING' }
  | { type: 'UPDATE_TRADES'; trades: any[] }
  | { type: 'UPDATE_ACCOUNT'; accountInfo: {isDemo:boolean;balance:number} };

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
  openTrades?: Array<{id:string;asset:string;direction:string;amount:number;openTime:number;closeTime:number;profit?:number}>;
  accountInfo?: {isDemo:boolean;balance:number};
  executionMode?: string;
  updateAvailable: { version: string; url: string; changelog: string } | null;
  extensionVersion: string;
}
