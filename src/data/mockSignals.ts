import { Signal } from '@/types';

const now = new Date();
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();
const minutesFromNow = (m: number) => new Date(now.getTime() + m * 60000).toISOString();

export const mockSignals: Signal[] = [
  { id: 's1', asset: 'EUR/USD', direction: 'CALL', entryTime: minutesFromNow(2), timeframe: 'M5', martingaleLevel: 0, status: 'pending', createdAt: minutesAgo(1), isPremium: false, confidence: 85 },
  { id: 's2', asset: 'GBP/JPY', direction: 'PUT', entryTime: minutesFromNow(5), timeframe: 'M5', martingaleLevel: 0, status: 'pending', createdAt: minutesAgo(2), isPremium: false, confidence: 78 },
  { id: 's3', asset: 'USD/CHF', direction: 'CALL', entryTime: minutesAgo(1), timeframe: 'M1', martingaleLevel: 1, status: 'active', createdAt: minutesAgo(5), isPremium: false, confidence: 72 },
  { id: 's4', asset: 'AUD/USD', direction: 'PUT', entryTime: minutesFromNow(8), timeframe: 'M15', martingaleLevel: 0, status: 'pending', createdAt: minutesAgo(3), isPremium: true, confidence: 91 },
  { id: 's5', asset: 'EUR/GBP', direction: 'CALL', entryTime: minutesAgo(10), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win', createdAt: minutesAgo(15), isPremium: true, confidence: 88 },
  { id: 's6', asset: 'USD/JPY', direction: 'PUT', entryTime: minutesAgo(15), timeframe: 'M5', martingaleLevel: 0, status: 'loss', result: 'loss', createdAt: minutesAgo(20), isPremium: false, confidence: 65 },
  { id: 's7', asset: 'NZD/USD', direction: 'CALL', entryTime: minutesAgo(20), timeframe: 'M1', martingaleLevel: 2, status: 'win', result: 'win', createdAt: minutesAgo(25), isPremium: true, confidence: 82 },
  { id: 's8', asset: 'EUR/JPY', direction: 'PUT', entryTime: minutesAgo(25), timeframe: 'M15', martingaleLevel: 0, status: 'win', result: 'win', createdAt: minutesAgo(30), isPremium: true, confidence: 76 },
  { id: 's9', asset: 'GBP/USD', direction: 'CALL', entryTime: minutesAgo(30), timeframe: 'M5', martingaleLevel: 0, status: 'loss', result: 'loss', createdAt: minutesAgo(35), isPremium: false, confidence: 70 },
  { id: 's10', asset: 'AUD/JPY', direction: 'PUT', entryTime: minutesAgo(35), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win', createdAt: minutesAgo(40), isPremium: true, confidence: 84 },
  { id: 's11', asset: 'CAD/CHF', direction: 'CALL', entryTime: minutesAgo(40), timeframe: 'M1', martingaleLevel: 0, status: 'skipped', createdAt: minutesAgo(45), isPremium: true, confidence: 60 },
  { id: 's12', asset: 'EUR/AUD', direction: 'PUT', entryTime: minutesAgo(45), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win', createdAt: minutesAgo(50), isPremium: true, confidence: 89 },
  { id: 's13', asset: 'USD/CAD', direction: 'CALL', entryTime: minutesAgo(50), timeframe: 'M15', martingaleLevel: 0, status: 'win', result: 'win', createdAt: minutesAgo(55), isPremium: false, confidence: 77 },
  { id: 's14', asset: 'GBP/CHF', direction: 'PUT', entryTime: minutesAgo(55), timeframe: 'M5', martingaleLevel: 0, status: 'loss', result: 'loss', createdAt: minutesAgo(60), isPremium: true, confidence: 68 },
  { id: 's15', asset: 'NZD/JPY', direction: 'CALL', entryTime: minutesAgo(60), timeframe: 'M1', martingaleLevel: 0, status: 'win', result: 'win', createdAt: minutesAgo(65), isPremium: true, confidence: 81 },
  { id: 's16', asset: 'EUR/CHF', direction: 'PUT', entryTime: minutesFromNow(12), timeframe: 'M30', martingaleLevel: 0, status: 'pending', createdAt: minutesAgo(1), isPremium: true, confidence: 93 },
  { id: 's17', asset: 'AUD/NZD', direction: 'CALL', entryTime: minutesAgo(70), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win', createdAt: minutesAgo(75), isPremium: true, confidence: 86 },
  { id: 's18', asset: 'GBP/AUD', direction: 'PUT', entryTime: minutesAgo(75), timeframe: 'M5', martingaleLevel: 0, status: 'expired', createdAt: minutesAgo(80), isPremium: true, confidence: 62 },
  { id: 's19', asset: 'CHF/JPY', direction: 'CALL', entryTime: minutesAgo(80), timeframe: 'M15', martingaleLevel: 0, status: 'win', result: 'win', createdAt: minutesAgo(85), isPremium: true, confidence: 79 },
  { id: 's20', asset: 'EUR/NZD', direction: 'PUT', entryTime: minutesAgo(85), timeframe: 'M5', martingaleLevel: 1, status: 'loss', result: 'loss', createdAt: minutesAgo(90), isPremium: true, confidence: 71 },
];

export const ASSETS = [
  'EUR/USD', 'GBP/JPY', 'USD/CHF', 'AUD/USD', 'EUR/GBP',
  'USD/JPY', 'NZD/USD', 'EUR/JPY', 'GBP/USD', 'AUD/JPY',
  'CAD/CHF', 'EUR/AUD', 'USD/CAD', 'GBP/CHF', 'NZD/JPY',
  'EUR/CHF', 'AUD/NZD', 'GBP/AUD', 'CHF/JPY', 'EUR/NZD',
];

export function generateRandomSignal(): Signal {
  const asset = ASSETS[Math.floor(Math.random() * ASSETS.length)];
  const direction = Math.random() > 0.5 ? 'CALL' : 'PUT';
  const timeframes: Signal['timeframe'][] = ['M1', 'M5', 'M15'];
  const timeframe = timeframes[Math.floor(Math.random() * timeframes.length)];
  const confidence = Math.floor(Math.random() * 30) + 65;

  return {
    id: `s${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    asset,
    direction: direction as Signal['direction'],
    entryTime: new Date(Date.now() + (Math.floor(Math.random() * 10) + 2) * 60000).toISOString(),
    timeframe,
    martingaleLevel: 0,
    status: 'pending',
    createdAt: new Date().toISOString(),
    isPremium: Math.random() > 0.3,
    confidence,
  };
}
