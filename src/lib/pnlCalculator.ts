import { PnlBreakdown, TradeExecution, ResultType } from '@/types';

export interface PnlInput {
  resultType: ResultType;
  resultGaleLevel: number;
  baseAmount: number;
  martingaleStrategy: 'off' | 'simple' | 'dynamic';
  fixedMultiplier?: number;
  payoutRate?: number;
}

function getGaleAmount(
  level: number,
  baseAmount: number,
  strategy: PnlInput['martingaleStrategy'],
  fixedMultiplier: number
): number {
  if (level === 0) return baseAmount;
  if (strategy === 'off') return 0;
  if (strategy === 'simple') {
    let amount = baseAmount;
    for (let i = 0; i < level; i++) {
      amount = Math.round(amount * fixedMultiplier * 100) / 100;
    }
    return amount;
  }
  // dynamic: x2 each level
  return baseAmount * Math.pow(2, level);
}

export function calculatePnl(input: PnlInput): PnlBreakdown {
  const {
    resultType, resultGaleLevel, baseAmount,
    martingaleStrategy, fixedMultiplier = 2.0, payoutRate = 0.88,
  } = input;

  const tradesExecuted: TradeExecution[] = [];

  if (resultType === 'direct_victory') {
    tradesExecuted.push({ level: 0, amount: baseAmount, result: 'win' });
  } else if (resultType === 'victory_at_gale') {
    for (let i = 0; i <= resultGaleLevel; i++) {
      const amount = getGaleAmount(i, baseAmount, martingaleStrategy, fixedMultiplier);
      if (amount === 0) continue;
      tradesExecuted.push({
        level: i, amount,
        result: i === resultGaleLevel ? 'win' : 'loss',
      });
    }
  } else {
    for (let i = 0; i <= resultGaleLevel; i++) {
      const amount = getGaleAmount(i, baseAmount, martingaleStrategy, fixedMultiplier);
      if (amount === 0) continue;
      tradesExecuted.push({ level: i, amount, result: 'loss' });
    }
  }

  const totalInvested = tradesExecuted.reduce((sum, t) => sum + t.amount, 0);
  const winningTrade = tradesExecuted.find(t => t.result === 'win');
  const totalReturn = winningTrade
    ? Math.round(winningTrade.amount * (1 + payoutRate) * 100) / 100
    : 0;
  const netPnl = Math.round((totalReturn - totalInvested) * 100) / 100;

  return {
    baseAmount,
    tradesExecuted,
    totalInvested: Math.round(totalInvested * 100) / 100,
    totalReturn,
    netPnl,
    payoutRate,
  };
}

export function quickPnl(
  resultType: ResultType, resultGaleLevel: number,
  baseAmount: number, payoutRate: number = 0.88
): number {
  return calculatePnl({
    resultType, resultGaleLevel, baseAmount,
    martingaleStrategy: 'dynamic', payoutRate,
  }).netPnl;
}

export function formatPnl(pnl: number): string {
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}$${Math.abs(pnl).toFixed(2)}`;
}

export function getResultLabel(resultType: ResultType, galeLevel: number): string {
  if (resultType === 'direct_victory') return 'Direct Win';
  if (resultType === 'victory_at_gale') return `Win @ Gale ${galeLevel}`;
  return galeLevel > 0 ? `Loss (Gale ${galeLevel})` : 'Loss';
}