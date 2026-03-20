import { Lock, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function LockedChartOverlay({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  return (
    <div className="relative">
      <div className="blur-md select-none pointer-events-none" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--st-bg-card)]/40 backdrop-blur-sm rounded-xl">
        <div className="w-12 h-12 rounded-full bg-st-premium/10 flex items-center justify-center mb-3">
          <Lock size={22} className="text-st-premium" />
        </div>
        <p className="text-sm font-semibold text-white mb-1">Premium Feature</p>
        <p className="text-xs text-[var(--st-text-secondary)] mb-4">Upgrade to access full analytics</p>
        <button
          onClick={() => navigate('/pricing')}
          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-st-accent to-st-info text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Sparkles size={14} />
          Upgrade Now
        </button>
      </div>
    </div>
  );
}
