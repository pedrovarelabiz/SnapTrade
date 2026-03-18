import { Signal } from '@/types';

const now = new Date();
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();
const minutesFromNow = (m: number) => new Date(now.getTime() + m * 60000).toISOString();

const futureTime = (m: number) => {
  const d = new Date(now.getTime() + m * 60000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

const pastTime = (m: number) => {
  const d = new Date(now.getTime() - m * 60000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const mockSignals: Signal[] = [
  {
    id: 's1', asset: 'EUR/CHF OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: minutesFromNow(2), timeframe: 'M5', martingaleLevel: 0, status: 'pending',
    createdAt: minutesAgo(1), isPremium: false, confidence: 85,
    martingaleSchedule: [{ level: 1, time: futureTime(7) }, { level: 2, time: futureTime(12) }],
  },
  {
    id: 's2', asset: 'GBP/JPY OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: minutesFromNow(5), timeframe: 'M5', martingaleLevel: 0, status: 'pending',
    createdAt: minutesAgo(2), isPremium: false, confidence: 78,
    martingaleSchedule: [{ level: 1, time: futureTime(10) }, { level: 2, time: futureTime(15) }],
  },
  {
    id: 's3', asset: 'USD/CHF', direction: 'CALL', signalType: 'scheduled',
    entryTime: minutesAgo(1), timeframe: 'M1', martingaleLevel: 1, status: 'active',
    createdAt: minutesAgo(5), isPremium: false, confidence: 72,
    martingaleSchedule: [{ level: 1, time: pastTime(0) }],
  },
  {
    id: 's4', asset: 'AUD/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: minutesFromNow(8), timeframe: 'M15', martingaleLevel: 0, status: 'pending',
    createdAt: minutesAgo(3), isPremium: true, confidence: 91,
    martingaleSchedule: [{ level: 1, time: futureTime(23) }, { level: 2, time: futureTime(38) }],
  },
  {
    id: 's5', asset: 'EUR/GBP', direction: 'CALL', signalType: 'scheduled',
    entryTime: minutesAgo(10), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: minutesAgo(15), isPremium: true, confidence: 88,
    martingaleSchedule: [{ level: 1, time: pastTime(5) }],
  },
  {
    id: 's6', asset: 'USD/JPY OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: minutesAgo(15), timeframe: 'M5', martingaleLevel: 0, status: 'loss', result: 'loss',
    createdAt: minutesAgo(20), isPremium: false, confidence: 65,
    martingaleSchedule: [{ level: 1, time: pastTime(10) }, { level: 2, time: pastTime(5) }],
  },
  {
    id: 's7', asset: 'NZD/USD', direction: 'CALL', signalType: 'instant',
    entryTime: minutesAgo(0.5), timeframe: 'M5', martingaleLevel: 0, status: 'active',
    createdAt: minutesAgo(0.5), isPremium: true, confidence: 82,
  },
  {
    id: 's8', asset: 'EUR/JPY OTC', direction: 'PUT', signalType: 'instant',
    entryTime: minutesAgo(25), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: minutesAgo(27), isPremium: true, confidence: 76,
  },
  {
    id: 's9', asset: 'GBP/USD', direction: 'CALL', signalType: 'scheduled',
    entryTime: minutesAgo(30), timeframe: 'M5', martingaleLevel: 0, status: 'loss', result: 'loss',
    createdAt: minutesAgo(35), isPremium: false, confidence: 70,
    martingaleSchedule: [{ level: 1, time: pastTime(25) }],
  },
  {
    id: 's10', asset: 'AUD/JPY', direction: 'PUT', signalType: 'instant',
    entryTime: minutesAgo(35), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: minutesAgo(37), isPremium: true, confidence: 84,
  },
  {
    id: 's11', asset: 'CAD/CHF OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: minutesAgo(40), timeframe: 'M1', martingaleLevel: 0, status: 'skipped',
    createdAt: minutesAgo(45), isPremium: true, confidence: 60,
    martingaleSchedule: [],
  },
  {
    id: 's12', asset: 'EUR/AUD', direction: 'PUT', signalType: 'instant',
    entryTime: minutesAgo(45), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: minutesAgo(47), isPremium: true, confidence: 89,
  },
  {
    id: 's13', asset: 'USD/CAD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: minutesAgo(50), timeframe: 'M15', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: minutesAgo(55), isPremium: false, confidence: 77,
    martingaleSchedule: [{ level: 1, time: pastTime(35) }, { level: 2, time: pastTime(20) }],
  },
  {
    id: 's14', asset: 'GBP/CHF', direction: 'PUT', signalType: 'instant',
    entryTime: minutesAgo(55), timeframe: 'M5', martingaleLevel: 0, status: 'loss', result: 'loss',
    createdAt: minutesAgo(57), isPremium: true, confidence: 68,
  },
  {
    id: 's15', asset: 'NZD/JPY OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: minutesAgo(60), timeframe: 'M1', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: minutesAgo(65), isPremium: true, confidence: 81,
    martingaleSchedule: [{ level: 1, time: pastTime(59) }],
  },
  {
    id: 's16', asset: 'EUR/CHF', direction: 'PUT', signalType: 'scheduled',
    entryTime: minutesFromNow(12), timeframe: 'M30', martingaleLevel: 0, status: 'pending',
    createdAt: minutesAgo(1), isPremium: true, confidence: 93,
    martingaleSchedule: [{ level: 1, time: futureTime(42) }, { level: 2, time: futureTime(72) }],
  },
  {
    id: 's17', asset: 'AUD/NZD OTC', direction: 'CALL', signalType: 'instant',
    entryTime: minutesAgo(70), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: minutesAgo(72), isPremium: true, confidence: 86,
  },
  {
    id: 's18', asset: 'GBP/AUD', direction: 'PUT', signalType: 'scheduled',
    entryTime: minutesAgo(75), timeframe: 'M5', martingaleLevel: 0, status: 'expired',
    createdAt: minutesAgo(80), isPremium: true, confidence: 62,
    martingaleSchedule: [],
  },
  {
    id: 's19', asset: 'CRYPTO IDX', direction: 'CALL', signalType: 'instant',
    entryTime: minutesAgo(80), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: minutesAgo(82), isPremium: true, confidence: 79,
  },
  {
    id: 's20', asset: 'EUR/NZD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: minutesAgo(85), timeframe: 'M5', martingaleLevel: 1, status: 'loss', result: 'loss',
    createdAt: minutesAgo(90), isPremium: true, confidence: 71,
    martingaleSchedule: [{ level: 1, time: pastTime(80) }, { level: 2, time: pastTime(75) }],
  },
];

export const ASSETS = [
  'EUR/USD', 'GBP/JPY', 'USD/CHF', 'AUD/USD', 'EUR/GBP',
  'USD/JPY', 'NZD/USD', 'EUR/JPY', 'GBP/USD', 'AUD/JPY',
  'CAD/CHF', 'EUR/AUD', 'USD/CAD', 'GBP/CHF', 'NZD/JPY',
  'EUR/CHF', 'AUD/NZD', 'GBP/AUD', 'CHF/JPY', 'EUR/NZD',
];

export const OTC_ASSETS = [
  'EUR/USD OTC', 'GBP/JPY OTC', 'USD/CHF OTC', 'AUD/USD OTC', 'EUR/CHF OTC',
];

export const CRYPTO_ASSETS = ['CRYPTO IDX'];

export const ALL_ASSETS = [...ASSETS, ...OTC_ASSETS, ...CRYPTO_ASSETS];

export function generateRandomSignal(): Signal {
  const allPairs = [...ASSETS, ...OTC_ASSETS, ...CRYPTO_ASSETS];
  const asset = allPairs[Math.floor(Math.random() * allPairs.length)];
  const direction = Math.random() > 0.5 ? 'CALL' : 'PUT';
  const timeframes: Signal['timeframe'][] = ['M1', 'M5', 'M15'];
  const timeframe = timeframes[Math.floor(Math.random() * timeframes.length)];
  const confidence = Math.floor(Math.random() * 30) + 65;
  const isScheduled = Math.random() > 0.4;
  const entryMinutes = Math.floor(Math.random() * 10) + 2;

  const signal: Signal = {
    id: `s${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    asset,
    direction: direction as Signal['direction'],
    signalType: isScheduled ? 'scheduled' : 'instant',
    entryTime: isScheduled
      ? new Date(Date.now() + entryMinutes * 60000).toISOString()
      : new Date().toISOString(),
    timeframe,
    martingaleLevel: 0,
    status: 'pending',
    createdAt: new Date().toISOString(),
    isPremium: Math.random() > 0.3,
    confidence,
  };

  if (isScheduled && Math.random() > 0.3) {
    const tfMinutes = timeframe === 'M1' ? 1 : timeframe === 'M5' ? 5 : 15;
    signal.martingaleSchedule = [
      { level: 1, time: futureTime(entryMinutes + tfMinutes) },
      { level: 2, time: futureTime(entryMinutes + tfMinutes * 2) },
    ];
  }

  return signal;
}