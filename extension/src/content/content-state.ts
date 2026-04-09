import { PocketOptionBridge } from './pocket-option-bridge';
import { OverlayManager } from './overlay';
import type { ExtensionSettings, ExtensionMessage } from '../types';
import { getSettings } from '../lib/storage';
import * as Sentry from '@sentry/browser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TradeSource = 'indicators' | 'ai' | 'backend' | 'telegram' | 'manual';

export interface ContentState {
  readonly bridge: PocketOptionBridge;
  readonly overlay: OverlayManager;
  readonly pendingSignals: Map<string, import('../types').Signal>;
  readonly activeGales: Map<string, { signal: import('../types').Signal; level: number; lastAmount: number }>;
  settings: ExtensionSettings | null;
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

export const state: ContentState = {
  bridge: new PocketOptionBridge(),
  overlay: new OverlayManager(),
  pendingSignals: new Map(),
  activeGales: new Map(),
  settings: null,
};

// Track currently open trades by normalized asset name (for trade guard)
export const openTradeAssets = new Set<string>();

// Track trade source for overlay labels: asset -> source
export const tradeSourceMap = new Map<string, TradeSource>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function normalizeAssetForGuard(asset: string): string {
  return asset.toLowerCase().replace(/[\s_/]/g, '');
}

export function getTradeSource(signalId: string, channelSlug?: string): TradeSource {
  if (signalId.startsWith('backend_')) return 'backend';
  if (signalId.startsWith('llm_')) return 'ai';
  if (signalId.startsWith('auto_')) return 'indicators';
  if (channelSlug === 'ai_analyst') return 'ai';
  if (channelSlug === 'st_indicators') return 'indicators';
  if (channelSlug) return 'telegram';
  return 'manual';
}

export function enrichTradesWithSource<T extends { asset: string }>(trades: T[]): (T & { source?: TradeSource })[] {
  return trades.map(t => {
    const norm = normalizeAssetForGuard(t.asset);
    const source = tradeSourceMap.get(norm);
    return source ? { ...t, source } : t;
  });
}

export function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sendToBackground(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message).catch((err) => {
    console.warn('[SnapTrade] sendToBackground failed:', err);
    Sentry.captureException(err);
  });
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const settings = await getSettings();
  state.settings = settings;
  return settings;
}
