/**
 * Strategy Lab — Type definitions, interfaces, and constants.
 */

import type { SetupType } from '../setup-detector';
import type { Candle } from '../candle-collector';
import type { PriceActionContext } from '../price-action';
import type { ExtraIndicators, SessionType } from '../extra-indicators';
import type { LabIndicatorSet } from '../lab-indicators';

// ─── Types ───

export type EntryTiming =
  | 'immediate'
  | 'next_m1_candle'
  | 'next_m5_candle'
  | 'm5_m1_optimized'    // Signal on M5 close, entry optimized by M1 momentum/RSI/pullback
  | 'm5_gate_m1_signal'  // Evaluates M1 candles but only fires at M5 boundary, resolves next M5
  | 'confirmation_2m1'
  | 'pullback';

export interface StrategyDef {
  readonly id: string;
  readonly name: string;
  readonly entryTiming: EntryTiming;
  readonly requiredSetups: readonly SetupType[];
  readonly minSetupCount: number;
  readonly requireM5Alignment: boolean;
  readonly minConfidence: number;
  // Price action filters
  readonly requireNearSR: boolean;
  readonly requireOrderBlock: boolean;
  readonly requireFVG: boolean;
  readonly requireStructureBreak: boolean;
  // Extra indicator filters (null = don't check)
  readonly requireStochExtreme: boolean;
  readonly requireADXTrend: boolean;    // ADX > 25
  readonly requireADXRange: boolean;    // ADX < 20
  readonly requireEMAAlignment: boolean;
  readonly requireEMACrossover: boolean;
  readonly requireSession: SessionType | null;
  // Regime mode: overrides normal setup check with regime-specific logic
  readonly regimeMode: 'trend' | 'range' | null;
  // Cooldown: minimum ms between entries for same strategy+symbol (prevents state-based spam)
  readonly minIntervalMs: number;
  // Custom evaluator: for strategies using lab-indicators (Williams %R, CCI, etc.)
  // Returns CALL/PUT direction or null (no signal). Bypasses normal setup checks.
  readonly customEval?: (candles: readonly Candle[], extra: ExtraIndicators, pa: PriceActionContext, lab: LabIndicatorSet) => 'CALL' | 'PUT' | null;
}

// ─── Payout Tier System ───

export interface PayoutTier {
  readonly minPayout: number;
  readonly breakEven: number;
  readonly label: string;
}

export const PAYOUT_TIERS: readonly PayoutTier[] = [
  { minPayout: 0.88, breakEven: 0.532, label: 'premium_otc' },
  { minPayout: 0.75, breakEven: 0.571, label: 'standard' },
  { minPayout: 0.65, breakEven: 0.606, label: 'low' },
  { minPayout: 0.45, breakEven: 0.690, label: 'very_low' },
];

export function getPayoutTier(payout: number): PayoutTier | null {
  for (const tier of PAYOUT_TIERS) {
    if (payout >= tier.minPayout) return tier;
  }
  return null; // below all tiers → skip
}

// ─── Granular Sub-Stats ───

export interface SubStats {
  wins: number;
  losses: number;
  payout: number;
  risked: number;
}

export function emptySubStats(): SubStats {
  return { wins: 0, losses: 0, payout: 0, risked: 0 };
}

export interface VirtualEntry {
  readonly strategyId: string;
  readonly symbol: string;
  readonly direction: 'CALL' | 'PUT';
  readonly payout: number; // payout rate (e.g., 0.82)
  readonly payoutTier: string; // 'premium_otc' | 'standard' | 'low'
  readonly galeLevel: number; // 0 = base, 1 = first recovery, 2 = second recovery
  readonly signalPrice: number; // price at signal time (candle close when signal fired)
  entryPrice: number;
  readonly entryTime: number;
  readonly session: string; // session at entry time
  readonly hour: number;    // UTC hour at entry time
  // How to determine entry price: 'next_m1' enters at next M1 open, 'next_m5' at next M5 open
  readonly entryOn: 'next_m1' | 'next_m5' | 'immediate';
  // M5 entries: only resolve on candle with time >= this value (prevents look-ahead bias)
  readonly resolveAfterMs: number;
  // M5+M1 optimized: tracks M1 entry optimizer state
  m1OptWaitCount: number;  // 0 = not m1-optimized, >0 = waiting for M1 confirmation
  // All entries resolve at next M5 close (5-min expiry simulation)
  entrySet: boolean; // true once entry price is locked in
  // Mutable state for confirmation/pullback timing
  confirmCount: number;
  pullbackSeen: boolean;
  // Track if entry conditions are met (confirmation/pullback)
  ready: boolean;
}

export interface StrategyStats {
  readonly id: string;
  readonly name: string;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  worstStreak: number;
  recentResults: readonly ('W' | 'L')[];
  totalPayout: number;   // sum of payout on wins (e.g., 0.82 per win)
  totalRisked: number;   // sum of 1.0 per trade (stake)
  // Gated stats: trades that passed through the regime gate
  gatedWins: number;
  gatedLosses: number;
  gatedPayout: number;
  gatedRisked: number;
  // Candidate gated stats: tracks all trades regardless of regime state.
  // Used as fallback for scoring when gated* has < 20 samples (e.g. when regime is permanently blocked).
  candidateGatedWins: number;
  candidateGatedLosses: number;
  candidateGatedPayout: number;
  candidateGatedRisked: number;
  // Granular analytics (Phase 1)
  pairStats: Map<string, SubStats>;
  sessionStats: Map<string, SubStats>;  // london | ny | overlap | asian | off
  hourStats: Map<number, SubStats>;     // 0-23 UTC
  tierStats: Map<string, SubStats>;     // premium_otc | standard | low
  equityCurve: number[];                // rolling P&L points (last 200)
  maxDrawdown: number;
  // Entry mode comparison:
  // Primary (wins/losses above) = entry at next candle OPEN, exit at next candle CLOSE
  // "atSignal" = entry at signal candle CLOSE (immediate), exit at next candle CLOSE
  atSignalWins: number;
  atSignalLosses: number;
  // Gale (martingale) tracking — two modes compared side by side
  // "signal": gale on next strategy signal (wait for strategy to fire again on same pair)
  // "candle": gale on immediate next candle (enter same direction right after loss)
  galeSignal: {
    g0: { wins: number; losses: number; pnl: number };  // base trades
    g1: { wins: number; losses: number; pnl: number };  // recovery trades
    totalPnl: number;
  };
  galeCandle: {
    g0: { wins: number; losses: number; pnl: number };
    g1: { wins: number; losses: number; pnl: number };
    totalPnl: number;
  };
  flatPnl: number; // flat betting (no gale, for comparison)
  // AI validation tracking (Phase 4)
  aiValidatedWins: number;
  aiValidatedLosses: number;
  aiRejectedWins: number;
  aiRejectedLosses: number;
  // Scoring (Phase 5)
  score: number;
  disabled: boolean;
  lastUpdated: number;
}

// ─── Live Event Log ───

export interface LabEvent {
  readonly type: 'entry' | 'win' | 'loss' | 'expire';
  readonly strategy: string;     // strategy name
  readonly strategyId: string;
  readonly symbol: string;
  readonly direction: 'CALL' | 'PUT';
  readonly isOtc: boolean;
  readonly time: number;
}

// ─── Gale Candle Recovery ───

export interface GaleCandleRecovery {
  readonly stratId: string;
  readonly symbol: string;
  readonly direction: 'CALL' | 'PUT';
  readonly payout: number;
  readonly entryOn: 'next_m1' | 'next_m5';
}
