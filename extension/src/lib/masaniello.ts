import type { MasanielloState } from '../types';
import { DEFAULT_PAYOUT_RATE } from './constants';

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < Math.min(k, n - k); i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

export interface MasanielloOpts {
  readonly baseAmount: number;
  readonly payoutRate?: number;
  readonly tradesPerDay?: number;
  readonly expectedWins?: number;
  readonly targetProfitPct?: number;
  readonly maxBet?: number;
}

export interface MasanielloSnapshot {
  readonly baseAmount: number;
  readonly payoutRate: number;
  readonly tradesPerDay: number;
  readonly expectedWins: number;
  readonly targetProfitPct: number;
  readonly maxBet: number;
  readonly dayTrades: number;
  readonly dayWins: number;
  readonly targetProfit: number;
}

function createSnapshot(opts: MasanielloOpts, state?: MasanielloState): MasanielloSnapshot {
  const baseAmount = opts.baseAmount;
  const payoutRate = opts.payoutRate ?? DEFAULT_PAYOUT_RATE;
  const tradesPerDay = opts.tradesPerDay ?? 20;
  const expectedWins = opts.expectedWins ?? 17;
  const targetProfitPct = opts.targetProfitPct ?? 0.5;
  const maxBet = opts.maxBet ?? baseAmount * 5;
  const targetProfit = state?.targetProfit ?? baseAmount * tradesPerDay * targetProfitPct;

  return {
    baseAmount,
    payoutRate,
    tradesPerDay,
    expectedWins,
    targetProfitPct,
    maxBet,
    dayTrades: state?.dayTrades ?? 0,
    dayWins: state?.dayWins ?? 0,
    targetProfit,
  };
}

export function masanielloCreate(opts: MasanielloOpts): MasanielloSnapshot {
  return createSnapshot(opts);
}

export function masanielloRestore(opts: MasanielloOpts, state: MasanielloState): MasanielloSnapshot {
  return createSnapshot(opts, state);
}

export function masanielloResetDay(snapshot: MasanielloSnapshot): MasanielloSnapshot {
  return {
    ...snapshot,
    dayTrades: 0,
    dayWins: 0,
    targetProfit: snapshot.baseAmount * snapshot.tradesPerDay * snapshot.targetProfitPct,
  };
}

export function masanielloGetStake(snapshot: MasanielloSnapshot): number {
  const remaining = snapshot.tradesPerDay - snapshot.dayTrades;
  const needed = snapshot.expectedWins - snapshot.dayWins;

  if (remaining <= 0 || needed <= 0 || needed > remaining) {
    return snapshot.baseAmount;
  }

  const pWin = comb(remaining - 1, needed - 1) / comb(remaining, needed);

  if (pWin <= 0 || !isFinite(pWin)) {
    return snapshot.baseAmount;
  }

  const stake = (snapshot.targetProfit * pWin) / snapshot.payoutRate;
  const clamped = Math.max(snapshot.baseAmount, Math.min(stake, snapshot.maxBet));
  return Math.round(clamped * 100) / 100;
}

export function masanielloRecordTrade(snapshot: MasanielloSnapshot, isWin: boolean): MasanielloSnapshot {
  const dayTrades = snapshot.dayTrades + 1;
  const dayWins = snapshot.dayWins + (isWin ? 1 : 0);
  const targetProfit = isWin
    ? Math.max(0, snapshot.targetProfit - masanielloGetStake(snapshot) * snapshot.payoutRate)
    : snapshot.targetProfit;

  return { ...snapshot, dayTrades, dayWins, targetProfit };
}

export function masanielloGetState(snapshot: MasanielloSnapshot): MasanielloState {
  return {
    dayTrades: snapshot.dayTrades,
    dayWins: snapshot.dayWins,
    targetProfit: snapshot.targetProfit,
  };
}
