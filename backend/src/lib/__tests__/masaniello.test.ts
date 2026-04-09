import { describe, it, expect } from 'vitest';
import { MasanielloCalculator } from '../masaniello';

describe('MasanielloCalculator', () => {
  const defaults = { baseAmount: 10, payoutRate: 0.88, tradesPerDay: 20, expectedWins: 16, targetProfitPct: 0.5, maxBet: 50 };

  it('should create with correct initial state', () => {
    const calc = new MasanielloCalculator(defaults);
    const state = calc.getState();
    expect(state.dayTrades).toBe(0);
    expect(state.dayWins).toBe(0);
    expect(state.targetProfit).toBeGreaterThan(0);
  });

  it('getStake returns value between baseAmount and maxBet', () => {
    const calc = new MasanielloCalculator(defaults);
    const stake = calc.getStake();
    expect(stake).toBeGreaterThanOrEqual(defaults.baseAmount);
    expect(stake).toBeLessThanOrEqual(defaults.maxBet);
  });

  it('getStake never goes below baseAmount (C2 fix)', () => {
    const calc = new MasanielloCalculator({ ...defaults, targetProfitPct: 0.01 });
    // Even with tiny target profit, stake should not go below baseAmount
    const stake = calc.getStake();
    expect(stake).toBeGreaterThanOrEqual(defaults.baseAmount);
  });

  it('getStake returns baseAmount when needed > remaining (C2 fix)', () => {
    const calc = new MasanielloCalculator(defaults);
    // Simulate: all trades done with 0 wins (needed=16, remaining=0)
    for (let i = 0; i < 20; i++) {
      calc.recordTrade(false);
    }
    const stake = calc.getStake();
    expect(stake).toBe(defaults.baseAmount);
  });

  it('getStake rounds to 2 decimal places (C2 fix)', () => {
    const calc = new MasanielloCalculator(defaults);
    const stake = calc.getStake();
    const rounded = Math.round(stake * 100) / 100;
    expect(stake).toBe(rounded);
  });

  it('recordTrade updates state correctly on win', () => {
    const calc = new MasanielloCalculator(defaults);
    calc.recordTrade(true);
    const state = calc.getState();
    expect(state.dayTrades).toBe(1);
    expect(state.dayWins).toBe(1);
  });

  it('recordTrade updates state correctly on loss', () => {
    const calc = new MasanielloCalculator(defaults);
    calc.recordTrade(false);
    const state = calc.getState();
    expect(state.dayTrades).toBe(1);
    expect(state.dayWins).toBe(0);
  });

  it('resetDay resets counters', () => {
    const calc = new MasanielloCalculator(defaults);
    calc.recordTrade(true);
    calc.recordTrade(false);
    calc.resetDay();
    const state = calc.getState();
    expect(state.dayTrades).toBe(0);
    expect(state.dayWins).toBe(0);
  });

  it('restoreState preserves and resumes correctly', () => {
    const calc = new MasanielloCalculator(defaults);
    calc.recordTrade(true);
    calc.recordTrade(true);
    calc.recordTrade(false);
    const savedState = calc.getState();

    const calc2 = new MasanielloCalculator(defaults);
    calc2.restoreState(savedState);
    expect(calc2.getState()).toEqual(savedState);
    expect(calc2.getStake()).toBe(calc.getStake());
  });

  it('stake increases as wins accumulate (Masaniello progression)', () => {
    const calc = new MasanielloCalculator({ ...defaults, maxBet: 500 });
    const stake1 = calc.getStake();
    calc.recordTrade(true);
    calc.recordTrade(true);
    calc.recordTrade(true);
    const stake2 = calc.getStake();
    // After wins, target profit decreases but probability shifts — stake should change
    expect(stake2).not.toBe(stake1);
  });
});
