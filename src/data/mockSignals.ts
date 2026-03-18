import { Signal } from '@/types';

// Real signals from 18/03/2026 sessions
// Times are in UTC format based on the signal entry times

const today = new Date().toISOString().split('T')[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

const t = (time: string, dateStr?: string) => `${dateStr || today}T${time}:00Z`;
const tCreated = (time: string, dateStr?: string) => `${dateStr || today}T${time}:00Z`;

// Session 1 (20:05-21:10 UTC) — 6 signals, 6 wins
// Session 2 (23:05-00:10 UTC) — 6 signals, 5 wins, 1 loss
// Session 3 (07:05-08:10 UTC) — 6 signals, 6 wins
// Session 4 (10:05-11:05 UTC) — partial session shown

export const mockSignals: Signal[] = [
  // === SESSION 4: 10:05-10:40 UTC (today, most recent — some still active/pending) ===
  {
    id: 's-gbp-1040', asset: 'GBP/USD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('10:40'), timeframe: 'M5', martingaleLevel: 0, status: 'pending',
    createdAt: tCreated('10:36'), isPremium: true, confidence: 82,
    martingaleSchedule: [{ level: 1, time: '10:45' }, { level: 2, time: '10:50' }],
  },
  {
    id: 's-aud-1030', asset: 'AUD/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('10:30'), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('10:28'), isPremium: true, confidence: 79,
    martingaleSchedule: [{ level: 1, time: '10:35' }, { level: 2, time: '10:40' }],
  },
  {
    id: 's-nzd-1015', asset: 'NZD/USD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('10:15'), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: tCreated('10:12'), isPremium: true, confidence: 76,
    martingaleSchedule: [{ level: 1, time: '10:20' }, { level: 2, time: '10:25' }],
  },
  {
    id: 's-eur-1005', asset: 'EUR/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('10:05'), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('10:03'), isPremium: true, confidence: 85,
    martingaleSchedule: [{ level: 1, time: '10:10' }, { level: 2, time: '10:15' }],
  },

  // === SESSION 3: 07:05-08:10 UTC (today) — 6W 0L ===
  {
    id: 's-audnzd-0810', asset: 'AUD/NZD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('08:10'), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('08:06'), isPremium: true, confidence: 81,
    martingaleSchedule: [{ level: 1, time: '08:15' }, { level: 2, time: '08:20' }],
  },
  {
    id: 's-audchf-0800', asset: 'AUD/CHF OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('08:00'), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('07:57'), isPremium: true, confidence: 84,
    martingaleSchedule: [{ level: 1, time: '08:05' }, { level: 2, time: '08:10' }],
  },
  {
    id: 's-audcad-0745', asset: 'AUD/CAD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('07:45'), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: tCreated('07:41'), isPremium: true, confidence: 77,
    martingaleSchedule: [{ level: 1, time: '07:50' }, { level: 2, time: '07:55' }],
  },
  {
    id: 's-eur-0735', asset: 'EUR/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('07:35'), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('07:31'), isPremium: true, confidence: 83,
    martingaleSchedule: [{ level: 1, time: '07:40' }, { level: 2, time: '07:45' }],
  },
  {
    id: 's-aud-0715', asset: 'AUD/USD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('07:15'), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: tCreated('07:11'), isPremium: true, confidence: 78,
    martingaleSchedule: [{ level: 1, time: '07:20' }, { level: 2, time: '07:25' }],
  },
  {
    id: 's-usdcad-0705', asset: 'USD/CAD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('07:05'), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('07:01'), isPremium: true, confidence: 86,
    martingaleSchedule: [{ level: 1, time: '07:10' }, { level: 2, time: '07:15' }],
  },

  // === SESSION 2: 23:05-00:10 UTC (yesterday night) — 5W 1L ===
  {
    id: 's-usdjpy-0010', asset: 'USD/JPY OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('00:10'), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: tCreated('00:07'), isPremium: true, confidence: 74,
    martingaleSchedule: [{ level: 1, time: '00:15' }, { level: 2, time: '00:20' }],
  },
  {
    id: 's-usdchf-2355', asset: 'USD/CHF OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('23:55', yesterday), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: tCreated('23:52', yesterday), isPremium: true, confidence: 75,
    martingaleSchedule: [{ level: 1, time: '00:00' }, { level: 2, time: '00:05' }],
  },
  {
    id: 's-gbp-2345', asset: 'GBP/USD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('23:45', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('23:41', yesterday), isPremium: true, confidence: 80,
    martingaleSchedule: [{ level: 1, time: '23:50' }, { level: 2, time: '23:55' }],
  },
  {
    id: 's-eur-2335', asset: 'EUR/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('23:35', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('23:32', yesterday), isPremium: true, confidence: 82,
    martingaleSchedule: [{ level: 1, time: '23:40' }, { level: 2, time: '23:45' }],
  },
  {
    id: 's-usdcad-2315', asset: 'USD/CAD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('23:15', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'loss', result: 'loss',
    createdAt: tCreated('23:11', yesterday), isPremium: true, confidence: 71,
    martingaleSchedule: [{ level: 1, time: '23:20' }, { level: 2, time: '23:25' }],
  },
  {
    id: 's-aud-2305', asset: 'AUD/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('23:05', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('23:02', yesterday), isPremium: true, confidence: 83,
    martingaleSchedule: [{ level: 1, time: '23:10' }, { level: 2, time: '23:15' }],
  },

  // === SESSION 1: 20:05-21:10 UTC (yesterday) — 6W 0L ===
  {
    id: 's-aud-2110', asset: 'AUD/USD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('21:10', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('21:07', yesterday), isPremium: false, confidence: 84,
    martingaleSchedule: [{ level: 1, time: '21:15' }, { level: 2, time: '21:20' }],
  },
  {
    id: 's-usdchf-2100', asset: 'USD/CHF OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('21:00', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('20:56', yesterday), isPremium: false, confidence: 81,
    martingaleSchedule: [{ level: 1, time: '21:05' }, { level: 2, time: '21:10' }],
  },
  {
    id: 's-usdjpy-2040', asset: 'USD/JPY OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('20:40', yesterday), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: tCreated('20:37', yesterday), isPremium: false, confidence: 76,
    martingaleSchedule: [{ level: 1, time: '20:45' }, { level: 2, time: '20:50' }],
  },
  {
    id: 's-eurchf-2025', asset: 'EUR/CHF OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('20:25', yesterday), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: tCreated('20:21', yesterday), isPremium: false, confidence: 78,
    martingaleSchedule: [{ level: 1, time: '20:30' }, { level: 2, time: '20:35' }],
  },
  {
    id: 's-gbp-2015', asset: 'GBP/USD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('20:15', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('20:11', yesterday), isPremium: false, confidence: 85,
    martingaleSchedule: [{ level: 1, time: '20:20' }, { level: 2, time: '20:25' }],
  },
  {
    id: 's-eur-2005', asset: 'EUR/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('20:05', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: tCreated('20:02', yesterday), isPremium: false, confidence: 82,
    martingaleSchedule: [{ level: 1, time: '20:10' }, { level: 2, time: '20:15' }],
  },
];

export const ASSETS = [
  'EUR/USD', 'GBP/JPY', 'USD/CHF', 'AUD/USD', 'EUR/GBP',
  'USD/JPY', 'NZD/USD', 'EUR/JPY', 'GBP/USD', 'AUD/JPY',
  'CAD/CHF', 'EUR/AUD', 'USD/CAD', 'GBP/CHF', 'NZD/JPY',
  'EUR/CHF', 'AUD/NZD', 'GBP/AUD', 'CHF/JPY', 'EUR/NZD',
];

export const OTC_ASSETS = [
  'EUR/USD OTC', 'GBP/USD OTC', 'USD/CHF OTC', 'AUD/USD OTC', 'EUR/CHF OTC',
  'USD/CAD OTC', 'USD/JPY OTC', 'NZD/USD OTC', 'AUD/CAD OTC', 'AUD/CHF OTC',
  'AUD/NZD OTC', 'CAD/JPY OTC', 'EUR/NZD OTC', 'EUR/GBP OTC', 'CHF/NOK OTC',
];

export const CRYPTO_ASSETS = ['CRYPTO IDX'];

export const ALL_ASSETS = [...ASSETS, ...OTC_ASSETS, ...CRYPTO_ASSETS];

export function generateRandomSignal(): Signal {
  const allPairs = [...OTC_ASSETS];
  const asset = allPairs[Math.floor(Math.random() * allPairs.length)];
  const direction = Math.random() > 0.5 ? 'CALL' : 'PUT';
  const timeframe: Signal['timeframe'] = 'M5';
  const confidence = Math.floor(Math.random() * 20) + 72;

  const now = new Date();
  const entryMinutes = Math.floor(Math.random() * 8) + 2;
  const entryTime = new Date(now.getTime() + entryMinutes * 60000);
  const entryHH = entryTime.getUTCHours().toString().padStart(2, '0');
  const entryMM = entryTime.getUTCMinutes().toString().padStart(2, '0');

  const g1Time = new Date(entryTime.getTime() + 5 * 60000);
  const g1HH = g1Time.getUTCHours().toString().padStart(2, '0');
  const g1MM = g1Time.getUTCMinutes().toString().padStart(2, '0');

  const g2Time = new Date(entryTime.getTime() + 10 * 60000);
  const g2HH = g2Time.getUTCHours().toString().padStart(2, '0');
  const g2MM = g2Time.getUTCMinutes().toString().padStart(2, '0');

  const signal: Signal = {
    id: `s${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    asset,
    direction: direction as Signal['direction'],
    signalType: 'scheduled',
    entryTime: entryTime.toISOString(),
    timeframe,
    martingaleLevel: 0,
    status: 'pending',
    createdAt: new Date().toISOString(),
    isPremium: Math.random() > 0.3,
    confidence,
    martingaleSchedule: [
      { level: 1, time: `${g1HH}:${g1MM}` },
      { level: 2, time: `${g2HH}:${g2MM}` },
    ],
  };

  return signal;
}