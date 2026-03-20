/**
 * Floating window script — always-on-top popup.
 * Uses push updates with a fallback poll.
 */
import { formatAssetDisplay, formatBalance, escapeHtml } from './lib/format';
import { FLOATING_POLL_INTERVAL_MS } from './lib/constants';

interface TradeInfo {
  id: string;
  asset: string;
  direction: string;
  amount: number;
  openTime: number;
  closeTime: number;
  profit?: number;
  isWin?: boolean;
  payout?: string;
  timer?: string;
  returnAmount?: string;
  isPositive?: boolean;
}

interface StatusData {
  isConnected: boolean;
  isEnabled: boolean;
  dailyState: {
    winsCount: number;
    lossesCount: number;
    totalPnl: number;
    trades: Array<{ asset: string; direction: string; amount: number; result: string | null; netPnl: number | null }>;
  };
  openTrades?: TradeInfo[];
  accountInfo?: { isDemo: boolean; balance: number };
  executionMode?: string;
}

function renderTrades(trades: TradeInfo[]): void {
  const el = document.getElementById('trades');
  if (!el) return;

  if (trades.length === 0) {
    el.innerHTML = '<div class="empty">No open trades</div>';
    return;
  }

  const now = Date.now();
  el.innerHTML = trades.map(t => {
    const remaining = Math.max(0, Math.floor((t.closeTime - now) / 1000));
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    const timeStr = min + ':' + (sec < 10 ? '0' : '') + sec;
    const dirClass = t.direction.toLowerCase() === 'call' || t.direction === '\u2191' ? 'call' : 'put';
    const arrow = dirClass === 'call' ? '\u2191' : '\u2193';
    const asset = escapeHtml(formatAssetDisplay(t.asset));

    let pnlClass = '';
    let pnlText = '';
    if (t.profit !== undefined && t.profit !== null) {
      pnlClass = t.profit >= 0 ? 'green' : 'red';
      const sign = t.profit >= 0 ? '+' : '';
      pnlText = sign + '$' + Math.abs(t.profit).toFixed(2);
    }

    const payout = escapeHtml((t as TradeInfo & {payout?: string}).payout || '');
    const retAmount = escapeHtml((t as TradeInfo & {returnAmount?: string}).returnAmount || '/bin/zsh');
    const timer = escapeHtml((t as TradeInfo & {timer?: string}).timer || timeStr);
    const isPos = !!(t as TradeInfo & {isPositive?: boolean}).isPositive;
    const bgClass = isPos ? 'winning' : '';

    return '<div class="trade ' + dirClass + ' ' + bgClass + '">'
      + '<div style="display:flex;justify-content:space-between">'
      + '<span class="trade-asset">' + asset + ' ' + arrow + ' ' + payout + '</span>'
      + '<span class="trade-time">' + timer + '</span>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:1px">'
      + '<span style="color:#8b8b9e">$' + t.amount.toFixed(0) + ' \u2192 ' + retAmount + '</span>'
      + (pnlText ? '<span class="trade-pnl ' + pnlClass + '">' + escapeHtml(pnlText) + '</span>' : '')
      + '</div></div>';
  }).join('');
}

function renderStats(status: StatusData): void {
  const ds = status.dailyState;
  const winsEl = document.getElementById('wins');
  const lossesEl = document.getElementById('losses');
  const pnlEl = document.getElementById('pnl');
  const modeEl = document.getElementById('mode');
  const accountEl = document.getElementById('account');

  if (winsEl) winsEl.textContent = String(ds.winsCount);
  if (lossesEl) lossesEl.textContent = String(ds.lossesCount);
  if (pnlEl) {
    const sign = ds.totalPnl >= 0 ? '+' : '';
    pnlEl.textContent = sign + '$' + Math.abs(ds.totalPnl).toFixed(2);
    pnlEl.className = 'stat-val ' + (ds.totalPnl >= 0 ? 'green' : 'red');
  }
  if (modeEl && status.executionMode) {
    modeEl.textContent = status.executionMode.toUpperCase().replace('-', ' ');
  }
  if (accountEl && status.accountInfo) {
    const cls = status.accountInfo.isDemo ? 'demo' : 'real';
    const label = status.accountInfo.isDemo ? 'DEMO' : 'REAL';
    accountEl.innerHTML = '<span class="' + cls + '">' + escapeHtml(label) + '</span><span>$' + escapeHtml(formatBalance(status.accountInfo.balance)) + '</span>';
  }
}

function showResult(asset: string, isWin: boolean, profit: number): void {
  const el = document.getElementById('results');
  if (!el) return;
  const cls = isWin ? 'win' : 'loss';
  const sign = isWin ? '+' : '-';
  const div = document.createElement('div');
  div.className = 'result ' + cls;
  div.textContent = formatAssetDisplay(asset) + ' ' + sign + '$' + Math.abs(profit).toFixed(2);
  el.prepend(div);
  setTimeout(() => div.remove(), 5000);
}

// Fallback poll (reduced frequency)
async function poll(): Promise<void> {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }) as StatusData;
    if (status) {
      renderStats(status);
      if (status.openTrades) renderTrades(status.openTrades);
    }
  } catch { /* Background not ready */ }
}

// Push updates (primary)
chrome.runtime.onMessage.addListener((msg: { type: string; status?: StatusData; execution?: { asset: string; result: string; netPnl: number } }) => {
  if (msg.type === 'STATUS_UPDATE' && msg.status) {
    renderStats(msg.status);
    if (msg.status.openTrades) renderTrades(msg.status.openTrades);
  }
  if (msg.type === 'TRADE_RESULT' && msg.execution) {
    const exec = msg.execution;
    showResult(exec.asset, exec.result === 'win', Math.abs(exec.netPnl || 0));
  }
});

poll();
setInterval(poll, FLOATING_POLL_INTERVAL_MS);
