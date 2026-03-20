import selectors from '../selectors/pocket-option.json';
import { formatAssetForWS } from '../lib/format';
import { WS_TRADE_TIMEOUT_MS } from '../lib/constants';

function qs(selectorStr: string): Element | null {
  for (const sel of selectorStr.split(',').map(s => s.trim())) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Returns true if the "Opened" trades tab is currently active in the PO UI.
 * When the "Closed" tab is active we must not scrape trades from the DOM.
 */
function isOpenedTabActive(): boolean {
  // Strategy 1: look for a tab/nav element containing "Opened" text and check active class
  const allEls = document.querySelectorAll(
    '[class*="tab"], [class*="nav"] a, [class*="deals"] a, [class*="trades"] a, [role="tab"]'
  );
  let foundOpenedTab = false;
  let openedTabIsActive = false;
  let closedTabIsActive = false;

  for (const el of Array.from(allEls)) {
    const text = (el.textContent || '').trim().toLowerCase();
    const cls = el.className || '';
    const isActive = cls.includes('active') || cls.includes('selected') || cls.includes('current')
      || el.getAttribute('aria-selected') === 'true';

    if (text === 'opened' || text.startsWith('opened')) {
      foundOpenedTab = true;
      if (isActive) openedTabIsActive = true;
    }
    if (text === 'closed' || text.startsWith('closed')) {
      if (isActive) closedTabIsActive = true;
    }
  }

  // If we found a Closed tab that is active, definitely return false (not on opened tab)
  if (closedTabIsActive) return false;
  // If we found an Opened tab and it is active, return true
  if (foundOpenedTab && openedTabIsActive) return true;
  // If we found the Opened tab but couldn't determine its state, default to allowing scrape
  // Strategy 2: check for "No opened trades" message which confirms Opened tab is shown
  const noTradesEl = document.querySelector('[class*="no-trades"], [class*="empty"]');
  if (noTradesEl) {
    const txt = (noTradesEl.textContent || '').toLowerCase();
    if (txt.includes('no opened') || txt.includes('no open')) return true; // opened tab, just empty
  }
  // Default: allow scraping (assume opened tab or can't determine)
  return true;
}

/**
 * Returns true if the timer string looks like an active countdown (open trade).
 * Open trades show countdowns like "00:04", "04:32" — always MM:SS with leading zeros.
 * Closed trades may show times like "14:22" but without the countdown urgency context;
 * however since both formats overlap we use tab detection as primary guard.
 */
function looksLikeCountdown(timer: string): boolean {
  // Must match MM:SS format
  return /^\d{2}:\d{2}$/.test(timer.trim());
}

/**
 * PocketOptionBridge — WebSocket-based trade execution.
 * DOM is only used for reading balance/account info.
 */
export class PocketOptionBridge {
  private wsReady = false;
  private wsUrl = '';
  private pendingResolve: ((r: { success: boolean; error?: string }) => void) | null = null;

  constructor() {
    window.addEventListener('message', (event) => {
      if (!event.data || typeof event.data !== 'object') return;

      if (event.data.type === 'ST_WS_READY') {
        this.wsReady = true;
        this.wsUrl = event.data.url || '';
        console.log('[SnapTrade] Trading WS ready:', this.wsUrl);
      }

      if (event.data.type === 'ST_WS_CLOSED') {
        this.wsReady = false;
      }

      if (event.data.type === 'ST_TRADE_RESULT' && this.pendingResolve) {
        this.pendingResolve(event.data);
        this.pendingResolve = null;
      }
    });
  }

  isReady(): boolean {
    return this.wsReady;
  }

  async waitForReady(timeout = 30000): Promise<boolean> {
    if (this.wsReady) return true;
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), timeout);
      const handler = (e: MessageEvent): void => {
        if (e.data?.type === 'ST_WS_READY') {
          clearTimeout(timer);
          window.removeEventListener('message', handler);
          this.wsReady = true;
          resolve(true);
        }
      };
      window.addEventListener('message', handler);
    });
  }

  isDemoAccount(): boolean {
    if (this.wsUrl.includes('demo-api')) return true;
    return !!qs(selectors.accountInfo.isDemoAccount);
  }

  getBalance(): number | null {
    const isDemo = this.isDemoAccount();
    const el = isDemo
      ? (qs(selectors.accountInfo.balanceDemo) || qs(selectors.accountInfo.balanceCurrent))
      : (qs(selectors.accountInfo.balanceReal) || qs(selectors.accountInfo.balanceCurrent));
    if (!el) return null;
    const text = (el.textContent || '').replace(/[^0-9.,]/g, '').replace(',', '');
    return parseFloat(text) || null;
  }

  getCurrentAsset(): string | null {
    const el = qs(selectors.assetSelector.currentAsset);
    return el?.textContent?.trim() || null;
  }

  getPayoutRate(): number | null {
    const el = document.querySelector('li.alist__item.alist__item--active a.alist__link');
    if (el) {
      const match = (el.textContent || '').match(/\+(\d+)%/);
      if (match) return parseInt(match[1]) / 100;
    }
    return null;
  }

  async executeTrade(
    asset: string, direction: 'CALL' | 'PUT', amount: number, expirationMinutes: number,
    forceDemo?: boolean,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.wsReady) {
      return { success: false, error: 'WebSocket not connected' };
    }

    const poAsset = formatAssetForWS(asset);
    const action = direction === 'CALL' ? 'call' : 'put';
    // Use forced mode from settings if provided, otherwise auto-detect
    const isDemo = forceDemo !== undefined ? forceDemo : this.isDemoAccount();

    return new Promise(resolve => {
      this.pendingResolve = resolve;

      window.postMessage({
        type: 'ST_EXECUTE_TRADE',
        asset: poAsset, amount, action, isDemo,
        time: expirationMinutes,
      }, '*');

      setTimeout(() => {
        if (this.pendingResolve) {
          this.pendingResolve({ success: false, error: 'Timeout' });
          this.pendingResolve = null;
        }
      }, WS_TRADE_TIMEOUT_MS);
    });
  }

  watchForResult(callback: (result: { win: boolean; amount: number; asset?: string }) => void): () => void {
    const handler = (event: MessageEvent): void => {
      if (event.data?.type !== 'ST_WS_IN') return;
      const data = String(event.data.data);
      if (data.includes('successcloseOrder') || data.includes('updateClosedDeals')) {
        try {
          const jsonPart = data.replace(/^\d+[-]?/, '');
          const parsed = JSON.parse(jsonPart);
          if (Array.isArray(parsed) && parsed.length > 1) {
            const deal = parsed[1];
            const profit = deal?.profit || deal?.closeProfit || 0;
            callback({ win: profit > 0, amount: Math.abs(profit) });
          }
        } catch {
          console.log('[SnapTrade] Trade closed (unparsed):', data.substring(0, 100));
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }

  getOpenTrades(): Array<{
    asset: string; direction: string; amount: number;
    payout: string; timer: string; profit: string;
    isPositive: boolean; returnAmount: string;
  }> {
    // Guard: if the "Closed" tab is active in PO's UI, return empty to avoid showing closed trades
    if (!isOpenedTabActive()) {
      console.log('[SnapTrade] Closed tab is active — skipping DOM trade scrape');
      return [];
    }

    const trades: Array<{
      asset: string; direction: string; amount: number;
      payout: string; timer: string; profit: string;
      isPositive: boolean; returnAmount: string;
    }> = [];

    const tradeEls = document.querySelectorAll('.deals-list > .deals-list__item > div');

    tradeEls.forEach(el => {
      try {
        const rows = el.querySelectorAll('.item-row');
        if (rows.length < 2) return;

        const row1 = rows[0];
        const row2 = rows[1];

        const assetLinks = row1.querySelectorAll('a');
        const assetEl = assetLinks.length > 1 ? assetLinks[1] : assetLinks[0];
        const asset = assetEl?.textContent?.trim() || '';
        if (!asset || asset.length < 3) return;

        const payoutEl = row1.querySelector('.price-up');
        const payout = payoutEl?.textContent?.trim() || '';

        const row1Children = row1.children;
        const timerEl = row1Children.length > 1 ? row1Children[row1Children.length - 1] : null;
        const timer = timerEl?.textContent?.trim() || '';

        // Secondary guard: if timer doesn't look like a live countdown, skip this entry.
        // This catches edge cases where tab detection fails but closed trades have no timer.
        if (timer && !looksLikeCountdown(timer)) return;

        const isCall = row2.querySelector('.fa-arrow-up, .icon-arrow-up') !== null;
        const isPut = row2.querySelector('.fa-arrow-down, .icon-arrow-down') !== null;
        const direction = isCall ? 'CALL' : isPut ? 'PUT' : '?';

        const row2Text = row2.textContent || '';
        const amounts = row2Text.match(/\$[\d.]+/g) || [];
        const amount = amounts.length > 0 ? parseFloat(amounts[0]!.replace('$', '')) : 0;
        const returnAmount = amounts.length > 1 ? amounts[1]! : '$0';

        const profitEls = row2.querySelectorAll('.price-up');
        const profitEl = profitEls.length > 0 ? profitEls[profitEls.length - 1] : null;
        const profitText = profitEl?.textContent?.trim() || '$0';
        const isPositive = profitEl !== null && profitText.includes('+');

        trades.push({ asset, direction, amount, payout, timer, profit: profitText, isPositive, returnAmount });
      } catch { /* skip malformed */ }
    });

    return trades;
  }
}
