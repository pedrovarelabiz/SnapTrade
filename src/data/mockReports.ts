import { DailyReport } from '@/types';

const daysAgo = (d: number) => {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date.toISOString().split('T')[0];
};

export const mockReports: DailyReport[] = [
  {
    id: 'r1', date: daysAgo(0), totalSignals: 16, wins: 14, losses: 2, skipped: 0,
    winRate: 87.5, topAsset: 'EUR/USD OTC', signals: [],
  },
  {
    id: 'r2', date: daysAgo(1), totalSignals: 30, wins: 29, losses: 1, skipped: 0,
    winRate: 96.7, topAsset: 'AUD/USD OTC', signals: [],
  },
  {
    id: 'r3', date: daysAgo(2), totalSignals: 24, wins: 24, losses: 0, skipped: 0,
    winRate: 100, topAsset: 'USD/CAD OTC', signals: [],
  },
  {
    id: 'r4', date: daysAgo(3), totalSignals: 22, wins: 20, losses: 2, skipped: 0,
    winRate: 90.9, topAsset: 'EUR/USD OTC', signals: [],
  },
  {
    id: 'r5', date: daysAgo(4), totalSignals: 18, wins: 17, losses: 1, skipped: 0,
    winRate: 94.4, topAsset: 'GBP/USD OTC', signals: [],
  },
  {
    id: 'r6', date: daysAgo(5), totalSignals: 24, wins: 22, losses: 2, skipped: 0,
    winRate: 91.7, topAsset: 'AUD/USD OTC', signals: [],
  },
  {
    id: 'r7', date: daysAgo(6), totalSignals: 20, wins: 19, losses: 1, skipped: 0,
    winRate: 95.0, topAsset: 'USD/CHF OTC', signals: [],
  },
];