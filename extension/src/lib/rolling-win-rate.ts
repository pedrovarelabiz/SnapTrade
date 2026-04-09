/**
 * Rolling Win Rate — calculates win rate over the last N trades.
 */

export interface TradeResult {
  readonly outcome: 'win' | 'loss';
  readonly timestamp: number;
}

/**
 * Returns the win rate (0–1) for the last `windowSize` trades,
 * sorted by timestamp descending (most recent first).
 * Returns 0 if no trades fall within the window.
 */
export function rollingWinRate(
  trades: readonly TradeResult[],
  windowSize: number
): number {
  if (trades.length === 0 || windowSize <= 0) return 0;

  const sorted = [...trades].sort((a, b) => b.timestamp - a.timestamp);
  const window = sorted.slice(0, windowSize);

  if (window.length === 0) return 0;

  const wins = window.filter((t) => t.outcome === 'win').length;
  return wins / window.length;
}
