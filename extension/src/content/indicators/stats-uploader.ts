/**
 * Stats Uploader — Periodically uploads strategy lab performance data to the backend.
 *
 * Enables remote monitoring without CDP access. Uploads every 30 minutes.
 * Data includes: strategy rankings, evolution state, regime snapshot.
 */

import { API_BASE } from '../../lib/constants';
import { getAllLabStats, getLabRanking, type StrategyStats } from './strategy-lab';
import { getRegimeSnapshot, isRegimeBlocked } from './regime-detector';
import { getEvolutionState } from './strategy-evolution';
import { getLoaderStats } from './strategy-loader';
import { getLabToTradeStatus, getRoutingTable, getLabTradeMetrics } from './lab-to-trade';
import { getLabAiStats } from './lab-ai-validator';
import { getShadowHealthMetrics } from './shadow-tracker';

// ─── Helpers ───

function pct100(n: number, d: number): number { return d > 0 ? Math.round(100 * n / d) : 0; }
function round2(v: number): number { return Math.round(v * 100) / 100; }
function round3(v: number): number { return Math.round(v * 1000) / 1000; }

// ─── Configuration ───

const UPLOAD_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// ─── State ───

let uploadTimer: ReturnType<typeof setInterval> | null = null;

// ─── Upload Logic ───

async function uploadStats(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get('settings');
    const token = stored.settings?.extensionToken;
    if (!token) return;
    // Read tradeLog via service worker (content script chrome.storage may not return all keys)
    let storedTradeLog: readonly Record<string, unknown>[] = [];
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_TRADE_LOG' }) as { tradeLog?: unknown[] };
      storedTradeLog = Array.isArray(resp?.tradeLog) ? resp.tradeLog as Record<string, unknown>[] : [];
    } catch { /* */ }

    const allStats = getAllLabStats();
    const ranking = getLabRanking(10);
    const regime = getRegimeSnapshot();
    const evolution = getEvolutionState();
    const loader = getLoaderStats();

    const withTrades = allStats.filter(s => s.wins + s.losses > 0);
    const activeOnly = withTrades.filter(s => !s.disabled); // for WR calculations

    // Rich stats for upload (all data needed for web dashboard)
    const activeStats = withTrades
      .map(s => {
        const total = s.wins + s.losses;
        const asTotal = s.atSignalWins + s.atSignalLosses;
        const aiValTotal = s.aiValidatedWins + s.aiValidatedLosses;
        const aiRejTotal = s.aiRejectedWins + s.aiRejectedLosses;
        return {
          id: s.id,
          nm: s.name,
          w: s.wins, l: s.losses,
          gw: s.gatedWins, gl: s.gatedLosses,
          wr: pct100(s.wins, total),
          gwr: pct100(s.gatedWins, s.gatedWins + s.gatedLosses),
          sc: round3(s.score),
          dd: round2(s.maxDrawdown),
          pnl: round2(s.flatPnl),
          galeSig: round2(s.galeSignal.totalPnl),
          galeCdl: round2(s.galeCandle.totalPnl),
          // @Signal comparison
          asw: s.atSignalWins, asl: s.atSignalLosses,
          aswr: asTotal > 0 ? pct100(s.atSignalWins, asTotal) : -1,
          // AI validation
          aiVw: s.aiValidatedWins, aiVl: s.aiValidatedLosses,
          aiRw: s.aiRejectedWins, aiRl: s.aiRejectedLosses,
          aiVwr: aiValTotal > 0 ? pct100(s.aiValidatedWins, aiValTotal) : -1,
          aiRwr: aiRejTotal > 0 ? pct100(s.aiRejectedWins, aiRejTotal) : -1,
          // Recent results
          recent: (s.recentResults as readonly string[]).slice(-12).join(''),
          dis: s.disabled,
          strk: s.streak,
        };
      })
      .sort((a, b) => {
        const wrA = a.w / (a.w + a.l); const wrB = b.w / (b.w + b.l);
        return wrB !== wrA ? wrB - wrA : (b.w + b.l) - (a.w + a.l);
      });

    // Use total WR for top10 (gated WR is 0 when regime is mostly blocked)
    const rankedAll = [...withTrades]
      .filter(s => s.wins + s.losses >= 10)
      .sort((a, b) => {
        const wrA = a.wins / (a.wins + a.losses);
        const wrB = b.wins / (b.wins + b.losses);
        return wrB !== wrA ? wrB - wrA : (b.wins + b.losses) - (a.wins + a.losses);
      });
    const top10 = rankedAll.slice(0, 10).map(s => {
      const t = s.wins + s.losses;
      return {
        id: s.id,
        name: s.name,
        wr: pct100(s.wins, t),
        trades: t,
        score: round3(s.score),
        pnl: round2(s.flatPnl),
      };
    });

    // AI aggregate
    const aiAgg = {
      valW: withTrades.reduce((a, s) => a + s.aiValidatedWins, 0),
      valL: withTrades.reduce((a, s) => a + s.aiValidatedLosses, 0),
      rejW: withTrades.reduce((a, s) => a + s.aiRejectedWins, 0),
      rejL: withTrades.reduce((a, s) => a + s.aiRejectedLosses, 0),
    };

    // P&L aggregate
    const pnlAgg = {
      flat: round2(withTrades.reduce((a, s) => a + s.flatPnl, 0)),
      galeSig: round2(withTrades.reduce((a, s) => a + s.galeSignal.totalPnl, 0)),
      galeCdl: round2(withTrades.reduce((a, s) => a + s.galeCandle.totalPnl, 0)),
    };

    // Pair insights
    const pairMap = new Map<string, { w: number; l: number; best: string; bestWR: number }>();
    for (const s of withTrades) {
      if (!s.pairStats) continue;
      for (const [pair, ps] of s.pairStats) {
        const pt = ps.wins + ps.losses;
        if (pt < 3) continue;
        const existing = pairMap.get(pair) ?? { w: 0, l: 0, best: '', bestWR: 0 };
        const wr = ps.wins / pt;
        pairMap.set(pair, {
          w: existing.w + ps.wins, l: existing.l + ps.losses,
          best: wr > existing.bestWR ? s.id : existing.best,
          bestWR: Math.max(wr, existing.bestWR),
        });
      }
    }
    const pairs = Array.from(pairMap.entries())
      .map(([p, d]) => ({ p, w: d.w, l: d.l, wr: pct100(d.w, d.w + d.l), best: d.best, bwr: Math.round(d.bestWR * 100) }))
      .sort((a, b) => (b.w + b.l) - (a.w + a.l))
      .slice(0, 25);

    // ─── Composite Strategy: best strategy per pair ───
    // Uses routing table as primary source for best-per-pair selection,
    // then enriches with pnl/totalPairTrades/pairOverallWR from lab stats.
    // Falls back to local calculation for pairs not in routing table.
    const MIN_PAIR_TRADES = 10;
    const compositeMap = new Map<string, { pair: string; stratId: string; stratName: string; w: number; l: number; wr: number; pnl: number; totalPairTrades: number; pairOverallWR: number }>();

    // Collect overall pair WR (all strategies combined)
    const pairOverall = new Map<string, { w: number; l: number }>();
    for (const s of withTrades) {
      if (!s.pairStats) continue;
      for (const [pair, ps] of s.pairStats) {
        const existing = pairOverall.get(pair) ?? { w: 0, l: 0 };
        pairOverall.set(pair, { w: existing.w + ps.wins, l: existing.l + ps.losses });
      }
    }

    // Use routing table as primary source for best-per-pair
    const compositeRT = getRoutingTable();
    for (const [pair, route] of compositeRT) {
      const stratStats = withTrades.find(s => s.id === route.strategyId);
      if (!stratStats?.pairStats) continue;
      const ps = stratStats.pairStats.get(pair);
      if (!ps) continue;
      const pt = ps.wins + ps.losses;
      if (pt < MIN_PAIR_TRADES) continue;
      const pairPnl = ps.payout - ps.risked;
      const overall = pairOverall.get(pair) ?? { w: 0, l: 0 };
      const overallTotal = overall.w + overall.l;
      compositeMap.set(pair, {
        pair, stratId: route.strategyId, stratName: route.strategyName,
        w: ps.wins, l: ps.losses,
        wr: route.pairWR,
        pnl: round2(pairPnl),
        totalPairTrades: overallTotal,
        pairOverallWR: overallTotal > 0 ? pct100(overall.w, overallTotal) : 0,
      });
    }

    // Fallback: pairs not in routing table — local calculation
    for (const s of withTrades) {
      if (!s.pairStats) continue;
      for (const [pair, ps] of s.pairStats) {
        if (compositeMap.has(pair)) continue; // already from routing table
        const pt = ps.wins + ps.losses;
        if (pt < MIN_PAIR_TRADES) continue;
        const wr = ps.wins / pt;
        const existing = compositeMap.get(pair);
        if (!existing || wr > existing.wr / 100 || (Math.round(wr * 100) === existing.wr && pt > existing.w + existing.l)) {
          const pairPnl = ps.payout - ps.risked;
          const overall = pairOverall.get(pair) ?? { w: 0, l: 0 };
          const overallTotal = overall.w + overall.l;
          compositeMap.set(pair, {
            pair, stratId: s.id, stratName: s.name,
            w: ps.wins, l: ps.losses,
            wr: Math.round(wr * 100),
            pnl: round2(pairPnl),
            totalPairTrades: overallTotal,
            pairOverallWR: overallTotal > 0 ? pct100(overall.w, overallTotal) : 0,
          });
        }
      }
    }
    const compositeEntries = Array.from(compositeMap.values()).sort((a, b) => b.wr - a.wr);
    const compositeW = compositeEntries.reduce((a, e) => a + e.w, 0);
    const compositeL = compositeEntries.reduce((a, e) => a + e.l, 0);
    const compositeT = compositeW + compositeL;
    const compositeWR = compositeT > 0 ? pct100(compositeW, compositeT) : 0;
    const compositePnl = round2(compositeEntries.reduce((a, e) => a + e.pnl, 0));

    // Compare: uniform WR from ACTIVE strategies only (disabled excluded)
    const allWins = activeOnly.reduce((a, s) => a + s.wins, 0);
    const allTotal = activeOnly.reduce((a, s) => a + s.wins + s.losses, 0);
    const uniformWR = allTotal > 0 ? pct100(allWins, allTotal) : 0;
    const composite = {
      wr: compositeWR,
      trades: compositeT,
      pnl: compositePnl,
      uniformWR,
      delta: compositeWR - uniformWR,
      pairs: compositeEntries.slice(0, 30),
      pairsCount: compositeEntries.length,
    };

    // ─── Health Monitor ───
    const totalTradesAll = allStats.reduce((s, st) => s + st.wins + st.losses, 0);
    const totalGatedW = allStats.reduce((s, st) => s + st.gatedWins, 0);
    const totalGatedL = allStats.reduce((s, st) => s + st.gatedLosses, 0);
    const totalGated = totalGatedW + totalGatedL;
    const regimeBlockRate = totalTradesAll > 0 ? Math.round((1 - totalGated / totalTradesAll) * 100) : 0;
    const aiTotalValidated = aiAgg.valW + aiAgg.valL + aiAgg.rejW + aiAgg.rejL;
    const labAiStats = getLabAiStats();
    const shadowHealth = getShadowHealthMetrics();
    const rt = getRoutingTable();

    const labTrade = getLabTradeMetrics();
    const health = {
      ts: Date.now(),
      labActive: totalTradesAll > 0,
      totalTrades: totalTradesAll,
      regimeState: regime?.state ?? 'unknown',
      regimeBlocked: isRegimeBlocked(),
      regimeBlockRate,
      aiActive: aiTotalValidated > 0 || labAiStats.calls > 0,
      aiTotalValidated,
      aiCallsThisHour: labAiStats.calls,
      aiPending: labAiStats.pending,
      aiDisabled: labAiStats.disabled,
      // Legacy indicator pipeline pre-filter (may be 0 when lab is primary)
      preFilterPassRate: shadowHealth.passRate,
      preFilterTotal: shadowHealth.totalSignals,
      preFilterPassed: shadowHealth.preFilterPassed,
      preFilterVetoed: shadowHealth.preFilterVetoed,
      preFilterSources: shadowHealth.sourceBreakdown,
      // Lab-to-trade pipeline metrics (primary trading pipeline)
      labFired: labTrade.fired,
      labGateBlocked: labTrade.gateBlocked,
      labProofBlocked: labTrade.proofBlocked,
      labRouteRejected: labTrade.routeRejected,
      labPayoutRejected: labTrade.payoutRejected,
      labPairCooldown: labTrade.pairCooldown,
      labAiApproved: labTrade.aiApproved,
      labAiRejected: labTrade.aiRejected,
      labAiWait: labTrade.aiWait,
      labAiTimeout: labTrade.aiTimeout,
      labQueued: labTrade.queued,
      labTraded: labTrade.traded,
      routedPairs: rt.size,
      activeStrategies: activeStats.length,
      disabledStrategies: allStats.filter(s => s.disabled).length,
    };

    // ─── Trade Log (real trades with W/L results) ───
    const tradeLog = storedTradeLog;

    // ─── Demo Balance (read from page DOM) ───
    const balanceEl = document.querySelector('.balance-info-block__balance, .js-balance-amount');
    const balanceText = balanceEl?.textContent?.trim().replace(/[^\d.]/g, '') ?? null;
    const demoBalance = balanceText ? parseFloat(balanceText) : null;

    const payload = {
      timestamp: Date.now(),
      totalStrategies: allStats.length,
      activeStrategies: activeStats.length,
      totalTrades: totalTradesAll,
      health,
      top10,
      tradeLog: tradeLog.slice(-50), // last 50 real trades
      demoBalance,
      regime: regime ? {
        state: regime.state,
        wr: regime.globalWR,
        volatility: regime.volatilityIndex,
        volTrend: regime.volatilityTrend,
        wrTrend: regime.wrTrend,
        sentinelsFailing: regime.sentinelsFailing,
        sentinelsTotal: regime.sentinelsTotal,
        streak: regime.losingStreakCount,
        recovery: regime.recoveryProgress,
        regimeClass: regime.regimeClass,
      } : null,
      evolution,
      loader,
      ai: aiAgg,
      pnl: pnlAgg,
      pairs,
      composite,
      tradeGate: (() => {
        try {
          const status = getLabToTradeStatus();
          const rt = getRoutingTable();
          return {
            initialized: status.initialized,
            qualifying: status.qualifying,
            hasPending: status.hasPending,
            pendingSymbol: status.pendingSymbol,
            activeTrade: status.activeLabTrade,
            gateMin: status.gateRemainingMin,
            masaniello: status.masaniello,
            routedPairs: status.routing.pairsMapped,
            routing: Array.from(rt.entries()).slice(0, 30).map(([pair, r]) => ({
              pair,
              strat: r.strategyName,
              wr: r.pairWR,
              trades: r.trades,
              minPayout: Math.round(100 * Math.max(0.65, (1 - r.pairWR / 100) / (r.pairWR / 100) + 0.05)),
            })),
          };
        } catch { return null; }
      })(),
      stats: activeStats,
    };

    console.log(`[StatsUploader] payload keys: ${Object.keys(payload).join(',')}, tradeLog=${(payload as any).tradeLog?.length}, balance=${(payload as any).demoBalance}`);
    const body = JSON.stringify(payload);
    console.log(`[StatsUploader] body size: ${body.length} bytes`);
    const resp = await fetch(`${API_BASE}/extension/stats-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body,
    });
    console.log(`[StatsUploader] response: ${resp.status}`);

  } catch (err) {
    console.warn('[StatsUploader] Upload failed:', err);
  }
}

// ─── Scheduling ───

export function startStatsUploader(): void {
  if (uploadTimer) return;

  // First upload after 30 seconds (quick initial data)
  setTimeout(() => uploadStats(), 30 * 1000);

  uploadTimer = setInterval(() => uploadStats(), UPLOAD_INTERVAL_MS);
  console.log('[StatsUploader] Started (30min interval)');
}

export function stopStatsUploader(): void {
  if (uploadTimer) {
    clearInterval(uploadTimer);
    uploadTimer = null;
  }
}
