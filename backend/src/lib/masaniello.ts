/**
 * Masaniello progressive staking calculator.
 * Uses combinatorial formula to compute optimal stakes based on
 * remaining trades and expected wins in a daily cycle.
 */

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < Math.min(k, n - k); i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

export interface MasanielloState {
  dayTrades: number;
  dayWins: number;
  targetProfit: number;
}

export class MasanielloCalculator {
  private readonly tradesPerDay: number;
  private readonly expectedWins: number;
  private readonly targetProfitPct: number;
  private readonly payoutRate: number;
  private readonly baseAmount: number;
  private readonly maxBet: number;

  private state: MasanielloState;

  constructor(opts: {
    baseAmount: number;
    payoutRate?: number;
    tradesPerDay?: number;
    expectedWins?: number;
    targetProfitPct?: number;
    maxBet?: number;
  }) {
    this.baseAmount = opts.baseAmount;
    this.payoutRate = opts.payoutRate ?? 0.88;
    this.tradesPerDay = opts.tradesPerDay ?? 20;
    this.expectedWins = opts.expectedWins ?? 16;
    this.targetProfitPct = opts.targetProfitPct ?? 0.5;
    this.maxBet = opts.maxBet ?? opts.baseAmount * 5;

    this.state = {
      dayTrades: 0,
      dayWins: 0,
      targetProfit: this.baseAmount * this.tradesPerDay * this.targetProfitPct,
    };
  }

  resetDay(): void {
    this.state = {
      dayTrades: 0,
      dayWins: 0,
      targetProfit: this.baseAmount * this.tradesPerDay * this.targetProfitPct,
    };
  }

  getStake(): number {
    const remaining = this.tradesPerDay - this.state.dayTrades;
    const needed = this.expectedWins - this.state.dayWins;

    if (remaining <= 0 || needed <= 0) return this.baseAmount;
    if (needed > remaining) return this.baseAmount; // Aligned with simulation & extension (C2 fix)

    try {
      const numerator =
        this.state.targetProfit * comb(remaining - 1, needed - 1);
      const denominator = this.payoutRate * comb(remaining, needed);

      if (denominator === 0) return this.baseAmount;

      let stake = numerator / denominator;
      stake = Math.max(this.baseAmount, stake); // Aligned with simulation & extension (C2 fix)
      const clamped = Math.min(stake, this.maxBet);
      return Math.round(clamped * 100) / 100; // Aligned with simulation & extension (C2 fix)
    } catch {
      return this.baseAmount;
    }
  }

  recordTrade(isWin: boolean): void {
    this.state = {
      ...this.state,
      dayTrades: this.state.dayTrades + 1,
      dayWins: this.state.dayWins + (isWin ? 1 : 0),
    };
  }

  getState(): MasanielloState {
    return { ...this.state };
  }

  restoreState(state: MasanielloState): void {
    this.state = { ...state };
  }
}
