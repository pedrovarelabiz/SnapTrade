import { describe, it, expect } from 'vitest';
import { SorosCalculator } from '../soros';

describe('SorosCalculator', () => {
  const defaults = { baseAmount: 10, payoutRate: 0.88, maxLevels: 3 };

  it('initial stake equals baseAmount', () => {
    const calc = new SorosCalculator(defaults);
    expect(calc.getStake()).toBe(10);
  });

  it('compounds on win', () => {
    const calc = new SorosCalculator(defaults);
    calc.recordTrade(true);
    // After win: 10 + 10*0.88 = 18.8
    expect(calc.getStake()).toBeCloseTo(18.8, 1);
  });

  it('resets on loss', () => {
    const calc = new SorosCalculator(defaults);
    calc.recordTrade(true);
    calc.recordTrade(false);
    expect(calc.getStake()).toBe(10);
  });

  it('resets after maxLevels consecutive wins', () => {
    const calc = new SorosCalculator(defaults);
    calc.recordTrade(true); // level 1
    calc.recordTrade(true); // level 2
    calc.recordTrade(true); // level 3 = maxLevels → reset
    expect(calc.getStake()).toBe(10);
  });

  it('compounds correctly through 2 wins', () => {
    const calc = new SorosCalculator(defaults);
    calc.recordTrade(true); // 10 + 8.8 = 18.8
    calc.recordTrade(true); // 18.8 + 18.8*0.88 = 18.8 + 16.544 = 35.344
    expect(calc.getStake()).toBeCloseTo(35.344, 1);
  });

  it('restoreState preserves state', () => {
    const calc = new SorosCalculator(defaults);
    calc.recordTrade(true);
    const state = calc.getState();
    const calc2 = new SorosCalculator(defaults);
    calc2.restoreState(state);
    expect(calc2.getStake()).toBe(calc.getStake());
  });
});
