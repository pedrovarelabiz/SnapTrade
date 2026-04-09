/**
 * Indicator Engine v2 — Async calculation using @ixjb94/indicators.
 * All methods are async (library returns Promises).
 */

// Import pre-compiled JS to avoid TS compilation issues with library source
// @ts-ignore
import { Indicators } from '@ixjb94/indicators/dist/index.js';
import type { Candle, Timeframe } from './candle-collector';
import { getCandles } from './candle-collector';

// Types
export interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  enabled: boolean;
  params: Record<string, number>;
  overlay: boolean;
  color: string;
  secondaryColor?: string;
  tertiaryColor?: string;
}

export type IndicatorType =
  | 'sma' | 'ema' | 'wma' | 'dema' | 'tema' | 'smma'
  | 'alligator' | 'supertrend' | 'parabolic_sar'
  | 'bollinger_bands' | 'keltner_channel' | 'donchian_channel'
  | 'atr' | 'rsi' | 'macd' | 'stochastic' | 'cci' | 'momentum'
  | 'williams_r' | 'roc' | 'awesome_oscillator' | 'adx';

export interface IndicatorValue {
  time: number;
  value: number;
  secondary?: number;
  tertiary?: number;
  histogram?: number;
}

export interface IndicatorResult {
  config: IndicatorConfig;
  values: IndicatorValue[];
  currentValue: number | null;
  label: string;
  direction: 'bullish' | 'bearish' | 'neutral';
}

export const INDICATOR_DEFAULTS: Record<string, Omit<IndicatorConfig, 'id' | 'enabled'>> = {
  sma: { type: 'sma', params: { period: 20 }, overlay: true, color: '#2196F3' },
  ema: { type: 'ema', params: { period: 20 }, overlay: true, color: '#FF9800' },
  wma: { type: 'wma', params: { period: 20 }, overlay: true, color: '#9C27B0' },
  dema: { type: 'dema', params: { period: 20 }, overlay: true, color: '#00BCD4' },
  tema: { type: 'tema', params: { period: 20 }, overlay: true, color: '#E91E63' },
  smma: { type: 'smma', params: { period: 20 }, overlay: true, color: '#607D8B' },
  alligator: { type: 'alligator', params: { jaw: 13, teeth: 8, lips: 5 }, overlay: true, color: '#2196F3', secondaryColor: '#F44336', tertiaryColor: '#4CAF50' },
  supertrend: { type: 'supertrend', params: { period: 10, multiplier: 3 }, overlay: true, color: '#4CAF50' },
  parabolic_sar: { type: 'parabolic_sar', params: { step: 2, max: 20 }, overlay: true, color: '#FF5722' },
  bollinger_bands: { type: 'bollinger_bands', params: { period: 20, stdDev: 2 }, overlay: true, color: '#7C4DFF' },
  keltner_channel: { type: 'keltner_channel', params: { period: 20, multiplier: 2 }, overlay: true, color: '#00BCD4' },
  donchian_channel: { type: 'donchian_channel', params: { period: 20 }, overlay: true, color: '#FF9800' },
  atr: { type: 'atr', params: { period: 14 }, overlay: false, color: '#795548' },
  rsi: { type: 'rsi', params: { period: 14 }, overlay: false, color: '#E040FB' },
  macd: { type: 'macd', params: { fast: 12, slow: 26, signal: 9 }, overlay: false, color: '#2196F3', secondaryColor: '#FF5722' },
  stochastic: { type: 'stochastic', params: { k: 14, d: 3, smooth: 3 }, overlay: false, color: '#4CAF50', secondaryColor: '#F44336' },
  cci: { type: 'cci', params: { period: 20 }, overlay: false, color: '#FF9800' },
  momentum: { type: 'momentum', params: { period: 10 }, overlay: false, color: '#2196F3' },
  williams_r: { type: 'williams_r', params: { period: 14 }, overlay: false, color: '#9C27B0' },
  roc: { type: 'roc', params: { period: 12 }, overlay: false, color: '#00BCD4' },
  awesome_oscillator: { type: 'awesome_oscillator', params: { fast: 5, slow: 34 }, overlay: false, color: '#4CAF50' },
  adx: { type: 'adx', params: { period: 14 }, overlay: false, color: '#FF9800' },
};

const ind: any = new Indicators();

// Helper: map result array to IndicatorValue[], filtering NaN
function mapValues(r: number[], times: number[], totalLen: number): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  for (let i = 0; i < r.length; i++) {
    if (typeof r[i] === 'number' && !isNaN(r[i]!)) {
      result.push({ time: times[i + totalLen - r.length] ?? 0, value: r[i]! });
    }
  }
  return result;
}

function dirFromPrice(lastPrice: number, lastInd: number): 'bullish' | 'bearish' | 'neutral' {
  return lastPrice > lastInd ? 'bullish' : lastPrice < lastInd ? 'bearish' : 'neutral';
}

export async function calculateIndicator(config: IndicatorConfig, candles: Candle[]): Promise<IndicatorResult> {
  const c = candles.map(cd => cd.close);
  const h = candles.map(cd => cd.high);
  const l = candles.map(cd => cd.low);
  const t = candles.map(cd => cd.time);
  const n = c.length;

  let values: IndicatorValue[] = [];
  let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let label = config.type.toUpperCase();

  try {
    switch (config.type) {
      case 'sma': case 'ema': case 'wma': case 'dema': case 'tema': case 'smma': {
        const methodName = config.type === 'smma' ? 'wilders' : config.type;
        const fn = (ind as any)[methodName].bind(ind);
        const r = await fn(c, config.params.period);
        values = mapValues(r, t, n);
        label = `${config.type.toUpperCase()}(${config.params.period})`;
        if (values.length > 0) direction = dirFromPrice(c[n - 1]!, values[values.length - 1]!.value);
        break;
      }

      case 'rsi': {
        const r = await ind.rsi(c, config.params.period);
        values = mapValues(r, t, n);
        label = `RSI(${config.params.period})`;
        if (values.length > 0) {
          const v = values[values.length - 1]!.value;
          direction = v > 50 ? 'bullish' : v < 50 ? 'bearish' : 'neutral';
        }
        break;
      }

      case 'macd': {
        const macdResult = await ind.macd(c, config.params.fast, config.params.slow, config.params.signal);
        const [macdL, signalL, histL] = macdResult;
        const len = Math.min(macdL.length, signalL.length, histL.length);
        values = [];
        for (let i = 0; i < len; i++) {
          const mv = macdL[macdL.length - len + i]!;
          const sv = signalL[signalL.length - len + i]!;
          const hv = histL[histL.length - len + i]!;
          if (isNaN(mv) || isNaN(sv) || isNaN(hv)) continue;
          values.push({
            time: t[n - len + i] ?? 0,
            value: mv,
            secondary: sv,
            histogram: hv,
          });
        }
        label = `MACD(${config.params.fast},${config.params.slow},${config.params.signal})`;
        if (values.length > 0) direction = (values[values.length - 1]!.histogram ?? 0) > 0 ? 'bullish' : 'bearish';
        break;
      }

      case 'bollinger_bands': {
        const bands = await ind.bbands(c, config.params.period, config.params.stdDev);
        const [lower, mid, upper] = bands; // bbands returns [lower, mid, upper]
        const len = Math.min(upper.length, lower.length, mid.length);
        values = [];
        for (let i = 0; i < len; i++) {
          values.push({
            time: t[n - len + i] ?? 0,
            value: mid[mid.length - len + i]!,
            secondary: upper[upper.length - len + i]!,
            tertiary: lower[lower.length - len + i]!,
          });
        }
        label = `BB(${config.params.period},${config.params.stdDev})`;
        if (values.length > 0) direction = dirFromPrice(c[n - 1]!, values[values.length - 1]!.value);
        break;
      }

      case 'stochastic': {
        const r = await ind.stoch(h, l, c, config.params.k, config.params.d, config.params.smooth);
        values = mapValues(r, t, n);
        label = `Stoch(${config.params.k},${config.params.d})`;
        if (values.length > 0) direction = values[values.length - 1]!.value > 50 ? 'bullish' : 'bearish';
        break;
      }

      case 'atr': {
        const r = await ind.atr(h, l, c, config.params.period);
        values = mapValues(r, t, n);
        label = `ATR(${config.params.period})`;
        break;
      }

      case 'cci': {
        const r = await ind.cci(h, l, c, config.params.period);
        values = mapValues(r, t, n);
        label = `CCI(${config.params.period})`;
        if (values.length > 0) direction = values[values.length - 1]!.value > 0 ? 'bullish' : 'bearish';
        break;
      }

      case 'momentum': {
        const r = await ind.mom(c, config.params.period);
        values = mapValues(r, t, n);
        label = `MOM(${config.params.period})`;
        if (values.length > 0) direction = values[values.length - 1]!.value > 0 ? 'bullish' : 'bearish';
        break;
      }

      case 'williams_r': {
        const r = await ind.willr(h, l, c, config.params.period);
        values = mapValues(r, t, n);
        label = `WillR(${config.params.period})`;
        if (values.length > 0) direction = values[values.length - 1]!.value > -50 ? 'bullish' : 'bearish';
        break;
      }

      case 'roc': {
        const r = await ind.roc(c, config.params.period);
        values = mapValues(r, t, n);
        label = `ROC(${config.params.period})`;
        if (values.length > 0) direction = values[values.length - 1]!.value > 0 ? 'bullish' : 'bearish';
        break;
      }

      case 'adx': {
        const r = await ind.adx(h, l, c, config.params.period);
        values = mapValues(r, t, n);
        label = `ADX(${config.params.period})`;
        break;
      }

      case 'alligator': {
        const [jaw, teeth, lips] = await Promise.all([
          ind.wilders(c, config.params.jaw),
          ind.wilders(c, config.params.teeth),
          ind.wilders(c, config.params.lips),
        ]);
        const len = Math.min(jaw.length, teeth.length, lips.length);
        values = [];
        for (let i = 0; i < len; i++) {
          values.push({
            time: t[n - len + i] ?? 0,
            value: jaw[jaw.length - len + i]!,
            secondary: teeth[teeth.length - len + i]!,
            tertiary: lips[lips.length - len + i]!,
          });
        }
        label = `Alligator(${config.params.jaw},${config.params.teeth},${config.params.lips})`;
        if (values.length > 0) {
          const last = values[values.length - 1]!;
          const bullish = (last.tertiary ?? 0) > (last.secondary ?? 0) && (last.secondary ?? 0) > last.value;
          const bearish = (last.tertiary ?? 0) < (last.secondary ?? 0) && (last.secondary ?? 0) < last.value;
          direction = bullish ? 'bullish' : bearish ? 'bearish' : 'neutral';
        }
        break;
      }

      case 'donchian_channel': {
        const period = config.params.period;
        values = [];
        for (let i = period - 1; i < n; i++) {
          const slice = candles.slice(i - period + 1, i + 1);
          const upper = Math.max(...slice.map(cd => cd.high));
          const lower = Math.min(...slice.map(cd => cd.low));
          values.push({ time: candles[i]!.time, value: (upper + lower) / 2, secondary: upper, tertiary: lower });
        }
        label = `Donchian(${period})`;
        if (values.length > 0) direction = dirFromPrice(c[n - 1]!, values[values.length - 1]!.value);
        break;
      }

      case 'keltner_channel': {
        const [emaR, atrR] = await Promise.all([
          ind.ema(c, config.params.period),
          ind.atr(h, l, c, config.params.period),
        ]);
        const len = Math.min(emaR.length, atrR.length);
        values = [];
        for (let i = 0; i < len; i++) {
          const e = emaR[emaR.length - len + i]!;
          const a = atrR[atrR.length - len + i]!;
          values.push({ time: t[n - len + i] ?? 0, value: e, secondary: e + a * config.params.multiplier, tertiary: e - a * config.params.multiplier });
        }
        label = `Keltner(${config.params.period},${config.params.multiplier})`;
        if (values.length > 0) direction = dirFromPrice(c[n - 1]!, values[values.length - 1]!.value);
        break;
      }

      case 'awesome_oscillator': {
        const [fastSma, slowSma] = await Promise.all([
          ind.sma(candles.map(cd => (cd.high + cd.low) / 2), config.params.fast),
          ind.sma(candles.map(cd => (cd.high + cd.low) / 2), config.params.slow),
        ]);
        const len = Math.min(fastSma.length, slowSma.length);
        values = [];
        for (let i = 0; i < len; i++) {
          const v = fastSma[fastSma.length - len + i]! - slowSma[slowSma.length - len + i]!;
          values.push({ time: t[n - len + i] ?? 0, value: v });
        }
        label = `AO(${config.params.fast},${config.params.slow})`;
        if (values.length > 0) direction = values[values.length - 1]!.value > 0 ? 'bullish' : 'bearish';
        break;
      }
    }
  } catch { /* calculation failed — return empty */ }

  return {
    config, values, label, direction,
    currentValue: values.length > 0 ? values[values.length - 1]!.value : null,
  };
}

export async function calculateAll(configs: IndicatorConfig[], symbol: string, timeframe: Timeframe): Promise<IndicatorResult[]> {
  const candles = getCandles(symbol, timeframe);
  if (candles.length < 5) return [];
  const enabled = configs.filter(cfg => cfg.enabled);
  return Promise.all(enabled.map(cfg => calculateIndicator(cfg, candles)));
}

export function checkConcordance(
  results: IndicatorResult[],
  requiredDirection: 'bullish' | 'bearish',
  mode: 'all' | 'majority' | 'weighted',
  minScore: number,
): { pass: boolean; score: number; agreeing: string[]; disagreeing: string[] } {
  const agreeing: string[] = [];
  const disagreeing: string[] = [];
  for (const r of results) {
    if (r.direction === 'neutral') continue;
    (r.direction === requiredDirection ? agreeing : disagreeing).push(r.label);
  }
  const total = agreeing.length + disagreeing.length;
  if (total === 0) return { pass: true, score: 100, agreeing, disagreeing };
  const score = Math.round((agreeing.length / total) * 100);
  return { pass: mode === 'all' ? disagreeing.length === 0 : score >= minScore, score, agreeing, disagreeing };
}
