import { useState, useEffect } from 'react';
import { PlatformConfig } from '@/types';
import { adminService } from '@/services/adminService';
import { ASSETS } from '@/data/mockSignals';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

export function PlatformConfigForm() {
  const [config, setConfig] = useState<PlatformConfig | null>(null);

  useEffect(() => {
    adminService.getPlatformConfig().then(setConfig);
  }, []);

  if (!config) return null;

  const handleSave = async () => {
    await adminService.updatePlatformConfig(config);
    toast.success('Platform config saved!');
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
          <label className="block text-sm font-medium text-white mb-2">Max Free Signals/Day</label>
          <input
            type="number"
            value={config.maxFreeSignals}
            onChange={e => setConfig({ ...config, maxFreeSignals: Number(e.target.value) })}
            className="w-full px-3 py-2 rounded-lg bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm focus:outline-none focus:border-st-accent"
          />
        </div>

        <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
          <label className="block text-sm font-medium text-white mb-2">Signal Cooldown (seconds)</label>
          <input
            type="number"
            value={config.signalCooldownSeconds}
            onChange={e => setConfig({ ...config, signalCooldownSeconds: Number(e.target.value) })}
            className="w-full px-3 py-2 rounded-lg bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm focus:outline-none focus:border-st-accent"
          />
        </div>

        <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
          <label className="block text-sm font-medium text-white mb-2">Min Confidence (%)</label>
          <input
            type="number"
            value={config.minConfidence}
            onChange={e => setConfig({ ...config, minConfidence: Number(e.target.value) })}
            min={0}
            max={100}
            className="w-full px-3 py-2 rounded-lg bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm focus:outline-none focus:border-st-accent"
          />
        </div>

        <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Maintenance Mode</p>
              <p className="text-xs text-[var(--st-text-secondary)]">Disable signal generation</p>
            </div>
            <Switch checked={config.maintenanceMode} onCheckedChange={v => setConfig({ ...config, maintenanceMode: v })} />
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
        <label className="block text-sm font-medium text-white mb-2">Announcement Message</label>
        <textarea
          value={config.announcementMessage}
          onChange={e => setConfig({ ...config, announcementMessage: e.target.value })}
          placeholder="Leave empty for no announcement"
          rows={2}
          className="w-full px-3 py-2 rounded-lg bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm placeholder:text-[var(--st-text-secondary)]/50 focus:outline-none focus:border-st-accent resize-none"
        />
      </div>

      <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
        <label className="block text-sm font-medium text-white mb-2">Enabled Assets</label>
        <div className="flex flex-wrap gap-2">
          {ASSETS.map(asset => {
            const isEnabled = config.enabledAssets.includes(asset);
            return (
              <button
                key={asset}
                onClick={() => {
                  const assets = isEnabled ? config.enabledAssets.filter(a => a !== asset) : [...config.enabledAssets, asset];
                  setConfig({ ...config, enabledAssets: assets });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isEnabled ? 'bg-st-accent/15 text-st-accent border border-st-accent/30' : 'bg-[var(--st-bg-elevated)] text-[var(--st-text-secondary)] border border-[var(--st-border)]'
                }`}
              >
                {asset}
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={handleSave} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-st-accent text-white font-semibold text-sm hover:bg-st-accent/90 transition-colors">
        <Save size={14} />
        Save Configuration
      </button>
    </div>
  );
}
