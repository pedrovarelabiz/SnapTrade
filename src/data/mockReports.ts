import { DailyReport } from '@/types';
import { quickPnl } from '@/lib/pnlCalculator';

const daysAgo = (d: number) => {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date.toISOString().split('T')[0];
};

const dw = quickPnl('direct_victory', 0, 10);
const g1 = quickPnl('victory_at_gale', 1, 10);
const g2 = quickPnl('victory_at_gale', 2, 10);
const fl = quickPnl('loss', 2, 10);

export const mockReports: DailyReport[] = [
  {
    id: 'r1', date: daysAgo(0), totalSignals: 10, wins: 9, losses: 1, skipped: 0,
    winRate: 90.0, topAsset: 'EUR/USD OTC', signals: [],
    dailyPnl: Math.round((5 * dw + 3 * g1 + 1 * g2) * 100) / 100,
    directWins: 5, gale1Wins: 3, gale2Wins: 1, fullLosses: 0,
  },
  {
    id: 'r2', date: daysAgo(1), totalSignals: 12, wins: 11, losses: 1, skipped: 0,
    winRate: 91.7, topAsset: 'AUD/USD OTC', signals: [],
    dailyPnl: Math.round((6 * dw + 3 * g1 + 2 * g2 + 1 * fl) * 100) / 100,
    directWins: 6, gale1Wins: 3, gale2Wins: 2, fullLosses: 1,
  },
  {
    id: 'r3', date: daysAgo(2), totalSignals: 10, wins: 10, losses: 0, skipped: 0,
    winRate: 100, topAsset: 'USD/CAD OTC', signals: [],
    dailyPnl: Math.round((7 * dw + 2 * g1 + 1 * g2) * 100) / 100,
    directWins: 7, gale1Wins: 2, gale2Wins: 1, fullLosses: 0,
  },
  {
    id: 'r4', date: daysAgo(3), totalSignals: 9, wins: 9, losses: 0, skipped: 0,
    winRate: 100, topAsset: 'EUR/USD OTC', signals: [],
    dailyPnl: Math.round((6 * dw + 2 * g1 + 1 * g2) * 100) / 100,
    directWins: 6, gale1Wins: 2, gale2Wins: 1, fullLosses: 0,
  },
  {
    id: 'r5', date: daysAgo(4), totalSignals: 8, wins: 7, losses: 1, skipped: 0,
    winRate: 87.5, topAsset: 'GBP/USD OTC', signals: [],
    dailyPnl: Math.round((4 * dw + 2 * g1 + 1 * g2 + 1 * fl) * 100) / 100,
    directWins: 4, gale1Wins: 2, gale2Wins: 1, fullLosses: 1,
  },
  {
    id: 'r6', date: daysAgo(5), totalSignals: 8, wins: 8, losses: 0, skipped: 0,
    winRate: 100, topAsset: 'AUD/USD OTC', signals: [],
    dailyPnl: Math.round((5 * dw + 2 * g1 + 1 * g2) * 100) / 100,
    directWins: 5, gale1Wins: 2, gale2Wins: 1, fullLosses: 0,
  },
  {
    id: 'r7', date: daysAgo(6), totalSignals: 9, wins: 9, losses: 0, skipped: 0,
    winRate: 100, topAsset: 'USD/CHF OTC', signals: [],
    dailyPnl: Math.round((6 * dw + 2 * g1 + 1 * g2) * 100) / 100,
    directWins: 6, gale1Wins: 2, gale2Wins: 1, fullLosses: 0,
  },
];