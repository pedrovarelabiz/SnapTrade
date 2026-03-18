import { useState, useEffect } from 'react';
import { ExtensionConfig } from '@/types';
import { extensionService } from '@/services/extensionService';
import { ASSETS, OTC_ASSETS, CRYPTO_ASSETS } from '@/data/mockSignals';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Chrome, RefreshCw, Copy, Wifi, WifiOff, Hand, MousePointer, Zap,
  ShieldOff, TrendingUp, BarChart3, Bell, Volume2, Monitor, Globe,
  AlertTriangle, Clock, Layers,
} from 'lucide-react';

export function ExtensionSettings() {
  const [config, setConfig] = useState<ExtensionConfig | null>(null);

  useEffect(() => {
    extensionService.getExtensionConfig().then(setConfig);
  }, []);

  if (!config) return null;

  const update = (updates: Partial<ExtensionConfig>) => {
    const updated = { ...config, ...updates };
    setConfig(updated);
    extensionService.updateExtensionConfig(updates);
  };

  const handleRegenerateToken = async () => {
    const token = await extensionService.generateToken();
    setConfig({ ...config, token });
    toast.success('Token regenerated');
  };

  const copyToken = () => {
    navigator.clipboard.writeText(config.token);
    toast.success('Token copied to clipboard');
  };

  const togglePair = (pair: string) => {
    const pairs = config.enabledPairs.includes(pair)
      ? config.enabledPairs.filter(p => p !== pair)
      : [...config.enabledPairs, pair];
    update({ enabledPairs: pairs });
  };

  const allPairs = [...ASSETS, ...OTC_ASSETS, ...CRYPTO_ASSETS];

  const selectAllPairs = () => update({ enabledPairs: [...allPairs] });
  const deselectAllPairs = () => update({ enabledPairs: [] });

  const executionModes = [
    { value: 'manual' as const, label: 'Manual', desc: 'Signals appear as notifications. You click to execute each trade.', icon: Hand, border: 'border-[var(--st-border)]' },
    { value: 'semi-auto' as const, label: 'Semi-Auto', desc: 'Trades are pre-filled on Pocket Option. You confirm with one click.', icon: MousePointer, border: 'border-[var(--st-border)]' },
    { value: 'auto' as const, label: 'Auto', desc: 'Trades execute automatically. Use with caution.', icon: Zap, border: 'border-amber-500/30' },
  ];

  const martingaleStrategies = [
    { value: 'off' as const, label: 'Off', desc: 'Only execute the initial trade. Ignore all martingale levels.', icon: ShieldOff },
    { value: 'simple' as const, label: 'Simple (Fixed)', desc: 'If initial trade loses, re-enter with a fixed multiplier.', icon: TrendingUp },
    { value: 'dynamic' as const, label: 'Dynamic (Signal)', desc: "Follow the martingale schedule from each signal (recommended).", icon: BarChart3 },
  ];

  return (
    <div className="space-y-8">
      {/* Section 1 — Connection */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-st-info/10 flex items-center justify-center">
            <Chrome size={18} className="text-st-info" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Chrome Extension</h3>
            <div className="flex items-center gap-1.5">
              {config.connected ? (
                <><Wifi size={12} className="text-st-call" /><span className="text-xs text-st-call">Connected</span></>
              ) : (
                <><WifiOff size={12} className="text-[var(--st-text-secondary)]" /><span className="text-xs text-[var(--st-text-secondary)]">Not connected</span></>
              )}
              <span className="text-[10px] text-[var(--st-text-secondary)] ml-2">v1.2.4</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
          <label className="block text-sm font-medium text-[var(--st-text-primary)] mb-2">API Token</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={`${config.token.slice(0, 12)}${'•'.repeat(16)}`}
              readOnly
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--st-bg-card)] border border-[var(--st-border)] text-white text-xs font-mono"
            />
            <button onClick={copyToken} className="p-2 rounded-lg bg-[var(--st-border)]/50 text-[var(--st-text-secondary)] hover:text-white transition-colors">
              <Copy size={14} />
            </button>
            <button onClick={handleRegenerateToken} className="p-2 rounded-lg bg-[var(--st-border)]/50 text-[var(--st-text-secondary)] hover:text-white transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Section 2 — Execution Mode */}
      <div>
        <h4 className="text-sm font-semibold text-white mb-3">Trade Execution Mode</h4>
        <div className="grid gap-3">
          {executionModes.map(mode => {
            const isSelected = config.executionMode === mode.value;
            const isAuto = mode.value === 'auto';
            return (
              <button
                key={mode.value}
                onClick={() => update({ executionMode: mode.value })}
                className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                  isSelected
                    ? isAuto ? 'bg-amber-500/5 border-amber-500/40' : 'bg-st-accent/5 border-st-accent/40'
                    : `bg-[var(--st-bg-elevated)] ${mode.border} hover:border-[var(--st-text-secondary)]/30`
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isSelected
                    ? isAuto ? 'bg-amber-500/15' : 'bg-st-accent/15'
                    : 'bg-[var(--st-border)]/50'
                }`}>
                  <mode.icon size={16} className={
                    isSelected
                      ? isAuto ? 'text-amber-400' : 'text-st-accent'
                      : 'text-[var(--st-text-secondary)]'
                  } />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-[var(--st-text-primary)]'}`}>{mode.label}</span>
                    {isAuto && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[9px] font-bold border border-amber-500/20">
                        <AlertTriangle size={8} />
                        CAUTION
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--st-text-secondary)] mt-0.5">{mode.desc}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  isSelected
                    ? isAuto ? 'border-amber-400' : 'border-st-accent'
                    : 'border-[var(--st-border)]'
                }`}>
                  {isSelected && <div className={`w-2 h-2 rounded-full ${isAuto ? 'bg-amber-400' : 'bg-st-accent'}`} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3 — Signal Preferences */}
      <div>
        <h4 className="text-sm font-semibold text-white mb-3">Signal Preferences</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-st-info" />
              <span className="text-sm text-white">Scheduled signals</span>
            </div>
            <Switch checked={config.acceptScheduled} onCheckedChange={v => update({ acceptScheduled: v })} />
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-amber-400" />
              <span className="text-sm text-white">Instant signals</span>
            </div>
            <Switch checked={config.acceptInstant} onCheckedChange={v => update({ acceptInstant: v })} />
          </div>

          <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <label className="block text-sm font-medium text-white mb-2">Default Trade Amount ($)</label>
            <div className="flex gap-2 mb-2">
              {[1, 2, 5, 10, 25].map(amt => (
                <button
                  key={amt}
                  onClick={() => update({ defaultAmount: amt })}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    config.defaultAmount === amt
                      ? 'bg-st-accent/15 text-st-accent border border-st-accent/30'
                      : 'bg-[var(--st-bg-card)] text-[var(--st-text-secondary)] border border-[var(--st-border)] hover:text-white'
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={config.defaultAmount}
              onChange={e => update({ defaultAmount: Number(e.target.value) })}
              min={1}
              className="w-full px-3 py-2 rounded-lg bg-[var(--st-bg-card)] border border-[var(--st-border)] text-white text-sm focus:outline-none focus:border-st-accent"
            />
          </div>

          {config.acceptInstant && (
            <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
              <label className="block text-sm font-medium text-white mb-1">Delay Before Execution (Instant)</label>
              <p className="text-[10px] text-[var(--st-text-secondary)] mb-2">Wait time before executing instant signals, giving you time to review</p>
              <div className="flex gap-2">
                {[0, 5, 10, 15].map(s => (
                  <button
                    key={s}
                    onClick={() => update({ instantDelay: s })}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      config.instantDelay === s
                        ? 'bg-st-accent/15 text-st-accent border border-st-accent/30'
                        : 'bg-[var(--st-bg-card)] text-[var(--st-text-secondary)] border border-[var(--st-border)] hover:text-white'
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 4 — Martingale */}
      <div>
        <h4 className="text-sm font-semibold text-white mb-3">Martingale Configuration</h4>
        <div className="grid gap-3 mb-3">
          {martingaleStrategies.map(strat => {
            const isSelected = config.martingaleStrategy === strat.value;
            return (
              <button
                key={strat.value}
                onClick={() => update({ martingaleStrategy: strat.value })}
                className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                  isSelected ? 'bg-st-accent/5 border-st-accent/40' : 'bg-[var(--st-bg-elevated)] border-[var(--st-border)] hover:border-[var(--st-text-secondary)]/30'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-st-accent/15' : 'bg-[var(--st-border)]/50'}`}>
                  <strat.icon size={16} className={isSelected ? 'text-st-accent' : 'text-[var(--st-text-secondary)]'} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-[var(--st-text-primary)]'}`}>{strat.label}</span>
                  <p className="text-xs text-[var(--st-text-secondary)] mt-0.5">{strat.desc}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${isSelected ? 'border-st-accent' : 'border-[var(--st-border)]'}`}>
                  {isSelected && <div className="w-2 h-2 rounded-full bg-st-accent" />}
                </div>
              </button>
            );
          })}
        </div>

        {config.martingaleStrategy !== 'off' && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
              <label className="block text-sm font-medium text-white mb-1">Max Martingale Levels</label>
              <p className="text-[10px] text-[var(--st-text-secondary)] mb-2">Signals include up to 2 martingale levels</p>
              <div className="flex gap-2">
                {([1, 2] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => update({ maxMartingaleLevels: n })}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      config.maxMartingaleLevels === n
                        ? 'bg-st-accent/15 text-st-accent border border-st-accent/30'
                        : 'bg-[var(--st-bg-card)] text-[var(--st-text-secondary)] border border-[var(--st-border)] hover:text-white'
                    }`}
                  >
                    Level {n}
                  </button>
                ))}
              </div>
            </div>

            {config.martingaleStrategy === 'simple' && (
              <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
                <label className="block text-sm font-medium text-white mb-1">Fixed Multiplier</label>
                <p className="text-[10px] text-[var(--st-text-secondary)] mb-2">Each martingale trade = previous amount × this multiplier</p>
                <div className="flex gap-2">
                  {([1.5, 2.0, 2.5, 3.0] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => update({ fixedMultiplier: m })}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        config.fixedMultiplier === m
                          ? 'bg-st-accent/15 text-st-accent border border-st-accent/30'
                          : 'bg-[var(--st-bg-card)] text-[var(--st-text-secondary)] border border-[var(--st-border)] hover:text-white'
                      }`}
                    >
                      ×{m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
              <div>
                <p className="text-sm font-medium text-white">Auto-execute Martingales</p>
                <p className="text-[10px] text-[var(--st-text-secondary)]">When off, you'll be asked to confirm each martingale trade</p>
              </div>
              <Switch checked={config.autoExecuteMartingale} onCheckedChange={v => update({ autoExecuteMartingale: v })} />
            </div>
          </div>
        )}
      </div>

      {/* Section 5 — Risk Management */}
      <div>
        <h4 className="text-sm font-semibold text-white mb-3">Risk Management</h4>
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <label className="block text-sm font-medium text-white mb-1">Max Daily Trades</label>
            <p className="text-[10px] text-[var(--st-text-secondary)] mb-2">Stop trading after this many trades per day (0 = unlimited)</p>
            <input
              type="number"
              value={config.maxDailyTrades}
              onChange={e => update({ maxDailyTrades: Number(e.target.value) })}
              min={0}
              className="w-full px-3 py-2 rounded-lg bg-[var(--st-bg-card)] border border-[var(--st-border)] text-white text-sm focus:outline-none focus:border-st-accent"
            />
          </div>

          <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <label className="block text-sm font-medium text-white mb-1">Max Consecutive Losses Before Pause</label>
            <p className="text-[10px] text-[var(--st-text-secondary)] mb-2">Pause trading automatically after consecutive losses</p>
            <div className="flex gap-2">
              {[0, 2, 3, 5].map(n => (
                <button
                  key={n}
                  onClick={() => update({ maxConsecutiveLosses: n })}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    config.maxConsecutiveLosses === n
                      ? 'bg-st-accent/15 text-st-accent border border-st-accent/30'
                      : 'bg-[var(--st-bg-card)] text-[var(--st-text-secondary)] border border-[var(--st-border)] hover:text-white'
                  }`}
                >
                  {n === 0 ? 'Off' : n}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <label className="block text-sm font-medium text-white mb-1">Minimum Balance Protection ($)</label>
            <p className="text-[10px] text-[var(--st-text-secondary)] mb-2">Stop all trading if account balance drops below this amount</p>
            <input
              type="number"
              value={config.minBalanceProtection}
              onChange={e => update({ minBalanceProtection: Number(e.target.value) })}
              min={0}
              className="w-full px-3 py-2 rounded-lg bg-[var(--st-bg-card)] border border-[var(--st-border)] text-white text-sm focus:outline-none focus:border-st-accent"
            />
          </div>

          <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <label className="block text-sm font-medium text-white mb-1">Max Single Trade Amount ($)</label>
            <p className="text-[10px] text-[var(--st-text-secondary)] mb-2">Require confirmation for trades above this amount even in auto mode</p>
            <input
              type="number"
              value={config.maxSingleTradeAmount}
              onChange={e => update({ maxSingleTradeAmount: Number(e.target.value) })}
              min={1}
              className="w-full px-3 py-2 rounded-lg bg-[var(--st-bg-card)] border border-[var(--st-border)] text-white text-sm focus:outline-none focus:border-st-accent"
            />
          </div>
        </div>
      </div>

      {/* Section 6 — Notifications */}
      <div>
        <h4 className="text-sm font-semibold text-white mb-3">Notifications & Sound</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <div className="flex items-center gap-2">
              <Volume2 size={14} className="text-st-info" />
              <span className="text-sm text-white">Sound Alerts</span>
            </div>
            <Switch checked={config.soundAlerts} onCheckedChange={v => update({ soundAlerts: v })} />
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-st-premium" />
              <span className="text-sm text-white">Browser Notifications</span>
            </div>
            <Switch checked={config.browserNotifications} onCheckedChange={v => update({ browserNotifications: v })} />
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <div className="flex items-center gap-2">
              <Monitor size={14} className="text-st-accent" />
              <span className="text-sm text-white">Show Overlay on Pocket Option</span>
            </div>
            <Switch checked={config.showOverlay} onCheckedChange={v => update({ showOverlay: v })} />
          </div>
        </div>
      </div>

      {/* Section 7 — Asset Whitelist */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-white">Asset Whitelist</h4>
            <p className="text-[10px] text-[var(--st-text-secondary)]">Only trade signals for selected pairs. Empty = trade all pairs</p>
          </div>
          <div className="flex gap-2">
            <button onClick={selectAllPairs} className="px-3 py-1 rounded-lg bg-[var(--st-bg-card)] border border-[var(--st-border)] text-[10px] text-[var(--st-text-secondary)] hover:text-white transition-colors">
              Select All
            </button>
            <button onClick={deselectAllPairs} className="px-3 py-1 rounded-lg bg-[var(--st-bg-card)] border border-[var(--st-border)] text-[10px] text-[var(--st-text-secondary)] hover:text-white transition-colors">
              Deselect All
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Forex */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--st-text-secondary)] font-semibold mb-2 flex items-center gap-1.5">
              <Globe size={10} /> Forex
            </p>
            <div className="flex flex-wrap gap-2">
              {ASSETS.slice(0, 8).map(pair => {
                const isEnabled = config.enabledPairs.includes(pair);
                return (
                  <button
                    key={pair}
                    onClick={() => togglePair(pair)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isEnabled
                        ? 'bg-st-accent/15 text-st-accent border border-st-accent/30'
                        : 'bg-[var(--st-bg-card)] text-[var(--st-text-secondary)] border border-[var(--st-border)] hover:text-white'
                    }`}
                  >
                    {pair}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Forex OTC */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--st-text-secondary)] font-semibold mb-2 flex items-center gap-1.5">
              <Globe size={10} /> Forex OTC
            </p>
            <div className="flex flex-wrap gap-2">
              {OTC_ASSETS.map(pair => {
                const isEnabled = config.enabledPairs.includes(pair);
                return (
                  <button
                    key={pair}
                    onClick={() => togglePair(pair)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isEnabled
                        ? 'bg-st-info/15 text-st-info border border-st-info/30'
                        : 'bg-[var(--st-bg-card)] text-[var(--st-text-secondary)] border border-[var(--st-border)] hover:text-white'
                    }`}
                  >
                    {pair}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Crypto */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--st-text-secondary)] font-semibold mb-2 flex items-center gap-1.5">
              <Layers size={10} /> Crypto
            </p>
            <div className="flex flex-wrap gap-2">
              {CRYPTO_ASSETS.map(pair => {
                const isEnabled = config.enabledPairs.includes(pair);
                return (
                  <button
                    key={pair}
                    onClick={() => togglePair(pair)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isEnabled
                        ? 'bg-st-premium/15 text-st-premium border border-st-premium/30'
                        : 'bg-[var(--st-bg-card)] text-[var(--st-text-secondary)] border border-[var(--st-border)] hover:text-white'
                    }`}
                  >
                    {pair}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}