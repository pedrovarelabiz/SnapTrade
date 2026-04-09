/**
 * Shared formatting utilities — single source of truth for asset names & HTML escaping.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

/**
 * Normalize asset to display format: "EUR/USD OTC"
 * Handles: "EURUSD_otc", "EUR/USD OTC", "EURUSD", "EUR/USD_otc", etc.
 */
export function formatAssetDisplay(raw: string): string {
  if (!raw || raw.length < 3) return raw;
  const trimmed = raw.trim();

  // Already has slash — just clean up OTC suffix
  if (trimmed.includes('/')) {
    const pair = trimmed.split(/[\s_]/)[0];
    const isOtc = /[_ ]?otc/i.test(trimmed);
    return isOtc ? pair + ' OTC' : pair;
  }

  const isOtc = /[_ ]?otc/i.test(trimmed);
  const letters = trimmed.replace(/[^A-Za-z]/g, '').toUpperCase().replace(/OTC$/, '');

  if (letters.length >= 6) {
    const pair = letters.slice(0, 3) + '/' + letters.slice(3, 6);
    return isOtc ? pair + ' OTC' : pair;
  }

  return trimmed;
}

/**
 * Normalize asset to PO WebSocket format: "EURUSD_otc" or "EURUSD"
 */
export function formatAssetForWS(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length < 4) return trimmed;

  const isOtc = /[_ ]?otc/i.test(trimmed);
  const letters = trimmed.replace(/[^A-Za-z]/g, '').toUpperCase().replace(/OTC$/, '');

  if (!letters || letters.length < 3) return trimmed;
  return isOtc ? letters + '_otc' : letters;
}

/**
 * Format balance with locale-appropriate separators.
 */
export function formatBalance(balance: number): string {
  return balance >= 1000
    ? balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : balance.toFixed(2);
}
