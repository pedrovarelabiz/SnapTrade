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
  { id: 'yf1', asset: 'USD/CAD OTC', direction: 'CALL', entryTime: time(7, 5), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 82 },
  { id: 'yf2', asset: 'AUD/USD OTC', direction: 'PUT', entryTime: time(7, 15), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 76 },
  { id: 'yf3', asset: 'EUR/USD OTC', direction: 'CALL', entryTime: time(7, 35), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 79 },
];

export const yesterdayPremiumResults: YesterdayResult[] = [
  { id: 'yp1', asset: 'USD/CAD OTC', direction: 'CALL', entryTime: time(7, 5), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 82 },
  { id: 'yp2', asset: 'AUD/USD OTC', direction: 'PUT', entryTime: time(7, 15), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 76 },
  { id: 'yp3', asset: 'EUR/USD OTC', direction: 'CALL', entryTime: time(7, 35), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 79 },
  { id: 'yp4', asset: 'AUD/CAD OTC', direction: 'CALL', entryTime: time(7, 45), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 84 },
  { id: 'yp5', asset: 'AUD/CHF OTC', direction: 'PUT', entryTime: time(8, 0), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 81 },
  { id: 'yp6', asset: 'AUD/NZD OTC', direction: 'CALL', entryTime: time(8, 10), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 77 },
  { id: 'yp7', asset: 'EUR/USD OTC', direction: 'CALL', entryTime: time(10, 5), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 88 },
  { id: 'yp8', asset: 'NZD/USD OTC', direction: 'PUT', entryTime: time(10, 15), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 83 },
  { id: 'yp9', asset: 'AUD/USD OTC', direction: 'CALL', entryTime: time(10, 30), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 80 },
  { id: 'yp10', asset: 'GBP/USD OTC', direction: 'PUT', entryTime: time(10, 40), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 85 },
  { id: 'yp11', asset: 'USD/JPY OTC', direction: 'CALL', entryTime: time(10, 55), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 82 },
  { id: 'yp12', asset: 'AUD/NZD OTC', direction: 'PUT', entryTime: time(11, 5), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 78 },
  { id: 'yp13', asset: 'EUR/USD OTC', direction: 'PUT', entryTime: time(15, 5), timeframe: 'M5', result: 'loss', martingaleLevel: 0, confidence: 67 },
  { id: 'yp14', asset: 'GBP/USD OTC', direction: 'CALL', entryTime: time(15, 25), timeframe: 'M5', result: 'loss', martingaleLevel: 0, confidence: 65 },
  { id: 'yp15', asset: 'USD/CAD OTC', direction: 'PUT', entryTime: time(15, 45), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 74 },
  { id: 'yp16', asset: 'EUR/CHF OTC', direction: 'CALL', entryTime: time(16, 0), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 79 },
  { id: 'yp17', asset: 'CHF/NOK OTC', direction: 'PUT', entryTime: time(16, 15), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 76 },
  { id: 'yp18', asset: 'USD/CHF OTC', direction: 'CALL', entryTime: time(16, 25), timeframe: 'M5', result: 'win', martingaleLevel: 0, confidence: 81 },
];

export const tickerResults: { asset: string; direction: 'CALL' | 'PUT'; result: 'win' | 'loss' }[] = [
  { asset: 'USD/CAD OTC', direction: 'CALL', result: 'win' },
  { asset: 'AUD/USD OTC', direction: 'PUT', result: 'win' },
  { asset: 'EUR/USD OTC', direction: 'CALL', result: 'win' },
  { asset: 'AUD/CAD OTC', direction: 'CALL', result: 'win' },
  { asset: 'AUD/CHF OTC', direction: 'PUT', result: 'win' },
  { asset: 'AUD/NZD OTC', direction: 'CALL', result: 'win' },
  { asset: 'EUR/USD OTC', direction: 'CALL', result: 'win' },
  { asset: 'NZD/USD OTC', direction: 'PUT', result: 'win' },
  { asset: 'AUD/USD OTC', direction: 'CALL', result: 'win' },
  { asset: 'GBP/USD OTC', direction: 'PUT', result: 'win' },
  { asset: 'USD/JPY OTC', direction: 'CALL', result: 'win' },
  { asset: 'AUD/NZD OTC', direction: 'PUT', result: 'win' },
  { asset: 'EUR/USD OTC', direction: 'PUT', result: 'loss' },
  { asset: 'GBP/USD OTC', direction: 'CALL', result: 'loss' },
  { asset: 'USD/CAD OTC', direction: 'PUT', result: 'win' },
  { asset: 'EUR/CHF OTC', direction: 'CALL', result: 'win' },
  { asset: 'CHF/NOK OTC', direction: 'PUT', result: 'win' },
  { asset: 'USD/CHF OTC', direction: 'CALL', result: 'win' },
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