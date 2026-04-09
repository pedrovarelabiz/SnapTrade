/**
 * Chart Overlay v4 — Setup-based floating indicator dashboard.
 * Shows actionable setup information: macro trend, active setups,
 * confidence bar, and signal recommendation.
 * Updates ONLY on candle close, NOT continuously.
 */

import { getAggregatedSetup, getDisplayState, type AggregatedSetup, type SymbolSummary } from './setup-detector';
import type { LlmAnalysis } from './llm-analyst';

type DisplayState = ReturnType<typeof getDisplayState>;

let panel: HTMLDivElement | null = null;
let running = false;
let currentLlmAnalysis: LlmAnalysis | null = null;
let lastSummaries: SymbolSummary[] = [];
let lastTrackedCount = 0;
let summaryCollapsed = false;

function ensurePanel(): boolean {
  if (panel) return true;

  panel = document.createElement('div');
  panel.id = 'st-indicator-panel';
  panel.style.cssText = [
    'position:fixed',
    'bottom:60px',
    'left:8px',
    'width:240px',
    'max-height:450px',
    'overflow-y:auto',
    'background:rgba(10,10,26,0.92)',
    'border:1px solid rgba(255,255,255,0.1)',
    'border-radius:10px',
    'padding:8px',
    'z-index:9999',
    'font-family:system-ui,-apple-system,sans-serif',
    'font-size:11px',
    'color:#e0e0e0',
    'pointer-events:auto',
    'backdrop-filter:blur(8px)',
    'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
  ].join(';');

  // Make draggable
  let isDragging = false;
  let startX = 0, startY = 0, startLeft = 0, startBottom = 0;
  const header = document.createElement('div');
  header.style.cssText = 'cursor:move;padding:2px 0 6px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;';
  header.innerHTML = '<span id="st-ind-header" style="font-weight:600;font-size:10px;color:#64B5F6;letter-spacing:0.5px">ST INDICATORS</span><span id="st-ind-toggle" style="cursor:pointer;color:#666;font-size:14px">&#8722;</span>';

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(panel!.style.left) || 8;
    startBottom = parseInt(panel!.style.bottom) || 60;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging || !panel) return;
    panel.style.left = (startLeft + (e.clientX - startX)) + 'px';
    panel.style.bottom = (startBottom - (e.clientY - startY)) + 'px';
  });

  document.addEventListener('mouseup', () => { isDragging = false; });

  panel.appendChild(header);

  // Content container
  const content = document.createElement('div');
  content.id = 'st-ind-content';
  panel.appendChild(content);

  // Minimize toggle
  let minimized = false;
  panel.querySelector('#st-ind-toggle')?.addEventListener('click', () => {
    minimized = !minimized;
    content.style.display = minimized ? 'none' : 'block';
    const toggle = panel!.querySelector('#st-ind-toggle');
    if (toggle) toggle.textContent = minimized ? '+' : '\u2212';
  });

  document.body.appendChild(panel);
  return true;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function buildConfidenceBar(confidence: number): string {
  const filled = Math.round(confidence / 10);
  const empty = 10 - filled;
  const color = confidence >= 70 ? '#4CAF50' : confidence >= 40 ? '#FF9800' : '#F44336';
  return `<span style="color:${color};">${'\u2588'.repeat(filled)}</span><span style="color:#333">${'\u2591'.repeat(empty)}</span>`;
}

function renderSetupRow(label: string, activeText: string, inactiveText: string, isActive: boolean, direction?: 'CALL' | 'PUT'): string {
  if (isActive) {
    const color = direction === 'CALL' ? '#4CAF50' : '#F44336';
    const arrow = direction === 'CALL' ? '\u25B2' : '\u25BC';
    return `
      <div style="display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
        <span style="font-size:10px;color:#aaa;width:60px">${label}</span>
        <span style="flex:1;font-size:10px;color:${color};font-weight:600">${activeText} ${arrow}</span>
      </div>`;
  }
  return `
    <div style="display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
      <span style="font-size:10px;color:#aaa;width:60px">${label}</span>
      <span style="flex:1;font-size:10px;color:#555">${inactiveText}</span>
    </div>`;
}

function formatSymbolShort(sym: string): string {
  // "EURUSD_otc" → "EUR/USD OTC", "EURUSD" → "EUR/USD"
  const isOtc = sym.includes('_otc') || sym.includes('OTC');
  const clean = sym.replace(/_otc/i, '').replace(/OTC/i, '');
  // Split pairs: 6-char forex pairs or known patterns
  const base = clean.length >= 6 ? clean.slice(0, 3) + '/' + clean.slice(3) : clean;
  return isOtc ? base + ' OTC' : base;
}

function buildMultiPairSummary(currentSymbol: string): string {
  const totalTracked = lastTrackedCount;
  const withSetups = lastSummaries.length;
  const tradeable = lastSummaries.filter(s => s.canTrade).length;

  if (totalTracked === 0) return '';

  const toggleIcon = summaryCollapsed ? '\u25B6' : '\u25BC';

  let html = `
    <div style="margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:6px">
      <div id="st-summary-toggle" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:2px 0">
        <span style="font-size:10px;font-weight:600;color:#64B5F6;letter-spacing:0.5px">MULTI-PAIR SCAN</span>
        <span style="font-size:9px;color:#888">
          <span style="color:#4CAF50;font-weight:600">${tradeable}</span> ready
          <span style="color:#888;margin:0 2px">/</span>
          <span style="color:#FF9800">${withSetups}</span> active
          <span style="color:#888;margin:0 2px">/</span>
          <span style="color:#555">${totalTracked}</span> tracked
          <span style="margin-left:4px;color:#555;font-size:8px">${toggleIcon}</span>
        </span>
      </div>`;

  if (!summaryCollapsed && lastSummaries.length > 0) {
    // Show top pairs (max 8)
    const topPairs = lastSummaries.slice(0, 8);
    html += '<div id="st-summary-list" style="margin-top:4px">';
    for (const s of topPairs) {
      const isCurrent = s.symbol === currentSymbol;
      const dirColor = s.direction === 'CALL' ? '#4CAF50' : s.direction === 'PUT' ? '#F44336' : '#555';
      const dirArrow = s.direction === 'CALL' ? '\u25B2' : s.direction === 'PUT' ? '\u25BC' : '\u25CF';
      const confColor = s.confidence >= 65 ? '#4CAF50' : s.confidence >= 40 ? '#FF9800' : '#666';
      const bgColor = isCurrent ? 'rgba(100,181,246,0.12)' : 'transparent';
      const borderLeft = isCurrent ? 'border-left:2px solid #64B5F6;padding-left:4px' : 'padding-left:6px';
      const tradeIcon = s.canTrade ? '<span style="color:#4CAF50;font-size:8px;margin-left:2px" title="Tradeable">&#9679;</span>' : '';
      const trendIcon = s.m5Trend === 'up' ? '<span style="color:#4CAF50;font-size:7px">\u25B2</span>'
        : s.m5Trend === 'down' ? '<span style="color:#F44336;font-size:7px">\u25BC</span>'
        : '<span style="color:#555;font-size:7px">\u25CF</span>';

      html += `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 4px;${borderLeft};background:${bgColor};border-radius:2px;margin-bottom:1px;font-size:9px">
          <span style="display:flex;align-items:center;gap:3px;flex:1;min-width:0">
            ${trendIcon}
            <span style="color:${isCurrent ? '#64B5F6' : '#ccc'};font-weight:${isCurrent ? '600' : '400'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${formatSymbolShort(s.symbol)}</span>
            ${tradeIcon}
          </span>
          <span style="display:flex;align-items:center;gap:4px;flex-shrink:0">
            <span style="color:${dirColor};font-weight:600;font-size:8px">${dirArrow} ${s.confidence}%</span>
            <span style="color:#555;font-size:7px">${s.activeSetupCount}s</span>
          </span>
        </div>`;
    }

    if (lastSummaries.length > 8) {
      html += `<div style="text-align:center;font-size:8px;color:#555;padding:2px 0">+${lastSummaries.length - 8} more pairs</div>`;
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function renderPanel(setup: AggregatedSetup, symbol: string, display: DisplayState): void {
  if (!ensurePanel() || !panel) return;

  const content = panel.querySelector('#st-ind-content') as HTMLDivElement;
  if (!content) return;

  // Update header with symbol
  const headerEl = panel.querySelector('#st-ind-header');
  if (headerEl) {
    headerEl.textContent = `ST INDICATORS | ${symbol}`;
  }

  // Multi-pair summary section
  let html = buildMultiPairSummary(symbol);

  // Macro trend line (SMA 80 based)
  const trendColor = display.m5Trend === 'up' ? '#4CAF50' : display.m5Trend === 'down' ? '#F44336' : '#666';
  const trendIcon = display.m5Trend === 'up' ? '\u25B2' : display.m5Trend === 'down' ? '\u25BC' : '\u25CF';
  const trendLabel = display.m5Trend === 'up' ? 'UPTREND' : display.m5Trend === 'down' ? 'DOWNTREND' : 'FLAT';
  const sma80Text = display.sma80 !== null ? ` (SMA80: ${display.sma80.toFixed(3)})` : '';

  html += `
    <div style="margin-bottom:4px;padding:4px 6px;background:rgba(${display.m5Trend === 'up' ? '76,175,80' : display.m5Trend === 'down' ? '244,67,54' : '100,100,100'},0.15);border-radius:4px">
      <span style="font-size:10px;color:#888">MACRO: </span>
      <span style="font-size:11px;font-weight:600;color:${trendColor}">${trendIcon} ${trendLabel}</span>
      <span style="font-size:8px;color:#555">${sma80Text}</span>
    </div>
  `;

  // Alligator state
  const alligColor = display.alligatorState === 'eating_up' ? '#4CAF50' : display.alligatorState === 'eating_down' ? '#F44336' : display.alligatorState === 'awakening' ? '#FF9800' : '#555';
  const alligLabel = display.alligatorState === 'eating_up' ? 'Eating UP' : display.alligatorState === 'eating_down' ? 'Eating DOWN' : display.alligatorState === 'awakening' ? 'Awakening' : 'Sleeping';
  html += `
    <div style="display:flex;align-items:center;gap:4px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
      <span style="font-size:10px;color:#aaa;width:60px">Alligator</span>
      <span style="flex:1;font-size:10px;color:${alligColor};font-weight:500">${alligLabel}</span>
    </div>`;

  // RSI
  const rsiSetup = setup.activeSetups.find(s => s.type === 'rsi_reversal');
  const rsiZone = display.rsi !== null ? (display.rsi < 30 ? 'OVERSOLD' : display.rsi > 70 ? 'OVERBOUGHT' : display.rsi > 50 ? 'Bullish bias' : 'Bearish bias') : 'No data';
  const rsiZoneColor = display.rsi !== null ? (display.rsi < 30 ? '#F44336' : display.rsi > 70 ? '#F44336' : display.rsi > 50 ? '#4CAF50' : '#FF9800') : '#555';
  html += renderSetupRow('RSI',
    rsiSetup ? (rsiSetup.direction === 'CALL' ? 'OVERSOLD EXIT' : 'OVERBOUGHT EXIT') : '',
    display.rsi !== null ? `${display.rsi.toFixed(1)} <span style="color:${rsiZoneColor}">${rsiZone}</span>` : 'No data',
    !!rsiSetup, rsiSetup?.direction);

  // MACD — show line relationship and histogram direction
  const macdSetup = setup.activeSetups.find(s => s.type === 'macd_cross');
  let macdStatus = 'No data';
  if (display.macdLine !== null && display.signalLine !== null) {
    const aboveSignal = display.macdLine > display.signalLine;
    const histDir = display.histogramRising ? '\u25B2' : '\u25BC';
    const histColor = display.histogramRising ? '#4CAF50' : '#F44336';
    macdStatus = `${aboveSignal ? 'Above' : 'Below'} signal <span style="color:${histColor}">${histDir}</span>`;
  }
  html += renderSetupRow('MACD',
    macdSetup ? (macdSetup.direction === 'CALL' ? 'CROSS UP' : 'CROSS DOWN') : '',
    macdStatus, !!macdSetup, macdSetup?.direction);

  // Candle Patterns
  const candleSetup = setup.activeSetups.find(s => s.type === 'candle_pattern');
  html += renderSetupRow('Candle',
    candleSetup ? candleSetup.reason : '',
    'Watching', !!candleSetup, candleSetup?.direction);

  // MA Trend — show SMA(20) and price relationship
  const maSetup = setup.activeSetups.find(s => s.type === 'ma_trend');
  let maStatus = 'No data';
  if (display.sma20 !== null) {
    maStatus = `SMA20: ${display.sma20.toFixed(3)}`;
  }
  html += renderSetupRow('MA Trend',
    maSetup ? maSetup.reason.split(' + ')[0]! : '',
    maStatus, !!maSetup, maSetup?.direction);

  // BB
  const bbSetup = setup.activeSetups.find(s => s.type === 'bb_squeeze');
  const bbStatus = display.inSqueeze ? `<span style="color:#FF9800;font-weight:600">SQUEEZE (${display.squeezeCandles})</span>` : 'Normal';
  html += renderSetupRow('BB',
    bbSetup ? (bbSetup.direction === 'CALL' ? 'BREAKOUT UP' : 'BREAKOUT DOWN') : '',
    bbStatus, !!bbSetup, bbSetup?.direction);

  // Trend Confirmation (the aggregated trend signal)
  const trendSetup = setup.activeSetups.find(s => s.type === 'trend_confirm');
  if (trendSetup) {
    const tColor = trendSetup.direction === 'CALL' ? '#4CAF50' : '#F44336';
    const tIcon = trendSetup.direction === 'CALL' ? '\u25B2' : '\u25BC';
    html += `
      <div style="display:flex;align-items:center;gap:4px;padding:4px 6px;margin-top:2px;background:rgba(${trendSetup.direction === 'CALL' ? '76,175,80' : '244,67,54'},0.1);border-radius:4px;border:1px solid ${tColor}33">
        <span style="font-size:10px;color:${tColor};font-weight:700">${tIcon} TREND CONFIRMED</span>
        <span style="font-size:8px;color:#888;flex:1;text-align:right">${trendSetup.reason.split(' + ').length}/7 aligned</span>
      </div>`;
  }

  // Confidence bar
  const confColor = setup.confidence >= 70 ? '#4CAF50' : setup.confidence >= 40 ? '#FF9800' : '#F44336';
  html += `
    <div style="margin-top:8px;padding:4px 0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
        <span style="font-size:10px;color:#888">CONFIDENCE:</span>
        <span style="font-size:11px;font-weight:600;color:${confColor}">${setup.confidence}%</span>
      </div>
      <div style="font-family:monospace;font-size:10px;letter-spacing:1px">${buildConfidenceBar(setup.confidence)}</div>
    </div>
  `;

  // Signal recommendation
  let signalText: string;
  let signalColor: string;
  if (setup.direction && setup.confidence >= 70) {
    signalText = setup.direction === 'CALL' ? 'STRONG BUY \u25B2' : 'STRONG SELL \u25BC';
    signalColor = setup.direction === 'CALL' ? '#4CAF50' : '#F44336';
  } else if (setup.direction && setup.confidence >= 40) {
    signalText = setup.direction === 'CALL' ? 'WEAK BUY \u25B2' : 'WEAK SELL \u25BC';
    signalColor = '#FF9800';
  } else {
    signalText = 'NO SIGNAL';
    signalColor = '#555';
  }

  html += `
    <div style="margin-top:6px;padding:6px;text-align:center;background:rgba(${signalColor === '#4CAF50' ? '76,175,80' : signalColor === '#F44336' ? '244,67,54' : signalColor === '#FF9800' ? '255,152,0' : '80,80,80'},0.15);border-radius:6px">
      <span style="font-size:13px;font-weight:700;color:${signalColor}">${signalText}</span>
    </div>
  `;

  // LLM Analysis section
  if (currentLlmAnalysis) {
    const llm = currentLlmAnalysis;
    const llmColor = llm.action === 'BUY' ? '#4CAF50' : llm.action === 'SELL' ? '#F44336' : '#666';
    const llmIcon = llm.action === 'BUY' ? '\u25B2' : llm.action === 'SELL' ? '\u25BC' : '\u25CF';
    const age = Math.floor((Date.now() - llm.timestamp) / 1000);
    const ageText = age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`;

    html += `
      <div style="margin-top:8px;border-top:1px solid rgba(100,181,246,0.2);padding-top:6px">
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
          <span style="font-size:9px;font-weight:600;color:#64B5F6;letter-spacing:0.5px">AI ANALYST</span>
          <span style="font-size:8px;color:#444">${llm.model.split('-').slice(-2).join(' ')} | ${ageText}</span>
        </div>
        <div style="padding:4px 6px;background:rgba(${llm.action === 'BUY' ? '76,175,80' : llm.action === 'SELL' ? '244,67,54' : '100,100,100'},0.15);border-radius:4px;margin-bottom:4px">
          <span style="font-size:13px;font-weight:700;color:${llmColor}">${llmIcon} ${llm.action} ${llm.confidence}%</span>
        </div>
        ${llm.patterns.length > 0 ? `<div style="font-size:9px;color:#888;margin-bottom:3px">${llm.patterns.map(p => `<span style="background:#1a1a2e;padding:1px 4px;border-radius:3px;margin-right:2px">${p}</span>`).join('')}</div>` : ''}
        ${llm.support ? `<div style="font-size:9px;color:#555">S: ${llm.support.toFixed(5)} | R: ${llm.resistance?.toFixed(5) ?? '—'}</div>` : ''}
        <div style="font-size:9px;color:#666;line-height:1.3;margin-top:3px">${llm.reasoning.slice(0, 150)}${llm.reasoning.length > 150 ? '...' : ''}</div>
      </div>
    `;
  }

  // Timestamp
  html += `
    <div style="margin-top:6px;text-align:center;font-size:9px;color:#444">
      Analyzed: ${formatTime(setup.lastAnalysis)} | ${setup.activeSetups.length} active setup${setup.activeSetups.length !== 1 ? 's' : ''}
    </div>
  `;

  content.innerHTML = html;

  // Bind summary toggle click
  const toggleEl = content.querySelector('#st-summary-toggle');
  if (toggleEl) {
    toggleEl.addEventListener('click', () => {
      summaryCollapsed = !summaryCollapsed;
      renderPanel(setup, symbol, display);
    });
  }
}

// --- Public API ---

export function initChartOverlay(): void {
  if (running) return;
  running = true;
  ensurePanel();

  // Show initial waiting state
  const content = panel?.querySelector('#st-ind-content') as HTMLDivElement | null;
  if (content) {
    content.innerHTML = '<div style="color:#555;text-align:center;padding:8px">Waiting for candle close...</div>';
  }
}

export function updateSetupDisplay(
  setup: AggregatedSetup, symbol: string, displayState: DisplayState,
  llmAnalysis?: LlmAnalysis | null,
  summaries?: SymbolSummary[],
  trackedCount?: number,
): void {
  if (!running) return;
  if (llmAnalysis) currentLlmAnalysis = llmAnalysis;
  if (summaries !== undefined) lastSummaries = summaries;
  if (trackedCount !== undefined) lastTrackedCount = trackedCount;
  renderPanel(setup, symbol, displayState);
}

export function destroyChartOverlay(): void {
  running = false;
  if (panel) { panel.remove(); panel = null; }
}

export function isOverlayActive(): boolean {
  return running;
}
