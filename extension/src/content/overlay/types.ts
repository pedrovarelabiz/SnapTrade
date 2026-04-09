export type TradeSource = 'indicators' | 'ai' | 'backend' | 'telegram' | 'manual';

export interface OpenTrade {
  id: string;
  asset: string;
  direction: string;
  amount: number;
  openTime: number;
  closeTime: number;
  profit?: number;
  isWin?: boolean;
  payout?: string;
  timer?: string;
  returnAmount?: string;
  isPositive?: boolean;
  source?: TradeSource;
  galeLevel?: number;
}

export interface TradeResult {
  asset: string;
  direction: string;
  isWin: boolean;
  pnl: number;
  payout: string;
  timestamp: number;
}
