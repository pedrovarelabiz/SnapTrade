import type { SorosState } from '../types';
import { DEFAULT_PAYOUT_RATE } from './constants';

export interface SorosOpts {
  readonly baseAmount: number;
  readonly payoutRate?: number;
  readonly maxLevels?: number;
}

export interface SorosSnapshot {
  readonly baseAmount: number;
  readonly payoutRate: number;
  readonly maxLevels: number;
  readonly currentBet: number;
  readonly winStreak: number;
}

export function sorosCreate(opts: SorosOpts): SorosSnapshot {
  return {
    baseAmount: opts.baseAmount,
    payoutRate: opts.payoutRate ?? DEFAULT_PAYOUT_RATE,
    maxLevels: opts.maxLevels ?? 3,
    currentBet: opts.baseAmount,
    winStreak: 0,
  };
}

export function sorosRestore(opts: SorosOpts, state: SorosState): SorosSnapshot {
  return {
    baseAmount: opts.baseAmount,
    payoutRate: opts.payoutRate ?? DEFAULT_PAYOUT_RATE,
    maxLevels: opts.maxLevels ?? 3,
    currentBet: state.currentBet,
    winStreak: state.winStreak,
  };
}

export function sorosGetStake(snapshot: SorosSnapshot): number {
  return Math.round(snapshot.currentBet * 100) / 100;
}

export function sorosRecordTrade(snapshot: SorosSnapshot, isWin: boolean): SorosSnapshot {
  if (isWin) {
    const newStreak = snapshot.winStreak + 1;
    if (newStreak < snapshot.maxLevels) {
      return {
        ...snapshot,
        currentBet: snapshot.currentBet + snapshot.currentBet * snapshot.payoutRate,
        winStreak: newStreak,
      };
    }
    // Max levels reached — reset
    return { ...snapshot, currentBet: snapshot.baseAmount, winStreak: 0 };
  }

  // Loss — reset
  return { ...snapshot, currentBet: snapshot.baseAmount, winStreak: 0 };
}

export function sorosResetDay(snapshot: SorosSnapshot): SorosSnapshot {
  return { ...snapshot, currentBet: snapshot.baseAmount, winStreak: 0 };
}

export function sorosGetState(snapshot: SorosSnapshot): SorosState {
  return {
    currentBet: snapshot.currentBet,
    winStreak: snapshot.winStreak,
  };
}
