import React, { useState, useEffect } from 'react';
import type { ExtensionSettings, IndicatorValidationConfig } from '../../types';

interface Props {
  readonly settings: ExtensionSettings;
  readonly onUpdate: (partial: Partial<ExtensionSettings>) => Promise<void>;
}

type SetupType = 'rsi_reversal' | 'macd_cross' | 'candle_pattern' | 'ma_trend' | 'bb_squeeze' | 'trend_confirm';

const SETUP_CATALOG: Array<{ type: SetupType; label: string; desc: string }> = [
  { type: 'trend_confirm', label: 'Trend Confirmation', desc: 'Sustained trend: RSI>50 + MACD>Signal + Price>SMA80 + Alligator' },
  { type: 'rsi_reversal', label: 'RSI Reversal', desc: 'Detects oversold/overbought exits' },
  { type: 'macd_cross', label: 'MACD Cross', desc: 'Detects MACD-signal line crossovers' },
  { type: 'candle_pattern', label: 'Candle Patterns', desc: 'Engulfing, hammer, shooting star, doji star reversals' },
  { type: 'ma_trend', label: 'MA Trend', desc: 'Detects price crossing SMA(20) with trend' },
  { type: 'bb_squeeze', label: 'BB Squeeze', desc: 'Detects Bollinger Band squeeze breakouts' },
];

const DEFAULT_CONFIG: IndicatorValidationConfig = {
  enabled: false,
  validateSignals: false,
  minConfidence: 60,
  noSetupAction: 'allow',
  autoTradeEnabled: false,
  autoTradeMinConfidence: 50,
  autoTradeExpirationMinutes: 5,
  autoTradePairs: [],
  enabledSetups: ['trend_confirm', 'rsi_reversal', 'macd_cross', 'candle_pattern', 'ma_trend', 'bb_squeeze'],
  indicators: [],
  showOverlay: true,
  monitoredPairs: [
    'EURUSD_otc', 'GBPJPY_otc', 'AUDUSD_otc', 'EURGBP_otc',
    'EURJPY_otc', 'GBPUSD_otc', 'BTCUSD_otc', 'ETHUSD_otc',
  ],
  llmAnalyst: null,
};

// OTC pair list — Major + Cross only (exotics removed: huge spreads, near-zero liquidity)
const FALLBACK_FOREX_OTC = [
  // Major pairs
  'EURUSD_otc', 'GBPUSD_otc', 'USDJPY_otc', 'USDCHF_otc', 'USDCAD_otc',
  'AUDUSD_otc', 'NZDUSD_otc',
  // Cross pairs
  'EURGBP_otc', 'EURJPY_otc', 'EURCHF_otc', 'EURNZD_otc', 'EURHUF_otc',
  'EURTRY_otc',
  'GBPJPY_otc', 'GBPAUD_otc',
  'AUDCAD_otc', 'AUDCHF_otc', 'AUDJPY_otc', 'AUDNZD_otc',
  'NZDJPY_otc', 'NZDCHF_otc',
  'CADCHF_otc', 'CADJPY_otc',
  'CHFJPY_otc',
  // Liquid exotics only (USD-based with real market volume)
  'USDBRL_otc', 'USDMXN_otc', 'USDINR_otc', 'USDSGD_otc', 'USDRUB_otc',
];

const FALLBACK_CRYPTO_OTC = ['BTCUSD_otc', 'ETHUSD_otc', 'SOL-USD_otc'];

// Live market forex pairs (available when markets are open)
const FALLBACK_FOREX_LIVE = [
  // Major
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD',
  // Cross
  'EURGBP', 'EURJPY', 'EURCHF', 'EURAUD', 'EURCAD',
  'GBPJPY', 'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPNZD',
  'AUDCAD', 'AUDCHF', 'AUDJPY',
  'CADCHF', 'CADJPY', 'CHFJPY',
];

const POPULAR_PAIRS = [
  'EURUSD_otc', 'GBPJPY_otc', 'AUDUSD_otc', 'EURGBP_otc',
  'EURJPY_otc', 'GBPUSD_otc', 'BTCUSD_otc', 'ETHUSD_otc',
];

const MAJOR_PAIRS = new Set([
  'EURUSD_otc', 'GBPUSD_otc', 'USDJPY_otc', 'USDCHF_otc', 'USDCAD_otc',
  'AUDUSD_otc', 'NZDUSD_otc',
]);

function categorizePairs(pairs: string[]): { major: string[]; cross: string[]; exotic: string[]; crypto: string[]; other: string[] } {
  const crypto = pairs.filter(p =>
    p.startsWith('BTC') || p.startsWith('ETH') || p.startsWith('SOL') ||
    p.startsWith('LTC') || p.startsWith('XRP') || p.startsWith('ADA') ||
    p.startsWith('DOG') || p.startsWith('BNB') || p.startsWith('AVAX') ||
    p.includes('-USD')
  );
  const cryptoSet = new Set(crypto);
  const major = pairs.filter(p => MAJOR_PAIRS.has(p));
  const majorSet = new Set(major);
  // Cross: standard 6-char forex but not major
  const cross = pairs.filter(p => !cryptoSet.has(p) && !majorSet.has(p) && /^[A-Z]{6}_otc$/.test(p) &&
    ['EUR','GBP','AUD','NZD','CAD','CHF','JPY'].some(c => p.startsWith(c) || p.substring(3,6) === c.substring(0,3))
  );
  const crossSet = new Set(cross);
  // Exotic: everything else that's forex
  const exotic = pairs.filter(p => !cryptoSet.has(p) && !majorSet.has(p) && !crossSet.has(p) && p.endsWith('_otc'));
  const exoticSet = new Set(exotic);
  const other = pairs.filter(p => !cryptoSet.has(p) && !majorSet.has(p) && !crossSet.has(p) && !exoticSet.has(p));
  return { major, cross, exotic, crypto, other };
}

const PRESETS: Record<string, {
  name: string;
  desc: string;
  config: Partial<IndicatorValidationConfig>;
}> = {
  conservative: {
    name: 'Conservative Validator',
    desc: 'Validate only, high threshold, block when no setup',
    config: {
      validateSignals: true,
      minConfidence: 75,
      noSetupAction: 'block',
      autoTradeEnabled: false,
      enabledSetups: ['trend_confirm', 'rsi_reversal', 'macd_cross', 'candle_pattern', 'ma_trend', 'bb_squeeze'],
      showOverlay: true,
    },
  },
  balanced: {
    name: 'Balanced',
    desc: 'Validate + auto-trade, medium thresholds',
    config: {
      validateSignals: true,
      minConfidence: 60,
      noSetupAction: 'allow',
      autoTradeEnabled: true,
      autoTradeMinConfidence: 65,
      autoTradeExpirationMinutes: 5,
      enabledSetups: ['trend_confirm', 'rsi_reversal', 'macd_cross', 'candle_pattern', 'ma_trend', 'bb_squeeze'],
      showOverlay: true,
    },
  },
  aggressive: {
    name: 'Aggressive Auto-Trader',
    desc: 'Auto-trade focused, lower thresholds',
    config: {
      validateSignals: false,
      minConfidence: 40,
      noSetupAction: 'allow',
      autoTradeEnabled: true,
      autoTradeMinConfidence: 45,
      autoTradeExpirationMinutes: 5,
      enabledSetups: ['rsi_reversal', 'macd_cross', 'ma_trend'],
      showOverlay: true,
    },
  },
};

export function IndicatorSettings({ settings, onUpdate }: Props) {
  const rawConfig = settings.indicatorValidation ?? DEFAULT_CONFIG;
  // Auto-migrate: if enabled but no pairs selected, use popular pairs
  const config = rawConfig.enabled && (rawConfig.monitoredPairs?.length ?? 0) === 0
    ? { ...rawConfig, monitoredPairs: [...POPULAR_PAIRS] }
    : rawConfig;
  const [expanded, setExpanded] = useState(config.enabled);
  const [discoveredPairs, setDiscoveredPairs] = useState<string[]>([]);
  const [pairSource, setPairSource] = useState<'discovered' | 'fallback'>('fallback');
  const [activePairs, setActivePairs] = useState<string[]>([]);
  const [payoutMap, setPayoutMap] = useState<Record<string, number>>({});

  // Load auto-discovered pairs + active pairs/payouts from chrome.storage
  useEffect(() => {
    chrome.storage.local.get(['discoveredOtcPairs', 'activePairs', 'activePayouts']).then(result => {
      const pairs: string[] = result.discoveredOtcPairs || [];
      if (pairs.length > 0) {
        setDiscoveredPairs(pairs);
        setPairSource('discovered');
      }
      // Load dynamically expanded pairs from content script
      const active: string[] = result.activePairs || [];
      if (active.length > 0) {
        setActivePairs(active);
        setPairSource('discovered');
      }
      // Build payout lookup map from bridge data
      const payouts: Array<{ symbol: string; payout: number; category: string }> = result.activePayouts || [];
      if (payouts.length > 0) {
        const map: Record<string, number> = {};
        for (const p of payouts) {
          map[p.symbol] = p.payout;
        }
        setPayoutMap(map);
      }
    }).catch(() => {});

    // Listen for updates
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (changes.discoveredOtcPairs?.newValue) {
        const pairs: string[] = changes.discoveredOtcPairs.newValue;
        setDiscoveredPairs(pairs);
        setPairSource('discovered');
      }
      if (changes.activePairs?.newValue) {
        const pairs: string[] = changes.activePairs.newValue;
        setActivePairs(pairs);
        setPairSource('discovered');
      }
      if (changes.activePayouts?.newValue) {
        const payouts: Array<{ symbol: string; payout: number; category: string }> = changes.activePayouts.newValue;
        const map: Record<string, number> = {};
        for (const p of payouts) {
          map[p.symbol] = p.payout;
        }
        setPayoutMap(map);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Use active/discovered pairs if available, otherwise fallback
  const otcPairs = activePairs.length > 0
    ? [...new Set([...activePairs.filter(p => p.endsWith('_otc')), ...discoveredPairs])]
    : discoveredPairs.length > 0
      ? discoveredPairs
      : [...FALLBACK_FOREX_OTC, ...FALLBACK_CRYPTO_OTC];
  const livePairsFromActive = activePairs.filter(p => !p.endsWith('_otc'));
  const allPairs = [...new Set([...otcPairs, ...(livePairsFromActive.length > 0 ? livePairsFromActive : FALLBACK_FOREX_LIVE)])];

  const { major: majorPairs, cross: crossPairs, exotic: exoticPairs, crypto: cryptoPairs, other: otherPairs } = categorizePairs(otcPairs);
  const livePairs = livePairsFromActive.length > 0 ? livePairsFromActive : FALLBACK_FOREX_LIVE;

  const formatPairLabel = (pair: string): string => {
    const label = pair.endsWith('_otc') ? pair.replace('_otc', ' OTC') : pair;
    const payout = payoutMap[pair];
    return payout ? `${label} (${Math.round(payout * 100)}%)` : label;
  };

  const updateConfig = (partial: Partial<IndicatorValidationConfig>) => {
    onUpdate({ indicatorValidation: { ...config, ...partial } });
  };

  const toggleSetup = (type: SetupType) => {
    const current = config.enabledSetups ?? [];
    const next = current.includes(type)
      ? current.filter(s => s !== type)
      : [...current, type];
    updateConfig({ enabledSetups: next });
  };

  const applyPreset = (key: string) => {
    const preset = PRESETS[key];
    if (!preset) return;
    updateConfig(preset.config);
  };

  const togglePair = (pair: string) => {
    const current = config.monitoredPairs ?? [];
    const next = current.includes(pair)
      ? current.filter(p => p !== pair)
      : [...current, pair];
    updateConfig({ monitoredPairs: next });
  };

  const setPairsPreset = (preset: 'all' | 'popular' | 'none') => {
    if (preset === 'all') updateConfig({ monitoredPairs: [...allPairs] });
    else if (preset === 'popular') updateConfig({ monitoredPairs: [...POPULAR_PAIRS] });
    else updateConfig({ monitoredPairs: [] });
  };

  const setMarketFilter = (filter: 'otc' | 'forex' | 'both') => {
    const otcPairs = allPairs.filter(p => p.endsWith('_otc'));
    const forexLive = allPairs.filter(p => !p.endsWith('_otc'));
    if (filter === 'otc') updateConfig({ monitoredPairs: otcPairs });
    else if (filter === 'forex') updateConfig({ monitoredPairs: forexLive });
    else updateConfig({ monitoredPairs: [...allPairs] });
  };

  const monitoredCount = config.monitoredPairs?.length ?? 0;
  const enabledCount = config.enabledSetups?.length ?? 0;

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      {/* Header */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>Setup Detection</span>
          {enabledCount > 0 && config.enabled && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#2196F322', color: '#64B5F6' }}>
              {enabledCount} setup{enabledCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <input
            type="checkbox" checked={config.enabled}
            onChange={e => updateConfig({ enabled: e.target.checked })}
            style={{ accentColor: '#2196F3' }}
          />
        </label>
      </div>

      {!expanded || !config.enabled ? null : (
        <div style={{ marginTop: 10 }}>
          {/* Presets */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Quick Presets</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Object.entries(PRESETS).map(([key, p]) => (
                <button key={key} onClick={() => applyPreset(key)}
                  style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#aaa', cursor: 'pointer' }}
                  title={p.desc}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Setup type checkboxes */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Enabled Setups</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {SETUP_CATALOG.map(setup => (
                <label key={setup.type} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={config.enabledSetups?.includes(setup.type) ?? false}
                    onChange={() => toggleSetup(setup.type)}
                    style={{ accentColor: '#2196F3' }}
                  />
                  <span style={{ fontSize: 11, color: config.enabledSetups?.includes(setup.type) ? '#e0e0e0' : '#555' }}>{setup.label}</span>
                  <span style={{ fontSize: 9, color: '#555' }}>{setup.desc}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Monitored Pairs */}
          <div style={{ marginBottom: 10, padding: 8, background: '#0d0d1a', borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#e0e0e0', fontWeight: 600 }}>Monitored Pairs</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: pairSource === 'discovered' ? '#4CAF50' : '#888' }}>
                  {otcPairs.length} OTC + {livePairs.length} live
                </span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#4CAF5022', color: '#81C784' }}>
                  {monitoredCount}/{allPairs.length}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <button onClick={() => setPairsPreset('all')}
                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#aaa', cursor: 'pointer' }}>
                All ({allPairs.length})
              </button>
              <button onClick={() => setPairsPreset('popular')}
                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#aaa', cursor: 'pointer' }}>
                Popular (8)
              </button>
              <button onClick={() => setPairsPreset('none')}
                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#aaa', cursor: 'pointer' }}>
                None
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <button onClick={() => setMarketFilter('otc')}
                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: '#1a1a2e', border: '1px solid #FF9800', color: '#FF9800', cursor: 'pointer' }}>
                OTC Only
              </button>
              <button onClick={() => setMarketFilter('forex')}
                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: '#1a1a2e', border: '1px solid #00BCD4', color: '#00BCD4', cursor: 'pointer' }}>
                Forex Only
              </button>
              <button onClick={() => setMarketFilter('both')}
                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#aaa', cursor: 'pointer' }}>
                Both
              </button>
            </div>

            {/* Major Pairs */}
            <div style={{ fontSize: 10, color: '#4CAF50', marginBottom: 4, fontWeight: 600 }}>Major OTC ({majorPairs.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 6 }}>
              {majorPairs.map(pair => (
                <label key={pair} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', width: '48%' }}>
                  <input type="checkbox" checked={config.monitoredPairs?.includes(pair) ?? false}
                    onChange={() => togglePair(pair)} style={{ accentColor: '#4CAF50' }} />
                  <span style={{ fontSize: 10, color: config.monitoredPairs?.includes(pair) ? '#e0e0e0' : '#555' }}>{formatPairLabel(pair)}</span>
                </label>
              ))}
            </div>

            {/* Cross Pairs */}
            <div style={{ fontSize: 10, color: '#2196F3', marginBottom: 4, fontWeight: 600 }}>Cross OTC ({crossPairs.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 6, maxHeight: 150, overflowY: 'auto' }}>
              {crossPairs.map(pair => (
                <label key={pair} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', width: '48%' }}>
                  <input type="checkbox" checked={config.monitoredPairs?.includes(pair) ?? false}
                    onChange={() => togglePair(pair)} style={{ accentColor: '#2196F3' }} />
                  <span style={{ fontSize: 10, color: config.monitoredPairs?.includes(pair) ? '#e0e0e0' : '#555' }}>{formatPairLabel(pair)}</span>
                </label>
              ))}
            </div>

            {/* Exotic Pairs */}
            {exoticPairs.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: '#FF9800', marginBottom: 4, fontWeight: 600 }}>Exotic OTC ({exoticPairs.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 6, maxHeight: 150, overflowY: 'auto' }}>
                  {exoticPairs.map(pair => (
                    <label key={pair} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', width: '48%' }}>
                      <input type="checkbox" checked={config.monitoredPairs?.includes(pair) ?? false}
                        onChange={() => togglePair(pair)} style={{ accentColor: '#FF9800' }} />
                      <span style={{ fontSize: 10, color: config.monitoredPairs?.includes(pair) ? '#e0e0e0' : '#555' }}>{formatPairLabel(pair)}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {/* Crypto OTC */}
            {cryptoPairs.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: '#E040FB', marginBottom: 4, fontWeight: 600 }}>Crypto OTC ({cryptoPairs.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 6 }}>
                  {cryptoPairs.map(pair => (
                    <label key={pair} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', width: '48%' }}>
                      <input type="checkbox" checked={config.monitoredPairs?.includes(pair) ?? false}
                        onChange={() => togglePair(pair)} style={{ accentColor: '#E040FB' }} />
                      <span style={{ fontSize: 10, color: config.monitoredPairs?.includes(pair) ? '#e0e0e0' : '#555' }}>{formatPairLabel(pair)}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {/* Live Forex (market hours) */}
            <div style={{ fontSize: 10, color: '#00BCD4', marginBottom: 4, fontWeight: 600, marginTop: 4 }}>
              Live Forex ({livePairs.length})
              <span style={{ fontWeight: 400, color: '#555', marginLeft: 4 }}>market hours only</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 6, maxHeight: 150, overflowY: 'auto' }}>
              {livePairs.map(pair => (
                <label key={pair} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', width: '48%' }}>
                  <input type="checkbox" checked={config.monitoredPairs?.includes(pair) ?? false}
                    onChange={() => togglePair(pair)} style={{ accentColor: '#00BCD4' }} />
                  <span style={{ fontSize: 10, color: config.monitoredPairs?.includes(pair) ? '#e0e0e0' : '#555' }}>{formatPairLabel(pair)}</span>
                </label>
              ))}
            </div>

            {/* Other (stocks, commodities, etc.) */}
            {otherPairs.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>Other ({otherPairs.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, maxHeight: 150, overflowY: 'auto' }}>
                  {otherPairs.map(pair => (
                    <label key={pair} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', width: '48%' }}>
                      <input
                        type="checkbox"
                        checked={config.monitoredPairs?.includes(pair) ?? false}
                        onChange={() => togglePair(pair)}
                        style={{ accentColor: '#9C27B0' }}
                      />
                      <span style={{ fontSize: 10, color: config.monitoredPairs?.includes(pair) ? '#e0e0e0' : '#555' }}>{formatPairLabel(pair)}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Validate External Signals */}
          <div style={{ marginBottom: 10, padding: 8, background: '#0d0d1a', borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <input type="checkbox" checked={config.validateSignals} onChange={e => updateConfig({ validateSignals: e.target.checked })} style={{ accentColor: '#2196F3' }} />
              <span style={{ fontSize: 11, color: '#e0e0e0', fontWeight: 600 }}>Validate External Signals</span>
            </div>
            {config.validateSignals && (
              <div style={{ paddingLeft: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: '#888', width: 90 }}>Min Confidence</span>
                  <input type="range" min={20} max={90} step={5} value={config.minConfidence}
                    onChange={e => updateConfig({ minConfidence: parseInt(e.target.value) })}
                    style={{ flex: 1, accentColor: '#2196F3' }} />
                  <span style={{ fontSize: 11, color: '#64B5F6', width: 30, textAlign: 'right' }}>{config.minConfidence}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#888', width: 90 }}>No Setup Action</span>
                  <select value={config.noSetupAction} onChange={e => updateConfig({ noSetupAction: e.target.value as 'allow' | 'block' })}
                    style={{ flex: 1, fontSize: 11, padding: '3px 6px', borderRadius: 4, background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#ccc' }}>
                    <option value="allow">Allow (fail-open)</option>
                    <option value="block">Block (fail-closed)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Auto-Trade from Indicators */}
          <div style={{ marginBottom: 10, padding: 8, background: '#0d0d1a', borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <input type="checkbox" checked={config.autoTradeEnabled} onChange={e => updateConfig({ autoTradeEnabled: e.target.checked })} style={{ accentColor: '#FF9800' }} />
              <span style={{ fontSize: 11, color: '#e0e0e0', fontWeight: 600 }}>Auto-Trade from Indicators</span>
            </div>
            {config.autoTradeEnabled && (
              <div style={{ paddingLeft: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: '#888', width: 90 }}>Min Confidence</span>
                  <input type="range" min={30} max={90} step={5} value={config.autoTradeMinConfidence}
                    onChange={e => updateConfig({ autoTradeMinConfidence: parseInt(e.target.value) })}
                    style={{ flex: 1, accentColor: '#FF9800' }} />
                  <span style={{ fontSize: 11, color: '#FFB74D', width: 30, textAlign: 'right' }}>{config.autoTradeMinConfidence}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#888', width: 90 }}>Expiration</span>
                  <select value={config.autoTradeExpirationMinutes} onChange={e => updateConfig({ autoTradeExpirationMinutes: parseInt(e.target.value) })}
                    style={{ flex: 1, fontSize: 11, padding: '3px 6px', borderRadius: 4, background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#ccc' }}>
                    <option value={1}>1 min</option>
                    <option value={3}>3 min</option>
                    <option value={5}>5 min</option>
                    <option value={10}>10 min</option>
                    <option value={15}>15 min</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Overlay toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <input type="checkbox" checked={config.showOverlay} onChange={e => updateConfig({ showOverlay: e.target.checked })} style={{ accentColor: '#2196F3' }} />
            <span style={{ fontSize: 11, color: '#aaa' }}>Show indicator panel on chart</span>
          </div>

          {/* AI Analyst (LLM) */}
          <div style={{ marginTop: 10, padding: 8, background: '#0a0a2a', borderRadius: 6, border: '1px solid rgba(100,181,246,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <input type="checkbox" checked={config.llmAnalyst?.enabled ?? false}
                onChange={e => updateConfig({ llmAnalyst: { ...(config.llmAnalyst ?? { enabled: false, minConfidence: 70, autoExecute: false }), enabled: e.target.checked } })}
                style={{ accentColor: '#64B5F6' }} />
              <span style={{ fontSize: 11, color: '#64B5F6', fontWeight: 600 }}>AI Analyst (Claude Sonnet)</span>
            </div>
            {config.llmAnalyst?.enabled && (
              <div style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 9, color: '#555', padding: '3px 0' }}>
                  Analyzes on every M1 close with M5 macro trend context
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#888', width: 90 }}>Min Confidence</span>
                  <input type="range" min={40} max={95} step={5} value={config.llmAnalyst?.minConfidence ?? 70}
                    onChange={e => updateConfig({ llmAnalyst: { ...config.llmAnalyst!, minConfidence: parseInt(e.target.value) } })}
                    style={{ flex: 1, accentColor: '#64B5F6' }} />
                  <span style={{ fontSize: 11, color: '#64B5F6', width: 30, textAlign: 'right' }}>{config.llmAnalyst?.minConfidence ?? 70}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={config.llmAnalyst?.autoExecute ?? false}
                    onChange={e => updateConfig({ llmAnalyst: { ...config.llmAnalyst!, autoExecute: e.target.checked } })}
                    style={{ accentColor: '#64B5F6' }} />
                  <span style={{ fontSize: 10, color: '#aaa' }}>Auto-execute AI decisions</span>
                </div>
                <p style={{ fontSize: 8, color: '#444', lineHeight: 1.3, margin: 0 }}>
                  Uses Claude Sonnet via your subscription (no API key needed). Analyzes chart screenshot + indicators on each candle close.
                </p>
              </div>
            )}
          </div>

          <p style={{ fontSize: 9, color: '#555', marginTop: 8, lineHeight: 1.3 }}>
            Setups detect on candle close. AI Analyst uses Claude Vision via backend.
            {pairSource === 'discovered' && activePairs.length > 0 && (
              <span style={{ color: '#4CAF50' }}> {activePairs.length} active pairs from PocketOption ({Object.keys(payoutMap).length} with payouts).</span>
            )}
            {pairSource === 'discovered' && activePairs.length === 0 && discoveredPairs.length > 0 && (
              <span style={{ color: '#4CAF50' }}> Auto-discovered {discoveredPairs.length} OTC pairs from PocketOption.</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
