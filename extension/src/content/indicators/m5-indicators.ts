/**
 * Lightweight M5 indicator calculator.
 * Computes RSI, MACD, and SMA from raw M5 candle data
 * without touching the main setup-detector state.
 */

interface Candle {
  o: number; h: number; l: number; c: number; t: number;
}

export interface M5Indicators {
  rsi: number | null;
  macdHistogram: number | null;
  histogramRising: boolean;
  sma20: number | null;
  trend: 'up' | 'down' | 'flat';
}

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i]! * k + result[i - 1]! * (1 - k));
  }
  return result;
}

function computeRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeMACD(closes: number[]): { histogram: number; rising: boolean } | null {
  if (closes.length < 26) return null;
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(ema12[i]! - ema26[i]!);
  }
  const signal = ema(macdLine.slice(26 - 1), 9);
  if (signal.length < 2) return null;
  const macdTail = macdLine.slice(26 - 1);
  const hist = macdTail[macdTail.length - 1]! - signal[signal.length - 1]!;
  const prevHist = macdTail[macdTail.length - 2]! - signal[signal.length - 2]!;
  return { histogram: hist, rising: hist > prevHist };
}

export function computeM5Indicators(candles: Candle[]): M5Indicators {
  const closes = candles.map(c => c.c);

  const rsi = computeRSI(closes);

  const macd = computeMACD(closes);

  const sma20 = closes.length >= 20
    ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20
    : null;

  const lastPrice = closes.length > 0 ? closes[closes.length - 1]! : 0;
  const trend: 'up' | 'down' | 'flat' = sma20 !== null
    ? (lastPrice > sma20 ? 'up' : lastPrice < sma20 ? 'down' : 'flat')
    : 'flat';

  return {
    rsi: rsi !== null ? Math.round(rsi * 10) / 10 : null,
    macdHistogram: macd?.histogram ?? null,
    histogramRising: macd?.rising ?? false,
    sma20,
    trend,
  };
}
