/**
 * Market Hours Detection — determines which asset classes are tradeable.
 *
 * Forex: Sunday 22:00 UTC → Friday 22:00 UTC (continuous 24/5)
 * OTC:   24/7 (broker-generated synthetic prices)
 * Crypto: 24/7
 *
 * Session windows (for future session-based filtering):
 *   Sydney:  22:00 - 07:00 UTC  (AUD, NZD pairs most active)
 *   Tokyo:   00:00 - 09:00 UTC  (JPY pairs most active)
 *   London:  08:00 - 17:00 UTC  (EUR, GBP pairs most active)
 *   New York: 13:00 - 22:00 UTC (USD pairs most active)
 */

export type MarketSession = 'sydney' | 'tokyo' | 'london' | 'newyork';

export interface MarketState {
  readonly forexOpen: boolean;
  readonly activeSessions: readonly MarketSession[];
  readonly nextOpen: Date | null;   // null if already open
  readonly nextClose: Date | null;  // null if already closed
}

export function getMarketState(now: Date = new Date()): MarketState {
  const utcDay = now.getUTCDay();   // 0=Sun, 6=Sat
  const utcHour = now.getUTCHours();

  // Forex closed: Friday 22:00 UTC → Sunday 22:00 UTC
  const isClosed =
    (utcDay === 6) ||                           // All Saturday
    (utcDay === 0 && utcHour < 22) ||           // Sunday before 22:00
    (utcDay === 5 && utcHour >= 22);            // Friday after 22:00

  const forexOpen = !isClosed;

  // Active sessions
  const sessions: MarketSession[] = [];
  if (forexOpen) {
    if (utcHour >= 22 || utcHour < 7) sessions.push('sydney');
    if (utcHour >= 0 && utcHour < 9) sessions.push('tokyo');
    if (utcHour >= 8 && utcHour < 17) sessions.push('london');
    if (utcHour >= 13 && utcHour < 22) sessions.push('newyork');
  }

  // Next open/close
  let nextOpen: Date | null = null;
  let nextClose: Date | null = null;

  if (!forexOpen) {
    // Find next Sunday 22:00 UTC
    const d = new Date(now);
    if (utcDay === 5) {
      d.setUTCDate(d.getUTCDate() + 2); // Fri → Sun
    } else if (utcDay === 6) {
      d.setUTCDate(d.getUTCDate() + 1); // Sat → Sun
    }
    // utcDay === 0 and utcHour < 22: already Sunday, just set hour
    d.setUTCHours(22, 0, 0, 0);
    nextOpen = d;
  } else {
    // Find next Friday 22:00 UTC
    const d = new Date(now);
    const daysUntilFriday = (5 - utcDay + 7) % 7 || (utcHour < 22 ? 0 : 7);
    d.setUTCDate(d.getUTCDate() + daysUntilFriday);
    d.setUTCHours(22, 0, 0, 0);
    nextClose = d;
  }

  return { forexOpen, activeSessions: sessions, nextOpen, nextClose };
}

/**
 * Returns true if a pair is a live (non-OTC) forex pair.
 * Live pairs only work when forex market is open.
 */
export function isLiveForexPair(symbol: string): boolean {
  // Live forex: no _otc suffix, no # prefix, looks like XXXYYY format
  return !symbol.includes('_otc') &&
    !symbol.startsWith('#') &&
    /^[A-Z]{6}$/.test(symbol);
}

/**
 * Filter a list of pairs based on current market state.
 * Removes live forex pairs when market is closed.
 */
export function filterByMarketHours(
  pairs: readonly string[],
  state: MarketState = getMarketState(),
): string[] {
  if (state.forexOpen) return [...pairs]; // all pairs available
  return pairs.filter(p => !isLiveForexPair(p));
}
