import { Signal, PnlBreakdown } from '@/types';
import { calculatePnl } from '@/lib/pnlCalculator';

const today = new Date().toISOString().split('T')[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

const t = (time: string, dateStr?: string) => `${dateStr || today}T${time}:00Z`;

function makePnl(
  resultType: 'direct_victory' | 'victory_at_gale' | 'loss',
  galeLevel: number
): PnlBreakdown {
  return calculatePnl({
    resultType, resultGaleLevel: galeLevel, baseAmount: 10,
    martingaleStrategy: 'dynamic', payoutRate: 0.88,
  });
}

export const mockSignals: Signal[] = [
  // === SESSION 4: 10:05-10:40 UTC (today) ===
  {
    id: 's-gbp-1040', asset: 'GBP/USD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('10:40'), timeframe: 'M5', martingaleLevel: 0, status: 'pending',
    createdAt: t('10:36'), isPremium: true, confidence: 82,
    martingaleSchedule: [{ level: 1, time: '10:45' }, { level: 2, time: '10:50' }],
  },
  {
    id: 's-aud-1030', asset: 'AUD/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('10:30'), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('10:28'), isPremium: true, confidence: 79,
    martingaleSchedule: [{ level: 1, time: '10:35' }, { level: 2, time: '10:40' }],
    resultType: 'direct_victory', resultGaleLevel: 0,
    resultTimestamp: `${today}T10:35:08Z`, resultRawText: 'DIRECT VICTORY 🤑✅',
    pnl: makePnl('direct_victory', 0),
  },
  {
    id: 's-nzd-1015', asset: 'NZD/USD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('10:15'), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: t('10:12'), isPremium: true, confidence: 76,
    martingaleSchedule: [{ level: 1, time: '10:20' }, { level: 2, time: '10:25' }],
    resultType: 'victory_at_gale', resultGaleLevel: 1,
    resultTimestamp: `${today}T10:25:12Z`, resultRawText: 'VICTORY AT GALE 🤑✅',
    pnl: makePnl('victory_at_gale', 1),
  },
  {
    id: 's-eur-1005', asset: 'EUR/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('10:05'), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('10:03'), isPremium: true, confidence: 85,
    martingaleSchedule: [{ level: 1, time: '10:10' }, { level: 2, time: '10:15' }],
    resultType: 'direct_victory', resultGaleLevel: 0,
    resultTimestamp: `${today}T10:10:05Z`, resultRawText: 'DIRECT VICTORY 🤑✅',
    pnl: makePnl('direct_victory', 0),
  },

  // === SESSION 3: 07:05-08:10 UTC (today) ===
  {
    id: 's-audnzd-0810', asset: 'AUD/NZD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('08:10'), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('08:06'), isPremium: true, confidence: 81,
    martingaleSchedule: [{ level: 1, time: '08:15' }, { level: 2, time: '08:20' }],
    resultType: 'direct_victory', resultGaleLevel: 0,
    resultTimestamp: `${today}T08:15:04Z`, resultRawText: 'DIRECT VICTORY 🤑✅',
    pnl: makePnl('direct_victory', 0),
  },
  {
    id: 's-audchf-0800', asset: 'AUD/CHF OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('08:00'), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('07:57'), isPremium: true, confidence: 84,
    martingaleSchedule: [{ level: 1, time: '08:05' }, { level: 2, time: '08:10' }],
    resultType: 'victory_at_gale', resultGaleLevel: 2,
    resultTimestamp: `${today}T08:15:18Z`, resultRawText: 'VICTORY AT GALE 🤑✅',
    pnl: makePnl('victory_at_gale', 2),
  },
  {
    id: 's-audcad-0745', asset: 'AUD/CAD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('07:45'), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: t('07:41'), isPremium: true, confidence: 77,
    martingaleSchedule: [{ level: 1, time: '07:50' }, { level: 2, time: '07:55' }],
    resultType: 'victory_at_gale', resultGaleLevel: 1,
    resultTimestamp: `${today}T07:55:09Z`, resultRawText: 'VICTORY AT GALE 🤑✅',
    pnl: makePnl('victory_at_gale', 1),
  },
  {
    id: 's-eur-0735', asset: 'EUR/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('07:35'), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('07:31'), isPremium: true, confidence: 83,
    martingaleSchedule: [{ level: 1, time: '07:40' }, { level: 2, time: '07:45' }],
    resultType: 'direct_victory', resultGaleLevel: 0,
    resultTimestamp: `${today}T07:40:06Z`, resultRawText: 'DIRECT VICTORY 🤑✅',
    pnl: makePnl('direct_victory', 0),
  },
  {
    id: 's-aud-0715', asset: 'AUD/USD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('07:15'), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: t('07:11'), isPremium: true, confidence: 78,
    martingaleSchedule: [{ level: 1, time: '07:20' }, { level: 2, time: '07:25' }],
    resultType: 'victory_at_gale', resultGaleLevel: 1,
    resultTimestamp: `${today}T07:25:14Z`, resultRawText: 'VICTORY AT GALE 🤑✅',
    pnl: makePnl('victory_at_gale', 1),
  },
  {
    id: 's-usdcad-0705', asset: 'USD/CAD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('07:05'), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('07:01'), isPremium: true, confidence: 86,
    martingaleSchedule: [{ level: 1, time: '07:10' }, { level: 2, time: '07:15' }],
    resultType: 'direct_victory', resultGaleLevel: 0,
    resultTimestamp: `${today}T07:10:03Z`, resultRawText: 'DIRECT VICTORY 🤑✅',
    pnl: makePnl('direct_victory', 0),
  },

  // === SESSION 2: 23:05-00:10 UTC (yesterday night) — 3 direct, 1 gale1, 1 gale2, 1 loss ===
  {
    id: 's-usdjpy-0010', asset: 'USD/JPY OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('00:10'), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: t('00:07'), isPremium: true, confidence: 74,
    martingaleSchedule: [{ level: 1, time: '00:15' }, { level: 2, time: '00:20' }],
    resultType: 'victory_at_gale', resultGaleLevel: 1,
    resultTimestamp: `${today}T00:20:07Z`, resultRawText: 'VICTORY AT GALE 🤑✅',
    pnl: makePnl('victory_at_gale', 1),
  },
  {
    id: 's-usdchf-2355', asset: 'USD/CHF OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('23:55', yesterday), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: t('23:52', yesterday), isPremium: true, confidence: 75,
    martingaleSchedule: [{ level: 1, time: '00:00' }, { level: 2, time: '00:05' }],
    resultType: 'victory_at_gale', resultGaleLevel: 2,
    resultTimestamp: `${today}T00:10:18Z`, resultRawText: 'VICTORY AT GALE 🤑✅',
    pnl: makePnl('victory_at_gale', 2),
  },
  {
    id: 's-gbp-2345', asset: 'GBP/USD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('23:45', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('23:41', yesterday), isPremium: true, confidence: 80,
    martingaleSchedule: [{ level: 1, time: '23:50' }, { level: 2, time: '23:55' }],
    resultType: 'direct_victory', resultGaleLevel: 0,
    resultTimestamp: `${yesterday}T23:50:05Z`, resultRawText: 'DIRECT VICTORY 🤑✅',
    pnl: makePnl('direct_victory', 0),
  },
  {
    id: 's-eur-2335', asset: 'EUR/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('23:35', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('23:32', yesterday), isPremium: true, confidence: 82,
    martingaleSchedule: [{ level: 1, time: '23:40' }, { level: 2, time: '23:45' }],
    resultType: 'direct_victory', resultGaleLevel: 0,
    resultTimestamp: `${yesterday}T23:40:09Z`, resultRawText: 'DIRECT VICTORY 🤑✅',
    pnl: makePnl('direct_victory', 0),
  },
  {
    id: 's-usdcad-2315', asset: 'USD/CAD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('23:15', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'loss', result: 'loss',
    createdAt: t('23:11', yesterday), isPremium: true, confidence: 71,
    martingaleSchedule: [{ level: 1, time: '23:20' }, { level: 2, time: '23:25' }],
    resultType: 'loss', resultGaleLevel: 2,
    resultTimestamp: `${yesterday}T23:30:22Z`, resultRawText: 'LOSS ❌',
    pnl: makePnl('loss', 2),
  },
  {
    id: 's-aud-2305', asset: 'AUD/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('23:05', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('23:02', yesterday), isPremium: true, confidence: 83,
    martingaleSchedule: [{ level: 1, time: '23:10' }, { level: 2, time: '23:15' }],
    resultType: 'direct_victory', resultGaleLevel: 0,
    resultTimestamp: `${yesterday}T23:10:04Z`, resultRawText: 'DIRECT VICTORY 🤑✅',
    pnl: makePnl('direct_victory', 0),
  },

  // === SESSION 1: 20:05-21:10 UTC (yesterday) — 3 direct, 2 gale1, 1 gale2 ===
  {
    id: 's-aud-2110', asset: 'AUD/USD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('21:10', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('21:07', yesterday), isPremium: false, confidence: 84,
    martingaleSchedule: [{ level: 1, time: '21:15' }, { level: 2, time: '21:20' }],
    resultType: 'direct_victory', resultGaleLevel: 0,
    resultTimestamp: `${yesterday}T21:15:06Z`, resultRawText: 'DIRECT VICTORY 🤑✅',
    pnl: makePnl('direct_victory', 0),
  },
  {
    id: 's-usdchf-2100', asset: 'USD/CHF OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('21:00', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('20:56', yesterday), isPremium: false, confidence: 81,
    martingaleSchedule: [{ level: 1, time: '21:05' }, { level: 2, time: '21:10' }],
    resultType: 'direct_victory', resultGaleLevel: 0,
    resultTimestamp: `${yesterday}T21:05:08Z`, resultRawText: 'DIRECT VICTORY 🤑✅',
    pnl: makePnl('direct_victory', 0),
  },
  {
    id: 's-usdjpy-2040', asset: 'USD/JPY OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('20:40', yesterday), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: t('20:37', yesterday), isPremium: false, confidence: 76,
    martingaleSchedule: [{ level: 1, time: '20:45' }, { level: 2, time: '20:50' }],
    resultType: 'victory_at_gale', resultGaleLevel: 1,
    resultTimestamp: `${yesterday}T20:50:11Z`, resultRawText: 'VICTORY AT GALE 🤑✅',
    pnl: makePnl('victory_at_gale', 1),
  },
  {
    id: 's-eurchf-2025', asset: 'EUR/CHF OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('20:25', yesterday), timeframe: 'M5', martingaleLevel: 1, status: 'win', result: 'win',
    createdAt: t('20:21', yesterday), isPremium: false, confidence: 78,
    martingaleSchedule: [{ level: 1, time: '20:30' }, { level: 2, time: '20:35' }],
    resultType: 'victory_at_gale', resultGaleLevel: 2,
    resultTimestamp: `${yesterday}T20:40:15Z`, resultRawText: 'VICTORY AT GALE 🤑✅',
    pnl: makePnl('victory_at_gale', 2),
  },
  {
    id: 's-gbp-2015', asset: 'GBP/USD OTC', direction: 'CALL', signalType: 'scheduled',
    entryTime: t('20:15', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('20:11', yesterday), isPremium: false, confidence: 85,
    martingaleSchedule: [{ level: 1, time: '20:20' }, { level: 2, time: '20:25' }],
    resultType: 'direct_victory', resultGaleLevel: 0,
    resultTimestamp: `${yesterday}T20:20:04Z`, resultRawText: 'DIRECT VICTORY 🤑✅',
    pnl: makePnl('direct_victory', 0),
  },
  {
    id: 's-eur-2005', asset: 'EUR/USD OTC', direction: 'PUT', signalType: 'scheduled',
    entryTime: t('20:05', yesterday), timeframe: 'M5', martingaleLevel: 0, status: 'win', result: 'win',
    createdAt: t('20:02', yesterday), isPremium: false, confidence: 82,
    martingaleSchedule: [{ level: 1, time: '20:10' }, { level: 2, time: '20:15' }],
    resultType: 'victory_at_gale', resultGaleLevel: 1,
    resultTimestamp: `${yesterday}T20:15:13Z`, resultRawText: 'VICTORY AT GALE 🤑✅',
    pnl: makePnl('victory_at_gale', 1),
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
  const confidence = Math.floor(Math.random() * 20) + 72;

  const now = new Date();
  const entryMinutes = Math.floor(Math.random() * 8) + 2;
  const entryTime = new Date(now.getTime() + entryMinutes * 60000);
  const fmt = (d: Date) => `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;

  const g1Time = new Date(entryTime.getTime() + 5 * 60000);
  const g2Time = new Date(entryTime.getTime() + 10 * 60000);

  return {
    id: `s${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    asset, direction: direction as Signal['direction'], signalType: 'scheduled',
    entryTime: entryTime.toISOString(), timeframe: 'M5', martingaleLevel: 0,
    status: 'pending', createdAt: new Date().toISOString(),
    isPremium: Math.random() > 0.3, confidence,
    martingaleSchedule: [
      { level: 1, time: fmt(g1Time) },
      { level: 2, time: fmt(g2Time) },
    ],
  };
}