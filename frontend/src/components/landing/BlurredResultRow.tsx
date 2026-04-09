import { Lock } from 'lucide-react';
import { getAssetFlag } from '@/lib/assetFlags';

const phantomAssets = [
  'EUR/CHF OTC', 'GBP/NZD OTC', 'AUD/CAD OTC', 'USD/SGD OTC', 'CAD/JPY OTC',
  'EUR/PLN OTC', 'GBP/SEK OTC', 'NZD/CAD OTC', 'CHF/SGD OTC', 'AUD/CHF OTC',
  'USD/MXN OTC', 'EUR/HUF OTC', 'GBP/ZAR OTC', 'NZD/CHF OTC', 'AUD/SGD OTC',
];

interface Props {
  index: number;
}

export function BlurredResultRow({ index }: Props) {
  const asset = phantomAssets[index % phantomAssets.length];

  return (
    <div
      className="relative flex items-center gap-3 p-3 rounded-xl bg-[var(--st-bg-elevated)] border-l-[3px] border-l-[var(--st-border)] overflow-hidden animate-fade-up"
      style={{ animationDelay: `${(index + 3) * 0.06}s` }}
    >
      {/* Blurred content */}
      <div className="flex items-center gap-3 flex-1 blur-[6px] select-none pointer-events-none opacity-50" aria-hidden>
        <span className="text-base">{getAssetFlag(asset)}</span>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-white">{asset}</span>
          <span className="block text-[10px] text-[var(--st-text-secondary)] font-mono">--:-- UTC · M5</span>
        </div>
        <span className="px-2 py-1 rounded-lg bg-[var(--st-border)]/50 text-[var(--st-text-secondary)] text-xs font-bold">????</span>
        <span className="px-2.5 py-1 rounded-lg bg-[var(--st-border)]/50 text-[var(--st-text-secondary)] text-xs font-bold">???</span>
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-7 h-7 rounded-full bg-st-premium/10 border border-st-premium/20 flex items-center justify-center">
          <Lock size={12} className="text-st-premium" />
        </div>
      </div>
    </div>
  );
}