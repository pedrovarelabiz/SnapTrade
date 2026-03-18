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

export const yesterdayFreeResults: YesterdayResult[] = [
  { id: 'yf1', asset: 'EUR/USD', direction: 'CALL', entryTime: time(8, 15), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 82 },
  { id: 'yf2', asset: 'GBP/JPY', direction: 'PUT', entryTime: time(12, 30), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 76 },
  { id: 'yf3', asset: 'USD/CHF', direction: 'CALL', entryTime: time(16, 45), timeframe: 'M1', result: 'loss', martingaleLevel: 0, confidence: 68 },
];

export const yesterdayPremiumResults: YesterdayResult[] = [
  { id: 'yp1', asset: 'AUD/CAD', direction: 'CALL', entryTime: time(6, 10), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 88 },
  { id: 'yp2', asset: 'USD/JPY', direction: 'PUT', entryTime: time(7, 25), timeframe: 'M15', result: 'win', martingaleLevel: 0, confidence: 84 },
  { id: 'yp3', asset: 'NZD/USD', direction: 'CALL', entryTime: time(8, 40), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 79 },
  { id: 'yp4', asset: 'EUR/GBP', direction: 'PUT', entryTime: time(9, 15), timeframe: 'M5', result: 'loss', martingaleLevel: 0, confidence: 71 },
  { id: 'yp5', asset: 'GBP/USD', direction: 'CALL', entryTime: time(9, 50), timeframe: 'M1', result: 'win', martingaleLevel: 1, confidence: 74 },
  { id: 'yp6', asset: 'EUR/JPY', direction: 'PUT', entryTime: time(10, 30), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 86 },
  { id: 'yp7', asset: 'AUD/USD', direction: 'CALL', entryTime: time(11, 5), timeframe: 'M15', result: 'win', martingaleLevel: 0, confidence: 81 },
  { id: 'yp8', asset: 'USD/CAD', direction: 'PUT', entryTime: time(12, 0), timeframe: 'M5', result: 'loss', martingaleLevel: 0, confidence: 67 },
  { id: 'yp9', asset: 'CHF/JPY', direction: 'CALL', entryTime: time(13, 20), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 83 },
  { id: 'yp10', asset: 'EUR/AUD', direction: 'PUT', entryTime: time(14, 10), timeframe: 'M1', result: 'win', martingaleLevel: 0, confidence: 77 },
  { id: 'yp11', asset: 'GBP/CHF', direction: 'CALL', entryTime: time(15, 0), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 85 },
  { id: 'yp12', asset: 'NZD/JPY', direction: 'PUT', entryTime: time(16, 15), timeframe: 'M15', result: 'loss', martingaleLevel: 0, confidence: 69 },
  { id: 'yp13', asset: 'EUR/NZD', direction: 'CALL', entryTime: time(17, 30), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 80 },
  { id: 'yp14', asset: 'AUD/JPY', direction: 'PUT', entryTime: time(18, 20), timeframe: 'M5', result: 'win', martingaleLevel: 1, confidence: 73 },
  { id: 'yp15', asset: 'GBP/AUD', direction: 'CALL', entryTime: time(19, 0), timeframe: 'M1', result: 'win', martingaleLevel: 0, confidence: 87 },
  { id: 'yp16', asset: 'USD/CHF', direction: 'PUT', entryTime: time(19, 45), timeframe: 'M5', result: 'loss', martingaleLevel: 0, confidence: 66 },
  { id: 'yp17', asset: 'EUR/USD', direction: 'CALL', entryTime: time(20, 30), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 89 },
  { id: 'yp18', asset: 'AUD/NZD', direction: 'PUT', entryTime: time(21, 15), timeframe: 'M15', result: 'win', martingaleLevel: 0, confidence: 78 },
];

export const tickerResults: { asset: string; direction: 'CALL' | 'PUT'; result: 'win' | 'loss'; pnl: string }[] = [
  { asset: 'EUR/USD', direction: 'CALL', result: 'win', pnl: '+$1.86' },
  { asset: 'GBP/JPY', direction: 'PUT', result: 'loss', pnl: '-$1.00' },
  { asset: 'USD/CHF', direction: 'CALL', result: 'win', pnl: '+$1.86' },
  { asset: 'AUD/CAD', direction: 'CALL', result: 'win', pnl: '+$1.86' },
  { asset: 'USD/JPY', direction: 'PUT', result: 'win', pnl: '+$1.86' },
  { asset: 'NZD/USD', direction: 'CALL', result: 'win', pnl: '+$1.86' },
  { asset: 'EUR/GBP', direction: 'PUT', result: 'loss', pnl: '-$1.00' },
  { asset: 'GBP/USD', direction: 'CALL', result: 'win', pnl: '+$1.86' },
  { asset: 'EUR/JPY', direction: 'PUT', result: 'win', pnl: '+$1.86' },
  { asset: 'AUD/USD', direction: 'CALL', result: 'win', pnl: '+$1.86' },
  { asset: 'CHF/JPY', direction: 'CALL', result: 'win', pnl: '+$1.86' },
  { asset: 'EUR/AUD', direction: 'PUT', result: 'loss', pnl: '-$1.00' },
  { asset: 'GBP/CHF', direction: 'CALL', result: 'win', pnl: '+$1.86' },
  { asset: 'NZD/JPY', direction: 'PUT', result: 'loss', pnl: '-$1.00' },
  { asset: 'EUR/NZD', direction: 'CALL', result: 'win', pnl: '+$1.86' },
  { asset: 'AUD/JPY', direction: 'PUT', result: 'win', pnl: '+$1.86' },
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