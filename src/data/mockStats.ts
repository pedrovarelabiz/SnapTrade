import { StatsOverview, AssetPerformance, HourlyData, PnlPoint, WinRatePoint } from '@/types';

export const mockStatsOverview: StatsOverview = {
  totalSignals: 154,
  winRate: 94.2,
  wins: 145,
  losses: 9,
  currentStreak: 14,
  bestStreak: 29,
  avgSignalsPerDay: 22.0,
};

export const mockAssetPerformance: AssetPerformance[] = [
  { asset: 'EUR/USD OTC', totalSignals: 28, wins: 27, losses: 1, winRate: 96.4 },
  { asset: 'AUD/USD OTC', totalSignals: 24, wins: 23, losses: 1, winRate: 95.8 },
  { asset: 'USD/CAD OTC', totalSignals: 18, wins: 17, losses: 1, winRate: 94.4 },
  { asset: 'GBP/USD OTC', totalSignals: 16, wins: 15, losses: 1, winRate: 93.8 },
  { asset: 'USD/CHF OTC', totalSignals: 14, wins: 14, losses: 0, winRate: 100.0 },
  { asset: 'USD/JPY OTC', totalSignals: 14, wins: 13, losses: 1, winRate: 92.9 },
  { asset: 'NZD/USD OTC', totalSignals: 10, wins: 10, losses: 0, winRate: 100.0 },
  { asset: 'EUR/CHF OTC', totalSignals: 8, wins: 7, losses: 1, winRate: 87.5 },
  { asset: 'AUD/CHF OTC', totalSignals: 6, wins: 6, losses: 0, winRate: 100.0 },
  { asset: 'AUD/CAD OTC', totalSignals: 4, wins: 4, losses: 0, winRate: 100.0 },
  { asset: 'AUD/NZD OTC', totalSignals: 4, wins: 4, losses: 0, winRate: 100.0 },
  { asset: 'CAD/JPY OTC', totalSignals: 3, wins: 3, losses: 0, winRate: 100.0 },
  { asset: 'EUR/NZD OTC', totalSignals: 2, wins: 2, losses: 0, winRate: 100.0 },
  { asset: 'EUR/GBP OTC', totalSignals: 2, wins: 2, losses: 0, winRate: 100.0 },
  { asset: 'CHF/NOK OTC', totalSignals: 1, wins: 1, losses: 0, winRate: 100.0 },
];

// Signals concentrated in session hours: 07-08, 10-11, 15-16, 20-21, 23-00
export const mockHourlyData: HourlyData[] = Array.from({ length: 24 }, (_, i) => {
  let signals = 0;
  let wins = 0;

  if (i === 7) { signals = 6; wins = 6; }
  else if (i === 8) { signals = 2; wins = 2; }
  else if (i === 10) { signals = 6; wins = 6; }
  else if (i === 11) { signals = 1; wins = 1; }
  else if (i === 15) { signals = 4; wins = 3; }
  else if (i === 16) { signals = 3; wins = 3; }
  else if (i === 20) { signals = 4; wins = 4; }
  else if (i === 21) { signals = 2; wins = 2; }
  else if (i === 23) { signals = 4; wins = 3; }
  else if (i === 0) { signals = 2; wins = 2; }

  return {
    hour: i,
    signals,
    wins,
    winRate: signals > 0 ? Math.round((wins / signals) * 100) : 0,
  };
});

const generatePnlData = (): PnlPoint[] => {
  const data: PnlPoint[] = [];
  let cumulative = 0;
  const dailyResults = [
    { wins: 19, losses: 1 },
    { wins: 22, losses: 2 },
    { wins: 17, losses: 1 },
    { wins: 20, losses: 2 },
    { wins: 24, losses: 0 },
    { wins: 29, losses: 1 },
    { wins: 14, losses: 2 },
  ];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const day = dailyResults[6 - i];
    const netWins = day.wins - day.losses;
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
  const dailyWinRates = [95.0, 91.7, 94.4, 90.9, 100, 96.7, 87.5];
  const dailySignals = [20, 24, 18, 22, 24, 30, 16];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split('T')[0],
      winRate: dailyWinRates[6 - i],
      signals: dailySignals[6 - i],
    });
  }
  return data;
};

export const mockWinRateData: WinRatePoint[] = generateWinRateData();