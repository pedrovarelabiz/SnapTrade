/**
 * Soros (Anti-Martingale) calculator.
 * Compounds profits on consecutive wins, resets on loss.
 */

export interface SorosState {
  currentBet: number;
  winStreak: number;
}

export class SorosCalculator {
  private readonly baseAmount: number;
  private readonly payoutRate: number;
  private readonly maxLevels: number;

  private state: SorosState;

  constructor(opts: {
    baseAmount: number;
    payoutRate?: number;
    maxLevels?: number;
  }) {
    this.baseAmount = opts.baseAmount;
    this.payoutRate = opts.payoutRate ?? 0.88;
    this.maxLevels = opts.maxLevels ?? 3;

    this.state = {
      currentBet: this.baseAmount,
      winStreak: 0,
    };
  }

  resetDay(): void {
    this.state = {
      currentBet: this.baseAmount,
      winStreak: 0,
    };
  }

  getStake(): number {
    return Math.round(this.state.currentBet * 100) / 100;
  }

  recordTrade(isWin: boolean): void {
    if (isWin) {
      const profit = this.state.currentBet * this.payoutRate;
      const newStreak = this.state.winStreak + 1;

      if (newStreak >= this.maxLevels) {
        this.state = {
          currentBet: this.baseAmount,
          winStreak: 0,
        };
      } else {
        this.state = {
          currentBet: this.state.currentBet + profit,
          winStreak: newStreak,
        };
      }
    } else {
      this.state = {
        currentBet: this.baseAmount,
        winStreak: 0,
      };
    }
  }

  getState(): SorosState {
    return { ...this.state };
  }

  restoreState(state: SorosState): void {
    this.state = { ...state };
  }
}
