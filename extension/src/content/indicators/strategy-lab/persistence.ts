/**
 * Strategy Lab — Serialization, load/save, payout cache, compact formats.
 */

import type { StrategyStats, SubStats, StrategyDef } from './types';

// ─── Data Version ───

export const DATA_VERSION = 8; // v8: reset baseline after fixing AI validation, regime gate, pre-filter (Session 5)

// ─── Compact Serialization Types ───

export type CompactFull = { w: number; l: number; p: number; r: number };
export type CompactLite = { w: number; l: number };

export interface PersistedStrategyData {
  id: string;
  w: number; l: number; s: number; bs: number; ws: number;
  r: string;
  tp: number; tr: number;
  gw: number; gl: number; gp: number; gr: number;
  cgw?: number; cgl?: number; cgp?: number; cgr?: number;
  // Granular
  ps?: Record<string, CompactFull>;
  ss?: Record<string, CompactLite>;
  hs?: Record<string, CompactLite>;
  ts?: Record<string, CompactFull>;
  ec?: number[];
  md?: number;
  // AtSignal entry mode
  asw?: number; asl?: number;
  // Gale signal mode
  gs0?: { w: number; l: number; p: number };
  gs1?: { w: number; l: number; p: number };
  gsp?: number;
  // Gale candle mode
  gc0?: { w: number; l: number; p: number };
  gc1?: { w: number; l: number; p: number };
  gcp?: number;
  fp?: number;  // flatPnl
  // AI
  avw?: number; avl?: number; arw?: number; arl?: number;
  // Scoring
  sc?: number; dis?: boolean;
  t: number;
}

export interface PersistedLabStats {
  readonly v: number; // data version — reset if < DATA_VERSION
  readonly strategies: readonly PersistedStrategyData[];
  readonly te: number;
  readonly lp: number;
}

// ─── Serialization Helpers ───

export function subStatsToFull(s: SubStats): CompactFull {
  return { w: s.wins, l: s.losses, p: s.payout, r: s.risked };
}

export function subStatsToLite(s: SubStats): CompactLite {
  return { w: s.wins, l: s.losses };
}

export function fullToSubStats(c: CompactFull): SubStats {
  return { wins: c.w, losses: c.l, payout: c.p, risked: c.r };
}

export function liteToSubStats(c: CompactLite): SubStats {
  return { wins: c.w, losses: c.l, payout: 0, risked: c.w + c.l };
}

export function serializeMapFull(map: Map<string, SubStats>): Record<string, CompactFull> {
  const rec: Record<string, CompactFull> = {};
  for (const [k, v] of map) rec[k] = subStatsToFull(v);
  return rec;
}

export function serializeMapLite(map: Map<string | number, SubStats>): Record<string, CompactLite> {
  const rec: Record<string, CompactLite> = {};
  for (const [k, v] of map) rec[String(k)] = subStatsToLite(v);
  return rec;
}

export function deserializeMapFull(rec: Record<string, CompactFull> | undefined): Map<string, SubStats> {
  const map = new Map<string, SubStats>();
  if (!rec) return map;
  for (const [k, v] of Object.entries(rec)) map.set(k, fullToSubStats(v));
  return map;
}

export function deserializeMapLite(rec: Record<string, CompactLite> | undefined): Map<string, SubStats> {
  const map = new Map<string, SubStats>();
  if (!rec) return map;
  for (const [k, v] of Object.entries(rec)) map.set(k, liteToSubStats(v));
  return map;
}

export function deserializeHourMap(rec: Record<string, CompactLite> | undefined): Map<number, SubStats> {
  const map = new Map<number, SubStats>();
  if (!rec) return map;
  for (const [k, v] of Object.entries(rec)) map.set(Number(k), liteToSubStats(v));
  return map;
}

// ─── Persist Stats ───

export function persistStats(statsMap: ReadonlyMap<string, StrategyStats>, evalCount: number): void {
  const persisted: PersistedLabStats = {
    v: DATA_VERSION,
    strategies: Array.from(statsMap.values()).map(s => ({
      id: s.id,
      w: s.wins, l: s.losses, s: s.streak, bs: s.bestStreak, ws: s.worstStreak,
      r: s.recentResults.join(''),
      tp: s.totalPayout, tr: s.totalRisked,
      gw: s.gatedWins, gl: s.gatedLosses, gp: s.gatedPayout, gr: s.gatedRisked,
      cgw: s.candidateGatedWins, cgl: s.candidateGatedLosses, cgp: s.candidateGatedPayout, cgr: s.candidateGatedRisked,
      ps: serializeMapFull(s.pairStats),
      ss: serializeMapLite(s.sessionStats),
      hs: serializeMapLite(s.hourStats),
      ts: serializeMapFull(s.tierStats),
      ec: s.equityCurve.slice(-200),
      asw: s.atSignalWins, asl: s.atSignalLosses,
      md: s.maxDrawdown,
      gs0: { w: s.galeSignal.g0.wins, l: s.galeSignal.g0.losses, p: Math.round(s.galeSignal.g0.pnl * 100) / 100 },
      gs1: { w: s.galeSignal.g1.wins, l: s.galeSignal.g1.losses, p: Math.round(s.galeSignal.g1.pnl * 100) / 100 },
      gsp: Math.round(s.galeSignal.totalPnl * 100) / 100,
      gc0: { w: s.galeCandle.g0.wins, l: s.galeCandle.g0.losses, p: Math.round(s.galeCandle.g0.pnl * 100) / 100 },
      gc1: { w: s.galeCandle.g1.wins, l: s.galeCandle.g1.losses, p: Math.round(s.galeCandle.g1.pnl * 100) / 100 },
      gcp: Math.round(s.galeCandle.totalPnl * 100) / 100,
      fp: Math.round(s.flatPnl * 100) / 100,
      avw: s.aiValidatedWins, avl: s.aiValidatedLosses,
      arw: s.aiRejectedWins, arl: s.aiRejectedLosses,
      sc: s.score, dis: s.disabled,
      t: s.lastUpdated,
    })),
    te: evalCount,
    lp: Date.now(),
  };

  try {
    chrome.storage.local.set({ strategyLabStats: persisted })
      .then(() => {
        console.log(`[SnapTrade] STRATEGY LAB persisted: ${persisted.strategies.length} strategies, eval #${evalCount}`);
      })
      .catch((err: unknown) => {
        console.error('[SnapTrade] STRATEGY LAB persist FAILED:', err);
      });
  } catch (err) {
    console.error('[SnapTrade] STRATEGY LAB persist error (context?):', err);
  }
}

// ─── Load Persisted Stats ───

export function loadPersistedStats(
  statsMap: Map<string, StrategyStats>,
  strategies: readonly StrategyDef[],
): void {
  try {
    chrome.storage.local.get('strategyLabStats', (result) => {
      const data = result?.strategyLabStats as PersistedLabStats | undefined;
      if (!data?.strategies) return;

      // Version check: reset corrupted data from old versions
      if (!data.v || data.v < DATA_VERSION) {
        console.log(`[SnapTrade] STRATEGY LAB: data version ${data.v ?? 0} < ${DATA_VERSION}, resetting corrupted data`);
        chrome.storage.local.remove('strategyLabStats');
        return;
      }

      for (const s of data.strategies) {
        const def = strategies.find(d => d.id === s.id);
        if (!def) continue;
        statsMap.set(s.id, {
          id: s.id,
          name: def.name,
          wins: s.w, losses: s.l, streak: s.s, bestStreak: s.bs, worstStreak: s.ws,
          recentResults: s.r.split('').filter(c => c === 'W' || c === 'L') as ('W' | 'L')[],
          totalPayout: s.tp ?? 0,
          totalRisked: s.tr ?? 0,
          gatedWins: s.gw ?? 0,
          gatedLosses: s.gl ?? 0,
          gatedPayout: s.gp ?? 0,
          gatedRisked: s.gr ?? 0,
          candidateGatedWins: s.cgw ?? 0,
          candidateGatedLosses: s.cgl ?? 0,
          candidateGatedPayout: s.cgp ?? 0,
          candidateGatedRisked: s.cgr ?? 0,
          pairStats: deserializeMapFull(s.ps),
          sessionStats: deserializeMapLite(s.ss),
          hourStats: deserializeHourMap(s.hs),
          tierStats: deserializeMapFull(s.ts),
          equityCurve: s.ec ?? [],
          maxDrawdown: s.md ?? 0,
          atSignalWins: s.asw ?? 0,
          atSignalLosses: s.asl ?? 0,
          galeSignal: {
            g0: { wins: s.gs0?.w ?? 0, losses: s.gs0?.l ?? 0, pnl: s.gs0?.p ?? 0 },
            g1: { wins: s.gs1?.w ?? 0, losses: s.gs1?.l ?? 0, pnl: s.gs1?.p ?? 0 },
            totalPnl: s.gsp ?? 0,
          },
          galeCandle: {
            g0: { wins: s.gc0?.w ?? 0, losses: s.gc0?.l ?? 0, pnl: s.gc0?.p ?? 0 },
            g1: { wins: s.gc1?.w ?? 0, losses: s.gc1?.l ?? 0, pnl: s.gc1?.p ?? 0 },
            totalPnl: s.gcp ?? 0,
          },
          flatPnl: s.fp ?? 0,
          aiValidatedWins: s.avw ?? 0,
          aiValidatedLosses: s.avl ?? 0,
          aiRejectedWins: s.arw ?? 0,
          aiRejectedLosses: s.arl ?? 0,
          score: s.sc ?? 0,
          disabled: s.dis ?? false,
          lastUpdated: s.t,
        });
      }
      console.log(`[SnapTrade] STRATEGY LAB v${DATA_VERSION}: loaded ${statsMap.size} strategies from storage`);
    });
  } catch {
    // Storage not available (e.g., during tests)
  }
}

// ─── Payout Cache ───

export function loadPayoutCache(payoutCache: Map<string, number>): void {
  try {
    chrome.storage.local.get('activePayouts', (result) => {
      const payouts = result?.activePayouts as Array<{ symbol: string; payout: number }> | undefined;
      if (!payouts) return;
      payoutCache.clear();
      for (const p of payouts) {
        if (p.symbol && typeof p.payout === 'number') {
          payoutCache.set(p.symbol.toLowerCase().replace(/[\s/]/g, ''), p.payout);
        }
      }
      console.log(`[SnapTrade] STRATEGY LAB: payout cache loaded, ${payoutCache.size} pairs`);
    });
  } catch { /* storage not available */ }
}

export function startPayoutRefresh(payoutCache: Map<string, number>): void {
  loadPayoutCache(payoutCache);
  setInterval(() => loadPayoutCache(payoutCache), 300_000);
}
