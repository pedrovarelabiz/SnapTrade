/**
 * Lab-to-Trade Bridge v6 — Pending orders for exact M5 open timing.
 * 1 trade at a time, 10 min between trades, top 3 M5 by WR, payout >= 85%.
 * Uses PO pending orders (openPendingOrder) — trade opens at exact server time.
 * nextTradeAllowedAt set in exactly 2 places (execute + close).
 */
import { getAllLabStats, getLabPayout, getStrategyPairStats, type StrategyStats } from './strategy-lab';
import { askAiOpinion, updateTradeLogResult, appendTradeLog, readDemoBalance, type CandidateSignal } from './lab-ai-observer';
import { getLabAiResult, recordLabAiOutcome, validateLabSignals, buildLabAiCandidates } from './lab-ai-validator';
import { getCandles } from './candle-collector';
import { isRegimeBlocked } from './regime-detector';
export { getAiOpinion } from './lab-ai-observer';

// Config
const MIN_WR = 0.55, MIN_TRADES = 20;
const ABSOLUTE_MIN_PAYOUT = 0.65; // never trade below 65% payout regardless of WR
const PAYOUT_SAFETY_MARGIN = 0.02; // require 2pp above break-even (was 5pp — too aggressive for 80-92% OTC payouts)
const MIN_PAIR_TRADES = 3; // minimum trades per pair for routing table
const PROOF_MIN_PAIR_TRADES = 15; // minimum pair trades required before executing (raised from bootstrap 3 for statistical proof)
const EXPIRY_MIN = 5, EXPIRY_MS = EXPIRY_MIN * 60_000, GAP_MS = 2 * 60_000;
const PROCESS_INTERVAL_MS = 500;
const PAIR_COOLDOWN_MS = 15 * 60_000; // 15 min cooldown per pair after loss
const MM_CYCLE = 20, MM_BASE = 5;
const ROUTING_UPDATE_INTERVAL_MS = 3 * 60_000; // rebuild routing table every 3 min
// Safety margin: pending orders must be placed at least this far before M5 open.
// Ensures relay users have time to receive and place their own pending orders.
const MIN_ADVANCE_MS = 30_000; // 30 seconds minimum before M5 open
// Timeout: if pending order doesn't produce a close event within this window, release gate.
const PENDING_EXEC_TIMEOUT_MS = EXPIRY_MS + 60_000; // expiry + 60s buffer

// ─── Dynamic Payout Threshold ───
// Break-even payout = (1 - WR) / WR. Add safety margin.
// Example: 60% WR → BE = 0.667, with 5pp margin → needs 71.7% payout
function getMinPayout(wr: number): number {
  if (wr <= 0.5) return 1; // never trade at 50% or below
  const breakEven = (1 - wr) / wr;
  const withMargin = breakEven + PAYOUT_SAFETY_MARGIN;
  return Math.max(ABSOLUTE_MIN_PAYOUT, Math.min(0.95, withMargin));
}

// ─── Pair-Specific Routing Table ───
// Maps each pair to the strategy with the highest WR on that pair.
// Rebuilt every 5 minutes from live lab stats.
interface RouteEntry {
  readonly strategyId: string;
  readonly strategyName: string;
  readonly pairWR: number;    // WR of this strategy on this specific pair
  readonly trades: number;
}
let routingTable = new Map<string, RouteEntry>();
let lastRoutingUpdate = 0;

function rebuildRoutingTable(): void {
  const allStats = getAllLabStats();
  const newTable = new Map<string, RouteEntry>();

  // Look at PAIR-SPECIFIC WR, not global WR.
  // A strategy with 50% global WR can have 80% WR on a specific pair.
  // Only require: not disabled, enough trades on this specific pair, and pair WR above break-even.
  for (const stats of allStats) {
    if (stats.disabled) continue;
    if (!stats.pairStats) continue;

    for (const [pair, ps] of stats.pairStats) {
      const pt = ps.wins + ps.losses;
      if (pt < MIN_PAIR_TRADES) continue;
      const wr = ps.wins / pt;

      // Only route if pair WR is above break-even (profitable on this pair)
      if (wr < 0.53) continue;

      const existing = newTable.get(pair);
      if (!existing || wr > existing.pairWR / 100 || (Math.round(wr * 100) === existing.pairWR && pt > existing.trades)) {
        newTable.set(pair, {
          strategyId: stats.id,
          strategyName: stats.name,
          pairWR: Math.round(wr * 100),
          trades: pt,
        });
      }
    }
  }

  routingTable = newTable;
  lastRoutingUpdate = Date.now();

  if (newTable.size > 0) {
    const top3 = Array.from(newTable.entries())
      .sort((a, b) => b[1].pairWR - a[1].pairWR)
      .slice(0, 3)
      .map(([p, r]) => `${p}:${r.strategyName}(${r.pairWR}%)`)
      .join(', ');
    console.log(`[SnapTrade] Routing: ${newTable.size} pairs mapped. Top: ${top3}`);
  }
}

function ensureRoutingTable(): void {
  if (Date.now() - lastRoutingUpdate > ROUTING_UPDATE_INTERVAL_MS) {
    rebuildRoutingTable();
  }
}

// ─── Lab Pipeline Health Metrics ───
// Tracks signal flow through the lab-to-trade pipeline for health monitoring.
// Persisted to chrome.storage to survive container restarts.
let labMetrics = { fired: 0, gateBlocked: 0, regimeBlocked: 0, proofBlocked: 0, routeRejected: 0, payoutRejected: 0, pairCooldown: 0, aiApproved: 0, aiRejected: 0, aiWait: 0, aiTimeout: 0, queued: 0, traded: 0 };
let metricsRestored = false;

function persistMetrics(): void {
  try { chrome.storage.local.set({ labPipelineMetrics: { ...labMetrics } }); } catch { /* */ }
}

function restoreMetrics(): Promise<void> {
  return new Promise((resolve) => {
    if (metricsRestored) { resolve(); return; }
    try {
      chrome.storage.local.get(['labPipelineMetrics'], (r) => {
        const saved = r.labPipelineMetrics;
        if (saved && typeof saved.traded === 'number') {
          labMetrics = { ...labMetrics, ...saved };
          console.log(`[SnapTrade] Pipeline metrics restored: ${labMetrics.traded} traded, ${labMetrics.fired} fired`);
        }
        metricsRestored = true;
        resolve();
      });
    } catch { metricsRestored = true; resolve(); }
  });
}

/** Get lab-to-trade pipeline metrics for health monitoring. */
export function getLabTradeMetrics(): Readonly<typeof labMetrics> {
  return { ...labMetrics };
}

// State (persisted via persistState)
let nextTradeAllowedAt = 0, mmWins = 0, mmLosses = 0;
let initialized = false, activeLabTradeAsset: string | null = null;
let lastStrategyId: string | null = null;
let lastLossPair: string | null = null;
let lastLossPairAt = 0;
let pendingOrderTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingSignal: {
  strategyId: string; strategyName: string; symbol: string;
  direction: 'CALL' | 'PUT'; payout: number; wr: number;
  pairWR: number | null; trades: number;
  m5Open: number; queuedAt: number;
} | null = null;
let candidateSignals: CandidateSignal[] = [];
let tradeExecutor: ((asset: string, dir: 'CALL' | 'PUT', amount: number, expiry: number, demo: boolean) => Promise<boolean>) | null = null;
let pendingTradeExecutor: ((asset: string, dir: 'CALL' | 'PUT', amount: number, expiryMin: number, openTimeUTC: string, demo: boolean, minPayout: number) => Promise<{ success: boolean; ticket?: string }>) | null = null;
let payoutChecker: ((symbol: string) => number | null) | null = null;
let demoChecker: (() => boolean) | null = null;
let processInterval: ReturnType<typeof setInterval> | null = null;

/** Next M5 boundary with safety margin.
 *  If less than MIN_ADVANCE_MS before the next M5 open, skip to the one after. */
function nextM5Open(): number {
  const ms5 = 5 * 60_000;
  const next = Math.ceil(Date.now() / ms5) * ms5;
  // If too close to M5 open, push to next M5 — gives relay users time to receive signal
  if (next - Date.now() < MIN_ADVANCE_MS) {
    return next + ms5;
  }
  return next;
}

/** Server time offset in ms (serverTime - localUTC). Detected from PO DOM. */
let serverTimeOffsetMs = 0;

/** Detect PO server time offset from the DOM clock element. */
function detectServerTimeOffset(): void {
  try {
    const el = document.querySelector('.current-time');
    if (!el) return;
    const text = el.textContent?.trim() ?? '';
    // Format: "15:38:13UTC+1Timezone" or "15:38:13"
    const match = text.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return;
    const serverH = parseInt(match[1]!, 10);
    const serverM = parseInt(match[2]!, 10);
    const serverS = parseInt(match[3]!, 10);
    const now = new Date();
    const localH = now.getUTCHours();
    const localM = now.getUTCMinutes();
    const localS = now.getUTCSeconds();
    const serverTotalS = serverH * 3600 + serverM * 60 + serverS;
    const localTotalS = localH * 3600 + localM * 60 + localS;
    let diffS = serverTotalS - localTotalS;
    if (diffS > 43200) diffS -= 86400;
    if (diffS < -43200) diffS += 86400;
    // PO DOM clock shows CET (UTC+1) but server openTime expects CEST (UTC+2).
    // The server's dateCreated is consistently +1h ahead of the DOM clock.
    // Add 3600s to compensate for the CET→CEST gap.
    const cestCorrectionS = 3600;
    diffS += cestCorrectionS;
    serverTimeOffsetMs = diffS * 1000;
    console.log(`[SnapTrade] Server time offset: ${diffS}s (DOM=${match[0]} CET, +${cestCorrectionS}s CEST correction, local UTC=${String(localH).padStart(2,'0')}:${String(localM).padStart(2,'0')}:${String(localS).padStart(2,'0')})`);
  } catch { /* */ }
}

/** Format timestamp as "YYYY-MM-DD HH:MM:SS" in PO server time. */
function formatOpenTimeServer(tsMs: number): string {
  const d = new Date(tsMs + serverTimeOffsetMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function persistState(): void {
  try {
    chrome.storage.local.set({
      labTradeGate: nextTradeAllowedAt,
      labMasaniello: { wins: mmWins, losses: mmLosses },
      labLastLossPair: lastLossPair,
      labLastLossPairAt: lastLossPairAt,
    });
  } catch (err) { console.warn('[SnapTrade] storage write failed:', err); }
}

function computeStake(): number {
  const s = MM_BASE + (mmWins - mmLosses) * 0.5;
  return isFinite(s) ? Math.max(1, Math.min(15, s)) : MM_BASE;
}

function getStakeWithCycleReset(): number {
  if (mmWins + mmLosses >= MM_CYCLE) {
    console.log(`[SnapTrade] MASANIELLO cycle done: ${mmWins}W/${mmLosses}L — resetting`);
    mmWins = 0; mmLosses = 0; persistState();
  }
  return computeStake();
}

// ─── Public API ───

export function setTradeExecutor(exec: typeof tradeExecutor, payout?: typeof payoutChecker): void {
  tradeExecutor = exec;
  if (payout) payoutChecker = payout;
  restoreMetrics();
  chrome.storage.local.get(['labTradeGate', 'labMasaniello', 'labLastLossPair', 'labLastLossPairAt']).then((r) => {
    const rawGate = r.labTradeGate;
    if (typeof rawGate === 'number' && isFinite(rawGate) && rawGate > Date.now()) {
      nextTradeAllowedAt = rawGate;
      console.log(`[SnapTrade] LAB gate restored: ${((rawGate - Date.now()) / 60000).toFixed(1)}min remaining`);
    }
    const rawMm = r.labMasaniello;
    if (rawMm && typeof rawMm.wins === 'number' && typeof rawMm.losses === 'number'
        && Number.isInteger(rawMm.wins) && rawMm.wins >= 0
        && Number.isInteger(rawMm.losses) && rawMm.losses >= 0) {
      mmWins = rawMm.wins; mmLosses = rawMm.losses;
      console.log(`[SnapTrade] LAB Masaniello restored: ${mmWins}W/${mmLosses}L stake=$${computeStake().toFixed(2)}`);
    }
    if (typeof r.labLastLossPair === 'string') lastLossPair = r.labLastLossPair;
    if (typeof r.labLastLossPairAt === 'number') lastLossPairAt = r.labLastLossPairAt;
    detectServerTimeOffset();
    setInterval(detectServerTimeOffset, 60_000); // re-sync every 60s
    initialized = true;
    if (processInterval) clearInterval(processInterval);
    processInterval = setInterval(processPending, PROCESS_INTERVAL_MS);
    console.log(`[SnapTrade] LAB-TRADE v7: ready (pair router, dynamic payout, gate=5min, minWR=${MIN_WR}, absMinPayout=${ABSOLUTE_MIN_PAYOUT})`);
  });
}

/** Register pending trade executor for exact M5 open timing. */
export function setPendingTradeExecutor(exec: typeof pendingTradeExecutor): void {
  pendingTradeExecutor = exec;
}

/** Register demo account checker. Returns true if account is demo. */
export function setDemoChecker(checker: () => boolean): void {
  demoChecker = checker;
}

export function getQualifyingStrategies(): readonly StrategyStats[] {
  return getAllLabStats()
    .filter(s => { const t = s.wins + s.losses; return t >= MIN_TRADES && s.wins / t >= MIN_WR && !s.disabled; })
    .sort((a, b) => b.wins / (b.wins + b.losses) - a.wins / (a.wins + a.losses));
}

/** Check if a strategy is the best router pick for a specific pair. */
function isRoutedStrategy(strategyId: string, symbol: string): boolean {
  ensureRoutingTable();
  const route = routingTable.get(symbol);
  // If no route exists for this pair, accept any qualifying strategy
  if (!route) return true;
  return route.strategyId === strategyId;
}

/** Get the routing table for dashboard display. */
export function getRoutingTable(): ReadonlyMap<string, RouteEntry> {
  ensureRoutingTable();
  return routingTable;
}

export function maybeQueueLabSignal(strategyId: string, symbol: string, direction: 'CALL' | 'PUT', payout: number): boolean {
  labMetrics = { ...labMetrics, fired: labMetrics.fired + 1 };
  if (!initialized || Date.now() < nextTradeAllowedAt) {
    labMetrics = { ...labMetrics, gateBlocked: labMetrics.gateBlocked + 1 };
    return false;
  }
  if (symbol === lastLossPair && (Date.now() - lastLossPairAt) < PAIR_COOLDOWN_MS) {
    labMetrics = { ...labMetrics, pairCooldown: labMetrics.pairCooldown + 1 };
    console.log(`[PAIR-COOLDOWN] ${symbol}: cooldown ${Math.round((PAIR_COOLDOWN_MS - (Date.now() - lastLossPairAt)) / 60000)}min remaining`);
    return false;
  }

  // PAIR-SPECIFIC ROUTER: lookup route for later gate check
  ensureRoutingTable();
  const route = routingTable.get(symbol);

  // Get strategy stats
  const allStats = getAllLabStats();
  const stats = allStats.find(s => s.id === strategyId);
  if (!stats || stats.disabled) return false;

  const total = stats.wins + stats.losses;
  const globalWR = total > 0 ? stats.wins / total : 0;
  const wr = Math.round(globalWR * 100);

  // PROOF GATE + pair-specific WR
  let pairWR: number | null = null;
  let effectiveWR = globalWR;
  const ps = getStrategyPairStats(strategyId);
  const pairEntry = ps?.get(symbol) ?? null;
  const pairTrades = pairEntry ? pairEntry.wins + pairEntry.losses : 0;

  // PROOF GATE: exige prova estatística neste par antes de executar
  if (pairTrades < PROOF_MIN_PAIR_TRADES) {
    labMetrics = { ...labMetrics, proofBlocked: labMetrics.proofBlocked + 1 };
    console.log(`[LabTrade] PROOF BLOCKED ${symbol} — ${pairTrades}/${PROOF_MIN_PAIR_TRADES} trades`);
    return false;
  }

  if (pairEntry && pairTrades >= MIN_PAIR_TRADES) {
    pairWR = Math.round((pairEntry.wins / pairTrades) * 100);
    effectiveWR = pairEntry.wins / pairTrades;
  }

  // ROUTING GATE: permite melhor estratégia por par, com margem de 3pp para evitar deadlock
  if (route && route.strategyId !== strategyId) {
    const thisWR = pairWR ?? wr;
    if (thisWR < route.pairWR - 3) {
      labMetrics = { ...labMetrics, routeRejected: labMetrics.routeRejected + 1 };
      console.log(`[ROUTE-REJECT] ${symbol}: strategy ${strategyId} WR=${thisWR}% < route best ${route.strategyId} WR=${route.pairWR}% (margin 3pp)`);
      return false;
    }
  }

  // DYNAMIC PAYOUT CHECK: minimum payout based on the WR for THIS pair
  const minPayout = getMinPayout(effectiveWR);
  if (payout < minPayout) {
    labMetrics = { ...labMetrics, payoutRejected: labMetrics.payoutRejected + 1 };
    // Only log occasionally to avoid spam
    if (Math.random() < 0.05) {
      console.log(`[SnapTrade] LAB PAYOUT SKIP: ${symbol} payout ${(payout * 100).toFixed(0)}% < required ${(minPayout * 100).toFixed(0)}% (WR:${Math.round(effectiveWR * 100)}%, BE:${((1 - effectiveWR) / effectiveWR * 100).toFixed(0)}%)`);
    }
    return false;
  }

  candidateSignals.push({ id: strategyId, sym: symbol, dir: direction, wr, pairWR, payout });

  // If we already have a pending signal, prefer the one with higher pair-specific WR
  if (pendingSignal) {
    const newPairWR = pairWR ?? wr;
    const existingPairWR = pendingSignal.pairWR ?? pendingSignal.wr;
    if (newPairWR <= existingPairWR) return false;
  }

  labMetrics = { ...labMetrics, queued: labMetrics.queued + 1 };
  persistMetrics();
  const m5 = nextM5Open();
  pendingSignal = { strategyId, strategyName: stats.name, symbol, direction, payout, wr, pairWR, trades: total, m5Open: m5, queuedAt: Date.now() };
  console.log(`[SnapTrade] LAB QUEUED: ${direction} ${symbol} via ${stats.name} (WR:${wr}%, pair:${pairWR ?? '?'}%) [ROUTED: ${route?.pairWR ?? 'open'}%]`);

  // Trigger AI validation for this specific trade (async, fires before processPending)
  // Result cached in pendingValidations — checked by AI gate in processPending
  const aiCandidates = buildLabAiCandidates([{ strategyId, symbol, direction, payout }]);
  if (aiCandidates.length > 0) {
    const m1 = getCandles(symbol, 'M1');
    const m5 = getCandles(symbol, 'M5');
    validateLabSignals(aiCandidates, m1, m5, {} as any).catch(() => {});
  }

  return true;
}

/** SET 2 of 2 for nextTradeAllowedAt. */
export function notifyTradeClose(isWin: boolean): void {
  // Clear pending order timeout — we got a real close event
  if (pendingOrderTimeout) { clearTimeout(pendingOrderTimeout); pendingOrderTimeout = null; }
  if (isWin) mmWins++; else mmLosses++;
  nextTradeAllowedAt = Date.now() + GAP_MS;
  const closedAsset = activeLabTradeAsset;
  const closedSymbol = closedAsset?.replace(/ OTC/i, '_otc').replace(/[\s/]/g, '') ?? null;
  activeLabTradeAsset = null;
  lastLossPair = isWin ? null : closedSymbol;
  lastLossPairAt = isWin ? 0 : Date.now();
  persistState();
  console.log(`[SnapTrade] LAB CLOSED: ${isWin ? 'WIN' : 'LOSS'} | MM: ${mmWins}W/${mmLosses}L | next stake: $${computeStake().toFixed(2)} | gate: ${(GAP_MS / 60000).toFixed(0)}min${lastLossPair ? ` | cooldown: ${lastLossPair}` : ''}`);
  updateTradeLogResult(isWin);

  // Record AI validation outcome for this trade
  if (lastStrategyId && closedSymbol) {
    recordLabAiOutcome(lastStrategyId, closedSymbol, isWin);
  }
}

export function getActiveLabTradeAsset(): string | null { return activeLabTradeAsset; }

// ─── Processor (runs every 2s) ───

const AI_GATE_WAIT_MS = 35_000; // max 35s wait for AI response before fail-open

async function processPending(): Promise<void> {
  if (!initialized || !pendingSignal) return;
  if (Date.now() < nextTradeAllowedAt) { candidateSignals = []; pendingSignal = null; return; }
  if (!tradeExecutor && !pendingTradeExecutor) return;

  // ─── Regime Gate: block trades when market regime is adverse ───
  if (isRegimeBlocked()) {
    labMetrics = { ...labMetrics, regimeBlocked: labMetrics.regimeBlocked + 1 };
    console.log(`[SnapTrade] LAB REGIME BLOCKED: ${pendingSignal.direction} ${pendingSignal.symbol} via ${pendingSignal.strategyName} — regime detector active`);
    candidateSignals = [];
    pendingSignal = null;
    return;
  }

  const sig = pendingSignal;

  // ─── AI Gate: wait for AI validation before executing ───
  const aiResult = getLabAiResult(sig.strategyId, sig.symbol);
  const signalAge = Date.now() - sig.queuedAt;
  if (!aiResult && signalAge < AI_GATE_WAIT_MS) {
    // AI hasn't responded yet and we haven't waited long enough — retry next cycle
    return;
  }

  // Consume pendingSignal — we're either proceeding or rejecting
  pendingSignal = null;

  let livePayout = sig.payout;
  if (payoutChecker) { const live = payoutChecker(sig.symbol); if (live !== null) livePayout = live; }
  const labPayout = getLabPayout(sig.symbol);
  if (labPayout !== null && labPayout < livePayout) livePayout = labPayout;

  // Dynamic payout check at execution time (payout may have changed since signal)
  const effectiveWR = (sig.pairWR ?? sig.wr) / 100;
  const minPayout = getMinPayout(effectiveWR);
  if (livePayout < minPayout) {
    console.log(`[SnapTrade] LAB BLOCKED: ${sig.symbol} payout ${(livePayout * 100).toFixed(0)}% < required ${(minPayout * 100).toFixed(0)}% for ${sig.wr}% WR (BE:${((1 - effectiveWR) / effectiveWR * 100).toFixed(0)}%+${(PAYOUT_SAFETY_MARGIN * 100).toFixed(0)}pp)`);
    candidateSignals = [];
    return;
  }
  if (aiResult && aiResult.decision === 'REJECT') {
    labMetrics = { ...labMetrics, aiRejected: labMetrics.aiRejected + 1 };
    console.log(`[SnapTrade] LAB AI GATE: REJECTED ${sig.direction} ${sig.symbol} via ${sig.strategyName} — ${aiResult.reasoning} (confidence: ${aiResult.confidence})`);
    candidateSignals = [];
    return;
  }
  if (aiResult && aiResult.decision === 'WAIT') {
    labMetrics = { ...labMetrics, aiWait: labMetrics.aiWait + 1 };
    console.log(`[SnapTrade] LAB AI GATE: WAIT ${sig.direction} ${sig.symbol} via ${sig.strategyName} — ${aiResult.reasoning} (confidence: ${aiResult.confidence})`);
    candidateSignals = [];
    return;
  }
  // AI CONFIRM or no result yet (fail-open: trade proceeds if AI hasn't responded)
  if (aiResult) {
    labMetrics = { ...labMetrics, aiApproved: labMetrics.aiApproved + 1 };
    console.log(`[SnapTrade] LAB AI GATE: CONFIRMED ${sig.direction} ${sig.symbol} — ${aiResult.reasoning}`);
  } else {
    labMetrics = { ...labMetrics, aiTimeout: labMetrics.aiTimeout + 1 };
    console.log(`[SnapTrade] LAB AI GATE: TIMEOUT (fail-open) ${sig.direction} ${sig.symbol} via ${sig.strategyName}`);
  }

  const stake = getStakeWithCycleReset();
  const balanceBefore = readDemoBalance();
  const asset = sig.symbol.includes('_otc') ? sig.symbol.replace('_otc', ' OTC') : sig.symbol;
  const openTimeStr = formatOpenTimeServer(sig.m5Open);

  // SET 1 of 2 — BEFORE execution (now + expiry + gap)
  nextTradeAllowedAt = Date.now() + EXPIRY_MS + GAP_MS;
  activeLabTradeAsset = asset;
  lastStrategyId = sig.strategyId;
  persistState();

  let ok = false;
  let ticket: string | undefined;

  // Execution path: pending orders for REAL accounts (exact M5 open timing via WS),
  // direct trade for DEMO accounts (PO pending orders don't execute on demo).
  const isDemo = demoChecker ? demoChecker() : true; // default to demo if checker not registered

  if (!isDemo && pendingTradeExecutor) {
    // REAL account: use pending orders for exact M5 open timing
    const result = await pendingTradeExecutor(asset, sig.direction, stake, EXPIRY_MIN, openTimeStr, false, minPayout);
    ok = result.success;
    ticket = result.ticket;
    if (ok) {
      labMetrics = { ...labMetrics, traded: labMetrics.traded + 1 };
      persistMetrics();
      const be = ((1 - effectiveWR) / effectiveWR * 100).toFixed(0);
      const edge = ((livePayout - (1 - effectiveWR) / effectiveWR) * 100).toFixed(1);
      console.log(`[SnapTrade] LAB PENDING ORDER: ${sig.direction} ${asset} $${stake.toFixed(2)} via ${sig.strategyName} (WR:${sig.wr}% pair:${sig.pairWR ?? '?'}%) payout:${(livePayout * 100).toFixed(0)}% (BE:${be}% edge:+${edge}pp) open:${openTimeStr} ticket:${ticket ?? 'N/A'}`);
    }
  } else if (tradeExecutor) {
    // DEMO account: direct trade at M5 open (pending orders don't work on demo)
    ok = await tradeExecutor(asset, sig.direction, stake, EXPIRY_MIN, true);
    if (ok) {
      labMetrics = { ...labMetrics, traded: labMetrics.traded + 1 };
      persistMetrics();
      const be = ((1 - effectiveWR) / effectiveWR * 100).toFixed(0);
      const edge = ((livePayout - (1 - effectiveWR) / effectiveWR) * 100).toFixed(1);
      console.log(`[SnapTrade] LAB TRADE (demo): ${sig.direction} ${asset} $${stake.toFixed(2)} via ${sig.strategyName} (WR:${sig.wr}% pair:${sig.pairWR ?? '?'}%) payout:${(livePayout * 100).toFixed(0)}% (BE:${be}% edge:+${edge}pp) | candidates: ${candidateSignals.length}`);
    }
  }

  if (!ok) {
    console.log(`[SnapTrade] LAB EXEC FAILED: ${sig.direction} ${asset}`);
    nextTradeAllowedAt = Date.now() + GAP_MS; activeLabTradeAsset = null; persistState();
    candidateSignals = [];
    return;
  }

  // Safety timeout: if notifyTradeClose is never called (pending order expired,
  // PO cancelled silently, payout dropped, etc.), release the gate automatically.
  if (pendingOrderTimeout) clearTimeout(pendingOrderTimeout);
  const timeUntilExpiry = PENDING_EXEC_TIMEOUT_MS;
  pendingOrderTimeout = setTimeout(() => {
    if (activeLabTradeAsset) {
      console.log(`[SnapTrade] LAB TIMEOUT: pending order for ${activeLabTradeAsset} did not produce a close event — releasing gate`);
      activeLabTradeAsset = null;
      nextTradeAllowedAt = Date.now() + GAP_MS;
      persistState();
    }
    pendingOrderTimeout = null;
  }, timeUntilExpiry);

  const others = candidateSignals.filter(c => c.id !== sig.strategyId || c.sym !== sig.symbol);
  if (!ticket) {
    console.log(`[SnapTrade] LAB TRADE: ${sig.direction} ${asset} $${stake.toFixed(2)} via ${sig.strategyName} (WR:${sig.wr}%) payout:${(livePayout * 100).toFixed(0)}% | candidates: ${candidateSignals.length}`);
  }
  candidateSignals = [];
  askAiOpinion(sig.symbol, sig.direction, sig.strategyId).catch(() => {});
  appendTradeLog({
    s: sig.strategyId, sym: sig.symbol, dir: sig.direction, wr: sig.wr, pairWR: sig.pairWR,
    stake, payout: livePayout, candidates: others, offset: 0, balanceBefore,
    aiDecision: aiResult?.decision ?? null, aiConfidence: aiResult?.confidence ?? null,
  });
}

export function getLabToTradeStatus() {
  ensureRoutingTable();
  const gateMs = Math.max(0, nextTradeAllowedAt - Date.now());
  return {
    initialized, qualifying: getQualifyingStrategies().length,
    hasPending: !!pendingSignal, pendingSymbol: pendingSignal?.symbol ?? null,
    activeLabTrade: activeLabTradeAsset, lastLossPair,
    regimeBlocked: isRegimeBlocked(),
    gateRemainingMs: gateMs, gateRemainingMin: (gateMs / 60000).toFixed(1),
    masaniello: { wins: mmWins, losses: mmLosses, stake: computeStake(), cycle: mmWins + mmLosses + '/' + MM_CYCLE },
    routing: { pairsMapped: routingTable.size, lastUpdate: lastRoutingUpdate },
  };
}
