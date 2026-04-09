/**
 * SnapTrade Overlay v2.0.0 — Professional PO-native dark UI.
 * Compact bar (default) + Expanded panel + Hidden states.
 * Shadow DOM, draggable, toast notifications, signal alerts.
 */

import type { Signal, DailyState, ExtensionSettings } from '../../types';
import { STRATEGY_LABELS } from '../../lib/constants';
import { escapeHtml, formatAssetDisplay, formatBalance } from '../../lib/format';
import { OVERLAY_STYLES } from './styles';
import type { OpenTrade, TradeResult, TradeSource } from './types';
import * as Sentry from '@sentry/browser';

export class OverlayManager {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;

  private isExpanded = false;
  private connected = false;
  private mode = 'auto';
  private isDemo = true;
  private balance = 0;
  private openTrades: OpenTrade[] = [];
  private recentResults: TradeResult[] = [];
  private dailyWins = 0;
  private dailyLosses = 0;
  private dailyPnl = 0;
  private dailyTradesExecuted = 0;
  private strategy = 'masaniello';
  private nextStake = 1;
  private maxDailyTrades = 30;

  private isDragging = false;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  // --- Init ---

  init(): void {
    if (this.host) return;

    this.host = document.createElement('div');
    this.host.id = 'snaptrade-overlay';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = OVERLAY_STYLES;
    this.shadow.appendChild(style);

    const root = document.createElement('div');
    root.id = 'st-root';
    this.shadow.appendChild(root);

    document.body.appendChild(this.host);
    this.restorePosition();
    this.render();
    this.startTicker();
  }

  // --- Rendering ---

  private render(): void {
    const root = this.shadow?.getElementById('st-root');
    if (!root) return;

    if (!this.isExpanded) {
      root.innerHTML = this.buildCompact();
      this.attachCompactListeners();
      return;
    }

    root.innerHTML = this.buildExpanded();
    this.attachExpandedListeners();
  }

  private buildCompact(): string {
    const dotClass = this.connected ? 'st-dot--on' : 'st-dot--off';
    const acct = this.isDemo ? 'DEMO' : 'REAL';
    const bal = escapeHtml(formatBalance(this.balance));
    const pnlClass = this.dailyPnl >= 0 ? 'st-stats__pnl--pos' : 'st-stats__pnl--neg';
    const pnlSign = this.dailyPnl >= 0 ? '+' : '-';
    const pnlVal = Math.abs(this.dailyPnl).toFixed(2);

    return '<div class="st-compact" id="st-compact-bar">'
      + '<span class="st-compact__logo">\u26A1 ST <span class="st-compact__dot st-dot ' + dotClass + '"></span></span>'
      + '<span class="st-compact__sep"></span>'
      + '<span class="st-compact__stat">' + escapeHtml(acct) + ' $' + bal + '</span>'
      + '<span class="st-compact__sep"></span>'
      + '<span class="st-compact__stat st-compact__stat--wl">'
      + '<span style="color:var(--st-green)">' + this.dailyWins + 'W</span>'
      + '/<span style="color:var(--st-red)">' + this.dailyLosses + 'L</span>'
      + ' <span class="' + pnlClass + '">' + pnlSign + '$' + pnlVal + '</span>'
      + '</span>'
      + '<span class="st-compact__expand">\u25BC</span>'
      + '</div>';
  }

  private buildExpanded(): string {
    const dotClass = this.connected ? 'st-dot--on' : 'st-dot--off';
    const modeClass = 'st-mode-badge--' + escapeHtml(this.mode);
    const modeLabel = this.mode === 'semi-auto' ? 'SEMI' : escapeHtml(this.mode.toUpperCase());
    const acctClass = this.isDemo ? 'st-status__type--demo' : 'st-status__type--real';
    const acctLabel = this.isDemo ? 'DEMO' : '\u26A0\uFE0F REAL';
    const bal = escapeHtml(formatBalance(this.balance));

    const totalTrades = this.dailyWins + this.dailyLosses;
    const winPct = totalTrades > 0 ? Math.round((this.dailyWins / totalTrades) * 100) : 0;
    const barColor = this.dailyWins > 0 ? 'var(--st-green)' : 'var(--st-text-muted)';
    const pnlClass = this.dailyPnl >= 0 ? 'st-stats__pnl--pos' : 'st-stats__pnl--neg';
    const pnlSign = this.dailyPnl >= 0 ? '+' : '-';
    const pnlVal = Math.abs(this.dailyPnl).toFixed(2);

    const stratLabel = escapeHtml(STRATEGY_LABELS[this.strategy] || this.strategy);
    const maxT = this.maxDailyTrades > 0 ? String(this.maxDailyTrades) : '\u221E';

    return '<div class="st-panel">'
      + '<div class="st-header" id="st-drag">'
      + '<div class="st-header__left">'
      + '<span class="st-logo"><span class="st-logo__icon">\u26A1</span> SnapTrade</span>'
      + '<span class="st-mode-badge ' + modeClass + '">' + modeLabel + '</span>'
      + '</div>'
      + '<div class="st-header__right">'
      + '<span class="st-dot ' + dotClass + '"></span>'
      + '<button class="st-header__btn" id="st-btn-min" title="Minimize">\u2500</button>'
      + '<button class="st-header__btn" id="st-btn-close" title="Hide">\u00D7</button>'
      + '</div></div>'
      + '<div class="st-status"><div class="st-status__account">'
      + '<span class="st-status__type ' + acctClass + '">' + acctLabel + '</span>'
      + '<span class="st-status__balance">$' + bal + '</span>'
      + '</div></div>'
      + '<div class="st-stats">'
      + '<div class="st-stats__progress"><div class="st-stats__bar" style="width:' + winPct + '%;background:' + barColor + '"></div></div>'
      + '<span class="st-stats__wl"><span style="color:var(--st-green)">' + this.dailyWins + 'W</span>'
      + ' / <span style="color:var(--st-red)">' + this.dailyLosses + 'L</span></span>'
      + '<span class="st-stats__pnl ' + pnlClass + '">' + pnlSign + '$' + pnlVal + '</span>'
      + '</div>'
      + '<div id="st-signals"></div>'
      + this.buildTradesSection()
      + this.buildResultsSection()
      + '<div class="st-footer">'
      + '<span>' + stratLabel + ' | WR ' + (totalTrades > 0 ? Math.round(this.dailyWins / totalTrades * 100) : 0) + '%</span>'
      + '<span>' + totalTrades + '/' + maxT + ' trades</span>'
      + '</div></div>';
  }

  private buildTradesSection(): string {
    let html = '<div class="st-section"><div class="st-section__title">OPEN TRADES</div>';
    if (this.openTrades.length === 0) {
      html += '<div class="st-empty">No open trades</div>';
    } else {
      html += '<div class="st-scrollable">';
      for (const t of this.openTrades) html += this.buildTradeRow(t);
      html += '</div>';
    }
    return html + '</div>';
  }

  private static SOURCE_LABELS: Record<TradeSource, { label: string; color: string }> = {
    indicators: { label: 'IND', color: '#00e676' },
    ai:         { label: 'AI',  color: '#7c4dff' },
    backend:    { label: 'BE',  color: '#2979ff' },
    telegram:   { label: 'TG',  color: '#ff9100' },
    manual:     { label: 'MAN', color: '#78909c' },
  };

  private buildTradeRow(t: OpenTrade): string {
    const nm = escapeHtml(formatAssetDisplay(t.asset));
    const dc = t.direction === 'CALL' ? 'call' : 'put';
    const arrow = dc === 'call' ? '\u2191' : '\u2193';
    const dirLabel = escapeHtml(arrow + ' ' + t.direction);
    const payout = escapeHtml((t as OpenTrade & { payout?: string }).payout || '');
    const timer = escapeHtml((t as OpenTrade & { timer?: string }).timer || this.calcTimer(t));
    const amount = '$' + t.amount.toFixed(2);
    const retAmt = escapeHtml((t as OpenTrade & { returnAmount?: string }).returnAmount || '');
    const isPos = !!(t as OpenTrade & { isPositive?: boolean }).isPositive;

    // Source badge
    const source = t.source;
    const srcInfo = source ? OverlayManager.SOURCE_LABELS[source] : null;
    const srcBadge = srcInfo
      ? '<span class="st-trade-row__source" style="background:' + srcInfo.color + ';color:#fff;font-size:9px;padding:1px 4px;border-radius:3px;margin-left:4px;font-weight:700">' + srcInfo.label + '</span>'
      : '';

    // Gale badge
    const galeBadge = t.galeLevel && t.galeLevel > 0
      ? '<span style="background:#FF6F00;color:#fff;font-size:9px;padding:1px 4px;border-radius:3px;margin-left:4px;font-weight:700">G' + t.galeLevel + '</span>'
      : '';

    let profitStr = '';
    let profitClass = 'st-trade-row__profit--pending';
    if (t.profit != null && t.profit !== 0) {
      const pNum = typeof t.profit === 'number' ? t.profit : parseFloat(String(t.profit).replace(/[^0-9.-]/g, ''));
      if (!isNaN(pNum)) {
        profitStr = (pNum >= 0 ? '+' : '') + '$' + Math.abs(pNum).toFixed(2);
        profitClass = pNum >= 0 ? 'st-trade-row__profit--win' : 'st-trade-row__profit--loss';
      }
    }
    if (!profitStr && retAmt) {
      profitStr = '\u2192 ' + retAmt;
      profitClass = isPos ? 'st-trade-row__profit--win' : 'st-trade-row__profit--pending';
    }
    if (!profitStr) { profitStr = 'pending'; profitClass = 'st-trade-row__profit--pending'; }

    return '<div class="st-trade-row">'
      + '<div class="st-trade-row__top-left">'
      + '<span class="st-trade-row__pair">' + nm + '</span>'
      + srcBadge + galeBadge
      + (payout ? '<span class="st-trade-row__payout">' + payout + '</span>' : '')
      + '<span class="st-trade-row__dir st-trade-row__dir--' + dc + '">' + dirLabel + '</span>'
      + '</div>'
      + '<div class="st-trade-row__top-right"><span class="st-trade-row__time">' + timer + '</span></div>'
      + '<div class="st-trade-row__bottom-left"><span>' + escapeHtml(amount) + '</span></div>'
      + '<div class="st-trade-row__bottom-right">'
      + '<span class="st-trade-row__profit ' + profitClass + '">' + escapeHtml(profitStr) + '</span>'
      + '</div></div>';
  }

  private buildResultsSection(): string {
    if (this.recentResults.length === 0) return '';
    let html = '<div class="st-section"><div class="st-section__title">RECENT RESULTS</div>';
    for (const r of this.recentResults.slice(0, 5)) {
      const icon = r.isWin ? '\u2705' : '\u274C';
      const dc = r.direction === 'CALL' ? 'call' : 'put';
      const pnlClass = r.isWin ? 'st-result-row__pnl--win' : 'st-result-row__pnl--loss';
      const sign = r.isWin ? '+' : '-';
      const nm = escapeHtml(formatAssetDisplay(r.asset));
      html += '<div class="st-result-row">'
        + '<div class="st-result-row__left">'
        + '<span class="st-result-row__icon">' + icon + '</span>'
        + '<span class="st-result-row__pair">' + nm + '</span>'
        + '<span class="st-result-row__dir st-result-row__dir--' + dc + '">' + escapeHtml(r.direction) + '</span>'
        + '</div>'
        + '<span class="st-result-row__pnl ' + pnlClass + '">' + sign + '$' + Math.abs(r.pnl).toFixed(2) + '</span>'
        + (r.payout ? '<span class="st-result-row__payout">(' + escapeHtml(r.payout) + ')</span>' : '')
        + '</div>';
    }
    return html + '</div>';
  }

  // --- Event listeners ---

  private attachCompactListeners(): void {
    const bar = this.shadow?.getElementById('st-compact-bar');
    if (bar) {
      bar.addEventListener('click', () => { this.isExpanded = true; this.render(); this.setupDrag(); });
    }
  }

  private attachExpandedListeners(): void {
    this.setupDrag();
    const minBtn = this.shadow?.getElementById('st-btn-min');
    if (minBtn) minBtn.addEventListener('click', (e) => { e.stopPropagation(); this.isExpanded = false; this.render(); });
    const closeBtn = this.shadow?.getElementById('st-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.hide(); });
  }

  // --- Drag ---

  private setupDrag(): void {
    const header = this.shadow?.getElementById('st-drag');
    const panel = this.host;
    if (!header || !panel) return;

    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    const onMouseDown = (e: MouseEvent): void => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      this.isDragging = true;
      startX = e.clientX; startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      header.classList.add('dragging');
      e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent): void => {
      if (!this.isDragging) return;
      panel.style.left = (startLeft + e.clientX - startX) + 'px';
      panel.style.top = (startTop + e.clientY - startY) + 'px';
      panel.style.bottom = 'auto'; panel.style.right = 'auto';
    };
    const onMouseUp = (): void => {
      if (!this.isDragging) return;
      this.isDragging = false;
      header.classList.remove('dragging');
      this.savePosition();
    };

    const newHeader = header.cloneNode(true) as HTMLElement;
    header.parentNode?.replaceChild(newHeader, header);
    newHeader.id = 'st-drag';
    newHeader.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    const minBtn = newHeader.querySelector('#st-btn-min') as HTMLElement;
    const closeBtn = newHeader.querySelector('#st-btn-close') as HTMLElement;
    if (minBtn) minBtn.addEventListener('click', (e) => { e.stopPropagation(); this.isExpanded = false; this.render(); });
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.hide(); });
  }

  private savePosition(): void {
    if (!this.host) return;
    try {
      chrome.storage.local.set({ overlayPosition: { left: this.host.style.left, top: this.host.style.top } });
    } catch { /* skip */ }
  }

  private restorePosition(): void {
    try {
      chrome.storage.local.get('overlayPosition', (result: Record<string, unknown>) => {
        const pos = result.overlayPosition as { left: string; top: string } | undefined;
        if (pos && this.host) {
          this.host.style.left = pos.left; this.host.style.top = pos.top;
          this.host.style.bottom = 'auto'; this.host.style.right = 'auto';
        }
      });
    } catch { /* skip */ }
  }

  // --- Timer ---

  private startTicker(): void {
    this.countdownInterval = setInterval(() => {
      const now = Date.now();
      const before = this.openTrades.length;
      this.openTrades = this.openTrades.filter(t => {
        if (t.closeTime > 0) return t.closeTime > now - 5000;
        return true;
      });
      if (before !== this.openTrades.length) {
        // Trade count changed (trade expired) — update trades section only
        if (this.isExpanded) this.updateTradesSectionInPlace();
        return;
      }
      // In-place timer update — only update .st-trade-row__time elements
      // DOM-scraped trades already carry their timer string; only update computed timers
      if (this.isExpanded && this.shadow) {
        const timeEls = this.shadow.querySelectorAll('.st-trade-row__time');
        for (let i = 0; i < timeEls.length && i < this.openTrades.length; i++) {
          const t = this.openTrades[i];
          if (!t) continue;
          const domTimer = (t as OpenTrade & { timer?: string }).timer;
          // If trade has a DOM-scraped timer, keep it (DOM poll updates it every 2s)
          // Only compute for extension-executed trades (which have closeTime > 0 and no timer)
          if (!domTimer && t.closeTime > 0) {
            timeEls[i].textContent = this.calcTimer(t);
          }
        }
      }
    }, 1000);
  }

  /** Rebuild just the OPEN TRADES section content (used when trade count changes). */
  private updateTradesSectionInPlace(): void {
    if (!this.shadow) return;
    const sections = this.shadow.querySelectorAll('.st-section');
    for (let i = 0; i < sections.length; i++) {
      const title = sections[i].querySelector('.st-section__title');
      if (title && title.textContent === 'OPEN TRADES') {
        let html = '<div class="st-section__title">OPEN TRADES</div>';
        if (this.openTrades.length === 0) {
          html += '<div class="st-empty">No open trades</div>';
        } else {
          html += '<div class="st-scrollable">';
          for (const t of this.openTrades) html += this.buildTradeRow(t);
          html += '</div>';
        }
        sections[i].innerHTML = html;
        return;
      }
    }
  }

  private calcTimer(t: OpenTrade): string {
    if (t.closeTime <= 0) return '--:--';
    const diff = Math.max(0, t.closeTime - Date.now());
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // --- Toast ---

  private showToast(text: string, type: 'win' | 'loss' | 'trade'): void {
    let container = this.shadow?.querySelector('.st-toast-container') as HTMLElement;
    if (!container && this.shadow) {
      container = document.createElement('div');
      container.className = 'st-toast-container';
      this.shadow.appendChild(container);
    }
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'st-toast st-toast--' + type;
    toast.textContent = text; // textContent is XSS-safe
    container.appendChild(toast);
    requestAnimationFrame(() => { toast.classList.add('st-toast--visible'); });
    setTimeout(() => {
      toast.classList.remove('st-toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --- Public API ---

  setConnectionStatus(connected: boolean): void {
    this.connected = connected;
    if (!this.shadow) { this.render(); return; }
    // In-place update of dot elements to avoid scroll reset
    const dots = this.shadow.querySelectorAll('.st-dot');
    dots.forEach(dot => {
      dot.classList.remove('st-dot--on', 'st-dot--off');
      dot.classList.add(connected ? 'st-dot--on' : 'st-dot--off');
    });
  }

  setExecutionMode(mode: string): void { this.mode = mode; this.render(); }

  setAccountInfo(isDemo: boolean, balance: number): void {
    this.isDemo = isDemo;
    this.balance = balance;
    if (!this.shadow) { this.render(); return; }
    // In-place balance update to avoid scroll reset
    const balEl = this.shadow.querySelector('.st-status__balance');
    if (balEl) {
      balEl.textContent = '$' + formatBalance(balance);
    }
  }

  updateBalance(balance: number): void { this.balance = balance; this.render(); }

  updateSettings(settings: ExtensionSettings): void {
    this.mode = settings.executionMode;
    this.strategy = settings.strategy;
    this.maxDailyTrades = settings.maxDailyTrades;
    this.render();
  }

  updateDailyState(state: DailyState): void {
    this.dailyWins = state.winsCount ?? 0;
    this.dailyLosses = state.lossesCount ?? 0;
    this.dailyPnl = state.totalPnl ?? 0;
    this.dailyTradesExecuted = state.tradesExecuted ?? 0;
    if (!this.shadow) { this.render(); return; }
    // In-place stats update — avoids full re-render, preserves scroll position
    const pnlClass = this.dailyPnl >= 0 ? 'st-stats__pnl--pos' : 'st-stats__pnl--neg';
    const pnlSign = this.dailyPnl >= 0 ? '+' : '-';
    const pnlVal = Math.abs(this.dailyPnl).toFixed(2);
    // Update W/L in expanded panel
    const wlEls = this.shadow.querySelectorAll('.st-stats__wl');
    wlEls.forEach(el => {
      el.innerHTML = '<span style="color:var(--st-green)">' + this.dailyWins + 'W</span>'
        + ' / <span style="color:var(--st-red)">' + this.dailyLosses + 'L</span>';
    });
    // Update PnL
    const pnlEls = this.shadow.querySelectorAll('.st-stats__pnl');
    pnlEls.forEach(el => {
      el.textContent = pnlSign + '$' + pnlVal;
      el.className = 'st-stats__pnl ' + pnlClass;
    });
    // Update progress bar
    const totalTrades = this.dailyWins + this.dailyLosses;
    const winPct = totalTrades > 0 ? Math.round((this.dailyWins / totalTrades) * 100) : 0;
    const barEl = this.shadow.querySelector('.st-stats__bar') as HTMLElement | null;
    if (barEl) {
      barEl.style.width = winPct + '%';
      barEl.style.background = this.dailyWins > 0 ? 'var(--st-green)' : 'var(--st-text-muted)';
    }
    // Update footer trade count
    const footerSpans = this.shadow.querySelectorAll('.st-footer span');
    if (footerSpans.length > 1) {
      const maxT = this.maxDailyTrades > 0 ? String(this.maxDailyTrades) : '\u221E';
      footerSpans[1].textContent = this.dailyTradesExecuted + '/' + maxT + ' trades';
    }
    // Update compact bar W/L stat if visible
    const compactWl = this.shadow.querySelector('.st-compact__stat--wl');
    if (compactWl) {
      compactWl.innerHTML = '<span style="color:var(--st-green)">' + this.dailyWins + 'W</span>'
        + '/<span style="color:var(--st-red)">' + this.dailyLosses + 'L</span>'
        + ' <span class="' + pnlClass + '">' + pnlSign + '$' + pnlVal + '</span>';
    }
  }

  addOpenTrade(trade: OpenTrade): void {
    this.openTrades = this.openTrades.filter(t => t.id !== trade.id);
    this.openTrades.push(trade);
    this.render();
    this.showToast('\u26A1 ' + formatAssetDisplay(trade.asset) + ' ' + trade.direction + ' $' + trade.amount.toFixed(2), 'trade');
  }

  removeTrade(tradeId: string): void {
    this.openTrades = this.openTrades.filter(t => t.id !== tradeId);
    this.render();
  }

  /** Check if open trades have meaningfully changed to avoid unnecessary DOM updates. */
  private hasTradesChanged(newTrades: OpenTrade[]): boolean {
    if (newTrades.length !== this.openTrades.length) return true;
    for (let i = 0; i < newTrades.length; i++) {
      const n = newTrades[i];
      const o = this.openTrades[i];
      if (!n || !o) return true;
      if (n.id !== o.id) return true;
      const nTimer = (n as OpenTrade & { timer?: string }).timer || '';
      const oTimer = (o as OpenTrade & { timer?: string }).timer || '';
      if (nTimer !== oTimer) return true;
      if (n.profit !== o.profit) return true;
      const nPayout = (n as OpenTrade & { payout?: string }).payout || '';
      const oPayout = (o as OpenTrade & { payout?: string }).payout || '';
      if (nPayout !== oPayout) return true;
    }
    return false;
  }

  updateOpenTrades(trades: OpenTrade[]): void {
    if (!this.hasTradesChanged(trades)) return;
    this.openTrades = trades;
    if (!this.isExpanded || !this.shadow) return;
    const sections = this.shadow.querySelectorAll('.st-section');
    for (let i = 0; i < sections.length; i++) {
      const title = sections[i].querySelector('.st-section__title');
      if (title && title.textContent === 'OPEN TRADES') {
        const scrollable = sections[i].querySelector('.st-scrollable');
        const scrollPos = scrollable ? scrollable.scrollTop : 0;
        let html = '<div class="st-section__title">OPEN TRADES</div>';
        if (this.openTrades.length === 0) {
          html += '<div class="st-empty">No open trades</div>';
        } else {
          html += '<div class="st-scrollable">';
          for (const t of this.openTrades) html += this.buildTradeRow(t);
          html += '</div>';
        }
        sections[i].innerHTML = html;
        // Restore scroll position via rAF to ensure DOM has settled
        if (scrollPos > 0) {
          requestAnimationFrame(() => {
            const ns = sections[i].querySelector('.st-scrollable');
            if (ns) ns.scrollTop = scrollPos;
          });
        }
        return;
      }
    }
  }

  showSignal(signal: Signal, amount: number, onConfirm?: () => void, onSkip?: () => void): void {
    const el = this.shadow?.getElementById('st-signals');
    if (!el) {
      if (!this.isExpanded) {
        this.isExpanded = true; this.render();
        setTimeout(() => this.showSignal(signal, amount, onConfirm, onSkip), 100);
        return;
      }
      return;
    }
    const nm = escapeHtml(formatAssetDisplay(signal.asset));
    const dc = signal.direction.toLowerCase();
    const showButtons = this.mode !== 'auto';
    const stratLabel = escapeHtml(STRATEGY_LABELS[this.strategy] || this.strategy);
    const div = document.createElement('div');
    div.className = 'st-signal-alert st-animate-in';

    let actionsHtml = '';
    if (showButtons) {
      actionsHtml = '<div class="st-signal-alert__actions">'
        + '<button class="st-signal-alert__btn st-signal-alert__btn--execute">EXECUTE</button>'
        + '<button class="st-signal-alert__btn st-signal-alert__btn--skip">SKIP</button></div>';
    } else {
      actionsHtml = '<div class="st-signal-alert__actions">'
        + '<button class="st-signal-alert__btn st-signal-alert__btn--auto">Executing...</button></div>';
    }

    div.innerHTML = '<div class="st-signal-alert__header"><span class="st-signal-alert__pair">' + nm + '</span></div>'
      + '<div class="st-signal-alert__body">'
      + '<span class="st-signal-alert__dir st-signal-alert__dir--' + dc + '">' + escapeHtml(signal.direction) + '</span>'
      + '<span class="st-signal-alert__amount"><strong>$' + amount.toFixed(2) + '</strong> (' + stratLabel + ')</span></div>'
      + actionsHtml;

    if (showButtons) {
      const execBtn = div.querySelector('.st-signal-alert__btn--execute');
      const skipBtn = div.querySelector('.st-signal-alert__btn--skip');
      if (execBtn && onConfirm) execBtn.addEventListener('click', () => { div.remove(); onConfirm(); });
      if (skipBtn && onSkip) skipBtn.addEventListener('click', () => { div.remove(); onSkip(); });
    }
    el.prepend(div);
    // Countdown timer for semi-auto mode so user knows remaining time
    if (showButtons) {
      let remaining = 30;
      const countdownEl = document.createElement('div');
      countdownEl.className = 'st-signal-alert__countdown';
      countdownEl.textContent = remaining + 's';
      div.appendChild(countdownEl);
      const interval = setInterval(() => {
        remaining--;
        countdownEl.textContent = remaining + 's';
        if (remaining <= 0) { clearInterval(interval); div.remove(); }
      }, 1000);
    } else {
      setTimeout(() => {
        Sentry.captureMessage('Trade execution timeout', {
          level: 'warning',
          tags: { trade_issue: 'timeout' },
          extra: {
            asset: signal.asset,
            direction: signal.direction,
            amount: amount,
            strategy: this.strategy,
            mode: this.mode,
            timestamp: new Date().toISOString()
          }
        });
        div.remove();
      }, 15000);
    }
  }

  showResult(asset: string, isWin: boolean, profit: number): void {
    this.recentResults.unshift({ asset, direction: '', isWin, pnl: isWin ? profit : -profit, payout: '', timestamp: Date.now() });
    if (this.recentResults.length > 5) this.recentResults = this.recentResults.slice(0, 5);
    // W/L and PnL are NOT incremented here — the service-worker is the single source of truth.
    // updateDailyState() (triggered by STATUS_UPDATE broadcast) will set the authoritative values.

    // Targeted update: only refresh RECENT RESULTS section, NOT full render
    if (this.shadow && this.isExpanded) {
      // Update results section in-place
      const sections = this.shadow.querySelectorAll('.st-section');
      let resultsSection: Element | null = null;
      for (let i = 0; i < sections.length; i++) {
        const title = sections[i].querySelector('.st-section__title');
        if (title && title.textContent === 'RECENT RESULTS') {
          resultsSection = sections[i];
          break;
        }
      }
      const newResultsHtml = this.buildResultsSection();
      if (resultsSection) {
        // Replace existing results section content
        const temp = document.createElement('div');
        temp.innerHTML = newResultsHtml;
        if (temp.firstElementChild) {
          resultsSection.innerHTML = temp.firstElementChild.innerHTML;
        }
      } else if (newResultsHtml) {
        // No results section yet — insert before footer
        const footer = this.shadow.querySelector('.st-footer');
        if (footer) {
          const temp = document.createElement('div');
          temp.innerHTML = newResultsHtml;
          if (temp.firstElementChild) {
            footer.parentNode?.insertBefore(temp.firstElementChild, footer);
          }
        }
      }
      // Stats (W/L, PnL) are updated by updateDailyState() when service-worker broadcasts
    } else {
      // Not expanded — just queue the result, stats come from service-worker
    }

    const nm = formatAssetDisplay(asset);
    this.showToast(isWin ? '\u2705 ' + nm + ' +$' + profit.toFixed(2) : '\u274C ' + nm + ' -$' + profit.toFixed(2), isWin ? 'win' : 'loss');
  }

  /** In-place stats update for W/L, PnL, progress bar, compact bar — no full render. */
  private updateStatsInPlace(): void {
    if (!this.shadow) return;
    const pnlClass = this.dailyPnl >= 0 ? 'st-stats__pnl--pos' : 'st-stats__pnl--neg';
    const pnlSign = this.dailyPnl >= 0 ? '+' : '-';
    const pnlVal = Math.abs(this.dailyPnl).toFixed(2);
    const wlEls = this.shadow.querySelectorAll('.st-stats__wl');
    wlEls.forEach(el => {
      el.innerHTML = '<span style="color:var(--st-green)">' + this.dailyWins + 'W</span>'
        + ' / <span style="color:var(--st-red)">' + this.dailyLosses + 'L</span>';
    });
    const pnlEls = this.shadow.querySelectorAll('.st-stats__pnl');
    pnlEls.forEach(el => {
      el.textContent = pnlSign + '$' + pnlVal;
      el.className = 'st-stats__pnl ' + pnlClass;
    });
    const totalTrades = this.dailyWins + this.dailyLosses;
    const winPct = totalTrades > 0 ? Math.round((this.dailyWins / totalTrades) * 100) : 0;
    const barEl = this.shadow.querySelector('.st-stats__bar') as HTMLElement | null;
    if (barEl) {
      barEl.style.width = winPct + '%';
      barEl.style.background = this.dailyWins > 0 ? 'var(--st-green)' : 'var(--st-text-muted)';
    }
    const compactWl = this.shadow.querySelector('.st-compact__stat--wl');
    if (compactWl) {
      compactWl.innerHTML = '<span style="color:var(--st-green)">' + this.dailyWins + 'W</span>'
        + '/<span style="color:var(--st-red)">' + this.dailyLosses + 'L</span>'
        + ' <span class="' + pnlClass + '">' + pnlSign + '$' + pnlVal + '</span>';
    }
  }

  hide(): void {
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }
}
