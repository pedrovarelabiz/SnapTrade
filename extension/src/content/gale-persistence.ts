// ---------------------------------------------------------------------------
// Gale-level persistence (chrome.storage.session / chrome.storage.local)
// ---------------------------------------------------------------------------

// Trade execution dedup (persisted to chrome.storage.session to survive page reloads)
export const executedTradeIds = new Set<string>();

// WS-based deal closure dedup + double-report prevention
export const wsClosedDealIds = new Set<string>();
export const wsResolvedAssets = new Map<string, number>(); // asset -> timestamp

// Track gale levels for WS result correlation: key = asset:direction:amount
export const recentTradeGaleLevels = new Map<string, {
  signalId: string;
  galeLevel: number;
  channelSlug: string;
  timestamp: number;
}>();

export async function persistGaleLevels(): Promise<void> {
  try {
    const entries = Array.from(recentTradeGaleLevels.entries());
    await chrome.storage.local.set({ recentTradeGaleLevels: entries });
  } catch { /* storage may be unavailable */ }
}

export async function restoreGaleLevels(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('recentTradeGaleLevels');
    const entries = result.recentTradeGaleLevels as Array<[string, {
      signalId: string;
      galeLevel: number;
      channelSlug: string;
      timestamp: number;
    }]> | undefined;
    if (entries && Array.isArray(entries)) {
      const now = Date.now();
      for (const [key, val] of entries) {
        // Only restore entries younger than 10 minutes
        if (now - val.timestamp < 600000) {
          recentTradeGaleLevels.set(key, val);
        }
      }
      console.log(`[SnapTrade] Restored ${recentTradeGaleLevels.size} gale tracking entries from session storage`);
    }
  } catch { /* ignore */ }
}

export async function persistExecutedId(id: string): Promise<void> {
  try {
    executedTradeIds.add(id);
    const result = await chrome.storage.session.get('contentExecutedIds');
    const ids: string[] = result.contentExecutedIds || [];
    const updated = [...ids, id].slice(-100);
    await chrome.storage.session.set({ contentExecutedIds: updated });
  } catch { /* ignore */ }
}

export async function restoreExecutedIds(): Promise<void> {
  try {
    const result = await chrome.storage.session.get('contentExecutedIds');
    const ids: string[] = result.contentExecutedIds || [];
    ids.forEach(id => executedTradeIds.add(id));
    // Keep only last 100
    if (ids.length > 100) {
      await chrome.storage.session.set({ contentExecutedIds: ids.slice(-100) });
    }
  } catch { /* session storage not available */ }
}
