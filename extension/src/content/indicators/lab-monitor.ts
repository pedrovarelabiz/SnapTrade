/**
 * Lab Monitor v2 — Comprehensive trading & R&D dashboard.
 *
 * Tabbed interface with macro/micro views:
 * - Overview: system health, regime, session, key metrics
 * - Strategies: full ranking with AI/gale/pair stats
 * - Evolution: Phase 3 status, mutations, crossbreeds, hypotheses
 * - Pairs: per-pair best strategy analysis
 * - Feed: live trade event log
 */

import { getLabRanking, getAllLabStats, getLabEvents, getPendingCount, getTopStrategies, getPayoutTiers, type StrategyStats, type LabEvent } from './strategy-lab';
import { getSessionInfo } from './extra-indicators';
import { getRegimeSnapshot, type RegimeSnapshot } from './regime-detector';
import { getLabAiStats } from './lab-ai-validator';
import { getEvolutionState } from './strategy-evolution';
import { getLoaderStats } from './strategy-loader';
import { getShadowStats } from './shadow-tracker';
import { getLabTradeMetrics } from './lab-to-trade';

// ─── State ───

let panel: HTMLDivElement | null = null;
let collapsed = false;
let activeTab: 'overview' | 'strategies' | 'evolution' | 'pairs' | 'feed' = 'overview';
let docMouseMove: ((e: MouseEvent) => void) | null = null;
let docMouseUp: (() => void) | null = null;

// ─── Panel Creation ───

function ensurePanel(): boolean {
  if (panel && document.body.contains(panel)) return true;

  panel = document.createElement('div');
  panel.id = 'st-lab-monitor';
  panel.style.cssText = [
    'position:fixed', 'top:40px', 'right:8px', 'width:420px', 'max-height:90vh',
    'overflow-y:auto', 'background:rgba(8,12,28,0.96)', 'border:1px solid rgba(100,180,246,0.2)',
    'border-radius:10px', 'padding:0', 'z-index:10000',
    'font-family:system-ui,-apple-system,monospace', 'font-size:11px', 'color:#c8d0e0',
    'pointer-events:auto', 'backdrop-filter:blur(12px)',
    'box-shadow:0 4px 32px rgba(0,0,0,0.7)', 'user-select:none',
  ].join(';');

  const style = document.createElement('style');
  style.textContent = `
    #st-lab-monitor::-webkit-scrollbar { width: 4px; }
    #st-lab-monitor::-webkit-scrollbar-track { background: transparent; }
    #st-lab-monitor::-webkit-scrollbar-thumb { background: rgba(100,180,246,0.3); border-radius: 2px; }
    .st-tab { padding:4px 8px; cursor:pointer; font-size:9px; color:#666; border-bottom:2px solid transparent; letter-spacing:0.5px; transition:all 0.2s; }
    .st-tab:hover { color:#aaa; }
    .st-tab.active { color:#64B5F6; border-bottom-color:#64B5F6; }
    .st-section { padding:6px 10px; border-bottom:1px solid rgba(100,180,246,0.08); }
    .st-section-title { font-size:9px; color:#64B5F6; letter-spacing:0.5px; margin-bottom:4px; }
    .st-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 8px; font-size:10px; }
    .st-label { color:#666; }
    .st-bar { height:3px; border-radius:2px; transition:width 0.3s; }
    .st-pill { font-size:8px; padding:1px 4px; border-radius:3px; margin-left:3px; }
  `;
  document.head.appendChild(style);

  let isDragging = false;
  let startX = 0, startY = 0, startRight = 0, startTop = 0;

  const onMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).dataset.clickable) return;
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    startRight = parseInt(panel!.style.right) || 8;
    startTop = parseInt(panel!.style.top) || 40;
    e.preventDefault();
  };

  docMouseMove = (e: MouseEvent) => {
    if (!isDragging || !panel) return;
    panel.style.right = `${startRight - (e.clientX - startX)}px`;
    panel.style.top = `${startTop + (e.clientY - startY)}px`;
  };
  docMouseUp = () => { isDragging = false; };

  panel.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', docMouseMove);
  document.addEventListener('mouseup', docMouseUp);

  document.body.appendChild(panel);
  return true;
}

// ─── Helpers ───

function fmt(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function pct(n: number, d: number): number { return d > 0 ? Math.round((n / d) * 100) : 0; }

function clr(wr: number): string {
  return wr >= 60 ? '#4CAF50' : wr >= 52 ? '#8BC34A' : wr >= 48 ? '#FFA726' : '#f44336';
}

function pnlClr(v: number): string { return v >= 0 ? '#4CAF50' : '#f44336'; }

function pnlStr(v: number): string { return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`; }

function pill(text: string, color: string, bg: string): string {
  return `<span class="st-pill" style="color:${color};background:${bg}">${text}</span>`;
}

function bar(value: number, max: number, color: string): string {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return `<div style="background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;height:3px;margin-top:2px"><div class="st-bar" style="width:${w}%;background:${color}"></div></div>`;
}

// ─── Header + Tabs ───

function renderHeader(): string {
  const session = getSessionInfo();
  const sessionLabel = session.session.replace(/_/g, '/').toUpperCase();
  const sessionColor = session.isHighLiquidity ? '#4CAF50' : '#FF9800';
  const now = new Date();
  const utcTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  const regime = getRegimeSnapshot();
  const regColor = { stable: '#4CAF50', warning: '#FF9800', blocked: '#f44336' }[regime.state];

  return `
    <div style="padding:6px 10px 4px;display:flex;justify-content:space-between;align-items:center;cursor:move">
      <span style="font-weight:700;font-size:11px;color:#64B5F6;letter-spacing:1px">SNAPTRADE LAB</span>
      <span style="font-size:9px;color:#888">${utcTime} UTC | <span style="color:${sessionColor}">${sessionLabel}</span> | <span style="color:${regColor}">${regime.state.toUpperCase()}</span></span>
      <span data-clickable="1" id="st-lab-collapse" style="cursor:pointer;color:#666;font-size:14px">${collapsed ? '+' : '\u2212'}</span>
    </div>
    <div style="display:flex;border-bottom:1px solid rgba(100,180,246,0.15);padding:0 6px">
      ${['overview', 'strategies', 'evolution', 'pairs', 'feed'].map(t =>
        `<div data-clickable="1" data-tab="${t}" class="st-tab ${activeTab === t ? 'active' : ''}">${t.toUpperCase()}</div>`
      ).join('')}
    </div>
  `;
}

// ─── TAB: Overview ───

function renderOverview(): string {
  const allStats = getAllLabStats();
  const withTrades = allStats.filter(s => s.wins + s.losses > 0);
  const disabled = allStats.filter(s => s.disabled).length;
  const loader = getLoaderStats();
  const regime = getRegimeSnapshot();
  const evo = getEvolutionState();
  const ai = getLabAiStats();
  const shadow = getShadowStats();
  const pending = getPendingCount();

  const total = withTrades.reduce((a, s) => a + s.wins + s.losses, 0);
  const totalWins = withTrades.reduce((a, s) => a + s.wins, 0);
  const gTotal = withTrades.reduce((a, s) => a + s.gatedWins + s.gatedLosses, 0);
  const gWins = withTrades.reduce((a, s) => a + s.gatedWins, 0);
  const flatPnl = withTrades.reduce((a, s) => a + s.flatPnl, 0);
  const galeSig = withTrades.reduce((a, s) => a + s.galeSignal.totalPnl, 0);
  const galeCdl = withTrades.reduce((a, s) => a + s.galeCandle.totalPnl, 0);
  const top = getTopStrategies(3);
  const metrics = getLabTradeMetrics();

  // Regime section
  const wrArrow = regime.wrTrend === 'rising' ? '\u25B2' : regime.wrTrend === 'falling' ? '\u25BC' : '\u25CF';
  const volClr = regime.volatilityIndex > 70 ? '#f44336' : regime.volatilityIndex > 55 ? '#FF9800' : '#4CAF50';
  const alerts = regime.alerts.slice(-3).reverse().map(a => {
    const c = a.severity === 'critical' ? '#f44336' : a.severity === 'warning' ? '#FF9800' : '#64B5F6';
    return `<div style="color:${c};font-size:9px">${fmt(a.time)} ${a.message}</div>`;
  }).join('');

  return `
    <!-- Regime -->
    <div class="st-section" style="background:${regime.state === 'blocked' ? 'rgba(244,67,54,0.08)' : regime.state === 'warning' ? 'rgba(255,152,0,0.05)' : 'rgba(76,175,80,0.03)'}">
      <div class="st-section-title">MARKET REGIME</div>
      <div class="st-grid">
        <span class="st-label">WR (rolling):</span>
        <span><span style="color:${clr(regime.globalWR)}">${regime.globalWR}%</span> <span style="color:${regime.wrTrend === 'rising' ? '#4CAF50' : '#f44336'};font-size:9px">${wrArrow}</span> (prev ${regime.prevGlobalWR}%)</span>
        <span class="st-label">Volatility:</span>
        <span style="color:${volClr}">${regime.volatilityIndex}% ${regime.volatilityTrend}</span>
        <span class="st-label">Sentinels:</span>
        <span style="color:${regime.sentinelsFailing >= 5 ? '#f44336' : '#4CAF50'}">${regime.sentinelsTotal - regime.sentinelsFailing}/${regime.sentinelsTotal} OK${regime.regimeClass !== 'stable' ? ` (${regime.regimeClass})` : ''}</span>
        <span class="st-label">Streaks:</span>
        <span>${regime.losingStreakCount} losing</span>
      </div>
      ${regime.state === 'blocked' ? `<div style="margin-top:4px;text-align:center"><span style="color:#f44336;font-weight:700;font-size:10px">TRADING BLOCKED</span>${regime.recoveryProgress > 0 ? ` <span style="color:#FF9800;font-size:9px">(${regime.recoveryProgress}% recovery)</span>` : ''}</div>${bar(regime.recoveryProgress, 100, '#FF9800')}` : ''}
      ${alerts}
    </div>

    <!-- Key Metrics -->
    <div class="st-section">
      <div class="st-section-title">PERFORMANCE</div>
      <div class="st-grid">
        <span class="st-label">Strategies:</span>
        <span>${loader.active}/${loader.total} active (${loader.builtin}B ${loader.crawler}C ${loader.evolved}E) ${disabled} off</span>
        <span class="st-label">Total trades:</span>
        <span>${total.toLocaleString()} (${pct(totalWins, total)}% WR)</span>
        <span class="st-label">Gated trades:</span>
        <span>${gTotal.toLocaleString()} (<span style="color:${clr(pct(gWins, gTotal))}">${pct(gWins, gTotal)}% WR</span>)</span>
        <span class="st-label">Pending:</span>
        <span style="color:#FFA726">${pending} virtual entries</span>
      </div>
    </div>

    <!-- Quality Gates -->
    <div class="st-section">
      <div class="st-section-title">QUALITY GATES</div>
      <div class="st-grid" style="font-size:9px">
        <span class="st-label">Proof (pair):</span>
        <span>${metrics.proofBlocked} blocked</span>
        <span class="st-label">Payout:</span>
        <span>${metrics.payoutRejected} rejected</span>
        <span class="st-label">Route:</span>
        <span>${metrics.routeRejected} suboptimal</span>
      </div>
    </div>

    <!-- P&L Comparison -->
    <div class="st-section">
      <div class="st-section-title">P&L COMPARISON</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;text-align:center;font-size:10px">
        <div style="background:rgba(255,255,255,0.03);padding:4px;border-radius:4px">
          <div class="st-label">Flat</div>
          <div style="color:${pnlClr(flatPnl)};font-size:13px;font-weight:700">${pnlStr(flatPnl)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.03);padding:4px;border-radius:4px">
          <div class="st-label">Gale Signal</div>
          <div style="color:${pnlClr(galeSig)};font-size:13px;font-weight:700">${pnlStr(galeSig)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.03);padding:4px;border-radius:4px">
          <div class="st-label">Gale Candle</div>
          <div style="color:${pnlClr(galeCdl)};font-size:13px;font-weight:700">${pnlStr(galeCdl)}</div>
        </div>
      </div>
    </div>

    <!-- Top 3 + AI -->
    <div class="st-section">
      <div class="st-section-title">TOP STRATEGIES</div>
      ${top.map((s, i) => {
        const t = s.gatedWins + s.gatedLosses;
        const wr = pct(s.gatedWins, t);
        return `<div style="display:flex;justify-content:space-between;font-size:10px;padding:1px 0">
          <span>${i + 1}. ${s.name}</span>
          <span style="color:${clr(wr)};font-weight:600">${wr}% <span style="color:#666">(${t}t)</span> <span style="color:${pnlClr(s.flatPnl)}">${pnlStr(s.flatPnl)}</span></span>
        </div>`;
      }).join('')}
    </div>

    <!-- AI OPINION — Comparative Analysis -->
    <div class="st-section">
      <div class="st-section-title">AI VALIDATION IMPACT</div>
      ${(() => {
        const aiValWins = withTrades.reduce((a, s) => a + s.aiValidatedWins, 0);
        const aiValLosses = withTrades.reduce((a, s) => a + s.aiValidatedLosses, 0);
        const aiRejWins = withTrades.reduce((a, s) => a + s.aiRejectedWins, 0);
        const aiRejLosses = withTrades.reduce((a, s) => a + s.aiRejectedLosses, 0);
        const aiValTotal = aiValWins + aiValLosses;
        const aiRejTotal = aiRejWins + aiRejLosses;
        const aiValWR = pct(aiValWins, aiValTotal);
        const aiRejWR = pct(aiRejWins, aiRejTotal);
        const baseWR = pct(totalWins, total);
        const delta = aiValWR - baseWR;

        if (aiValTotal === 0 && ai.calls === 0) {
          return `<div style="font-size:10px;color:#555">AI validation not yet active (needs 100+ gated trades per strategy)</div>`;
        }

        return `
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;text-align:center;font-size:10px;margin-bottom:4px">
            <div style="background:rgba(255,255,255,0.03);padding:4px;border-radius:4px">
              <div class="st-label">Without AI</div>
              <div style="color:${clr(baseWR)};font-size:14px;font-weight:700">${baseWR}%</div>
              <div style="color:#555;font-size:9px">${total} trades</div>
            </div>
            <div style="background:rgba(100,180,246,0.06);padding:4px;border-radius:4px;border:1px solid rgba(100,180,246,0.15)">
              <div style="color:#64B5F6;font-size:9px">AI Validated</div>
              <div style="color:${clr(aiValWR)};font-size:14px;font-weight:700">${aiValWR}%</div>
              <div style="color:#555;font-size:9px">${aiValTotal} trades</div>
            </div>
            <div style="background:rgba(255,152,0,0.06);padding:4px;border-radius:4px">
              <div style="color:#FF9800;font-size:9px">AI Rejected</div>
              <div style="color:${clr(aiRejWR)};font-size:14px;font-weight:700">${aiRejWR}%</div>
              <div style="color:#555;font-size:9px">${aiRejTotal} trades</div>
            </div>
          </div>
          <div style="text-align:center;font-size:10px">
            ${delta > 0 ? `<span style="color:#4CAF50;font-weight:600">AI adds +${delta}pp to WR</span>` : delta < 0 ? `<span style="color:#f44336">AI reduces WR by ${delta}pp</span>` : `<span style="color:#888">No AI impact yet</span>`}
            ${aiRejTotal > 0 && aiRejWR < 50 ? ` <span style="color:#4CAF50;font-size:9px">| Rejected trades confirm bad (${aiRejWR}% WR)</span>` : ''}
          </div>
          <div style="margin-top:3px;font-size:9px;color:#666">AI calls: ${ai.calls} | Pending: ${ai.pending}${ai.disabled ? ' | <span style="color:#f44336">DISABLED</span>' : ''}</div>
        `;
      })()}
    </div>

    <!-- Payout Tiers -->
    <div class="st-section">
      <div class="st-section-title">PAYOUT TIERS</div>
      <div style="display:flex;gap:6px;font-size:9px">
        ${getPayoutTiers().map(t => {
          const tierClr = t.label === 'premium_otc' ? '#4CAF50' : t.label === 'standard' ? '#FFA726' : '#f44336';
          return `<span style="color:${tierClr};padding:2px 6px;background:rgba(255,255,255,0.03);border-radius:3px">${t.label.replace('_otc', '')}: ${Math.round(t.minPayout * 100)}%+ (BE: ${Math.round(t.breakEven * 100)}%)</span>`;
        }).join('')}
      </div>
    </div>

    <!-- Shadow Tracker -->
    ${shadow.totalSignals > 0 ? `
    <div class="st-section">
      <div class="st-section-title">SHADOW TRACKER</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;font-size:9px">
        <span>M1 imm: <span style="color:${clr(shadow.immediateM1.rate)}">${shadow.immediateM1.rate}%</span> (${shadow.immediateM1.wins + shadow.immediateM1.losses}t)</span>
        <span>M5 imm: <span style="color:${clr(shadow.immediateM5.rate)}">${shadow.immediateM5.rate}%</span> (${shadow.immediateM5.wins + shadow.immediateM5.losses}t)</span>
        <span>M1 del: <span style="color:${clr(shadow.delayedM1.rate)}">${shadow.delayedM1.rate}%</span> (${shadow.delayedM1.wins + shadow.delayedM1.losses}t)</span>
        <span>M5 del: <span style="color:${clr(shadow.delayedM5.rate)}">${shadow.delayedM5.rate}%</span> (${shadow.delayedM5.wins + shadow.delayedM5.losses}t)</span>
      </div>
    </div>` : ''}

    <!-- Evolution Quick Status -->
    <div class="st-section">
      <div class="st-section-title">EVOLUTION ENGINE</div>
      <div class="st-grid" style="font-size:10px">
        <span class="st-label">Cycle:</span>
        <span>#${evo.cycleCount} | ${evo.isRunning ? '<span style="color:#4CAF50">RUNNING</span>' : '<span style="color:#f44336">STOPPED</span>'}</span>
        <span class="st-label">Last run:</span>
        <span>${evo.lastCycleAt > 0 ? fmt(evo.lastCycleAt) : 'never'}</span>
        <span class="st-label">Next in:</span>
        <span>${evo.nextCycleIn > 0 ? `${Math.floor(evo.nextCycleIn / 3600000)}h ${Math.round((evo.nextCycleIn % 3600000) / 60000)}m` : 'pending'}</span>
      </div>
    </div>
  `;
}

// ─── TAB: Strategies ───

function renderStrategiesTab(): string {
  const allStats = getAllLabStats();
  const withTrades = allStats.filter(s => s.wins + s.losses > 0);
  if (withTrades.length === 0) return '<div class="st-section" style="color:#666">No trades yet...</div>';

  // Sort by WR descending (like the old dashboard), tiebreak by volume
  const sorted = [...withTrades].sort((a, b) => {
    const wrA = a.wins / (a.wins + a.losses);
    const wrB = b.wins / (b.wins + b.losses);
    if (wrB !== wrA) return wrB - wrA;
    return (b.wins + b.losses) - (a.wins + a.losses);
  });

  // Summary bar
  const totalTrades = sorted.reduce((a, s) => a + s.wins + s.losses, 0);
  const totalWins = sorted.reduce((a, s) => a + s.wins, 0);
  const above55 = sorted.filter(s => s.wins / (s.wins + s.losses) >= 0.55).length;
  const below45 = sorted.filter(s => s.wins / (s.wins + s.losses) < 0.45).length;
  const disabled = sorted.filter(s => s.disabled).length;

  return `
    <div style="padding:4px 10px;font-size:9px;color:#888;border-bottom:1px solid rgba(100,180,246,0.08)">
      ${sorted.length} strategies | ${totalTrades.toLocaleString()} trades | <span style="color:#4CAF50">${above55} above 55%</span> | <span style="color:#f44336">${below45} below 45%</span> | ${disabled} disabled
    </div>
    <div style="padding:2px 10px;display:flex;justify-content:space-between;font-size:8px;color:#555;border-bottom:1px solid rgba(100,180,246,0.05)">
      <span># Name</span>
      <span style="display:flex;gap:6px"><span>WR%</span><span>@Sig</span><span>PnL</span></span>
    </div>
    ${sorted.map((s, i) => renderStrategyRow(s, i)).join('')}
  `;
}

function renderStrategyRow(s: StrategyStats, idx: number): string {
  const total = s.wins + s.losses;
  const wr = pct(s.wins, total);
  const gTotal = s.gatedWins + s.gatedLosses;
  const gWR = pct(s.gatedWins, gTotal);
  const recent = (s.recentResults as readonly string[]).slice(-10).map(c =>
    c === 'W' ? '<span style="color:#4CAF50">W</span>' : '<span style="color:#f44336">L</span>'
  ).join('');

  // Source pill
  const src = s.id.startsWith('crawler_') ? pill('C', '#FFB74D', 'rgba(255,183,77,0.15)')
    : s.id.startsWith('evolved_') || s.id.startsWith('hybrid_') || s.id.startsWith('hypothesis_')
      ? pill('E', '#CE93D8', 'rgba(206,147,216,0.15)')
      : '';

  // Timeframe badge (bordered like the old one)
  const tfBadge = (color: string, label: string, border: string) =>
    `<span style="color:${color};font-size:8px;font-weight:700;margin-left:3px;padding:0 2px;border:1px solid ${border};border-radius:2px">${label}</span>`;
  const isM5M1 = s.id.endsWith('_m5_m1opt');
  const isM5g = s.id.endsWith('_m5g');
  const isM5 = !isM5M1 && !isM5g && s.id.endsWith('_m5');
  const tf = isM5M1 ? tfBadge('#CE93D8', 'M5+M1', 'rgba(206,147,216,0.3)')
    : isM5g ? tfBadge('#FFB74D', 'M5g', 'rgba(255,183,77,0.3)')
    : isM5 ? tfBadge('#64B5F6', 'M5', 'rgba(100,180,246,0.3)')
    : tfBadge('#888', 'M1', 'rgba(136,136,136,0.2)');

  const disTag = s.disabled ? '<span style="color:#f44336;font-size:8px;margin-left:2px">OFF</span>' : '';

  // AI validation: WR with vs without AI
  const aiTotal = s.aiValidatedWins + s.aiValidatedLosses;
  const aiRejTotal = s.aiRejectedWins + s.aiRejectedLosses;
  const aiWR = aiTotal > 0 ? pct(s.aiValidatedWins, aiTotal) : -1;
  const aiRejWR = aiRejTotal > 0 ? pct(s.aiRejectedWins, aiRejTotal) : -1;
  const aiTag = aiWR >= 0 ? `<span style="color:#64B5F6;font-size:8px;margin-left:2px">AI:${aiWR}%</span>` : '';

  // @Signal comparison: entry at signal candle close vs entry at next candle open
  const asTotal = s.atSignalWins + s.atSignalLosses;
  const asRate = asTotal > 0 ? pct(s.atSignalWins, asTotal) : -1;

  // Gale comparison (F=flat, S=signal gale, C=candle gale)
  const hasGale = s.flatPnl !== 0 || s.galeSignal.totalPnl !== 0 || s.galeCandle.totalPnl !== 0;
  const galeStr = hasGale
    ? `F:<span style="color:${pnlClr(s.flatPnl)}">${pnlStr(s.flatPnl)}</span> S:<span style="color:${pnlClr(s.galeSignal.totalPnl)}">${pnlStr(s.galeSignal.totalPnl)}</span> C:<span style="color:${pnlClr(s.galeCandle.totalPnl)}">${pnlStr(s.galeCandle.totalPnl)}</span>`
    : '';

  const scoreStr = s.score > 0 ? `S:${(s.score * 100).toFixed(0)}` : '';
  const ddStr = s.maxDrawdown > 0 ? `<span style="color:#f44336">DD:${s.maxDrawdown.toFixed(1)}</span>` : '';

  // WR bar background (gradient fill like original)
  const barColor = wr >= 60 ? `rgba(76,175,80,${0.3 + wr / 200})`
    : wr >= 50 ? `rgba(255,167,38,${0.3 + wr / 200})`
    : `rgba(244,67,54,${0.3 + wr / 200})`;

  // AI comparison row (if data available)
  const aiCompare = aiWR >= 0 ? `
    <div style="display:flex;gap:6px;font-size:8px;margin-top:1px;padding:1px 0;border-top:1px solid rgba(255,255,255,0.02)">
      <span style="color:#64B5F6">AI Validated: <b>${aiWR}%</b> (${aiTotal}t)</span>
      ${aiRejWR >= 0 ? `<span style="color:#FF9800">AI Rejected: <b>${aiRejWR}%</b> (${aiRejTotal}t)</span>` : ''}
      ${aiWR >= 0 && aiRejWR >= 0 ? `<span style="color:${aiWR > aiRejWR ? '#4CAF50' : '#f44336'}">Delta: ${aiWR > aiRejWR ? '+' : ''}${aiWR - aiRejWR}pp</span>` : ''}
    </div>
  ` : '';

  return `
    <div style="padding:2px 10px;position:relative;font-size:10px${s.disabled ? ';opacity:0.35' : ''}">
      <div style="position:absolute;left:0;top:0;bottom:0;width:${wr}%;background:${barColor};opacity:0.12"></div>
      <div style="position:relative;display:flex;justify-content:space-between;align-items:center">
        <span style="color:#aaa;width:16px">${idx + 1}.</span>
        <span style="flex:1;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-right:4px">${s.name}${src}${tf}${disTag}${aiTag}</span>
        <span style="color:${clr(wr)};font-weight:700;min-width:30px;text-align:right">${wr}%</span>
        <span style="color:${asRate >= 0 ? (asRate >= 50 ? '#8BC34A' : '#FF9800') : '#555'};min-width:28px;text-align:right;margin-left:2px;font-size:9px">${asRate >= 0 ? `@${asRate}%` : ''}</span>
        <span style="color:${pnlClr(s.flatPnl)};min-width:38px;text-align:right;margin-left:2px;font-size:9px">${pnlStr(s.flatPnl)}</span>
      </div>
      <div style="position:relative;display:flex;justify-content:space-between;font-size:9px;line-height:1.1;margin-top:1px">
        <span style="color:#555">${s.wins}W/${s.losses}L (${total}) <span style="color:#64B5F6">${scoreStr}</span> ${ddStr} <span style="font-size:8px">${galeStr}</span></span>
        <span>${recent}</span>
      </div>
      ${aiCompare}
    </div>
  `;
}

// ─── TAB: Evolution ───

function renderEvolutionTab(): string {
  const evo = getEvolutionState();
  const loader = getLoaderStats();
  const allStats = getAllLabStats();

  // Evolved strategies breakdown
  const evolvedStats = allStats.filter(s =>
    s.id.startsWith('evolved_') || s.id.startsWith('hybrid_') || s.id.startsWith('hypothesis_')
  );
  const evolvedWithTrades = evolvedStats.filter(s => s.wins + s.losses > 0);
  const mutationStats = evolvedStats.filter(s => s.id.startsWith('evolved_'));
  const hybridStats = evolvedStats.filter(s => s.id.startsWith('hybrid_'));
  const hypothesisStats = evolvedStats.filter(s => s.id.startsWith('hypothesis_'));

  // Crawler stats
  const crawlerStats = allStats.filter(s => s.id.startsWith('crawler_'));
  const crawlerWithTrades = crawlerStats.filter(s => s.wins + s.losses > 0);

  // Best evolved
  const bestEvolved = [...evolvedWithTrades]
    .filter(s => s.wins + s.losses >= 10)
    .sort((a, b) => {
      const wrA = a.gatedWins / Math.max(a.gatedWins + a.gatedLosses, 1);
      const wrB = b.gatedWins / Math.max(b.gatedWins + b.gatedLosses, 1);
      return wrB - wrA;
    }).slice(0, 5);

  const bestCrawler = [...crawlerWithTrades]
    .filter(s => s.wins + s.losses >= 10)
    .sort((a, b) => {
      const wrA = a.gatedWins / Math.max(a.gatedWins + a.gatedLosses, 1);
      const wrB = b.gatedWins / Math.max(b.gatedWins + b.gatedLosses, 1);
      return wrB - wrA;
    }).slice(0, 5);

  return `
    <!-- Pipeline Status -->
    <div class="st-section">
      <div class="st-section-title">PIPELINE STATUS</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;text-align:center;font-size:9px">
        <div style="background:rgba(76,175,80,0.1);padding:4px;border-radius:4px">
          <div style="color:#4CAF50;font-size:12px;font-weight:700">${loader.builtin}</div>
          <div class="st-label">Builtin</div>
        </div>
        <div style="background:rgba(255,183,77,0.1);padding:4px;border-radius:4px">
          <div style="color:#FFB74D;font-size:12px;font-weight:700">${loader.crawler}</div>
          <div class="st-label">Crawler</div>
        </div>
        <div style="background:rgba(206,147,216,0.1);padding:4px;border-radius:4px">
          <div style="color:#CE93D8;font-size:12px;font-weight:700">${loader.evolved}</div>
          <div class="st-label">Evolved</div>
        </div>
        <div style="background:rgba(100,180,246,0.1);padding:4px;border-radius:4px">
          <div style="color:#64B5F6;font-size:12px;font-weight:700">${loader.total}</div>
          <div class="st-label">Total</div>
        </div>
      </div>
      ${bar(loader.total, 150, loader.total > 140 ? '#f44336' : '#64B5F6')}
      <div style="font-size:8px;color:#555;text-align:right">${loader.total}/150 cap</div>
    </div>

    <!-- Evolution Cycle -->
    <div class="st-section">
      <div class="st-section-title">EVOLUTION CYCLE</div>
      <div class="st-grid" style="font-size:10px">
        <span class="st-label">Status:</span>
        <span>${evo.isRunning ? '<span style="color:#4CAF50">ACTIVE</span>' : '<span style="color:#f44336">STOPPED</span>'} | Cycle #${evo.cycleCount}</span>
        <span class="st-label">Last run:</span>
        <span>${evo.lastCycleAt > 0 ? new Date(evo.lastCycleAt).toLocaleString() : 'never'}</span>
        <span class="st-label">Next in:</span>
        <span>${evo.nextCycleIn > 0 ? `${Math.floor(evo.nextCycleIn / 86400000)}d ${Math.floor((evo.nextCycleIn % 86400000) / 3600000)}h` : 'pending warmup'}</span>
      </div>
    </div>

    <!-- Evolved Breakdown -->
    <div class="st-section">
      <div class="st-section-title">EVOLVED STRATEGIES (${evolvedStats.length})</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;text-align:center;font-size:9px">
        <div style="background:rgba(255,255,255,0.03);padding:3px;border-radius:3px">
          <div style="font-size:11px;font-weight:600">${mutationStats.length}</div>
          <div class="st-label">Mutations</div>
        </div>
        <div style="background:rgba(255,255,255,0.03);padding:3px;border-radius:3px">
          <div style="font-size:11px;font-weight:600">${hybridStats.length}</div>
          <div class="st-label">Hybrids</div>
        </div>
        <div style="background:rgba(255,255,255,0.03);padding:3px;border-radius:3px">
          <div style="font-size:11px;font-weight:600">${hypothesisStats.length}</div>
          <div class="st-label">AI Hypotheses</div>
        </div>
      </div>
      ${bestEvolved.length > 0 ? `
        <div style="margin-top:4px;font-size:9px;color:#CE93D8">Best evolved:</div>
        ${bestEvolved.map(s => {
          const t = s.gatedWins + s.gatedLosses;
          return `<div style="font-size:9px;padding:1px 0"><span style="color:#aaa">${s.name}</span> <span style="color:${clr(pct(s.gatedWins, t))}">${pct(s.gatedWins, t)}%</span> <span style="color:#555">(${t}t)</span></div>`;
        }).join('')}
      ` : '<div style="font-size:9px;color:#555;margin-top:4px">No evolved strategies with enough data yet</div>'}
    </div>

    <!-- Crawler Strategies -->
    <div class="st-section">
      <div class="st-section-title">CRAWLER STRATEGIES (${crawlerStats.length})</div>
      <div class="st-grid" style="font-size:10px">
        <span class="st-label">With trades:</span>
        <span>${crawlerWithTrades.length}/${crawlerStats.length}</span>
        <span class="st-label">Disabled:</span>
        <span>${loader.disabled}</span>
      </div>
      ${bestCrawler.length > 0 ? `
        <div style="margin-top:4px;font-size:9px;color:#FFB74D">Best crawler:</div>
        ${bestCrawler.map(s => {
          const t = s.gatedWins + s.gatedLosses;
          return `<div style="font-size:9px;padding:1px 0"><span style="color:#aaa">${s.name}</span> <span style="color:${clr(pct(s.gatedWins, t))}">${pct(s.gatedWins, t)}%</span> <span style="color:#555">(${t}t)</span></div>`;
        }).join('')}
      ` : ''}
    </div>
  `;
}

// ─── TAB: Pairs ───

function renderPairsTab(): string {
  const allStats = getAllLabStats();

  // Aggregate pair data across all strategies
  const pairAgg = new Map<string, { wins: number; losses: number; bestStrat: string; bestWR: number; stratCount: number }>();

  for (const stats of allStats) {
    if (!stats.pairStats) continue;
    for (const [pair, ps] of stats.pairStats) {
      const t = ps.wins + ps.losses;
      if (t < 3) continue;
      const existing = pairAgg.get(pair) ?? { wins: 0, losses: 0, bestStrat: '', bestWR: 0, stratCount: 0 };
      const wr = ps.wins / t;
      pairAgg.set(pair, {
        wins: existing.wins + ps.wins,
        losses: existing.losses + ps.losses,
        bestStrat: wr > existing.bestWR ? stats.id : existing.bestStrat,
        bestWR: Math.max(wr, existing.bestWR),
        stratCount: existing.stratCount + 1,
      });
    }
  }

  const pairs = Array.from(pairAgg.entries())
    .map(([pair, data]) => ({ pair, ...data, totalTrades: data.wins + data.losses, wr: pct(data.wins, data.wins + data.losses) }))
    .sort((a, b) => b.totalTrades - a.totalTrades);

  if (pairs.length === 0) return '<div class="st-section" style="color:#666">No pair data yet...</div>';

  return `
    <div style="padding:3px 10px;font-size:9px;color:#888">${pairs.length} pairs tracked</div>
    ${pairs.slice(0, 20).map(p => {
      const isOtc = p.pair.includes('_otc');
      const sym = p.pair.replace('_otc', '');
      return `
        <div style="padding:3px 10px;border-bottom:1px solid rgba(255,255,255,0.02);font-size:10px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="min-width:90px">${sym}${isOtc ? '<span style="color:#555;font-size:8px"> OTC</span>' : ''}</span>
            <span style="color:${clr(p.wr)};font-weight:600;min-width:35px">${p.wr}%</span>
            <span style="color:#666;font-size:9px;min-width:40px">${p.totalTrades}t</span>
            <span style="color:#888;font-size:9px;min-width:20px">${p.stratCount}s</span>
            <span style="color:${clr(Math.round(p.bestWR * 100))};font-size:9px">best: ${Math.round(p.bestWR * 100)}%</span>
          </div>
          ${bar(p.wr, 100, clr(p.wr))}
        </div>
      `;
    }).join('')}
  `;
}

// ─── TAB: Feed ───

function renderFeedTab(): string {
  const events = getLabEvents();
  const recent = events.slice(-30).reverse();

  if (recent.length === 0) return '<div class="st-section" style="color:#666">No events yet...</div>';

  return `
    <div style="padding:3px 10px;font-size:9px;color:#888">${events.length} total events</div>
    ${recent.map(ev => {
      const sym = ev.symbol.replace('_otc', '').substring(0, 8);
      const otc = ev.symbol.includes('_otc') ? '<span style="color:#555;font-size:7px">OTC</span>' : '';
      const dirClr = ev.direction === 'CALL' ? '#4CAF50' : '#f44336';
      const dirArr = ev.direction === 'CALL' ? '\u25B2' : '\u25BC';
      const typeClr = ev.type === 'win' ? '#4CAF50' : ev.type === 'loss' ? '#f44336' : ev.type === 'entry' ? '#64B5F6' : '#666';
      const typeLabel = ev.type.toUpperCase();

      return `
        <div style="padding:2px 10px;font-size:10px;display:flex;gap:4px;align-items:center;border-bottom:1px solid rgba(255,255,255,0.02)">
          <span style="color:#555;min-width:32px">${fmt(ev.time)}</span>
          <span style="color:${dirClr};min-width:10px">${dirArr}</span>
          <span style="color:#aaa;min-width:55px">${sym}${otc}</span>
          <span style="color:${typeClr};font-weight:600;min-width:34px">${typeLabel}</span>
          <span style="color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ev.strategy}</span>
        </div>
      `;
    }).join('')}
  `;
}

// ─── Public API ───

export function initLabMonitor(): void {
  setTimeout(() => { ensurePanel(); updateLabMonitor(); }, 3000);
}

let lastMonitorUpdate = 0;
const MONITOR_THROTTLE_MS = 5000;

export function updateLabMonitor(): void {
  const now = Date.now();
  if (now - lastMonitorUpdate < MONITOR_THROTTLE_MS) return;
  lastMonitorUpdate = now;

  if (!ensurePanel() || !panel) return;
  if (collapsed) {
    panel.innerHTML = renderHeader();
    attachListeners();
    return;
  }

  const tabContent = activeTab === 'overview' ? renderOverview()
    : activeTab === 'strategies' ? renderStrategiesTab()
    : activeTab === 'evolution' ? renderEvolutionTab()
    : activeTab === 'pairs' ? renderPairsTab()
    : renderFeedTab();

  panel.innerHTML = renderHeader() + tabContent;
  attachListeners();
}

function attachListeners(): void {
  const collapseBtn = document.getElementById('st-lab-collapse');
  if (collapseBtn) {
    collapseBtn.onclick = (e) => { e.stopPropagation(); collapsed = !collapsed; updateLabMonitor(); };
  }

  // Tab clicks
  panel?.querySelectorAll('[data-tab]').forEach(el => {
    (el as HTMLElement).onclick = (e) => {
      e.stopPropagation();
      activeTab = (el as HTMLElement).dataset.tab as typeof activeTab;
      updateLabMonitor();
    };
  });
}

export function destroyLabMonitor(): void {
  if (docMouseMove) { document.removeEventListener('mousemove', docMouseMove); docMouseMove = null; }
  if (docMouseUp) { document.removeEventListener('mouseup', docMouseUp); docMouseUp = null; }
  if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); panel = null; }
}
