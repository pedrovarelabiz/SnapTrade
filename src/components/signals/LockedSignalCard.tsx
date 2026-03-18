import { Lock, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const randomAssets = ['EUR/USD', 'GBP/JPY', 'USD/CHF', 'AUD/USD', 'EUR/GBP'];

export function LockedSignalCard({ index = 0 }: { index?: number }) {
  const navigate = useNavigate();
  const asset = randomAssets[index % randomAssets.length];

  return (
    <div className="relative rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] overflow-hidden">
      {/* Blurred content */}
      <div className="p-4 blur-sm select-none pointer-events-none" aria-hidden>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🌐</span>
            <span className="text-white font-semibold text-sm">{asset}</span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-[var(--st-border)] text-[var(--st-text-secondary)] text-xs">Pending</span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="px-3 py-1.5 rounded-lg bg-[var(--st-border)]/50">
            <span className="text-[var(--st-text-secondary)] font-bold text-sm">????</span>
          </div>
          <span className="px-2 py-1 rounded-md bg-[var(--st-bg-elevated)] text-[var(--st-text-secondary)] text-xs">M5</span>
        </div>
        <div className="text-xs text-[var(--st-text-secondary)]">--:--</div>
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--st-bg-card)]/60 backdrop-blur-sm">
        <div className="w-10 h-10 rounded-full bg-st-premium/10 flex items-center justify-center mb-2">
          <Lock size={18} className="text-st-premium" />
        </div>
        <p className="text-xs text-[var(--st-text-secondary)] mb-2">Premium Signal</p>
        <button
          onClick={() => navigate('/pricing')}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-st-accent to-st-info text-white text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          <Sparkles size={12} />
          Upgrade
        </button>
      </div>
    </div>
  );
}
