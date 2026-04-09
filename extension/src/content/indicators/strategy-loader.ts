/**
 * Strategy Loader — Runtime CRUD for strategy definitions via chrome.storage.local.
 *
 * Loads StrategyDefJSON from storage, seeds with builtins on first run,
 * and provides add/remove/update/disable operations for dynamic strategy management.
 *
 * Storage key: 'strategyDefs' (separate from 'strategyLabStats' which holds results).
 */

import type { StrategyDefJSON } from './strategy-dsl';
import { convertAllBuiltins } from './strategy-converter';

// ─── Constants ───

const STORAGE_KEY = 'strategyDefs';
const DATA_VERSION = 1;

interface StoredStrategyData {
  readonly version: number;
  readonly strategies: readonly StrategyDefJSON[];
  readonly lastUpdated: number;
}

// ─── In-Memory Cache ───

let cachedStrategies: StrategyDefJSON[] = [];
let loaded = false;

// ─── Change Listeners ───

type StrategyChangeListener = () => void;
const changeListeners: StrategyChangeListener[] = [];

/** Subscribe to strategy list changes (e.g., after crawler inject). */
export function onStrategiesChanged(fn: StrategyChangeListener): void {
  changeListeners.push(fn);
}

function notifyStrategiesChanged(): void {
  for (const fn of changeListeners) {
    try { fn(); } catch (e) { console.warn('[SnapTrade] Strategy change listener error:', e); }
  }
}

// ─── Persistence ───

function persistToStorage(): void {
  const data: StoredStrategyData = {
    version: DATA_VERSION,
    strategies: cachedStrategies,
    lastUpdated: Date.now(),
  };

  try {
    chrome.storage.local.set({ [STORAGE_KEY]: data }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[SnapTrade] Strategy loader: persist error:', chrome.runtime.lastError.message);
      }
    });
  } catch (err) {
    console.warn('[SnapTrade] Strategy loader: persist failed:', err);
  }
}

// ─── Initialization ───

/**
 * Load strategies from storage. Seeds with builtins if empty.
 * Call once at startup from content-script.
 */
export async function initStrategyLoader(): Promise<void> {
  if (loaded) return;

  return new Promise<void>((resolve) => {
    try {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const data = result[STORAGE_KEY] as StoredStrategyData | undefined;

        if (data && data.strategies && data.strategies.length > 0) {
          cachedStrategies = [...data.strategies];
          console.log(`[SnapTrade] Strategy loader: ${cachedStrategies.length} strategies from storage (v${data.version})`);
        } else {
          // First run: seed with builtins
          cachedStrategies = [...convertAllBuiltins()];
          console.log(`[SnapTrade] Strategy loader: seeded ${cachedStrategies.length} builtin strategies`);
          persistToStorage();
        }

        loaded = true;
        resolve();
      });
    } catch {
      // Fallback: use builtins directly (e.g., in test environment without chrome.storage)
      cachedStrategies = [...convertAllBuiltins()];
      loaded = true;
      console.log(`[SnapTrade] Strategy loader: fallback to ${cachedStrategies.length} builtins`);
      resolve();
    }
  });
}

// ─── Read Operations ───

/**
 * Get all active (non-disabled) strategies.
 */
export function getActiveStrategies(): readonly StrategyDefJSON[] {
  return cachedStrategies.filter(s => s.disabledAt === null);
}

/**
 * Get all strategies including disabled.
 */
export function getAllStrategies(): readonly StrategyDefJSON[] {
  return cachedStrategies;
}

/**
 * Get a strategy by ID.
 */
export function getStrategyById(id: string): StrategyDefJSON | null {
  return cachedStrategies.find(s => s.id === id) ?? null;
}

/**
 * Get strategies by source type.
 */
export function getStrategiesBySource(source: StrategyDefJSON['source']): readonly StrategyDefJSON[] {
  return cachedStrategies.filter(s => s.source === source);
}

// ─── Write Operations (immutable updates) ───

/**
 * Add a new strategy. Returns false if ID already exists.
 */
export function addStrategy(def: StrategyDefJSON): boolean {
  if (cachedStrategies.some(s => s.id === def.id)) {
    console.warn(`[SnapTrade] Strategy loader: duplicate ID '${def.id}'`);
    return false;
  }

  cachedStrategies = [...cachedStrategies, def];
  persistToStorage();
  console.log(`[SnapTrade] Strategy loader: added '${def.id}' (${def.source})`);
  return true;
}

/**
 * Add multiple strategies at once. Skips duplicates.
 */
export function addStrategies(defs: readonly StrategyDefJSON[]): number {
  const existingIds = new Set(cachedStrategies.map(s => s.id));
  const newOnes = defs.filter(d => !existingIds.has(d.id));

  if (newOnes.length === 0) return 0;

  cachedStrategies = [...cachedStrategies, ...newOnes];
  persistToStorage();
  console.log(`[SnapTrade] Strategy loader: added ${newOnes.length} strategies`);
  return newOnes.length;
}

/**
 * Remove a strategy by ID. Returns false if not found.
 */
export function removeStrategy(id: string): boolean {
  const idx = cachedStrategies.findIndex(s => s.id === id);
  if (idx === -1) return false;

  cachedStrategies = [...cachedStrategies.slice(0, idx), ...cachedStrategies.slice(idx + 1)];
  persistToStorage();
  console.log(`[SnapTrade] Strategy loader: removed '${id}'`);
  return true;
}

/**
 * Disable a strategy (set disabledAt timestamp). Immutable update.
 */
export function disableStrategy(id: string): boolean {
  const idx = cachedStrategies.findIndex(s => s.id === id);
  if (idx === -1) return false;

  const updated = { ...cachedStrategies[idx]!, disabledAt: Date.now() };
  cachedStrategies = [
    ...cachedStrategies.slice(0, idx),
    updated,
    ...cachedStrategies.slice(idx + 1),
  ];
  persistToStorage();
  return true;
}

/**
 * Re-enable a disabled strategy. Immutable update.
 */
export function enableStrategy(id: string): boolean {
  const idx = cachedStrategies.findIndex(s => s.id === id);
  if (idx === -1) return false;

  const updated = { ...cachedStrategies[idx]!, disabledAt: null };
  cachedStrategies = [
    ...cachedStrategies.slice(0, idx),
    updated,
    ...cachedStrategies.slice(idx + 1),
  ];
  persistToStorage();
  return true;
}

/**
 * Update a strategy's fields (partial patch). Immutable update.
 */
export function updateStrategy(id: string, patch: Partial<Pick<StrategyDefJSON, 'name' | 'description' | 'aiPrompt' | 'tags' | 'customLogic' | 'customCode' | 'minIntervalMs'>>): boolean {
  const idx = cachedStrategies.findIndex(s => s.id === id);
  if (idx === -1) return false;

  const updated = {
    ...cachedStrategies[idx]!,
    ...patch,
    version: cachedStrategies[idx]!.version + 1,
  };
  cachedStrategies = [
    ...cachedStrategies.slice(0, idx),
    updated,
    ...cachedStrategies.slice(idx + 1),
  ];
  persistToStorage();
  return true;
}

/**
 * Reset to builtin strategies (removes all crawler/evolved strategies).
 */
export function resetToBuiltins(): void {
  cachedStrategies = [...convertAllBuiltins()];
  persistToStorage();
  console.log(`[SnapTrade] Strategy loader: reset to ${cachedStrategies.length} builtins`);
}

// ─── Crawler Strategy Polling ───

const POLL_INTERVAL_MS = 30 * 60_000; // Poll every 30 minutes
let lastPollTime = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

interface CrawlerStrategy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly entryTiming: string;
  readonly confidence: number;
  readonly indicators: readonly string[];
  readonly entryConditionCall: string;
  readonly entryConditionPut: string;
  readonly tags: readonly string[];
  readonly source: 'crawler';
  readonly sourceUrl: string;
  readonly sourceTitle: string;
  readonly publishedAt: number;
  readonly dsl: unknown | null; // DSL expression tree from crawler LLM conversion
}

/**
 * Poll the relay server for new crawler-discovered strategies.
 * Converts them to StrategyDefJSON and adds to the local cache.
 */
async function pollForNewStrategies(): Promise<number> {
  try {
    const settings = await chrome.storage.local.get('settings');
    const token = settings.settings?.extensionToken;
    if (!token) return 0;

    // Fetch published strategies from server
    const response = await fetch('https://snaptrade.faroldigital.pt/api/extension/strategies-new', {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      // Fallback: try static file
      const fallback = await fetch('https://snaptrade.faroldigital.pt/strategies-new.json');
      if (!fallback.ok) return 0;
      const strategies = await fallback.json() as readonly CrawlerStrategy[];
      return injectCrawlerStrategies(strategies);
    }

    const strategies = await response.json() as readonly CrawlerStrategy[];
    return injectCrawlerStrategies(strategies);
  } catch {
    return 0;
  }
}

// ─── DSL Path Validation ───

const VALID_LAB_PATHS = new Set([
  // Core indicators
  'williamsR.value', 'williamsR.zone', 'williamsR.crossingUp', 'williamsR.crossingDown',
  'cci.value', 'cci.zone', 'cci.crossingAboveMinus100', 'cci.crossingBelowPlus100',
  'ichimoku.tkCross', 'ichimoku.priceVsCloud',
  'sar.isBelow', 'sar.flipped',
  'keltner.pricePosition', 'keltner.upper', 'keltner.lower',
  'donchian.breakoutUp', 'donchian.breakoutDown',
  'divergence.bullishRegular', 'divergence.bearishRegular', 'divergence.bullishHidden', 'divergence.bearishHidden',
  'bbSqueeze.isSqueeze',
  'threeWhiteSoldiers', 'threeBlackCrows', 'insideBar',
  // New indicators
  'aroon.aroonUp', 'aroon.aroonDown', 'aroon.oscillator', 'aroon.trend', 'aroon.crossingUp', 'aroon.crossingDown',
  'demarker.value', 'demarker.zone', 'demarker.crossingUp', 'demarker.crossingDown',
  'vortex.viPlus', 'vortex.viMinus', 'vortex.trend', 'vortex.crossingUp', 'vortex.crossingDown',
  'alligator.jaw', 'alligator.teeth', 'alligator.lips', 'alligator.trend', 'alligator.opening',
  'fractal.upFractal', 'fractal.downFractal', 'fractal.lastUpPrice', 'fractal.lastDownPrice',
  'awesomeOscillator.value', 'awesomeOscillator.prevValue', 'awesomeOscillator.rising',
  'awesomeOscillator.crossingZeroUp', 'awesomeOscillator.crossingZeroDown', 'awesomeOscillator.color',
  'supertrend.value', 'supertrend.direction', 'supertrend.flipped',
]);

const VALID_ROOTS = new Set(['lab', 'extra', 'pa', 'candle', 'prevLab']);

/** Walk a DSL expression tree and return any invalid paths. */
function validateDSLPaths(expr: Record<string, unknown>): string[] {
  const invalid: string[] = [];

  function walk(node: Record<string, unknown>): void {
    if (!node || typeof node !== 'object') return;

    const type = node.type as string | undefined;

    if (type === 'check' || type === 'exists' || type === 'transition') {
      const path = node.path as string | undefined;
      if (path) {
        const parts = path.split('.');
        const root = parts[0];
        if (!VALID_ROOTS.has(root ?? '')) {
          invalid.push(path);
        } else if (root === 'lab' && parts.length >= 2) {
          const labPath = parts.slice(1).join('.');
          if (!VALID_LAB_PATHS.has(labPath)) invalid.push(path);
        }
      }
    }

    if (type === 'prev_compare') {
      for (const key of ['currPath', 'prevPath'] as const) {
        const p = node[key] as string | undefined;
        if (p) {
          const parts = p.split('.');
          if (!VALID_ROOTS.has(parts[0] ?? '')) invalid.push(p);
        }
      }
    }

    // Recurse into children/condition/checks
    for (const key of ['children', 'checks'] as const) {
      const arr = node[key];
      if (Array.isArray(arr)) arr.forEach(c => walk(c as Record<string, unknown>));
    }
    if (node.condition && typeof node.condition === 'object') walk(node.condition as Record<string, unknown>);
  }

  walk(expr);
  return invalid;
}

function injectCrawlerStrategies(strategies: readonly CrawlerStrategy[]): number {
  if (!Array.isArray(strategies) || strategies.length === 0) return 0;

  const existingIds = new Set(cachedStrategies.map(s => s.id));
  let added = 0;

  for (const cs of strategies) {
    // Skip if already exists or confidence too low
    const crawlerId = `crawler_${cs.id}`;
    if (existingIds.has(crawlerId) || cs.confidence < 50) continue;

    // Convert to StrategyDefJSON
    const def: StrategyDefJSON = {
      id: crawlerId,
      name: cs.name,
      version: 1,
      source: 'crawler',
      entryTiming: (cs.entryTiming ?? 'm5_gate_m1_signal') as StrategyDefJSON['entryTiming'],
      minIntervalMs: 60_000,
      requiredSetups: [],
      minSetupCount: 0,
      requireM5Alignment: false,
      minConfidence: 0,
      filters: {
        nearSR: false, orderBlock: false, fvg: false, structureBreak: false,
        stochExtreme: false, adxTrend: false, adxRange: false,
        emaAlignment: false, emaCrossover: false,
        session: null, regimeMode: null,
      },
      // Use DSL expression tree from crawler if available — validate paths first
      customLogic: (() => {
        if (!cs.dsl || typeof cs.dsl !== 'object') return null;
        const invalidPaths = validateDSLPaths(cs.dsl as Record<string, unknown>);
        if (invalidPaths.length > 0) {
          console.warn(`[SnapTrade] Strategy '${cs.name}' has invalid DSL paths:`, invalidPaths);
          return null; // Fallback to declarative filters only
        }
        return cs.dsl as StrategyDefJSON['customLogic'];
      })(),
      customCode: null,
      description: `${cs.description} | CALL: ${cs.entryConditionCall} | PUT: ${cs.entryConditionPut}`,
      aiPrompt: `Strategy "${cs.name}" from ${cs.sourceTitle}: ${cs.description}. Entry CALL: ${cs.entryConditionCall}. Entry PUT: ${cs.entryConditionPut}. Validate: does the current setup match these conditions?`,
      tags: [...cs.tags],
      parentIds: [],
      createdAt: cs.publishedAt,
      disabledAt: null,
    };

    if (addStrategy(def)) {
      added++;
    }
  }

  if (added > 0) {
    console.log(`[SnapTrade] Strategy loader: injected ${added} crawler strategies`);
    notifyStrategiesChanged();
  }
  return added;
}

/**
 * Start polling for new strategies. Call once from content-script.
 */
export function startStrategyPolling(): void {
  if (pollTimer) return;

  // First poll after 60s (let the extension initialize)
  setTimeout(() => {
    pollForNewStrategies();
    pollTimer = setInterval(pollForNewStrategies, POLL_INTERVAL_MS);
  }, 60_000);

  console.log('[SnapTrade] Strategy polling started (every 30 min)');
}

// ─── Diagnostics ───

/**
 * Get loader stats for debugging.
 */
export function getLoaderStats(): {
  total: number;
  active: number;
  disabled: number;
  builtin: number;
  crawler: number;
  evolved: number;
  manual: number;
} {
  const all = cachedStrategies;
  return {
    total: all.length,
    active: all.filter(s => s.disabledAt === null).length,
    disabled: all.filter(s => s.disabledAt !== null).length,
    builtin: all.filter(s => s.source === 'builtin').length,
    crawler: all.filter(s => s.source === 'crawler').length,
    evolved: all.filter(s => s.source === 'evolved').length,
    manual: all.filter(s => s.source === 'manual').length,
  };
}
