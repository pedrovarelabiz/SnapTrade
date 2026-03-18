import { Signal } from '@/types';

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yStr = yesterday.toISOString().split('T')[0];

const time = (h: number, m: number) => `${yStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;

export interface YesterdayResult {
  id: string;
  asset: string;
  direction: 'CALL' | 'PUT';
  entryTime: string;
  timeframe: string;
  result: 'win' | 'loss';
  martingaleLevel: number;
  confidence: number;
}

// Real results from 17/03 operations report (previous day)
// Session 1: 07:05-08:15 — 6W 0L
// Session 2: 10:05-11:05 — 6W 0L
// Session 3: 15:05-16:15 — 6W 0L
// Session 4: 20:05-21:10 — 6W 0L
// Total: 24W 0L

// Free tier shows Session 1 (first 3 signals)
export const yesterdayFreeResults: YesterdayResult[] = [
  { id: 'yf1', asset: 'USD/CAD OTC', direction: 'PUT', entryTime: time(7, 5), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 86 },
  { id: 'yf2', asset: 'AUD/USD OTC', direction: 'CALL', entryTime: time(7, 25), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 78 },
  { id: 'yf3', asset: 'NZD/USD OTC', direction: 'PUT', entryTime: time(7, 35), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 81 },
];

// Premium shows all 24 signals from the day
export const yesterdayPremiumResults: YesterdayResult[] = [
  // Session 1: 07:05-08:15
  { id: 'yp1', asset: 'USD/CAD OTC', direction: 'PUT', entryTime: time(7, 5), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 86 },
  { id: 'yp2', asset: 'AUD/USD OTC', direction: 'CALL', entryTime: time(7, 25), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 78 },
  { id: 'yp3', asset: 'NZD/USD OTC', direction: 'PUT', entryTime: time(7, 35), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 81 },
  { id: 'yp4', asset: 'EUR/USD OTC', direction: 'CALL', entryTime: time(7, 45), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 83 },
  { id: 'yp5', asset: 'AUD/CHF OTC', direction: 'PUT', entryTime: time(8, 0), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 84 },
  { id: 'yp6', asset: 'USD/JPY OTC', direction: 'CALL', entryTime: time(8, 15), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 79 },

  // Session 2: 10:05-11:05
  { id: 'yp7', asset: 'USD/CAD OTC', direction: 'PUT', entryTime: time(10, 5), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 85 },
  { id: 'yp8', asset: 'NZD/USD OTC', direction: 'CALL', entryTime: time(10, 15), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 80 },
  { id: 'yp9', asset: 'AUD/USD OTC', direction: 'PUT', entryTime: time(10, 25), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 82 },
  { id: 'yp10', asset: 'CAD/JPY OTC', direction: 'CALL', entryTime: time(10, 40), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 77 },
  { id: 'yp11', asset: 'EUR/NZD OTC', direction: 'PUT', entryTime: time(10, 55), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 76 },
  { id: 'yp12', asset: 'EUR/USD OTC', direction: 'CALL', entryTime: time(11, 5), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 84 },

  // Session 3: 15:05-16:15
  { id: 'yp13', asset: 'EUR/USD OTC', direction: 'PUT', entryTime: time(15, 5), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 83 },
  { id: 'yp14', asset: 'USD/CHF OTC', direction: 'CALL', entryTime: time(15, 20), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 81 },
  { id: 'yp15', asset: 'USD/JPY OTC', direction: 'PUT', entryTime: time(15, 30), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 79 },
  { id: 'yp16', asset: 'AUD/USD OTC', direction: 'CALL', entryTime: time(15, 50), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 82 },
  { id: 'yp17', asset: 'EUR/GBP OTC', direction: 'PUT', entryTime: time(16, 0), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 78 },
  { id: 'yp18', asset: 'GBP/USD OTC', direction: 'CALL', entryTime: time(16, 15), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 85 },

  // Session 4: 20:05-21:10
  { id: 'yp19', asset: 'EUR/USD OTC', direction: 'PUT', entryTime: time(20, 5), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 82 },
  { id: 'yp20', asset: 'GBP/USD OTC', direction: 'CALL', entryTime: time(20, 15), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 85 },
  { id: 'yp21', asset: 'EUR/CHF OTC', direction: 'PUT', entryTime: time(20, 25), timeframe: 'M5', result: 'win', martingaleLevel: 1, confidence: 78 },
  { id: 'yp22', asset: 'USD/JPY OTC', direction: 'CALL', entryTime: time(20, 40), timeframe: 'M5', result: 'win', martingaleLevel: 1, confidence: 76 },
  { id: 'yp23', asset: 'USD/CHF OTC', direction: 'PUT', entryTime: time(21, 0), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 81 },
  { id: 'yp24', asset: 'AUD/USD OTC', direction: 'CALL', entryTime: time(21, 10), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 84 },
];

export const tickerResults: { asset: string; direction: 'CALL' | 'PUT'; result: 'win' | 'loss' }[] = [
  // From 17/03 report — all 24 wins
  { asset: 'USD/CAD OTC', direction: 'PUT', result: 'win' },
  { asset: 'AUD/USD OTC', direction: 'CALL', result: 'win' },
  { asset: 'NZD/USD OTC', direction: 'PUT', result: 'win' },
  { asset: 'EUR/USD OTC', direction: 'CALL', result: 'win' },
  { asset: 'AUD/CHF OTC', direction: 'PUT', result: 'win' },
  { asset: 'USD/JPY OTC', direction: 'CALL', result: 'win' },
  { asset: 'USD/CAD OTC', direction: 'PUT', result: 'win' },
  { asset: 'NZD/USD OTC', direction: 'CALL', result: 'win' },
  { asset: 'AUD/USD OTC', direction: 'PUT', result: 'win' },
  { asset: 'CAD/JPY OTC', direction: 'CALL', result: 'win' },
  { asset: 'EUR/NZD OTC', direction: 'PUT', result: 'win' },
  { asset: 'EUR/USD OTC', direction: 'CALL', result: 'win' },
  { asset: 'EUR/USD OTC', direction: 'PUT', result: 'win' },
  { asset: 'USD/CHF OTC', direction: 'CALL', result: 'win' },
  { asset: 'USD/JPY OTC', direction: 'PUT', result: 'win' },
  { asset: 'AUD/USD OTC', direction: 'CALL', result: 'win' },
  { asset: 'EUR/GBP OTC', direction: 'PUT', result: 'win' },
  { asset: 'GBP/USD OTC', direction: 'CALL', result: 'win' },
  { asset: 'EUR/USD OTC', direction: 'PUT', result: 'win' },
  { asset: 'GBP/USD OTC', direction: 'CALL', result: 'win' },
  { asset: 'EUR/CHF OTC', direction: 'PUT', result: 'win' },
  { asset: 'USD/JPY OTC', direction: 'CALL', result: 'win' },
  { asset: 'USD/CHF OTC', direction: 'PUT', result: 'win' },
  { asset: 'AUD/USD OTC', direction: 'CALL', result: 'win' },
];

export interface YesterdaySummary {
  free: YesterdayResult[];
  premium: {
    visible: YesterdayResult[];
    blurredCount: number;
    stats: { total: number; wins: number; losses: number; winRate: number };
  };
}

export function getYesterdaySummary(): YesterdaySummary {
  const premiumWins = yesterdayPremiumResults.filter(r => r.result === 'win').length;
  const premiumLosses = yesterdayPremiumResults.filter(r => r.result === 'loss').length;

  return {
    free: yesterdayFreeResults,
    premium: {
      visible: yesterdayPremiumResults.slice(0, 3),
      blurredCount: yesterdayPremiumResults.length - 3,
      stats: {
        total: yesterdayPremiumResults.length,
        wins: premiumWins,
        losses: premiumLosses,
        winRate: Math.round((premiumWins / yesterdayPremiumResults.length) * 1000) / 10,
      },
    },
  };
}