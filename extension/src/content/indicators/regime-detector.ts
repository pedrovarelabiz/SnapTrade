/**
 * Regime Detector — Detects sudden market behavior changes in OTC pairs.
 *
 * Monitors rolling win rates, volatility shifts, and streak patterns
 * across all Strategy Lab strategies to detect when the "datafeed changes".
 *
 * Persists to chrome.storage.local to survive page reloads and container restarts.
 */

import type { Candle } from './candle-collector';
import { onSentinelResult, getSentinelDefs } from './sentinel-engine';

// ─── Types ───

export type RegimeState = 'stable' | 'warning' | 'blocked';

export interface RegimeAlert {
  readonly type: 'wr_drop' | 'wr_recovery' | 'volatility_spike' | 'volatility_collapse' | 'multi_streak_loss' | 'regime_change';
  readonly message: string;
  readonly time: number;
  readonly severity: 'info' | 'warning' | 'critical';
}

export interface RegimeSnapshot {
  readonly state: RegimeState;
  readonly tradingAllowed: boolean;    // ultimate gate: can we trade?
  readonly globalWR: number;          // rolling WR across recent lab results (%)
  readonly prevGlobalWR: number;      // previous window WR for comparison
  readonly wrTrend: 'rising' | 'falling' | 'stable';
  readonly volatilityIndex: number;   // 0-100, current vs baseline
  readonly volatilityTrend: 'expanding' | 'contracting' | 'stable';
  readonly losingStreakCount: number;  // how many strategies in losing streak (3+)
  readonly sentinelsFailing: number;  // how many of 7 sentinels are below baseline
  readonly sentinelsTotal: number;    // total sentinel count (7)
  readonly regimeClass: 'breakdown' | 'rotation' | 'stable';
  readonly recoveryProgress: number;  // 0-100%, how close to unblock
  readonly alerts: readonly RegimeAlert[];
  readonly lastUpdate: number;
}

// ─── Config ───

const ROLLING_WINDOW = 30;        // last N lab results for WR calculation
const WR_DROP_THRESHOLD = 15;     // % drop triggers warning
const WR_CRITICAL_THRESHOLD = 25; // % drop triggers critical
const VOLATILITY_SPIKE = 2.0;     // ATR ratio above this = spike
const VOLATILITY_COLLAPSE = 0.4;  // ATR ratio below this = collapse
const STREAK_LOSS_MIN = 3;        // consecutive losses to count as "streak"
const MULTI_STREAK_PCT = 0.25;    // block when >25% of active strategies are in losing streak
const MAX_ALERTS = 20;
const STORAGE_KEY = 'regimeState';
const SAVE_INTERVAL = 5;          // persist every N recorded results (was 20 — too infrequent)

// ─── Hysteresis Config (block/unblock) ───
const BLOCK_WR_THRESHOLD = 45;        // block trading when rolling WR drops below this
const UNBLOCK_WR_THRESHOLD = 52;      // only unblock when WR rises above this (higher = safer)
// Dynamic: block when >25% of active strategies are in losing streak
// For 159 strategies: block at ~40, unblock at ~16
// For 20 strategies: block at ~5, unblock at ~2
const BLOCK_STREAK_PCT = 0.25;
const UNBLOCK_STREAK_PCT = 0.10;
const RECOVERY_HOLD_TRADES = 10;      // must sustain recovery conditions for N consecutive trades
const BLOCK_VOLATILITY_RATIO = 3.0;   // block on extreme volatility (3x baseline)

// ─── Sentinel Config ───
// Sentinel definitions live in sentinel-engine.ts (autonomous evaluators).
// The regime detector reads their baselines and consumes their results.
const SENTINEL_WINDOW = 20;            // rolling window per sentinel
const SENTINEL_DROP_THRESHOLD = 12;    // pts below baseline = sentinel failing
const SENTINEL_BLOCK_COUNT = 5;        // block if 5+ of 7 sentinels failing
const SENTINEL_UNBLOCK_COUNT = 2;      // unblock when 2 or fewer failing

// ─── Dynamic Thresholds ───

function getActiveStrategyCount(): number {
  return Math.max(1, strategyStreaks.size);
}

function getBlockStreakThreshold(): number {
  return Math.max(5, Math.ceil(getActiveStrategyCount() * BLOCK_STREAK_PCT));
}

function getUnblockStreakMax(): number {
  return Math.max(2, Math.ceil(getActiveStrategyCount() * UNBLOCK_STREAK_PCT));
}

function getMultiStreakThreshold(): number {
  return Math.max(3, Math.ceil(getActiveStrategyCount() * MULTI_STREAK_PCT));
}

// ─── State ───

// Rolling lab results (from strategy lab events)
const recentResults: Array<{ win: boolean; time: number; stratId?: string }> = [];
const MAX_RECENT = 200;
const disabledStrategies = new Set<string>();

// Per-symbol ATR tracking
const symbolATR: Map<string, { current: number; baseline: number; history: number[] }> = new Map();

// Per-strategy streak tracking
const strategyStreaks: Map<string, number> = new Map(); // negative = losing streak

// Alert history
const alerts: RegimeAlert[] = [];

// Previous WR for trend detection
let prevWindowWR = 50;
let baselineWR = 50;
let baselineSet = false;

// Per-sentinel rolling results
const sentinelResults: Map<string, Array<{ win: boolean; time: number }>> = new Map();

// Save throttle
let recordCount = 0;

// ─── Regime Gate State ───
let blocked = false;                  // master trading gate
let blockReason = '';                 // human-readable reason for block
let recoveryCounter = 0;             // consecutive trades meeting recovery conditions
let blockTime = 0;                   // when was trading blocked

// ─── Core Functions ───

/**
 * Record a lab result for regime analysis.
 * Call this from strategy-lab when a virtual trade resolves.
 */
export function regimeRecordResult(strategyId: string, isWin: boolean): void {
  const now = Date.now();

  // Track rolling results (with strategy ID for cleanup on prune)
  recentResults.push({ win: isWin, time: now, stratId: strategyId });
  if (recentResults.length > MAX_RECENT) {
    recentResults.splice(0, recentResults.length - MAX_RECENT);
  }

  // Track per-strategy streaks
  const prevStreak = strategyStreaks.get(strategyId) ?? 0;
  const newStreak = isWin
    ? (prevStreak >= 0 ? prevStreak + 1 : 1)
    : (prevStreak <= 0 ? prevStreak - 1 : -1);
  strategyStreaks.set(strategyId, newStreak);


  // Set baseline after first 30 results
  if (!baselineSet && recentResults.length >= ROLLING_WINDOW) {
    baselineWR = computeRollingWR(recentResults, ROLLING_WINDOW);
    baselineSet = true;
  }

  // Check for regime shifts
  if (recentResults.length >= ROLLING_WINDOW) {
    checkWRShift(now);
    checkMultiStreak(now);
    evaluateRegimeGate(now);
  }

  // Auto-save periodically
  recordCount++;
  if (recordCount % SAVE_INTERVAL === 0) regimeFlush();
}

/**
 * Record ATR data for volatility tracking.
 * Call on each candle close with the symbol's recent candles.
 */
export function regimeRecordVolatility(symbol: string, candles: readonly Candle[]): void {
  if (candles.length < 20) return;

  // Compute ATR(14) from last 14 candles
  const atr = computeATR(candles, 14);
  if (atr === null) return;

  let data = symbolATR.get(symbol);
  if (!data) {
    data = { current: atr, baseline: atr, history: [] };
    symbolATR.set(symbol, data);
  }

  data.history.push(atr);
  if (data.history.length > 60) {
    data.history.splice(0, data.history.length - 60);
  }

  data.current = atr;

  // Baseline = average ATR over history
  if (data.history.length >= 10) {
    data.baseline = data.history.reduce((a, b) => a + b, 0) / data.history.length;
  }

  // Check for volatility anomaly
  if (data.baseline > 0) {
    const ratio = data.current / data.baseline;
    if (ratio > VOLATILITY_SPIKE) {
      emitAlert({
        type: 'volatility_spike',
        message: `${symbol}: ATR ${ratio.toFixed(1)}x above baseline`,
        time: Date.now(),
        severity: ratio > 3.0 ? 'critical' : 'warning',
      });
    } else if (ratio < VOLATILITY_COLLAPSE) {
      emitAlert({
        type: 'volatility_collapse',
        message: `${symbol}: ATR collapsed to ${(ratio * 100).toFixed(0)}% of baseline`,
        time: Date.now(),
        severity: 'warning',
      });
    }
  }
}

// ─── Analysis ───

function computeRollingWR(results: readonly { win: boolean; stratId?: string }[], window: number): number {
  // Filter out results from disabled/pruned strategies
  const active = results.filter(r => !r.stratId || !disabledStrategies.has(r.stratId));
  const slice = active.slice(-window);
  if (slice.length === 0) return 50;
  const wins = slice.filter(r => r.win).length;
  return Math.round((wins / slice.length) * 100);
}

/**
 * Notify regime detector that a strategy has been disabled/pruned.
 * Removes its results from the rolling WR calculation so bad strategies
 * don't poison the regime gate after being removed.
 */
export function regimeNotifyStrategyDisabled(strategyId: string): void {
  disabledStrategies.add(strategyId);
  // Remove from streak tracking
  strategyStreaks.delete(strategyId);
  console.log(`[SnapTrade] Regime: purged strategy ${strategyId} from rolling stats (${disabledStrategies.size} excluded)`);
}

function computeATR(candles: readonly Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  let sum = 0;
  const start = candles.length - period;
  for (let i = start; i < candles.length; i++) {
    const curr = candles[i]!;
    const prev = candles[i - 1]!;
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );
    sum += tr;
  }
  return sum / period;
}

function checkWRShift(now: number): void {
  const currentWR = computeRollingWR(recentResults, ROLLING_WINDOW);
  const halfWindow = Math.floor(ROLLING_WINDOW / 2);

  // Compare current half vs previous half
  const recentHalf = computeRollingWR(recentResults.slice(-halfWindow), halfWindow);
  const olderHalf = computeRollingWR(
    recentResults.slice(-(ROLLING_WINDOW), -(halfWindow)),
    halfWindow,
  );

  const drop = olderHalf - recentHalf;

  if (drop >= WR_CRITICAL_THRESHOLD) {
    emitAlert({
      type: 'regime_change',
      message: `WR crashed: ${olderHalf}% → ${recentHalf}% (${drop}pt drop)`,
      time: now,
      severity: 'critical',
    });
  } else if (drop >= WR_DROP_THRESHOLD) {
    emitAlert({
      type: 'wr_drop',
      message: `WR dropping: ${olderHalf}% → ${recentHalf}% (${drop}pt drop)`,
      time: now,
      severity: 'warning',
    });
  } else if (drop <= -WR_DROP_THRESHOLD) {
    emitAlert({
      type: 'wr_recovery',
      message: `WR recovering: ${olderHalf}% → ${recentHalf}% (+${-drop}pt)`,
      time: now,
      severity: 'info',
    });
  }

  prevWindowWR = currentWR;
}

function checkMultiStreak(now: number): void {
  let losingCount = 0;
  for (const [, streak] of strategyStreaks) {
    if (streak <= -STREAK_LOSS_MIN) losingCount++;
  }

  if (losingCount >= getMultiStreakThreshold()) {
    // Only alert if not already alerted recently (within 5 min)
    const recentSame = alerts.find(
      a => a.type === 'multi_streak_loss' && now - a.time < 300_000
    );
    if (!recentSame) {
      emitAlert({
        type: 'multi_streak_loss',
        message: `${losingCount} strategies in losing streak (${STREAK_LOSS_MIN}+ consecutive)`,
        time: now,
        severity: losingCount >= 5 ? 'critical' : 'warning',
      });
    }
  }
}

function emitAlert(alert: RegimeAlert): void {
  // Deduplicate: don't repeat same type within 60s
  const recent = alerts.find(
    a => a.type === alert.type && Date.now() - a.time < 60_000
  );
  if (recent) return;

  alerts.push(alert);
  if (alerts.length > MAX_ALERTS) {
    alerts.splice(0, alerts.length - MAX_ALERTS);
  }

  // Persist immediately on warning/critical alerts
  if (alert.severity !== 'info') regimeFlush();
}

// ─── Sentinel Analysis ───

interface SentinelStatus {
  readonly id: string;
  readonly type: string;
  readonly recentWR: number;
  readonly baselineWR: number;
  readonly deviation: number;    // recentWR - baselineWR (negative = underperforming)
  readonly failing: boolean;
  readonly samples: number;
}

function evaluateSentinels(): readonly SentinelStatus[] {
  return getSentinelDefs().map(sentinel => {
    const results = sentinelResults.get(sentinel.id) ?? [];
    const window = results.slice(-SENTINEL_WINDOW);
    const samples = window.length;

    if (samples < 5) {
      // Not enough data — assume OK
      return {
        id: sentinel.id,
        type: sentinel.type,
        recentWR: sentinel.baselineWR,
        baselineWR: sentinel.baselineWR,
        deviation: 0,
        failing: false,
        samples,
      };
    }

    const wins = window.filter(r => r.win).length;
    const recentWR = Math.round((wins / samples) * 100);
    const deviation = recentWR - sentinel.baselineWR;
    const failing = deviation <= -SENTINEL_DROP_THRESHOLD;

    return {
      id: sentinel.id,
      type: sentinel.type,
      recentWR,
      baselineWR: sentinel.baselineWR,
      deviation,
      failing,
      samples,
    };
  });
}

/**
 * Detect if regime shift is style rotation vs true regime breakdown.
 * Style rotation: one type fails while opposite type succeeds.
 * True breakdown: all types fail simultaneously.
 */
function classifyRegimeShift(sentinels: readonly SentinelStatus[]): 'breakdown' | 'rotation' | 'stable' {
  const byType = new Map<string, { failing: number; total: number }>();
  for (const s of sentinels) {
    if (s.samples < 5) continue;
    const entry = byType.get(s.type) ?? { failing: 0, total: 0 };
    entry.total++;
    if (s.failing) entry.failing++;
    byType.set(s.type, entry);
  }

  const trendFailing = (byType.get('trend')?.failing ?? 0) > 0;
  const reversionFailing = (byType.get('reversion')?.failing ?? 0) > 0;

  const totalFailing = sentinels.filter(s => s.failing).length;

  // If trend AND reversion both fail → true breakdown
  if (trendFailing && reversionFailing && totalFailing >= SENTINEL_BLOCK_COUNT) {
    return 'breakdown';
  }

  // If only one side fails → rotation
  if ((trendFailing && !reversionFailing) || (!trendFailing && reversionFailing)) {
    return 'rotation';
  }

  if (totalFailing >= SENTINEL_BLOCK_COUNT) {
    return 'breakdown';
  }

  return 'stable';
}

// ─── Regime Gate (Hysteresis) ───

/**
 * Evaluate whether trading should be blocked or unblocked.
 *
 * PRIMARY signal: sentinel strategies (7 diverse virtual strategies with known baselines).
 * SECONDARY signals: global WR, losing streaks, volatility.
 *
 * Block: sentinel breakdown (5+ of 7 failing) OR global WR < 45% OR 5+ losing streaks.
 * Unblock: sentinels recover (2 or fewer failing) AND global WR > 52% AND trend rising,
 *          sustained for RECOVERY_HOLD_TRADES consecutive results.
 *
 * Style rotation (trend fails but reversion succeeds, or vice versa) does NOT block —
 * only true breakdown where all approaches fail simultaneously triggers a block.
 */
function evaluateRegimeGate(now: number): void {
  const currentWR = computeRollingWR(recentResults, ROLLING_WINDOW);

  // ─── Sentinel evaluation (primary signal) ───
  const sentinels = evaluateSentinels();
  const failingCount = sentinels.filter(s => s.failing).length;
  const regimeClass = classifyRegimeShift(sentinels);

  // Count losing streaks
  let losingCount = 0;
  for (const [, streak] of strategyStreaks) {
    if (streak <= -STREAK_LOSS_MIN) losingCount++;
  }

  // Volatility check
  let maxVolRatio = 0;
  for (const [, data] of symbolATR) {
    if (data.baseline > 0) {
      maxVolRatio = Math.max(maxVolRatio, data.current / data.baseline);
    }
  }

  // WR trend
  let trendingUp = false;
  if (recentResults.length >= 20) {
    const recent10 = computeRollingWR(recentResults.slice(-10), 10);
    const older10 = computeRollingWR(recentResults.slice(-20, -10), 10);
    trendingUp = recent10 > older10 + 3;
  }

  if (!blocked) {
    // ─── Check if we should BLOCK ───
    // PRIMARY: sentinel breakdown (independent market health signal)
    // SECONDARY: WR drop + high volatility (confirms sentinel signal)
    const sentinelBreakdown = regimeClass === 'breakdown';
    const wrTooLow = currentWR < BLOCK_WR_THRESHOLD;
    const volatilityCrazy = maxVolRatio >= BLOCK_VOLATILITY_RATIO;

    // Style rotation is NOT a block condition — log it as info
    if (regimeClass === 'rotation') {
      const failingSentinels = sentinels.filter(s => s.failing);
      const types = [...new Set(failingSentinels.map(s => s.type))].join(', ');
      emitAlert({
        type: 'wr_drop',
        message: `Style rotation: ${types} underperforming (${failingCount}/7 sentinels)`,
        time: now,
        severity: 'warning',
      });
    }

    // Block ONLY on sentinel breakdown OR (WR critically low AND volatility crazy)
    // Low strategy WR alone does NOT block — strategies may just need pruning
    if (sentinelBreakdown || (wrTooLow && volatilityCrazy)) {
      blocked = true;
      blockTime = now;
      recoveryCounter = 0;

      const reasons: string[] = [];
      if (sentinelBreakdown) reasons.push(`sentinel breakdown (${failingCount}/7 failing)`);
      if (wrTooLow && volatilityCrazy) reasons.push(`WR ${currentWR}% + volatility ${maxVolRatio.toFixed(1)}x`);
      blockReason = reasons.join(' + ');

      emitAlert({
        type: 'regime_change',
        message: `TRADING BLOCKED: ${blockReason}`,
        time: now,
        severity: 'critical',
      });

      const sentinelSummary = sentinels
        .filter(s => s.samples >= 5)
        .map(s => `${s.id.slice(0, 15)}:${s.recentWR}%${s.failing ? '!' : ''}`)
        .join(', ');
      console.log(`[SnapTrade] REGIME GATE: BLOCKED — ${blockReason}`);
      console.log(`[SnapTrade] SENTINELS: ${sentinelSummary}`);
      regimeFlush();
    }
  } else {
    // ─── Check if we can UNBLOCK ───
    // PRIMARY: sentinels must be healthy (market is objectively OK)
    // SECONDARY: WR trending up (strategies are recovering)
    // Removed: streaks check (was too restrictive with many strategies)
    // Removed: exact WR threshold (sentinels are more reliable than lab WR)
    const sentinelsOK = failingCount <= SENTINEL_UNBLOCK_COUNT;
    const wrNotTerrible = currentWR >= 40; // just sanity check, not strict threshold
    const volNormal = maxVolRatio < VOLATILITY_SPIKE;
    const allConditions = sentinelsOK && wrNotTerrible && volNormal;

    if (allConditions) {
      recoveryCounter++;

      if (recoveryCounter >= RECOVERY_HOLD_TRADES) {
        blocked = false;
        blockReason = '';
        recoveryCounter = 0;

        emitAlert({
          type: 'wr_recovery',
          message: `TRADING UNBLOCKED: WR ${currentWR}%, ${failingCount}/7 sentinels failing, sustained ${RECOVERY_HOLD_TRADES} trades`,
          time: now,
          severity: 'info',
        });

        console.log(
          `[SnapTrade] REGIME GATE: UNBLOCKED — WR ${currentWR}%, ` +
          `sentinels ${failingCount}/7 failing, ${losingCount} streaks, trend rising`
        );
        regimeFlush();
      } else {
        console.log(
          `[SnapTrade] REGIME GATE: recovery ${recoveryCounter}/${RECOVERY_HOLD_TRADES} — ` +
          `WR ${currentWR}%, sentinels ${failingCount}/7, trend ${trendingUp ? 'up' : 'flat'}`
        );
      }
    } else {
      if (recoveryCounter > 0) {
        console.log(
          `[SnapTrade] REGIME GATE: recovery reset (was ${recoveryCounter}) — ` +
          `WR ${currentWR}%${currentWR >= 40 ? '' : ' LOW'}, ` +
          `sentinels ${failingCount}/7${sentinelsOK ? '' : ' HIGH'}, ` +
          `vol ${maxVolRatio.toFixed(1)}x${volNormal ? '' : ' HIGH'}`
        );
      }
      recoveryCounter = 0;
    }
  }
}

/**
 * Check if trading is currently allowed by the regime gate.
 */
export function isRegimeBlocked(): boolean {
  return blocked;
}

/**
 * Get human-readable block reason.
 */
export function getBlockReason(): string {
  return blockReason;
}

// ─── Persistence ───

/** Persist regime state to chrome.storage.local. */
export function regimeFlush(): void {
  try {
    // Serialize sentinel results
    const sentinelData: Record<string, Array<{ win: boolean; time: number }>> = {};
    for (const [id, results] of sentinelResults) {
      sentinelData[id] = results.slice(-(SENTINEL_WINDOW * 2));
    }

    const state = {
      recentResults: recentResults.slice(-100),
      strategyStreaks: Object.fromEntries(strategyStreaks),
      sentinelResults: sentinelData,
      prevWindowWR,
      baselineWR,
      baselineSet,
      alerts: alerts.slice(-MAX_ALERTS),
      blocked,
      blockReason,
      blockTime,
      recoveryCounter,
      savedAt: Date.now(),
    };
    chrome.storage.local.set({ [STORAGE_KEY]: state })
      .then(() => {
        console.log(
          `[SnapTrade] RegimeDetector flushed: ${state.recentResults.length} results, ` +
          `${Object.keys(state.strategyStreaks).length} streaks`
        );
      })
      .catch((err: unknown) => {
        console.error('[SnapTrade] RegimeDetector flush FAILED:', err);
      });
  } catch (err) {
    // Context invalidated — chrome.storage.local may not exist
    console.error('[SnapTrade] RegimeDetector flush error (context?):', err);
  }
}

/**
 * Restore regime state from chrome.storage.local.
 * Call once at startup so streaks and WR history survive container restarts.
 * Falls back to bootstrapping streaks from strategyLabStats if no regime state exists.
 */
export function initRegimeDetector(): void {
  try {
    chrome.storage.local.get([STORAGE_KEY, 'strategyLabStats'])
      .then((data: Record<string, unknown>) => {
        console.log(
          `[SnapTrade] RegimeDetector init: ${STORAGE_KEY}=${data[STORAGE_KEY] ? 'exists' : 'NULL'}, ` +
          `strategyLabStats=${data['strategyLabStats'] ? 'exists' : 'NULL'}`
        );

        const saved = data[STORAGE_KEY] as {
          recentResults: Array<{ win: boolean; time: number }>;
          strategyStreaks: Record<string, number>;
          sentinelResults?: Record<string, Array<{ win: boolean; time: number }>>;
          prevWindowWR: number;
          baselineWR: number;
          baselineSet: boolean;
          alerts: RegimeAlert[];
          blocked?: boolean;
          blockReason?: string;
          blockTime?: number;
          recoveryCounter?: number;
          savedAt: number;
        } | undefined;

        if (saved && Date.now() - saved.savedAt <= 86_400_000) {
          const cutoff = Date.now() - 7_200_000;
          const fresh = saved.recentResults.filter(r => r.time > cutoff);
          recentResults.splice(0, recentResults.length, ...fresh);

          strategyStreaks.clear();
          for (const [k, v] of Object.entries(saved.strategyStreaks)) {
            strategyStreaks.set(k, v);
          }

          prevWindowWR = saved.prevWindowWR;
          baselineWR = saved.baselineWR;
          baselineSet = saved.baselineSet;

          const alertCutoff = Date.now() - 21_600_000;
          const freshAlerts = saved.alerts.filter(a => a.time > alertCutoff);
          alerts.splice(0, alerts.length, ...freshAlerts);

          // Restore gate state
          blocked = saved.blocked ?? false;
          blockReason = saved.blockReason ?? '';
          blockTime = saved.blockTime ?? 0;
          recoveryCounter = saved.recoveryCounter ?? 0;

          // Restore sentinel results
          sentinelResults.clear();
          if (saved.sentinelResults) {
            for (const [id, results] of Object.entries(saved.sentinelResults)) {
              sentinelResults.set(id, results);
            }
          }

          const sentinelCount = sentinelResults.size;
          console.log(
            `[SnapTrade] RegimeDetector restored: ${fresh.length} results, ` +
            `${strategyStreaks.size} streaks, ${freshAlerts.length} alerts, ` +
            `${sentinelCount} sentinels, ` +
            `blocked=${blocked}${blocked ? ` (${blockReason})` : ''}, ` +
            `savedAt=${new Date(saved.savedAt).toISOString()}`
          );
        } else {
          if (saved) {
            console.log(`[SnapTrade] RegimeDetector state stale (${Math.round((Date.now() - saved.savedAt) / 3_600_000)}h old), bootstrapping`);
          }
          const lab = data['strategyLabStats'] as { strategies?: Array<{ id: string; s: number }> } | undefined;
          if (lab?.strategies) {
            strategyStreaks.clear();
            for (const s of lab.strategies) {
              if (s.s !== 0) strategyStreaks.set(s.id, s.s);
            }
            const losingCount = [...strategyStreaks.values()].filter(v => v <= -STREAK_LOSS_MIN).length;
            console.log(
              `[SnapTrade] RegimeDetector bootstrapped from lab: ${strategyStreaks.size} streaks, ` +
              `${losingCount} losing (>=${STREAK_LOSS_MIN})`
            );
            if (losingCount >= getMultiStreakThreshold()) checkMultiStreak(Date.now());
          } else {
            console.log('[SnapTrade] RegimeDetector: no saved state AND no lab stats — starting cold');
          }
        }

        // Register sentinel result callback
        onSentinelResult((sentinelId: string, isWin: boolean) => {
          let results = sentinelResults.get(sentinelId);
          if (!results) {
            results = [];
            sentinelResults.set(sentinelId, results);
          }
          results.push({ win: isWin, time: Date.now() });
          if (results.length > SENTINEL_WINDOW * 2) {
            results.splice(0, results.length - SENTINEL_WINDOW * 2);
          }
        });

        const sentinelDefs = getSentinelDefs();
        console.log(`[SnapTrade] RegimeDetector: ${sentinelDefs.length} autonomous sentinels registered`);

        // Verify storage works by writing a test key
        chrome.storage.local.set({ regimeDetectorAlive: Date.now() })
          .then(() => console.log('[SnapTrade] RegimeDetector storage write test: OK'))
          .catch((e: unknown) => console.error('[SnapTrade] RegimeDetector storage write test FAILED:', e));
      })
      .catch((err: unknown) => {
        console.error('[SnapTrade] RegimeDetector init read FAILED:', err);
      });
  } catch (err) {
    console.error('[SnapTrade] RegimeDetector init error (context?):', err);
  }
}

// ─── Public API ───

/**
 * Get current regime snapshot for the monitor overlay.
 */
export function getRegimeSnapshot(): RegimeSnapshot {
  const currentWR = recentResults.length >= 10
    ? computeRollingWR(recentResults, Math.min(ROLLING_WINDOW, recentResults.length))
    : 50;

  // WR trend: compare last 10 vs previous 10
  let wrTrend: RegimeSnapshot['wrTrend'] = 'stable';
  if (recentResults.length >= 20) {
    const recent10 = computeRollingWR(recentResults.slice(-10), 10);
    const older10 = computeRollingWR(recentResults.slice(-20, -10), 10);
    if (recent10 > older10 + 5) wrTrend = 'rising';
    else if (recent10 < older10 - 5) wrTrend = 'falling';
  }

  // Volatility index: average ratio across tracked symbols
  let volatilityIndex = 50;
  let volTrend: RegimeSnapshot['volatilityTrend'] = 'stable';
  const volRatios: number[] = [];
  for (const [, data] of symbolATR) {
    if (data.baseline > 0) {
      volRatios.push(data.current / data.baseline);
    }
  }
  if (volRatios.length > 0) {
    const avgRatio = volRatios.reduce((a, b) => a + b, 0) / volRatios.length;
    volatilityIndex = Math.min(100, Math.round(avgRatio * 50)); // 1.0 = 50, 2.0 = 100
    if (avgRatio > 1.3) volTrend = 'expanding';
    else if (avgRatio < 0.7) volTrend = 'contracting';
  }

  // Count losing streaks
  let losingStreakCount = 0;
  for (const [, streak] of strategyStreaks) {
    if (streak <= -STREAK_LOSS_MIN) losingStreakCount++;
  }

  // Sentinel status
  const sentinels = evaluateSentinels();
  const sentinelsFailing = sentinels.filter(s => s.failing).length;
  const regimeClass = classifyRegimeShift(sentinels);

  // Determine state from gate (evidence-based, not timeout-based)
  let state: RegimeState = 'stable';
  if (blocked) {
    state = 'blocked';
  } else if (regimeClass === 'rotation' || currentWR < UNBLOCK_WR_THRESHOLD || losingStreakCount >= getMultiStreakThreshold()) {
    state = 'warning';
  }

  // Recovery progress: 0% = just blocked, 100% = about to unblock
  let recoveryProgress = 0;
  if (blocked) {
    recoveryProgress = Math.round((recoveryCounter / RECOVERY_HOLD_TRADES) * 100);
  }

  return {
    state,
    tradingAllowed: !blocked,
    globalWR: currentWR,
    prevGlobalWR: prevWindowWR,
    wrTrend,
    volatilityIndex,
    volatilityTrend: volTrend,
    losingStreakCount,
    sentinelsFailing,
    sentinelsTotal: getSentinelDefs().length,
    regimeClass,
    recoveryProgress,
    alerts: alerts.slice(-5),
    lastUpdate: Date.now(),
  };
}
