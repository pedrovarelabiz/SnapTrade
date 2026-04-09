import selectors from '../selectors/pocket-option.json';
import { formatAssetForWS } from '../lib/format';
import { WS_TRADE_TIMEOUT_MS } from '../lib/constants';
import * as Sentry from '@sentry/browser';

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
 * Delegates to getTabState() — returns true only for 'opened', false otherwise.
 */
function isOpenedTabActive(): boolean {
  // Only scrape when DEFINITELY on the opened tab.
  // 'unknown' (mid-transition) must NOT scrape — it causes false closures.
  return getTabState() === 'opened';
}

/**
 * Returns the current tab state: 'opened', 'closed', or 'unknown'.
 * Used by balance detection to freeze on tab switches.
 */
function getTabState(): 'opened' | 'closed' | 'unknown' {
  // Look specifically for PO's deal tab buttons (not any element with "tab" in class)
  // PO uses links inside the deals panel: "Opened" and "Closed" tabs
  const dealsTabs = document.querySelectorAll(
    '.deals-header a, .deals-tabs a, [class*="deals"] > a, [class*="deals"] [role="tab"]'
  );

  let foundOpenedTab = false;
  let openedTabIsActive = false;
  let closedTabIsActive = false;

  for (const el of Array.from(dealsTabs)) {
    const text = (el.textContent || '').trim().toLowerCase();
    const cls = el.className || '';
    const isActive = cls.includes('active') || cls.includes('selected') || cls.includes('current')
      || el.getAttribute('aria-selected') === 'true';

    if (text === 'opened' || text === 'open') {
      foundOpenedTab = true;
      if (isActive) openedTabIsActive = true;
    }
    if (text === 'closed' || text === 'close') {
      if (isActive) closedTabIsActive = true;
    }
  }

  // Only block if we DEFINITELY found both tabs AND "Closed" is active
  if (foundOpenedTab && closedTabIsActive) return 'closed';
  // Default to 'opened' — safe to scrape (worst case: empty list)
  return 'opened';
}

/**
 * Returns true if the timer string looks like an active countdown (open trade).
 * Open trades show countdowns like "00:04", "04:32" — always MM:SS with leading zeros.
 * Closed trades may show times like "14:22" but without the countdown urgency context;
 * however since both formats overlap we use tab detection as primary guard.
 */
function looksLikeCountdown(timer: string): boolean {
  // Match M:SS or MM:SS format (e.g., "2:52", "02:52", "04:32")
  return /^\d{1,2}:\d{2}$/.test(timer.trim());
}

/**
 * PocketOptionBridge — WebSocket-based trade execution.
 * DOM is only used for reading balance/account info.
 */
export class PocketOptionBridge {
  private wsReady = false;
  private wsUrl = '';
  private wsPayouts = new Map<string, number>(); // WS-based payout cache: normalized symbol → payout (0-1)
  private wsSymbolMap = new Map<string, string>(); // normalized → original symbol (e.g. "audcadotc" → "AUDCAD_otc")
  private pendingResolve: ((r: { success: boolean; error?: string }) => void) | null = null;

  constructor() {
    window.addEventListener('message', (event) => {
      if (!event.data || typeof event.data !== 'object') return;

      if (event.data.type === 'ST_WS_READY') {
        const newUrl = event.data.url || '';
        const isNewConnection = newUrl !== this.wsUrl;
        this.wsReady = true;
        this.wsUrl = newUrl;
        if (isNewConnection) {
          console.log('[SnapTrade] Trading WS ready:', this.wsUrl);
        }
      }

      if (event.data.type === 'ST_WS_CLOSED') {
        this.wsReady = false;
      }

      if (event.data.type === 'ST_TRADE_RESULT' && this.pendingResolve) {
        this.pendingResolve(event.data);
        this.pendingResolve = null;
      }

      // Capture asset payout data from WS updateAssets event
      if (event.data.type === 'ST_WS_ASSETS') {
        try {
          const assets = JSON.parse(event.data.data);
          // PO sends assets as array or object with payout info
          const assetList = Array.isArray(assets) ? assets : Object.values(assets);
          for (const a of assetList) {
            let name: string | undefined;
            let payout: number | undefined;

            if (Array.isArray(a)) {
              // PO array format: [id, symbol, displayName, category, type, profit%, ...]
              // index 1 = symbol (e.g. "AUDCAD_otc"), index 5 = payout (e.g. 85)
              name = typeof a[1] === 'string' ? a[1] : undefined;
              const rawPayout = typeof a[5] === 'number' ? a[5] : undefined;
              payout = rawPayout !== undefined ? (rawPayout > 1 ? rawPayout / 100 : rawPayout) : undefined;
            } else if (a && typeof a === 'object') {
              // Object format: {name, symbol, payout, profit, profitability, ...}
              name = (a as any)?.name || (a as any)?.symbol || (a as any)?.title;
              const rawPayout = (a as any)?.payout ?? (a as any)?.profit ?? (a as any)?.profitability
                ?? (a as any)?.option_profit ?? (a as any)?.optionProfit;
              payout = typeof rawPayout === 'string' ? parseFloat(rawPayout) : rawPayout;
              if (payout !== undefined && payout > 1) payout = payout / 100;
            }

            if (name && typeof payout === 'number' && !isNaN(payout) && payout > 0) {
              const norm = String(name).toLowerCase().replace(/[\s_/]/g, '');
              this.wsPayouts.set(norm, payout);
              this.wsSymbolMap.set(norm, String(name));
            }
          }
          if (this.wsPayouts.size > 0) {
            const otcEntries = Array.from(this.wsPayouts.entries()).filter(([k]) => k.includes('otc'));
            const sample = otcEntries.slice(0, 4).map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`).join(', ');
            console.log(`[SnapTrade] WS payouts updated: ${this.wsPayouts.size} assets, ${otcEntries.length} OTC (${sample})`);
          } else {
            const first = assetList[0];
            if (first) console.log('[SnapTrade] WS assets received but no payouts parsed. Sample:', JSON.stringify(first).substring(0, 300));
          }
        } catch { /* malformed asset data */ }
      }
    });
  }

  isReady(): boolean {
    if (this.wsReady) return true;
    // Fallback: check if WS interceptor has a live connection we missed
    const ws = (window as any).__stTradingWS as WebSocket | null;
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.wsReady = true;
      return true;
    }
    return false;
  }

  getTabState(): 'opened' | 'closed' | 'unknown' {
    return getTabState();
  }

  async waitForReady(timeout = 30000): Promise<boolean> {
    if (this.isReady()) return true;
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        // Final fallback: check global WS before giving up
        if (this.isReady()) { resolve(true); return; }
        window.removeEventListener('message', handler);
        resolve(false);
      }, timeout);
      // Poll every 2s in case ST_WS_READY was missed
      const poll = setInterval(() => {
        if (this.isReady()) {
          clearTimeout(timer);
          clearInterval(poll);
          window.removeEventListener('message', handler);
          resolve(true);
        }
      }, 2000);
      const handler = (e: MessageEvent): void => {
        if (e.data?.type === 'ST_WS_READY') {
          clearTimeout(timer);
          clearInterval(poll);
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

  getPayoutRate(targetAsset?: string): number | null {
    if (targetAsset) {
      const normalized = targetAsset.toLowerCase().replace(/[\s_/]/g, '');
      // Priority 1: WS-based payout cache (most reliable, covers all assets)
      const wsPayout = this.wsPayouts.get(normalized);
      if (wsPayout !== undefined) return wsPayout;
      // Try fuzzy match on WS cache
      for (const [key, val] of this.wsPayouts) {
        if (key.includes(normalized) || normalized.includes(key)) return val;
      }
      // Priority 2: DOM-based payout (fallback, only works for visible assets)
      const items = document.querySelectorAll('li.alist__item a.alist__link');
      for (const el of items) {
        const text = el.textContent || '';
        const elAsset = text.replace(/\+\d+%/g, '').trim().toLowerCase().replace(/[\s_/]/g, '');
        if (elAsset.includes(normalized) || normalized.includes(elAsset)) {
          const match = text.match(/\+(\d+)%/);
          if (match) return parseInt(match[1]) / 100;
        }
      }
    }
    // Fallback: read active/visible asset's payout
    const el = document.querySelector('li.alist__item.alist__item--active a.alist__link');
    if (el) {
      const match = (el.textContent || '').match(/\+(\d+)%/);
      if (match) return parseInt(match[1]) / 100;
    }
    return null;
  }

  /**
   * Returns all pairs from WS payout cache with payout >= minPayout.
   * Categories: 'otc_forex', 'otc_crypto', 'live_forex', 'other'
   */
  getTradeablePairs(minPayoutPct: number = 65): Array<{ symbol: string; payout: number; category: string }> {
    const result: Array<{ symbol: string; payout: number; category: string }> = [];
    for (const [norm, payout] of this.wsPayouts) {
      if (payout * 100 < minPayoutPct) continue;
      const original = this.wsSymbolMap.get(norm) ?? norm;
      const isOtc = original.includes('_otc');
      const isStock = original.startsWith('#');
      const isCrypto = /^(BTC|ETH|SOL|ADA|BNB|DOGE|DOT|LTC|MATIC|LINK|AVAX|TON|TRX|BITB)/i.test(original);
      const isForex = /^[A-Z]{6}/.test(original.replace('_otc', '').replace('-USD', 'USD'));

      let category = 'other';
      if (isStock) category = 'stock';
      else if (isCrypto && isOtc) category = 'otc_crypto';
      else if (isCrypto) category = 'live_crypto';
      else if (isForex && isOtc) category = 'otc_forex';
      else if (isForex) category = 'live_forex';

      if (category !== 'stock') {
        result.push({ symbol: original, payout, category });
      }
    }
    return result.sort((a, b) => b.payout - a.payout);
  }

  /** Returns count of cached payouts */
  getPayoutCacheSize(): number {
    return this.wsPayouts.size;
  }

  async executeTrade(
    asset: string, direction: 'CALL' | 'PUT', amount: number, expirationMinutes: number,
    forceDemo?: boolean,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check both the flag and the actual WS state
      if (!this.isReady()) {
        const ws = (window as any).__stTradingWS as WebSocket | null;
        console.warn('[SnapTrade] WS not ready. wsReady:', this.wsReady,
          'globalWS:', ws ? `readyState=${ws.readyState}` : 'null');
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
    } catch (error) {
      Sentry.captureException(error, {
        extra: {
          asset,
          direction,
          amount,
          expirationMinutes,
        },
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /** Schedule a pending order to open at exact server time (no delay). */
  async executePendingTrade(
    asset: string, direction: 'CALL' | 'PUT', amount: number, expirationMinutes: number,
    openTimeUTC: string, isDemo: boolean, minPayout: number,
  ): Promise<{ success: boolean; ticket?: string; error?: string }> {
    try {
      if (!this.isReady()) return { success: false, error: 'WebSocket not connected' };
      const poAsset = formatAssetForWS(asset);
      const action = direction === 'CALL' ? 'call' : 'put';

      return new Promise(resolve => {
        const handler = (event: MessageEvent): void => {
          if (event.data?.type === 'ST_PENDING_TRADE_RESULT') {
            window.removeEventListener('message', handler);
            clearTimeout(timer);
            resolve({ success: event.data.success, ticket: event.data.ticket, error: event.data.error });
          }
        };
        window.addEventListener('message', handler);
        window.postMessage({
          type: 'ST_EXECUTE_PENDING_TRADE',
          asset: poAsset, amount, action, isDemo,
          timeframeSec: expirationMinutes * 60,
          openTime: openTimeUTC, minPayout,
        }, '*');
        const timer = setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve({ success: false, error: 'Timeout' });
        }, WS_TRADE_TIMEOUT_MS);
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  watchForResult(callback: (result: { win: boolean; amount: number; asset?: string }) => void): () => void {
    const handler = (event: MessageEvent): void => {
      const type = event.data?.type;
      if (type !== 'ST_WS_TRADE' && type !== 'ST_WS_DEALS') return;
      const data = String(event.data.data);
      if (data.includes('successcloseOrder') || data.includes('updateClosedDeals')) {
        try {
          const jsonPart = data.replace(/^\d+[-]?/, '');
          const parsed = JSON.parse(jsonPart);
          if (Array.isArray(parsed) && parsed.length > 1) {
            const deal = parsed[1];
            const profit = deal?.profit || deal?.closeProfit || 0;
            console.log('[SnapTrade] watchForResult fired:', data.substring(0, 100));
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

    // Primary selectors
    let tradeEls = document.querySelectorAll('.deals-list > .deals-list__item > div');

    // Fallback if primary returns nothing
    if (tradeEls.length === 0) {
      tradeEls = document.querySelectorAll('[class*="deals-list"] [class*="deals-item"]');
    }

    // No warning needed — empty is normal when Closed tab is active or no trades open

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

        // Timer extraction: find clean MM:SS text from row1's children.
        // timerEl.textContent can concatenate multiple child text nodes (e.g. "122:51"
        // instead of "02:52"), so we search for the innermost leaf with MM:SS format.
        let timer = '';
        const row1Children = row1.children;
        const timerEl = row1Children.length > 1 ? row1Children[row1Children.length - 1] : null;
        if (timerEl) {
          // Try innermost leaf elements first (most specific)
          const leaves = timerEl.querySelectorAll('*');
          for (const leaf of Array.from(leaves)) {
            const t = (leaf.textContent || '').trim();
            if (/^\d{1,2}:\d{2}$/.test(t) && leaf.children.length === 0) {
              timer = t;
            }
          }
          // Fallback: if timerEl itself is a leaf, use its text
          if (!timer && timerEl.children.length === 0) {
            const t = (timerEl.textContent || '').trim();
            if (/^\d{1,2}:\d{2}$/.test(t)) timer = t;
          }
          // Last resort: extract MM:SS pattern via regex from full text
          if (!timer) {
            const fullText = (timerEl.textContent || '').trim();
            const match = fullText.match(/\b(\d{1,2}:\d{2})\b/);
            if (match) timer = match[1];
          }
        }

        // Secondary guard: if timer doesn't look like a live countdown, skip this entry.
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
