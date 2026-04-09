import type { Signal, TradeExecution, ExtensionSettings } from '../types';
import * as Sentry from '@sentry/browser';
import { TAB_SWITCH_FREEZE_CYCLES } from '../lib/constants';
import { state, normalizeAssetForGuard, getTradeSource, tradeSourceMap, generateExecutionId, sendToBackground, loadSettings } from './content-state';
import { executedTradeIds, persistExecutedId, recentTradeGaleLevels, persistGaleLevels } from './gale-persistence';
import { validateSignalWithSetups } from './indicators/indicator-validator';
import { getAggregatedSetup, getDisplayState } from './indicators/setup-detector';
import { getCandles } from './indicators/candle-collector';
import { analyzeWithLlm, type AnalystConfig } from './indicators/llm-analyst';

// ---------------------------------------------------------------------------
// Gale state
// ---------------------------------------------------------------------------

export interface PendingGale {
  level: number;
  baseAmount: number;
  multiplier: number;
  maxLevel: number;
  lostAmount: number;
}

export let pendingGaleState: PendingGale | null = null;
export function setPendingGaleState(val: PendingGale | null): void {
  pendingGaleState = val;
}

// ---------------------------------------------------------------------------
// Balance-based result detection state (mutable container for cross-module use)
// ---------------------------------------------------------------------------

export interface PendingClosure {
  numClosed: number;
  balanceBefore: number;
  assets: string[];
  amounts: number[];
  directions: ('CALL' | 'PUT')[];
  cyclesWaited: number;
}

export const balanceState = {
  prevBalance: null as number | null,
  prevTradeCount: 0,
  prevTradeAssets: [] as string[],
  prevTradeAmounts: [] as number[],
  prevTradeDirections: [] as ('CALL' | 'PUT')[],
  pendingClosure: null as PendingClosure | null,
  balanceStableCycles: 0,
  lastKnownTabState: 'unknown' as 'opened' | 'closed' | 'unknown',
  tabSwitchFreezeRemaining: 0,
};

export const BALANCE_WARMUP_CYCLES = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function computeGaleAmount(baseAmount: number, level: number, multiplier: number): number {
  if (level <= 0) return baseAmount;
  return Math.round(baseAmount * Math.pow(multiplier, level) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Trade execution
// ---------------------------------------------------------------------------

export async function executeTrade(
  signal: Signal,
  amount: number,
  galeLevel: number,
): Promise<void> {
  try {
    if (executedTradeIds.has(signal.id + '_g' + galeLevel)) {
      console.log('[SnapTrade] Trade already executed (dedup):', signal.id, 'gale:', galeLevel);
      return;
    }
    await persistExecutedId(signal.id + '_g' + galeLevel);

  const settings = state.settings ?? (await loadSettings());

  // Setup-based signal validation -- only for EXTERNAL signals (Telegram).
  const INTERNAL_TRADE_SLUGS = new Set(['st_indicators', 'ai_analyst']);
  const isInternalSignal = INTERNAL_TRADE_SLUGS.has(signal.channel?.slug ?? '');

  if (galeLevel === 0 && !isInternalSignal && settings.indicatorValidation?.enabled && settings.indicatorValidation.validateSignals) {
    const poSymbol = signal.asset.replace(/[\s/]/g, '').replace(/OTC/i, '_otc');
    const validation = validateSignalWithSetups(signal, settings.indicatorValidation, poSymbol);
    console.log('[SnapTrade] Signal validation:', signal.asset, signal.direction, validation.reason);
    if (!validation.allow) {
      sendToBackground({ type: 'SKIP_SIGNAL', signalId: signal.id });
      console.log('[SnapTrade] Trade BLOCKED:', validation.reason);
      return;
    }
  }

  // AI validation for external signals (Telegram channels)
  const INTERNAL_SLUGS = new Set(['st_indicators', 'ai_analyst']);
  const isExternal = !INTERNAL_SLUGS.has(signal.channel?.slug ?? '');
  const llmConfig = (settings as any)?.llmAnalyst as AnalystConfig | undefined;

  if (galeLevel === 0 && isExternal && llmConfig?.enabled) {
    const poSymbol = signal.asset.replace(/[\s/]/g, '').replace(/OTC/i, '_otc');
    const candles = getCandles(poSymbol, 'M1');

    if (candles.length >= 10) {
      const aggregated = getAggregatedSetup(poSymbol, 30);
      const display = getDisplayState(poSymbol);
      const llmResult = await analyzeWithLlm(llmConfig, poSymbol, candles, aggregated, display as any);

      if (llmResult) {
        const llmDirection: 'CALL' | 'PUT' = llmResult.action === 'BUY' ? 'CALL' : 'PUT';
        const aiDisagrees = llmResult.action === 'WAIT' ||
          llmDirection !== signal.direction ||
          llmResult.confidence < llmConfig.minConfidence;

        if (aiDisagrees) {
          console.log(`[SnapTrade] AI blocked external signal: ${signal.asset} ${signal.direction} — AI: ${llmResult.action} ${llmResult.confidence}% (${llmResult.reasoning.slice(0, 80)})`);
          sendToBackground({ type: 'SKIP_SIGNAL', signalId: signal.id });
          return;
        }
        console.log(`[SnapTrade] AI confirmed external signal: ${signal.asset} ${signal.direction} — AI: ${llmResult.action} ${llmResult.confidence}%`);
      }
    }
  }

  // Minimum payout filter
  const MIN_PAYOUT_PERCENT = settings.minPayoutPercent ?? 65;
  const currentPayout = state.bridge.getPayoutRate(signal.asset);
  if (MIN_PAYOUT_PERCENT > 0) {
    if (currentPayout === null) {
      if (settings.tradingMode === 'real') {
        console.log(`[SnapTrade] BLOCKED: ${signal.asset} payout UNKNOWN (min ${MIN_PAYOUT_PERCENT}% required, REAL mode)`);
        sendToBackground({ type: 'SKIP_SIGNAL', signalId: signal.id });
        return;
      }
      console.log(`[SnapTrade] PAYOUT UNKNOWN: ${signal.asset} — allowing in DEMO mode`);
    } else if (currentPayout * 100 < MIN_PAYOUT_PERCENT) {
      console.log(`[SnapTrade] BLOCKED: ${signal.asset} payout ${(currentPayout * 100).toFixed(0)}% < min ${MIN_PAYOUT_PERCENT}%`);
      sendToBackground({ type: 'SKIP_SIGNAL', signalId: signal.id });
      return;
    }
  }

  const forceDemo = settings.tradingMode === 'demo';

  // Balance protection
  const balance = state.bridge.getBalance();
  if (balance !== null && settings.minBalanceProtection > 0 && balance < settings.minBalanceProtection) {
    sendToBackground({
      type: 'PAUSE_TRADING',
      reason: `Balance ($${balance.toFixed(2)}) below minimum ($${settings.minBalanceProtection})`,
    });
    return;
  }

  // === PER-SIGNAL GALE: Apply pending gale amount ===
  let effectiveAmount = amount;
  let effectiveGaleLevel = galeLevel;
  const galeMode = (settings as any).galeMode ?? 'per-signal';
  const strategyHandlesRecovery = settings.strategy === 'sorosgale' || settings.strategy === 'masaniello';

  if (!strategyHandlesRecovery && galeMode === 'per-signal' && pendingGaleState && galeLevel === 0) {
    const galeAmount = computeGaleAmount(pendingGaleState.baseAmount, pendingGaleState.level, pendingGaleState.multiplier);
    effectiveAmount = galeAmount;
    effectiveGaleLevel = pendingGaleState.level;
    console.log(`[SnapTrade] GALE APPLIED (per-signal): G${pendingGaleState.level} $${galeAmount.toFixed(2)} to ${signal.asset} (recovering $${pendingGaleState.lostAmount.toFixed(2)})`);
    pendingGaleState = null;
  }

  const tradeAmount = settings.maxSingleTradeAmount > 0 ? Math.min(effectiveAmount, settings.maxSingleTradeAmount) : effectiveAmount;

  // === PRE-EXECUTION RE-VALIDATION ===
  const INTERNAL_SOURCES = new Set(['st_indicators', 'ai_analyst']);
  if (INTERNAL_SOURCES.has(signal.channel?.slug ?? '')) {
    const poSym = signal.asset.replace(/[\s/]/g, '').replace(/OTC/i, '_otc');
    const currentSetup = getAggregatedSetup(poSym, 0);
    const currentDisplay = getDisplayState(poSym);

    if (currentSetup.direction && currentSetup.direction !== signal.direction && currentSetup.confidence >= 30) {
      console.log(`[SnapTrade] PRE-EXEC CANCEL: ${signal.asset} ${signal.direction} — indicators now say ${currentSetup.direction} ${currentSetup.confidence}%`);
      sendToBackground({ type: 'SKIP_SIGNAL', signalId: signal.id });
      return;
    }

    const alligConflict = (signal.direction === 'CALL' && currentDisplay.alligatorState === 'eating_down') ||
                          (signal.direction === 'PUT' && currentDisplay.alligatorState === 'eating_up');
    const macdLine = currentDisplay.macdLine;
    const signalLine = currentDisplay.signalLine;
    const macdConflict = macdLine !== null && signalLine !== null &&
      ((signal.direction === 'CALL' && macdLine < signalLine) ||
       (signal.direction === 'PUT' && macdLine > signalLine));

    if (alligConflict && macdConflict) {
      console.log(`[SnapTrade] PRE-EXEC CANCEL: ${signal.asset} ${signal.direction} — Alligator ${currentDisplay.alligatorState} + MACD opposing`);
      sendToBackground({ type: 'SKIP_SIGNAL', signalId: signal.id });
      return;
    }
  }

  // Pre-register source BEFORE execution
  const preSource = getTradeSource(signal.id, signal.channel?.slug);
  tradeSourceMap.set(normalizeAssetForGuard(signal.asset), preSource);

  const result = await state.bridge.executeTrade(
    signal.asset,
    signal.direction,
    tradeAmount,
    signal.expirationMinutes || 5,
    forceDemo,
  );

  const execution: TradeExecution = {
    id: generateExecutionId(),
    signalId: signal.id,
    asset: signal.asset,
    direction: signal.direction,
    amount: tradeAmount,
    galeLevel: effectiveGaleLevel,
    mode: settings.executionMode === 'auto' ? 'auto' : settings.executionMode === 'semi-auto' ? 'semi' : 'manual',
    strategy: settings.strategy,
    executedAt: new Date().toISOString(),
    result: result.success ? 'pending' : null,
    payout: null,
    netPnl: null,
  };

  if (result.success) {
    const source = getTradeSource(signal.id, signal.channel?.slug);
    const normAsset = normalizeAssetForGuard(signal.asset);
    tradeSourceMap.set(normAsset, source);

    console.log(`[SnapTrade] Trade opened: ${signal.asset} ${signal.direction} $${tradeAmount} gale:${effectiveGaleLevel} [${source.toUpperCase()}]`);

    const tradeKey = `${normalizeAssetForGuard(signal.asset)}:${signal.direction}:${tradeAmount}`;
    recentTradeGaleLevels.set(tradeKey, { signalId: signal.id, galeLevel: effectiveGaleLevel, channelSlug: signal.channel?.slug ?? '', timestamp: Date.now() });
    console.log(`[SnapTrade] STORE tradeKey="${tradeKey}" sid=${signal.id} mapSize=${recentTradeGaleLevels.size}`);
    persistGaleLevels();

    const now = Date.now();
    chrome.runtime.sendMessage({ type: 'UPDATE_TRADES', trades: [{
      id: 'st_' + signal.id, asset: signal.asset, direction: signal.direction,
      amount: tradeAmount, openTime: now, closeTime: now + (signal.expirationMinutes || 5) * 60000,
      source,
    }]} as import('../types').ExtensionMessage).catch((err) => {
      Sentry.captureException(err);
    });

    state.overlay.addOpenTrade({
      id: 'st_' + signal.id,
      asset: signal.asset.replace(/\//g, '').replace(/\s+OTC/i, '_otc'),
      direction: signal.direction,
      amount: tradeAmount,
      openTime: now,
      closeTime: now + (signal.expirationMinutes || 5) * 60 * 1000,
      source,
      galeLevel: effectiveGaleLevel > 0 ? effectiveGaleLevel : undefined,
    });

    const chSlug = signal.channel?.slug ?? '';
    const chStrat = chSlug ? settings.channelStrategies?.[chSlug] : undefined;
    const effectiveMaxGale = chStrat?.maxGale ?? settings.simpleMaxGale;

    if (effectiveMaxGale > 0) {
      state.activeGales.set(signal.id, {
        signal,
        level: galeLevel,
        lastAmount: tradeAmount,
      });
    }

    sendToBackground({ type: 'TRADE_EXECUTED', execution });
  } else {
    sendToBackground({ type: 'TRADE_EXECUTED', execution: { ...execution, result: null } });
    console.warn('[SnapTrade] Trade execution failed:', result.error);
  }
  } catch (err) {
    console.error('[SnapTrade] executeTrade error:', err);
    Sentry.captureException(err, {
      tags: { context: 'trade_execution' },
      extra: {
        signalId: signal.id,
        asset: signal.asset,
        direction: signal.direction,
        amount: amount,
        galeLevel: galeLevel,
      },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Trade result handler (gale logic)
// ---------------------------------------------------------------------------

export function handleTradeResult(resultData: { win: boolean; amount: number; asset?: string; galeLevel?: number }): void {
  const settings = state.settings;
  if (!settings) return;

  const galeMode = (settings as any).galeMode ?? 'per-signal';
  const effectiveMaxGale = settings.simpleMaxGale;
  const effectiveMultiplier = settings.simpleMultiplier;
  const tradeGaleLevel = resultData.galeLevel ?? 0;

  console.log(`[SnapTrade] handleTradeResult: ${resultData.win ? 'WIN' : 'LOSS'} $${resultData.amount} ${resultData.asset ?? '?'} G${tradeGaleLevel} | galeMode=${galeMode} strategy=${settings.strategy} maxGale=${effectiveMaxGale} pendingGale=${pendingGaleState ? 'G' + pendingGaleState.level : 'none'}`);

  if (settings.strategy === 'sorosgale' || settings.strategy === 'masaniello') return;

  // === PER-SIGNAL GALE MODE ===
  if (galeMode === 'per-signal') {
    if (resultData.win) {
      if (tradeGaleLevel > 0 && pendingGaleState) {
        console.log(`[SnapTrade] GALE RESOLVED: G${tradeGaleLevel} WIN cleared pending G${pendingGaleState.level} (recovered $${pendingGaleState.lostAmount.toFixed(2)})`);
        pendingGaleState = null;
      } else if (tradeGaleLevel > 0) {
        console.log(`[SnapTrade] GALE WIN: G${tradeGaleLevel} (no pending state — already consumed)`);
      }
      state.activeGales.clear();
    } else {
      if (!settings.autoExecuteGale || effectiveMaxGale <= 0) {
        console.log(`[SnapTrade] GALE SKIPPED: autoGale=${settings.autoExecuteGale} maxGale=${effectiveMaxGale}`);
        return;
      }

      if (pendingGaleState && tradeGaleLevel === 0) {
        console.log(`[SnapTrade] GALE UNCHANGED: concurrent loss G0, pending G${pendingGaleState.level} still waiting to be applied`);
        state.activeGales.clear();
        return;
      }

      const currentLevel = tradeGaleLevel;
      const nextLevel = currentLevel + 1;

      if (nextLevel > effectiveMaxGale) {
        console.log(`[SnapTrade] GALE MAX REACHED: G${nextLevel} > max ${effectiveMaxGale} — resetting`);
        pendingGaleState = null;
      } else {
        const baseAmount = pendingGaleState?.baseAmount ?? resultData.amount;
        const nextAmount = computeGaleAmount(baseAmount, nextLevel, effectiveMultiplier);
        const totalLost = (pendingGaleState?.lostAmount ?? 0) + resultData.amount;
        pendingGaleState = {
          level: nextLevel,
          baseAmount,
          multiplier: effectiveMultiplier,
          maxLevel: effectiveMaxGale,
          lostAmount: totalLost,
        };
        console.log(`[SnapTrade] GALE PENDING: G${nextLevel} next trade = $${nextAmount.toFixed(2)} (lost $${totalLost.toFixed(2)} so far)`);
      }
      state.activeGales.clear();
    }
    return;
  }

  // === PER-ASSET GALE MODE (legacy) ===
  const entries = Array.from(state.activeGales.entries());
  if (entries.length === 0) return;

  const [signalId, galeInfo] = entries[0]!;

  if (resultData.win) {
    state.activeGales.delete(signalId);
  } else {
    const nextLevel = galeInfo.level + 1;
    const galeSlug = galeInfo.signal.channel?.slug ?? '';
    const isInternalGale = galeSlug === 'st_indicators' || galeSlug === 'ai_analyst';
    const galeChStrat = galeSlug ? settings.channelStrategies?.[galeSlug] : undefined;
    const galeMaxLevel = galeChStrat?.maxGale ?? (isInternalGale ? 1 : effectiveMaxGale);
    const galeMultiplier = galeChStrat?.multiplier ?? (isInternalGale ? 2.0 : effectiveMultiplier);

    if (nextLevel <= galeMaxLevel && settings.autoExecuteGale) {
      const galeAsset = galeInfo.signal.asset.replace(/[\s/]/g, '').replace(/OTC/i, '_otc');
      const galeSetup = getAggregatedSetup(galeAsset, 0);
      const galeDirection = galeInfo.signal.direction;

      const macroOpposed = (galeDirection === 'CALL' && galeSetup.m5Trend === 'down') ||
                           (galeDirection === 'PUT' && galeSetup.m5Trend === 'up');
      const indicatorsOpposed = galeSetup.direction !== null && galeSetup.direction !== galeDirection;
      const noSupport = galeSetup.confidence === 0 || (macroOpposed && indicatorsOpposed);

      if (noSupport && galeSetup.m5Trend !== 'flat') {
        console.log(`[SnapTrade] GALE BLOCKED: ${galeAsset} ${galeDirection} G${nextLevel}`);
        state.activeGales.delete(signalId);
      } else {
        const galeBaseAmount = galeInfo.level === 0 ? galeInfo.lastAmount : settings.defaultAmount;
        const nextAmount = computeGaleAmount(galeBaseAmount, nextLevel, galeMultiplier);
        state.activeGales.set(signalId, { ...galeInfo, level: nextLevel, lastAmount: nextAmount });

        if (settings.executionMode === 'semi-auto') {
          const galeSignal: Signal = { ...galeInfo.signal, id: galeInfo.signal.id + '_g' + nextLevel };
          sendToBackground({ type: 'SIGNAL_NEW', signal: galeSignal });
        } else {
          console.log(`[SnapTrade] GALE ALLOWED: ${galeAsset} ${galeDirection} G${nextLevel}`);
          executeTrade(galeInfo.signal, nextAmount, nextLevel);
        }
      }
    } else {
      state.activeGales.delete(signalId);
    }
  }
}
