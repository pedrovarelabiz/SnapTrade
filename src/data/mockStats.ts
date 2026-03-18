import { StatsOverview, AssetPerformance, HourlyData, PnlPoint, WinRatePoint } from '@/types';

export const mockStatsOverview: StatsOverview = {
  totalSignals: 1247,
  winRate: 78.4,
  wins: 977,
  losses: 270,
  currentStreak: 7,
  bestStreak: 14,
  avgSignalsPerDay: 25.4,
};

export const mockAssetPerformance: AssetPerformance[] = [
  { asset: 'EUR/USD OTC', totalSignals: 210, wins: 172, losses: 38, winRate: 81.9 },
  { asset: 'GBP/JPY OTC', totalSignals: 185, wins: 148, losses: 37, winRate: 80.0 },
  { asset: 'USD/CHF OTC', totalSignals: 156, wins: 125, losses: 31, winRate: 80.1 },
  { asset: 'AUD/USD OTC', totalSignals: 142, wins: 110, losses: 32, winRate: 77.5 },
  { asset: 'EUR/GBP OTC', totalSignals: 128, wins: 99, losses: 29, winRate: 77.3 },
  { asset: 'USD/JPY OTC', totalSignals: 118, wins: 89, losses: 29, winRate: 75.4 },
  { asset: 'NZD/USD OTC', totalSignals: 95, wins: 73, losses: 22, winRate: 76.8 },
  { asset: 'GBP/USD OTC', totalSignals: 88, wins: 67, losses: 21, winRate: 76.1 },
  { asset: 'EUR/JPY OTC', totalSignals: 72, wins: 55, losses: 17, winRate: 76.4 },
  { asset: 'AUD/JPY OTC', totalSignals: 53, wins: 39, losses: 14, winRate: 73.6 },
];

export const mockHourlyData: HourlyData[] = Array.from({ length: 24 }, (_, i) => {
  const signals = i >= 8 && i <= 20 ? Math.floor(Math.random() * 8) + 3 : Math.floor(Math.random() * 3);
  const wins = Math.floor(signals * (0.7 + Math.random() * 0.2));
  return { hour: i, signals, wins, winRate: signals > 0 ? Math.round((wins / signals) * 100) : 0 };
});

const generatePnlData = (): PnlPoint[] => {
  const data: PnlPoint[] = [];
  let cumulative = 0;
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const totalSignals = Math.floor(Math.random() * 10) + 15;
    const winRate = 0.7 + Math.random() * 0.2;
    const wins = Math.round(totalSignals * winRate);
    const losses = totalSignals - wins;
    const netWins = wins - losses;
    cumulative += netWins;
    data.push({
      date: date.toISOString().split('T')[0],
      pnl: netWins,
      cumulative,
    });
  }
  return data;
};

export const mockPnlData: PnlPoint[] = generatePnlData();

const generateWinRateData = (): WinRatePoint[] => {
  const data: WinRatePoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split('T')[0],
      winRate: Math.round((70 + Math.random() * 20) * 10) / 10,
      signals: Math.floor(Math.random() * 15) + 15,
    });
  }
  return data;
};

export const mockWinRateData: WinRatePoint[] = generateWinRateData();