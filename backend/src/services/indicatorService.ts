/**
 * Indicator Service — Server-side technical indicator calculation.
 * Receives candle snapshots from extension, calculates indicators,
 * detects setups, and generates signals.
 */
import { Indicators } from "@ixjb94/indicators/dist/index.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

interface CandleSnapshot {
  o: number;
  h: number;
  l: number;
  c: number;
  t: number;
}

interface AssetSnapshot {
  symbol: string;
  candlesM1: CandleSnapshot[];
  candlesM5: CandleSnapshot[];
  price: number;
}

interface SetupResult {
  symbol: string;
  direction: "CALL" | "PUT" | null;
  confidence: number;
  setups: string[];
  m5Trend: string;
}

interface AnalysisResult {
  analyzed: number;
  signals: number;
  results: SetupResult[];
}

// Stateful: track per-symbol indicator state to avoid re-calculating from scratch
const symbolStates = new Map<string, { lastAnalyzed: number; lastSignalTime: number }>();

const SIGNAL_COOLDOWN_MS = 120000; // 2 minutes between signals for same symbol
const ST_INDICATORS_CHANNEL_ID = "38af0b2a-2b93-4dee-abf4-e9ce46ed2b7d";

async function calculateIndicators(candles: CandleSnapshot[]): Promise<{
  rsi: number[];
  macd: { macd: number[]; signal: number[]; histogram: number[] };
  sma20: number[];
  sma80: number[];
  bb: { upper: number[]; middle: number[]; lower: number[] };
  alligator: { jaw: number[]; teeth: number[]; lips: number[] };
}> {
  const closes = candles.map(c => c.c);
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);

  const ind = new Indicators();

  const [rsi, macdResult, sma20, sma80, bbResult] = await Promise.all([
    ind.rsi(closes, 14),
    ind.macd(closes, 12, 26, 9),
    ind.sma(closes, 20),
    ind.sma(closes, 80),
    ind.bbands(closes, 20, 2),
  ]);

  // Alligator: SMA(13), SMA(8), SMA(5) on median price
  const medianPrices = candles.map(c => (c.h + c.l) / 2);
  const [jaw, teeth, lips] = await Promise.all([
    ind.sma(medianPrices, 13),
    ind.sma(medianPrices, 8),
    ind.sma(medianPrices, 5),
  ]);

  return {
    rsi: Array.from(rsi),
    macd: {
      macd: Array.from(macdResult[0] || []),
      signal: Array.from(macdResult[1] || []),
      histogram: Array.from(macdResult[2] || []),
    },
    sma20: Array.from(sma20),
    sma80: Array.from(sma80),
    bb: {
      upper: Array.from(bbResult[2] || []),
      middle: Array.from(bbResult[1] || []),
      lower: Array.from(bbResult[0] || []),
    },
    alligator: {
      jaw: Array.from(jaw),
      teeth: Array.from(teeth),
      lips: Array.from(lips),
    },
  };
}

function detectSetups(
  candles: CandleSnapshot[],
  indicators: Awaited<ReturnType<typeof calculateIndicators>>,
  m5Trend: string
): { direction: "CALL" | "PUT" | null; confidence: number; setups: string[] } {
  const len = candles.length;
  if (len < 5) return { direction: null, confidence: 0, setups: [] };

  const lastIdx = len - 1;
  const prevIdx = len - 2;
  const price = candles[lastIdx]!.c;

  const rsi = indicators.rsi;
  const macd = indicators.macd;
  const sma20 = indicators.sma20;
  const sma80 = indicators.sma80;

  const currentRsi = rsi[rsi.length - 1] ?? 50;
  const prevRsi = rsi[rsi.length - 2] ?? 50;
  const currentMacd = macd.macd[macd.macd.length - 1] ?? 0;
  const currentSignal = macd.signal[macd.signal.length - 1] ?? 0;
  const prevMacd = macd.macd[macd.macd.length - 2] ?? 0;
  const prevSignal = macd.signal[macd.signal.length - 2] ?? 0;
  const currentSma20 = sma20[sma20.length - 1] ?? price;
  const currentSma80 = sma80.length > 0 && !isNaN(sma80[sma80.length - 1]) ? sma80[sma80.length - 1] : currentSma20;

  const setups: string[] = [];
  let bullScore = 0;
  let bearScore = 0;

  // RSI Reversal
  if (prevRsi < 30 && currentRsi > 30) { setups.push("rsi_reversal"); bullScore += 35; }
  if (prevRsi > 70 && currentRsi < 70) { setups.push("rsi_reversal"); bearScore += 35; }

  // MACD Cross
  if (prevMacd <= prevSignal && currentMacd > currentSignal) { setups.push("macd_cross"); bullScore += 35; }
  if (prevMacd >= prevSignal && currentMacd < currentSignal) { setups.push("macd_cross"); bearScore += 35; }

  // MA Trend
  if (price > currentSma20 && currentSma20 > currentSma80) { setups.push("ma_trend"); bullScore += 25; }
  if (price < currentSma20 && currentSma20 < currentSma80) { setups.push("ma_trend"); bearScore += 25; }

  // BB Squeeze
  const bbUpper = indicators.bb.upper[indicators.bb.upper.length - 1] ?? 0;
  const bbLower = indicators.bb.lower[indicators.bb.lower.length - 1] ?? 0;
  const bbWidth = bbUpper - bbLower;
  const avgPrice = (bbUpper + bbLower) / 2;
  if (bbWidth > 0 && bbWidth / avgPrice < 0.005) {
    setups.push("bb_squeeze");
    if (price > avgPrice) bullScore += 30;
    else bearScore += 30;
  }

  // Trend Confirmation (composite)
  const alligatorBull = indicators.alligator.lips[indicators.alligator.lips.length - 1]! >
    indicators.alligator.teeth[indicators.alligator.teeth.length - 1]! &&
    indicators.alligator.teeth[indicators.alligator.teeth.length - 1]! >
    indicators.alligator.jaw[indicators.alligator.jaw.length - 1]!;
  const alligatorBear = indicators.alligator.lips[indicators.alligator.lips.length - 1]! <
    indicators.alligator.teeth[indicators.alligator.teeth.length - 1]! &&
    indicators.alligator.teeth[indicators.alligator.teeth.length - 1]! <
    indicators.alligator.jaw[indicators.alligator.jaw.length - 1]!;

  if (currentRsi > 50 && currentMacd > currentSignal && price > currentSma80 && alligatorBull) {
    setups.push("trend_confirm");
    bullScore += 15;
  }
  if (currentRsi < 50 && currentMacd < currentSignal && price < currentSma80 && alligatorBear) {
    setups.push("trend_confirm");
    bearScore += 15;
  }

  // M5 trend alignment bonus
  if (m5Trend === "bullish" && bullScore > bearScore) bullScore += 15;
  if (m5Trend === "bearish" && bearScore > bullScore) bearScore += 15;

  const confidence = Math.max(bullScore, bearScore);
  const direction = bullScore > bearScore ? "CALL" : bearScore > bullScore ? "PUT" : null;

  return { direction, confidence, setups };
}

function getM5Trend(candles: CandleSnapshot[]): string {
  if (candles.length < 5) return "neutral";
  const last5 = candles.slice(-5);
  const firstClose = last5[0]!.c;
  const lastClose = last5[last5.length - 1]!.c;
  const change = (lastClose - firstClose) / firstClose;
  if (change > 0.001) return "bullish";
  if (change < -0.001) return "bearish";
  return "neutral";
}

export async function analyzeMarketData(
  snapshots: AssetSnapshot[],
  userId?: string
): Promise<AnalysisResult> {
  const results: SetupResult[] = [];
  let signalCount = 0;

  for (const snapshot of snapshots) {
    try {
      if (snapshot.candlesM1.length < 20) continue;

      const indicators = await calculateIndicators(snapshot.candlesM1);
      const m5Trend = getM5Trend(snapshot.candlesM5);
      const setup = detectSetups(snapshot.candlesM1, indicators, m5Trend);
      if (setup.confidence >= 40) logger.info({ symbol: snapshot.symbol, direction: setup.direction, confidence: setup.confidence, setups: setup.setups, m5Trend }, "Backend setup detected");

      results.push({
        symbol: snapshot.symbol,
        direction: setup.direction,
                entryTimeUtc: new Date(),
        confidence: setup.confidence,
        setups: setup.setups,
        m5Trend,
      });

      // Generate signal if confidence >= 65%
      if (setup.direction && setup.confidence >= 65) {
        const state = symbolStates.get(snapshot.symbol);
        const now = Date.now();

        if (!state || now - state.lastSignalTime > SIGNAL_COOLDOWN_MS) {
          symbolStates.set(snapshot.symbol, { lastAnalyzed: now, lastSignalTime: now });

          try {
            await prisma.signal.create({
              data: {
                id: `ind_${snapshot.symbol}_${Date.now()}`,
                asset: snapshot.symbol.replace("_otc", " OTC").replace(/([a-z])([A-Z])/g, "$1/$2"),
                direction: setup.direction,
                entryTimeUtc: new Date(),
                expirationMinutes: 5,
                status: "active",
                visibility: "premium",
                channelId: ST_INDICATORS_CHANNEL_ID,
                rawText: `indicator_engine|${setup.confidence}|${setup.setups.join(",")}|${m5Trend}`,
              },
            });
            signalCount++;
            logger.info({ symbol: snapshot.symbol, direction: setup.direction,
                entryTimeUtc: new Date(), confidence: setup.confidence },
              "Indicator signal generated");
          } catch (err) {
            logger.error({ err, symbol: snapshot.symbol }, "Failed to create indicator signal");
          }
        }
      }
    } catch (err) {
      logger.error({ err, symbol: snapshot.symbol }, "Indicator analysis error");
    }
  }

  return { analyzed: results.length, signals: signalCount, results };
}
