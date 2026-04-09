/**
 * P&L calculator wrapper that computes per-user profit/loss on signal result.
 * Supports Masaniello, Soros, and fixed MG strategies.
 */

import { MasanielloCalculator } from "./masaniello.js";
import { SorosCalculator } from "./soros.js";

export interface PnlResult {
  amount: number;
  pnl: number;
  strategy: string;
}

export function calculatePnl(opts: {
  strategy: string;
  baseAmount: number;
  payoutRate: number;
  isWin: boolean;
  galeLevel: number;
  maxGale: number;
}): PnlResult {
  const { strategy, baseAmount, payoutRate, isWin, galeLevel, maxGale } = opts;

  if (strategy === "flat") {
    const pnl = isWin ? baseAmount * payoutRate : -baseAmount;
    return { amount: baseAmount, pnl, strategy };
  }

  // MG strategies: calculate total invested up to the gale level that won (or max)
  const multiplier = strategy.includes("x1.5") ? 1.5 : strategy.includes("x3") ? 3.0 : 2.0;
  const effectiveMaxGale = Math.min(maxGale, 2);
  const levelsPlayed = isWin
    ? Math.min(galeLevel, effectiveMaxGale) + 1
    : effectiveMaxGale + 1;

  let totalInvested = 0;
  let totalReturn = 0;

  for (let level = 0; level < levelsPlayed; level++) {
    const bet = baseAmount * Math.pow(multiplier, level);
    totalInvested += bet;

    if (level === galeLevel && isWin && level <= effectiveMaxGale) {
      totalReturn = bet * (1 + payoutRate);
      break;
    }
  }

  const pnl = totalReturn - totalInvested;
  return { amount: totalInvested, pnl, strategy };
}
