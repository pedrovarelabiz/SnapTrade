import { DEFAULT_PAYOUT_RATE } from './constants';

export interface TradePnlResult {
  invested: number;
  returned: number;
  netPnl: number;
}

export function calculateTradePnl(
  amount: number,
  isWin: boolean,
  payoutRate: number = DEFAULT_PAYOUT_RATE,
): TradePnlResult {
  const invested = amount;

  if (isWin) {
    const returned = amount + amount * payoutRate;
    const netPnl = amount * payoutRate;
    return {
      invested: Math.round(invested * 100) / 100,
      returned: Math.round(returned * 100) / 100,
      netPnl: Math.round(netPnl * 100) / 100,
    };
  }

  return {
    invested: Math.round(invested * 100) / 100,
    returned: 0,
    netPnl: Math.round(-invested * 100) / 100,
  };
}

export function formatPnl(pnl: number): string {
  const abs = Math.abs(pnl).toFixed(2);
  return pnl >= 0 ? `+$${abs}` : `-$${abs}`;
}

export function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
