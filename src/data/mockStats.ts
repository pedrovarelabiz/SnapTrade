import { StatsOverview, AssetPerformance, HourlyData, PnlPoint, WinRatePoint } from '@/types';
import { quickPnl } from '@/lib/pnlCalculator';

// Computed from mock signals: 10 direct wins, 7 gale1 wins, 3 gale2 wins, 1 loss (gale2)
const directWinPnl = quickPnl('direct_victory', 0, 10);
const gale1WinPnl = quickPnl('victory_at_gale', 1, 10);
const gale2WinPnl = quickPnl('victory_at_gale', 2, 10);
const lossPnl = quickPnl('loss', 2, 10);

const totalPnl = 10 * directWinPnl + 7 * gale1WinPnl + 3 * gale2WinPnl + 1 * lossPnl;
const totalResolved = 21;

export const mockStatsOverview: StatsOverview = {
  totalSignals: 22,
  winRate: Math.round((20 / totalResolved) * 100 * 10) / 10,
  wins: 20,
  losses: 1,
  currentStreak: 9,
  bestStreak: 11,
  avgSignalsPerDay: 11.0,
  totalPnl: Math.round(totalPnl * 100) / 100,
  avgPnlPerSignal: Math.round((totalPnl / totalResolved) * 100) / 100,
};

export const mockAssetPerformance: AssetPerformance[] = [
  { asset: 'EUR/USD OTC', totalSignals: 5, wins: 5, losses: 0, winRate: 100.0 },
  { asset: 'AUD/USD OTC', totalSignals: 4, wins: 4, losses: 0, winRate: 100.0 },
  { asset: 'GBP/USD OTC', totalSignals: 3, wins: 3, losses: 0, winRate: 100.0 },
  { asset: 'USD/CHF OTC', totalSignals: 2, wins: 2, losses: 0, winRate: 100.0 },
  { asset: 'USD/JPY OTC', totalSignals: 2, wins: 2, losses: 0, winRate: 100.0 },
  { asset: 'NZD/USD OTC', totalSignals: 1, wins: 1, losses: 0, winRate: 100.0 },
  { asset: 'AUD/CHF OTC', totalSignals: 1, wins: 1, losses: 0, winRate: 100.0 },
  { asset: 'AUD/CAD OTC', totalSignals: 1, wins: 1, losses: 0, winRate: 100.0 },
  { asset: 'AUD/NZD OTC', totalSignals: 1, wins: 1, losses: 0, winRate: 100.0 },
  { asset: 'EUR/CHF OTC', totalSignals: 1, wins: 1, losses: 0, winRate: 100.0 },
  { asset: 'USD/CAD OTC', totalSignals: 2, wins: 1, losses: 1, winRate: 50.0 },
];

export const mockHourlyData: HourlyData[] = [
  { hour: 0, signals: 2, wins: 2, winRate: 100 },
  { hour: 7, signals: 6, wins: 6, winRate: 100 },
  { hour: 8, signals: 2, wins: 2, winRate: 100 },
  { hour: 10, signals: 3, wins: 3, winRate: 100 },
  { hour: 20, signals: 4, wins: 4, winRate: 100 },
  { hour: 21, signals: 2, wins: 2, winRate: 100 },
  { hour: 23, signals: 4, wins: 3, winRate: 75 },
];

// P&L curve with monetary values
const daysAgo = (d: number) => {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date.toISOString().split('T')[0];
};

// Realistic daily P&L based on signal mix
const dailyPnls = [
  { date: daysAgo(13), pnl: 6 * directWinPnl + 2 * gale1WinPnl + 1 * gale2WinPnl },
  { date: daysAgo(12), pnl: 5 * directWinPnl + 3 * gale1WinPnl + 1 * lossPnl },
  { date: daysAgo(11), pnl: 7 * directWinPnl + 1 * gale1WinPnl },
  { date: daysAgo(10), pnl: 4 * directWinPnl + 2 * gale1WinPnl + 2 * gale2WinPnl },
  { date: daysAgo(9), pnl: 5 * directWinPnl + 3 * gale1WinPnl },
  { date: daysAgo(8), pnl: 3 * directWinPnl + 2 * gale1WinPnl + 1 * lossPnl },
  { date: daysAgo(7), pnl: 6 * directWinPnl + 2 * gale1WinPnl + 1 * gale2WinPnl },
  { date: daysAgo(6), pnl: 8 * directWinPnl + 1 * gale1WinPnl },
  { date: daysAgo(5), pnl: 4 * directWinPnl + 3 * gale1WinPnl + 1 * gale2WinPnl },
  { date: daysAgo(4), pnl: 5 * directWinPnl + 2 * gale1WinPnl + 1 * lossPnl },
  { date: daysAgo(3), pnl: 7 * directWinPnl + 2 * gale1WinPnl },
  { date: daysAgo(2), pnl: 6 * directWinPnl + 3 * gale1WinPnl + 1 * gale2WinPnl },
  { date: daysAgo(1), pnl: 10 * directWinPnl + 2 * gale1WinPnl },
  { date: daysAgo(0), pnl: 5 * directWinPnl + 3 * gale1WinPnl + 1 * gale2WinPnl },
];

let cumulative = 0;
export const mockPnlData: PnlPoint[] = dailyPnls.map(d => {
  const roundedPnl = Math.round(d.pnl * 100) / 100;
  cumulative = Math.round((cumulative + roundedPnl) * 100) / 100;
  return { date: d.date, pnl: roundedPnl, cumulative };
});

export const mockWinRateData: WinRatePoint[] = [
  { date: daysAgo(13), winRate: 88, signals: 9 },
  { date: daysAgo(12), winRate: 82, signals: 9 },
  { date: daysAgo(11), winRate: 100, signals: 8 },
  { date: daysAgo(10), winRate: 89, signals: 8 },
  { date: daysAgo(9), winRate: 100, signals: 8 },
  { date: daysAgo(8), winRate: 78, signals: 6 },
  { date: daysAgo(7), winRate: 94, signals: 9 },
  { date: daysAgo(6), winRate: 100, signals: 9 },
  { date: daysAgo(5), winRate: 91, signals: 8 },
  { date: daysAgo(4), winRate: 82, signals: 8 },
  { date: daysAgo(3), winRate: 100, signals: 9 },
  { date: daysAgo(2), winRate: 95, signals: 10 },
  { date: daysAgo(1), winRate: 100, signals: 12 },
  { date: daysAgo(0), winRate: 95, signals: 9 },
];