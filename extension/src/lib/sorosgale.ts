import { DEFAULT_PAYOUT_RATE } from './constants';

export interface SorosgaleOpts {
  readonly baseAmount: number;
  readonly payoutRate?: number;
  readonly sorosMaxLevels?: number;
  readonly galeMaxLevels?: number;
  readonly galeMultiplier?: number;
}

export interface SorosgaleSnapshot {
  readonly baseAmount: number;
  readonly payoutRate: number;
  readonly sorosMaxLevels: number;
  readonly galeMaxLevels: number;
  readonly galeMultiplier: number;
  // Soros state
  readonly sorosLevel: number;
  readonly currentBet: number;
  // Gale state (active when recovering from a loss)
  readonly isRecovering: boolean;
  readonly galeLevel: number;
  readonly totalLost: number;        // accumulated loss to recover
  readonly recoveryBaseAmount: number; // base for gale calculation
}

export interface SorosgaleState {
  readonly sorosLevel: number;
  readonly currentBet: number;
  readonly isRecovering: boolean;
  readonly galeLevel: number;
  readonly totalLost: number;
  readonly recoveryBaseAmount: number;
}

export function sorosgaleCreate(opts: SorosgaleOpts): SorosgaleSnapshot {
  return {
    baseAmount: opts.baseAmount,
    payoutRate: opts.payoutRate ?? DEFAULT_PAYOUT_RATE,
    sorosMaxLevels: opts.sorosMaxLevels ?? 3,
    galeMaxLevels: opts.galeMaxLevels ?? 2,
    galeMultiplier: opts.galeMultiplier ?? 2.0,
    sorosLevel: 0,
    currentBet: opts.baseAmount,
    isRecovering: false,
    galeLevel: 0,
    totalLost: 0,
    recoveryBaseAmount: opts.baseAmount,
  };
}

export function sorosgaleRestore(opts: SorosgaleOpts, state: SorosgaleState): SorosgaleSnapshot {
  return {
    baseAmount: opts.baseAmount,
    payoutRate: opts.payoutRate ?? DEFAULT_PAYOUT_RATE,
    sorosMaxLevels: opts.sorosMaxLevels ?? 3,
    galeMaxLevels: opts.galeMaxLevels ?? 2,
    galeMultiplier: opts.galeMultiplier ?? 2.0,
    sorosLevel: state.sorosLevel,
    currentBet: state.currentBet,
    isRecovering: state.isRecovering,
    galeLevel: state.galeLevel,
    totalLost: state.totalLost,
    recoveryBaseAmount: state.recoveryBaseAmount,
  };
}

export function sorosgaleGetStake(snapshot: SorosgaleSnapshot): number {
  return Math.round(snapshot.currentBet * 100) / 100;
}

export function sorosgaleRecordTrade(
  snapshot: SorosgaleSnapshot,
  isWin: boolean,
): SorosgaleSnapshot {
  if (snapshot.isRecovering) {
    return handleRecoveryResult(snapshot, isWin);
  }
  return handleSorosResult(snapshot, isWin);
}

function handleSorosResult(s: SorosgaleSnapshot, isWin: boolean): SorosgaleSnapshot {
  if (isWin) {
    const newLevel = s.sorosLevel + 1;
    if (newLevel >= s.sorosMaxLevels) {
      // Max soros reached — collect profit, reset to base
      return { ...s, sorosLevel: 0, currentBet: s.baseAmount };
    }
    // Advance soros: reinvest entry + profit
    const profit = s.currentBet * s.payoutRate;
    return {
      ...s,
      sorosLevel: newLevel,
      currentBet: s.currentBet + profit,
    };
  }

  // LOSS during Soros — enter recovery mode
  const lostAmount = s.currentBet;
  // Recovery bet: amount that, if won at payoutRate, covers the loss
  const recoveryBet = Math.ceil((lostAmount / s.payoutRate) * 100) / 100;

  return {
    ...s,
    sorosLevel: 0,
    isRecovering: true,
    galeLevel: 1,
    totalLost: lostAmount,
    recoveryBaseAmount: lostAmount,
    currentBet: recoveryBet,
  };
}

function handleRecoveryResult(s: SorosgaleSnapshot, isWin: boolean): SorosgaleSnapshot {
  if (isWin) {
    // Recovery successful — back to Soros level 0
    return {
      ...s,
      sorosLevel: 0,
      currentBet: s.baseAmount,
      isRecovering: false,
      galeLevel: 0,
      totalLost: 0,
      recoveryBaseAmount: s.baseAmount,
    };
  }

  // LOSS during recovery — escalate gale
  const newGaleLevel = s.galeLevel + 1;
  const newTotalLost = s.totalLost + s.currentBet;

  if (newGaleLevel > s.galeMaxLevels) {
    // Max gale reached — accept the loss, reset everything
    return {
      ...s,
      sorosLevel: 0,
      currentBet: s.baseAmount,
      isRecovering: false,
      galeLevel: 0,
      totalLost: 0,
      recoveryBaseAmount: s.baseAmount,
    };
  }

  // Next recovery bet: cover ALL accumulated losses
  const recoveryBet = Math.ceil((newTotalLost / s.payoutRate) * 100) / 100;

  return {
    ...s,
    galeLevel: newGaleLevel,
    totalLost: newTotalLost,
    currentBet: recoveryBet,
  };
}

export function sorosgaleResetDay(snapshot: SorosgaleSnapshot): SorosgaleSnapshot {
  return {
    ...snapshot,
    sorosLevel: 0,
    currentBet: snapshot.baseAmount,
    isRecovering: false,
    galeLevel: 0,
    totalLost: 0,
    recoveryBaseAmount: snapshot.baseAmount,
  };
}

export function sorosgaleGetState(snapshot: SorosgaleSnapshot): SorosgaleState {
  return {
    sorosLevel: snapshot.sorosLevel,
    currentBet: snapshot.currentBet,
    isRecovering: snapshot.isRecovering,
    galeLevel: snapshot.galeLevel,
    totalLost: snapshot.totalLost,
    recoveryBaseAmount: snapshot.recoveryBaseAmount,
  };
}
