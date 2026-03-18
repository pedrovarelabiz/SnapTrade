import { DailyReport } from '@/types';

const daysAgo = (d: number) => {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date.toISOString().split('T')[0];
};

export const mockReports: DailyReport[] = [
  {
    id: 'r1', date: daysAgo(0), totalSignals: 24, wins: 19, losses: 4, skipped: 1,
    winRate: 82.6, topAsset: 'EUR/USD', signals: [],
  },
  {
    id: 'r2', date: daysAgo(1), totalSignals: 28, wins: 21, losses: 6, skipped: 1,
    winRate: 77.8, topAsset: 'GBP/JPY', signals: [],
  },
  {
    id: 'r3', date: daysAgo(2), totalSignals: 22, wins: 18, losses: 3, skipped: 1,
    winRate: 85.7, topAsset: 'USD/CHF', signals: [],
  },
  {
    id: 'r4', date: daysAgo(3), totalSignals: 26, wins: 20, losses: 5, skipped: 1,
    winRate: 80.0, topAsset: 'AUD/USD', signals: [],
  },
  {
    id: 'r5', date: daysAgo(4), totalSignals: 20, wins: 15, losses: 4, skipped: 1,
    winRate: 78.9, topAsset: 'EUR/GBP', signals: [],
  },
  {
    id: 'r6', date: daysAgo(5), totalSignals: 30, wins: 24, losses: 5, skipped: 1,
    winRate: 82.8, topAsset: 'USD/JPY', signals: [],
  },
  {
    id: 'r7', date: daysAgo(6), totalSignals: 25, wins: 19, losses: 5, skipped: 1,
    winRate: 79.2, topAsset: 'NZD/USD', signals: [],
  },
];
