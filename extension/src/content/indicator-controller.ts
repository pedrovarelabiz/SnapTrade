import type { ExtensionSettings, Signal } from '../types';
import { state, openTradeAssets, normalizeAssetForGuard, sendToBackground } from './content-state';
import { getMarketState, filterByMarketHours, isLiveForexPair } from '../lib/market-hours';
import { initCandleCollector } from './indicators/candle-collector';
import { startCandleWatcher, setWatchSymbol, onCandleClose, stopCandleWatcher } from './indicators/candle-watcher';
import { analyzeOnCandleClose, getAggregatedSetup, getAggregatedSetupM5, getDisplayState, getAllSymbolSummaries, getTrackedSymbolCount, registerM5Signal, getPendingM5Signal, checkM1Alignment, type SetupType } from './indicators/setup-detector';
import { validateSignalWithSetups } from './indicators/indicator-validator';
import { initChartOverlay, updateSetupDisplay, destroyChartOverlay } from './indicators/chart-overlay';
import { analyzeWithLlm, batchAnalyze, getLastAnalysis, logAiPrediction, logAiFeedback, type LlmAnalysis, type AnalystConfig, type BatchCandidate } from './indicators/llm-analyst';
import { getCandles, type Timeframe } from './indicators/candle-collector';
import { computeM5Indicators } from './indicators/m5-indicators';
import { uploadMarketData } from './indicators/data-uploader';
import { shadowRegister, shadowOnCandleClose, shadowUpdateActualResult, getShadowStats, shadowFlush } from './indicators/shadow-tracker';
import { initRelayPublisher, publishSignalApproved, publishSignalRaw, publishTradeResult, publishPairSummaries, publishShadowStats } from './indicators/relay-publisher';
import { labOnCandleClose, logTopStrategies, labFlush, refreshStrategies } from './indicators/strategy-lab';
import { startStrategyPolling, initStrategyLoader, onStrategiesChanged } from './indicators/strategy-loader';
import { buildPriceActionContext } from './indicators/price-action';
import { computeExtraIndicators } from './indicators/extra-indicators';
import { initLabMonitor, updateLabMonitor, destroyLabMonitor } from './indicators/lab-monitor';
import { regimeRecordVolatility, initRegimeDetector } from './indicators/regime-detector';
import { sentinelOnCandleClose } from './indicators/sentinel-engine';
import { computeLabIndicators } from './indicators/lab-indicators';
import { startEvolutionScheduler, stopEvolutionScheduler } from './indicators/strategy-evolution';
import { startStatsUploader, stopStatsUploader } from './indicators/stats-uploader';

// ---------------------------------------------------------------------------
// Indicator engine state
// ---------------------------------------------------------------------------

let indicatorInterval: ReturnType<typeof setInterval> | null = null;
let discoveredPairs: string[] = [];
export let lastSubscribedHash = '';
export let chartRotationComplete = false;
let lastMarketOpen: boolean | null = null;

export function setLastSubscribedHash(v: string): void { lastSubscribedHash = v; }
export function setChartRotationComplete(v: boolean): void { chartRotationComplete = v; }

// ---------------------------------------------------------------------------
// Market hours re-evaluation (every 60s)
// ---------------------------------------------------------------------------

export function initMarketHoursCheck(): void {
  setInterval(() => {
    const market = getMarketState();
    if (lastMarketOpen !== null && market.forexOpen !== lastMarketOpen) {
      console.log(`[SnapTrade] Market ${market.forexOpen ? 'OPENED' : 'CLOSED'} — re-evaluating pairs`);
      lastSubscribedHash = '';
      if (state.settings) subscribeMonitoredPairs(state.settings);
    }
    lastMarketOpen = market.forexOpen;
  }, 60_000);
}

// ---------------------------------------------------------------------------
// Asset discovery & payout listeners
// ---------------------------------------------------------------------------

export function initIndicatorListeners(): void {
  // Re-subscribe when payout data arrives
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'ST_WS_ASSETS') return;
    if (state.settings && state.bridge.getPayoutCacheSize() > 0) {
      subscribeMonitoredPairs(state.settings);
    }
  });

  // Listen for auto-discovered OTC pairs
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'ST_DISCOVERED_ASSETS') {
      const pairs: string[] = event.data.pairs || [];
      if (pairs.length > 0) {
        discoveredPairs = pairs;
        chrome.storage.local.set({ discoveredOtcPairs: pairs }).catch(() => {});
        console.log(`[SnapTrade] Discovered ${pairs.length} OTC pairs (${event.data.source})`);
        if (state.settings) {
          subscribeMonitoredPairs(state.settings);
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Pair subscription
// ---------------------------------------------------------------------------

export function subscribeMonitoredPairs(settings: ExtensionSettings): void {
  const cfg = settings.indicatorValidation;
  let pairs = cfg?.monitoredPairs ?? [];

  if (pairs.length === 0 && cfg?.enabled && discoveredPairs.length > 0) {
    pairs = discoveredPairs;
  }

  const bridgePairs = state.bridge.getTradeablePairs(0);
  if (bridgePairs.length > 0) {
    const market = getMarketState();
    const dynamicPairs = bridgePairs
      .filter(p => p.category === 'otc_forex' || p.category === 'otc_crypto' ||
        (market.forexOpen && (p.category === 'live_forex' || p.category === 'live_crypto')))
      .map(p => p.symbol);

    const mergedSet = new Set([...pairs, ...dynamicPairs]);
    const merged = [...mergedSet];

    if (merged.length !== pairs.length) {
      const otcForex = dynamicPairs.filter(p => p.includes('_otc') && !(/^(BTC|ETH|SOL|ADA|BNB|DOGE|DOT|LTC|MATIC|LINK|AVAX|TON|TRX|BITB)/i.test(p)));
      const otcCrypto = dynamicPairs.filter(p => p.includes('_otc') && (/^(BTC|ETH|SOL|ADA|BNB|DOGE|DOT|LTC|MATIC|LINK|AVAX|TON|TRX|BITB)/i.test(p)));
      const liveFx = dynamicPairs.filter(p => !p.includes('_otc'));
      console.log(`[SnapTrade] Dynamic pairs: ${otcForex.length} OTC forex, ${otcCrypto.length} OTC crypto, ${liveFx.length} live forex | market ${market.forexOpen ? 'OPEN' : 'CLOSED'}`);
    }

    pairs = merged;
  }

  const market = getMarketState();
  if (!market.forexOpen) {
    pairs = pairs.filter(p => !isLiveForexPair(p));
  }

  if (pairs.length === 0) return;

  const hash = [...pairs].sort().join(',');
  if (hash === lastSubscribedHash) return;
  lastSubscribedHash = hash;

  window.postMessage({ type: 'ST_SUBSCRIBE_ASSETS', assets: pairs }, '*');
  chrome.storage.local.set({ activePairs: pairs, activePayouts: bridgePairs }).catch(() => {});
  console.log(`[SnapTrade] Subscribing to ${pairs.length} pairs`);

  if (!chartRotationComplete) {
    setTimeout(() => {
      console.log('[SnapTrade] Starting chart rotation to equalize candle data...');
      window.postMessage({ type: 'ST_START_ROTATION', assets: pairs }, '*');
    }, 15_000);
  }
}

// ---------------------------------------------------------------------------
// Main indicator settings handler
// ---------------------------------------------------------------------------

export function handleIndicatorSettingsChange(settings: ExtensionSettings): void {
  const cfg = settings.indicatorValidation;
  const shouldRun = !!(cfg?.enabled && cfg.enabledSetups?.length > 0);

  subscribeMonitoredPairs(settings);
  window.postMessage({ type: 'ST_DISCOVER_ASSETS' }, '*');

  if (shouldRun && !indicatorInterval) {
    console.log('[SnapTrade] Starting setup detection engine...');
    stopCandleWatcher();
    if (cfg?.showOverlay) initChartOverlay();
    initLabMonitor();
    initRegimeDetector();
    onStrategiesChanged(() => refreshStrategies());
    initStrategyLoader().then(() => {
      refreshStrategies();
      startStrategyPolling();
      startEvolutionScheduler();
      startStatsUploader();
    });

    const enabledSetups = cfg!.enabledSetups as SetupType[];
    const minConfidence = cfg!.autoTradeMinConfidence ?? 50;

    const rawAsset = state.bridge.getCurrentAsset();
    const symbol = rawAsset?.replace(/[\s/]/g, '').replace(/OTC/i, '_otc') ?? 'unknown';
    startCandleWatcher(symbol, ['M1', 'M5']);

    let closeCount = 0;
    let lastCloseSummary = 0;
    const recentSignals = new Map<string, number>();
    const SIGNAL_DEDUP_MS = 120_000;

    let pendingTradeCount = 0;
    const PENDING_TRADE_DECAY_MS = 10_000;

    // === BATCH AI SYSTEM ===
    let batchCandidates: Array<BatchCandidate & { aggregated: ReturnType<typeof getAggregatedSetup> }> = [];
    let batchTimer: ReturnType<typeof setTimeout> | null = null;
    let batchDeadline: number | null = null;
    const BATCH_COLLECT_WINDOW = 3000;

    async function processBatch(): Promise<void> {
      const candidates = [...batchCandidates];
      batchCandidates = [];
      batchDeadline = null;

      if (candidates.length === 0) return;
      candidates.sort((a, b) => b.confidence - a.confidence);

      const llmConfig = (cfg as any)?.llmAnalyst as AnalystConfig | undefined;
      if (!llmConfig?.enabled) return;

      const batchResult = await batchAnalyze(llmConfig, candidates);

      if (batchResult && batchResult.results.length > 0) {
        for (const result of batchResult.results) {
          if (result.action === 'WAIT') {
            console.log(`[SnapTrade] AI BATCH VETO: ${result.symbol} — WAIT ${result.confidence}% (${result.reasoning.slice(0, 60)})`);
            const vc = candidates.find(c => c.symbol === result.symbol);
            if (vc) shadowRegister(result.symbol, vc.direction, vc.confidence, 'ai-vetoed', vc.price, null, vc.architecture ?? 'm1-primary');
            continue;
          }

          if (openTradeAssets.size + pendingTradeCount >= 3) break;

          const candidate = candidates.find(c => c.symbol === result.symbol);
          if (!candidate) continue;

          const now = Date.now();
          if (!canSignalSymbol(result.symbol, now)) continue;

          const llmDirection: 'CALL' | 'PUT' = result.action === 'BUY' ? 'CALL' : 'PUT';
          if (llmDirection !== candidate.direction) {
            console.log(`[SnapTrade] AI BATCH DISAGREE: ${result.symbol} — AI says ${result.action} but local says ${candidate.direction}`);
            continue;
          }

          if (result.confidence < llmConfig.minConfidence) continue;

          // POST-AI SAFETY checks
          const postRsi = candidate.rsi as number | null;
          const postHist = candidate.histogramRising as boolean;
          const postM5 = candidate.aggregated.m5Trend;
          let postAiVeto: string | null = null;
          if (llmDirection === 'CALL' && postRsi !== null && postRsi > 70) postAiVeto = `POST-AI BLOCK: BUY but RSI=${postRsi.toFixed(0)} > 70`;
          else if (llmDirection === 'PUT' && postRsi !== null && postRsi < 30) postAiVeto = `POST-AI BLOCK: SELL but RSI=${postRsi.toFixed(0)} < 30`;
          else if (llmDirection === 'CALL' && postM5 === 'down') postAiVeto = `POST-AI BLOCK: BUY but M5 trend DOWN`;
          else if (llmDirection === 'PUT' && postM5 === 'up') postAiVeto = `POST-AI BLOCK: SELL but M5 trend UP`;
          else if (llmDirection === 'CALL' && !postHist) postAiVeto = `POST-AI BLOCK: BUY but histogram falling`;
          else if (llmDirection === 'PUT' && postHist) postAiVeto = `POST-AI BLOCK: SELL but histogram rising`;
          if (!postAiVeto && candidate.m1Alignment) {
            const m1Rsi = candidate.m1Alignment.rsi;
            if (m1Rsi !== null && (m1Rsi > 85 || m1Rsi < 15)) {
              postAiVeto = `POST-AI BLOCK: M1 extreme volatility RSI=${m1Rsi.toFixed(0)}`;
            }
          }
          if (postAiVeto) {
            console.log(`[SnapTrade] ${postAiVeto} — ${result.symbol} (AI said ${result.action} ${result.confidence}%)`);
            continue;
          }

          recentSignals.set(result.symbol, now);
          const sig = makeSignal(`llm_${result.symbol}_${now}`, result.symbol, llmDirection, 5, 'AI Analyst', 'ai_analyst', result.confidence);
          console.log(`[SnapTrade] AI BATCH TRADE: ${sig.asset} ${sig.direction} (AI ${result.confidence}% + local ${candidate.confidence}% | ${result.reasoning.slice(0, 60)})`);
          shadowRegister(result.symbol, llmDirection, result.confidence, 'ai-approved', candidate.price, null, candidate.architecture ?? 'm1-primary');
          sendToBackground({ type: 'SIGNAL_NEW', signal: sig });
          logAiPrediction({ symbol: result.symbol, predictedAction: result.action, predictedConfidence: result.confidence, localConfidence: candidate.confidence, model: batchResult.model, source: 'batch', tradeId: sig.id });
          publishSignalApproved(sig.id, result.symbol, llmDirection, candidate.confidence, result.confidence, result.reasoning.slice(0, 120), 1.0, 5);
          pendingTradeCount++; setTimeout(() => { pendingTradeCount = Math.max(0, pendingTradeCount - 1); }, PENDING_TRADE_DECAY_MS);
        }
        return;
      }

      console.log('[SnapTrade] Batch unavailable — no trades (single path enforced)');
    }

    function canSignalSymbol(symbol: string, now: number): boolean {
      const lastTime = recentSignals.get(symbol) ?? 0;
      return now - lastTime >= SIGNAL_DEDUP_MS;
    }

    function makeSignal(id: string, symbol: string, direction: 'CALL' | 'PUT', expMin: number, channelName: string, channelSlug: string, confidence?: number): Signal {
      return {
        id,
        asset: symbol.replace('_otc', ' OTC').replace(/([a-z])([A-Z])/g, '$1/$2'),
        direction,
        signalType: 'instant',
        entryTime: null,
        entryTimestamp: null,
        timeframe: 'M5',
        expirationMinutes: expMin,
        martingaleSchedule: null,
        status: 'active',
        visibility: 'premium',
        resultType: null,
        resultGaleLevel: null,
        isWin: null,
        channel: { name: channelName, slug: channelSlug },
        createdAt: new Date().toISOString(),
        confidence,
      };
    }

    onCandleClose(async (sym, tf, candles) => {
      closeCount++;

      const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
      if (lastCandle) shadowOnCandleClose(sym, tf as 'M1' | 'M5', lastCandle);

      const minCandles = tf === 'M5' ? 6 : 30;
      if (candles.length >= minCandles && lastCandle) {
        const paCtx = buildPriceActionContext(candles, lastCandle.close);
        const extraInd = computeExtraIndicators(candles);
        const labAgg = getAggregatedSetup(sym, 0);
        const symPayout = state.bridge?.getPayoutRate(sym) ?? 0.8;
        const labInd = computeLabIndicators(candles);
        labOnCandleClose(sym, tf as Timeframe, candles, labAgg.activeSetups, labAgg, paCtx, extraInd, symPayout, labInd);
        regimeRecordVolatility(sym, candles);
        if (tf === 'M1') sentinelOnCandleClose(sym, candles);
        updateLabMonitor();
      }

      // Summary log every 60s
      const now = Date.now();
      if (now - lastCloseSummary > 60000) {
        console.log(`[SnapTrade] Candle closes: ${closeCount} total since start`);
        lastCloseSummary = now;
        logTopStrategies();
        const ss = getShadowStats();
        if (ss.totalSignals > 0) {
          console.log(`[SnapTrade] SHADOW: ${ss.totalSignals} signals | ImmM1 ${ss.immediateM1.rate}% (${ss.immediateM1.wins}W/${ss.immediateM1.losses}L) | ImmM5 ${ss.immediateM5.rate}% (${ss.immediateM5.wins}W/${ss.immediateM5.losses}L) | DelayM1 ${ss.delayedM1.rate}% (${ss.delayedM1.wins}W/${ss.delayedM1.losses}L) | DelayM5 ${ss.delayedM5.rate}% (${ss.delayedM5.wins}W/${ss.delayedM5.losses}L)`);
          publishShadowStats({ immM1WR: ss.immediateM1.rate, immM5WR: ss.immediateM5.rate, delayM1WR: ss.delayedM1.rate, delayM5WR: ss.delayedM5.rate, totalSignals: ss.totalSignals });
        }
        const summariesForRelay = getAllSymbolSummaries(30);
        if (summariesForRelay.length > 0) {
          publishPairSummaries(summariesForRelay.map(s => ({
            symbol: s.symbol, direction: s.direction ?? 'NONE', confidence: s.confidence, canTrade: s.canTrade, setups: s.setupTypes ?? [],
          })));
        }
      }

      if (!chartRotationComplete) return;

      const newSetups = await analyzeOnCandleClose(sym, tf, candles, enabledSetups);
      const aggregated = getAggregatedSetup(sym, minConfidence);
      const display = getDisplayState(sym);

      if (cfg?.showOverlay) {
        const summaries = getAllSymbolSummaries(minConfidence);
        const trackedCount = getTrackedSymbolCount();
        updateSetupDisplay(aggregated, sym, display, null, summaries, trackedCount);
      }

      if (aggregated.activeSetups.length > 0) {
        console.log(`[SnapTrade] ${sym} ${tf}: ${aggregated.direction ?? 'NONE'} ${aggregated.confidence}% [${aggregated.activeSetups.map(s=>s.type).join(',')}]`);
      }

      const m5PrimaryEnabled = (cfg as any)?.m5PrimaryEnabled ?? true;
      if (!cfg?.autoTradeEnabled) return;

      // === M5-PRIMARY MODE ===
      if (m5PrimaryEnabled) {
        if (tf === 'M5') {
          const m5Agg = getAggregatedSetupM5(sym, minConfidence);
          if (m5Agg.canTrade && m5Agg.direction) {
            const m5Candles = getCandles(sym, 'M5').slice(-20).map(c => ({ o: c.open, h: c.high, l: c.low, c: c.close, t: c.time }));
            registerM5Signal(sym, m5Agg, m5Candles);
          }
          return;
        }

        if (tf !== 'M1') return;

        const pending = getPendingM5Signal(sym);
        if (!pending) return;

        const m1Display = getDisplayState(sym, 'M1');
        const alignment = checkM1Alignment(pending.direction, m1Display);
        if (!alignment.aligned) return;

        const normSym = normalizeAssetForGuard(sym.replace('_otc', ' OTC').replace(/([a-z])([A-Z])/g, '$1/$2'));
        if (openTradeAssets.has(normSym) || openTradeAssets.has(normalizeAssetForGuard(sym))) return;
        if (openTradeAssets.size + pendingTradeCount >= 3) return;
        if (!canSignalSymbol(sym, now)) return;
        uploadMarketData().catch(() => {});

        const llmConfig = (cfg as any)?.llmAnalyst as AnalystConfig | undefined;
        if (!llmConfig?.enabled) {
          console.log(`[SnapTrade] BLOCKED (no AI): ${sym} ${pending.direction} ${pending.confidence}% — AI must be enabled`);
          return;
        }

        const m5Ind = pending.m5Indicators;
        const dir = pending.direction;
        const m5EventSetups = pending.activeSetups.filter(s => s.type !== 'trend_confirm');
        const m5AlignedCount = m5EventSetups.filter(s => s.direction === dir).length;

        let preFilterVeto: string | null = null;
        if (dir === 'CALL' && m5Ind.rsi !== null && m5Ind.rsi > 78) preFilterVeto = `M5 RSI ${m5Ind.rsi.toFixed(0)} > 78`;
        else if (dir === 'PUT' && m5Ind.rsi !== null && m5Ind.rsi < 22) preFilterVeto = `M5 RSI ${m5Ind.rsi.toFixed(0)} < 22`;
        else if (m5AlignedCount < 1) preFilterVeto = `No M5 aligned setups`;

        if (preFilterVeto) {
          console.log(`[SnapTrade] M5-PRE-FILTER VETO: ${sym} ${dir} ${pending.confidence}% — ${preFilterVeto}`);
          const allC = getCandles(sym, 'M1');
          const lastC = allC.length > 0 ? allC[allC.length - 1] : null;
          shadowRegister(sym, dir, pending.confidence, 'pre-filter-vetoed', lastC?.close ?? 0, null, 'm5-primary');
          return;
        }

        publishSignalRaw(sym, pending.direction, pending.confidence,
          pending.activeSetups.map(s => s.type),
          { rsi: m5Ind.rsi, macdHistogram: m5Ind.macdHistogram, histogramRising: m5Ind.histogramRising, sma20: m5Ind.sma20, sma80: m5Ind.sma80, alligatorState: m5Ind.alligatorState },
          pending.m5Trend);

        const now2 = Date.now();
        if (!batchDeadline) batchDeadline = now2 + BATCH_COLLECT_WINDOW;
        const remaining = Math.max(0, batchDeadline - now2);
        if (remaining === 0) {
          if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
          processBatch();
        } else {
          if (batchTimer) clearTimeout(batchTimer);
          batchTimer = setTimeout(() => { batchTimer = null; processBatch(); }, remaining);
        }
        return;
      }

      // === M1-PRIMARY MODE (legacy) ===
      if (tf !== 'M1') return;

      const normSym = normalizeAssetForGuard(sym.replace('_otc', ' OTC').replace(/([a-z])([A-Z])/g, '$1/$2'));
      if (openTradeAssets.has(normSym) || openTradeAssets.has(normalizeAssetForGuard(sym))) return;
      if (openTradeAssets.size + pendingTradeCount >= 3) return;
      if (!canSignalSymbol(sym, now)) return;
      uploadMarketData().catch(() => {});

      if (aggregated.direction) {
        const macroConflict = (aggregated.direction === 'CALL' && aggregated.m5Trend === 'down') ||
                              (aggregated.direction === 'PUT' && aggregated.m5Trend === 'up');
        if (macroConflict) {
          console.log(`[SnapTrade] BLOCKED (macro): ${sym} ${aggregated.direction} ${aggregated.confidence}% — against ${aggregated.m5Trend}`);
          return;
        }
      }

      const llmConfig = (cfg as any)?.llmAnalyst as AnalystConfig | undefined;

      if (llmConfig?.enabled) {
        if (!aggregated.canTrade || !aggregated.direction || aggregated.confidence < 30) return;

        const rsi = display.rsi as number | null;
        const histRising = display.histogramRising as boolean;
        const dir = aggregated.direction;
        const eventSetups = aggregated.activeSetups.filter(s => s.type !== 'trend_confirm');
        const alignedCount = eventSetups.filter(s => s.direction === dir).length;

        let preFilterVeto: string | null = null;
        if (dir === 'CALL' && rsi !== null && rsi > 78) preFilterVeto = `RSI ${rsi.toFixed(0)} > 78`;
        else if (dir === 'PUT' && rsi !== null && rsi < 22) preFilterVeto = `RSI ${rsi.toFixed(0)} < 22`;
        else if (alignedCount < 1) preFilterVeto = `No aligned setups`;

        if (preFilterVeto) {
          console.log(`[SnapTrade] PRE-FILTER VETO: ${sym} ${dir} ${aggregated.confidence}% — ${preFilterVeto}`);
          const allC = getCandles(sym, tf);
          const lastC = allC.length > 0 ? allC[allC.length - 1] : null;
          shadowRegister(sym, dir, aggregated.confidence, 'pre-filter-vetoed', lastC?.close ?? 0, null, 'm1-primary');
          return;
        }

        publishSignalRaw(sym, aggregated.direction, aggregated.confidence,
          aggregated.activeSetups.map(s => s.type),
          { rsi: display.rsi, macdHistogram: display.macdHistogram, histogramRising: display.histogramRising, sma20: display.sma20, sma80: display.sma80, alligatorState: display.alligatorState },
          aggregated.m5Trend);

        const now2 = Date.now();
        if (!batchDeadline) batchDeadline = now2 + BATCH_COLLECT_WINDOW;
        const remaining = Math.max(0, batchDeadline - now2);
        if (remaining === 0) {
          if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
          processBatch();
        } else {
          if (batchTimer) clearTimeout(batchTimer);
          batchTimer = setTimeout(() => { batchTimer = null; processBatch(); }, remaining);
        }
      } else {
        if (aggregated.canTrade && aggregated.direction && aggregated.confidence >= 65) {
          console.log(`[SnapTrade] BLOCKED (no AI): ${sym} ${aggregated.direction} ${aggregated.confidence}% — AI must be enabled for trades`);
        }
      }
    });

    indicatorInterval = setInterval(() => {
      const currentRaw = state.bridge.getCurrentAsset();
      const current = currentRaw?.replace(/[\s/]/g, '').replace(/OTC/i, '_otc') ?? '';
      if (current) setWatchSymbol(current);
    }, 5000);

  } else if (!shouldRun && indicatorInterval) {
    console.log('[SnapTrade] Stopping setup detection');
    stopCandleWatcher();
    clearInterval(indicatorInterval);
    indicatorInterval = null;
    destroyChartOverlay();
    destroyLabMonitor();
    stopEvolutionScheduler();
    stopStatsUploader();
  }
}
