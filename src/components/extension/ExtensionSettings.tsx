import { useState, useEffect } from 'react';
import { ExtensionConfig } from '@/types';
import { extensionService } from '@/services/extensionService';
import { ASSETS } from '@/data/mockSignals';
import { Chrome, RefreshCw, Copy, Wifi, WifiOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export function ExtensionSettings() {
  const [config, setConfig] = useState<ExtensionConfig | null>(null);

  useEffect(() => {
    extensionService.getExtensionConfig().then(setConfig);
  }, []);

  if (!config) return null;

  const handleToggle = (key: keyof ExtensionConfig, value: boolean) => {
    const updated = { ...config, [key]: value };
    setConfig(updated);
    extensionService.updateExtensionConfig({ [key]: value });
  };

  const handleAmountChange = (amount: number) => {
    setConfig({ ...config, defaultAmount: amount });
    extensionService.updateExtensionConfig({ defaultAmount: amount });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-st-info/10 flex items-center justify-center">
          <Chrome size={18} className="text-st-info" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Chrome Extension</h3>
          <div className="flex items-center gap-1.5">
            {config.isConnected ? (
              <><Wifi size={12} className="text-st-call" /><span className="text-xs text-st-call">Connected</span></>
            ) : (
              <><WifiOff size={12} className="text-[var(--st-text-secondary)]" /><span className="text-xs text-[var(--st-text-secondary)]">Not connected</span></>
            )}
          </div>
        </div>
      </div>

      {/* Token */}
      <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
        <label className="block text-sm font-medium text-[var(--st-text-primary)] mb-2">API Token</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={config.token}
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

      {/* Settings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
          <div>
            <p className="text-sm font-medium text-white">Auto Trade</p>
            <p className="text-xs text-[var(--st-text-secondary)]">Automatically execute trades when signals arrive</p>
          </div>
          <Switch checked={config.autoTrade} onCheckedChange={v => handleToggle('autoTrade', v)} />
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
          <div>
            <p className="text-sm font-medium text-white">Sound Alerts</p>
            <p className="text-xs text-[var(--st-text-secondary)]">Play sound when new signals arrive</p>
          </div>
          <Switch checked={config.soundAlerts} onCheckedChange={v => handleToggle('soundAlerts', v)} />
        </div>

        <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
          <label className="block text-sm font-medium text-white mb-2">Default Trade Amount ($)</label>
          <input
            type="number"
            value={config.defaultAmount}
            onChange={e => handleAmountChange(Number(e.target.value))}
            min={1}
            className="w-full px-3 py-2 rounded-lg bg-[var(--st-bg-card)] border border-[var(--st-border)] text-white text-sm focus:outline-none focus:border-st-accent"
          />
        </div>

        <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
          <label className="block text-sm font-medium text-white mb-2">Max Martingale Level</label>
          <select
            value={config.maxMartingale}
            onChange={e => { setConfig({ ...config, maxMartingale: Number(e.target.value) }); }}
            className="w-full px-3 py-2 rounded-lg bg-[var(--st-bg-card)] border border-[var(--st-border)] text-white text-sm focus:outline-none focus:border-st-accent"
          >
            {[0, 1, 2, 3, 4, 5].map(n => (
              <option key={n} value={n}>{n === 0 ? 'Disabled' : `Level ${n}`}</option>
            ))}
          </select>
        </div>

        <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
          <label className="block text-sm font-medium text-white mb-2">Enabled Pairs</label>
          <div className="flex flex-wrap gap-2">
            {ASSETS.slice(0, 12).map(asset => {
              const isEnabled = config.enabledPairs.includes(asset);
              return (
                <button
                  key={asset}
                  onClick={() => {
                    const pairs = isEnabled ? config.enabledPairs.filter(p => p !== asset) : [...config.enabledPairs, asset];
                    setConfig({ ...config, enabledPairs: pairs });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isEnabled ? 'bg-st-accent/15 text-st-accent border border-st-accent/30' : 'bg-[var(--st-bg-card)] text-[var(--st-text-secondary)] border border-[var(--st-border)]'
                  }`}
                >
                  {asset}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
