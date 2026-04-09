import { Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function UpgradeCTA({ variant = 'banner' }: { variant?: 'banner' | 'inline' | 'button' }) {
  const navigate = useNavigate();

  if (variant === 'button') {
    return (
      <button
        onClick={() => navigate('/pricing')}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-st-accent to-st-info text-white font-semibold text-sm hover:opacity-90 transition-opacity"
      >
        <Sparkles size={14} />
        Upgrade to Premium
      </button>
    );
  }

  if (variant === 'inline') {
    return (
      <button
        onClick={() => navigate('/pricing')}
        className="text-st-premium hover:text-st-premium/80 text-sm font-medium inline-flex items-center gap-1 transition-colors"
      >
        <Sparkles size={12} />
        Upgrade
      </button>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-gradient-to-r from-st-accent/20 to-st-info/20 border border-st-accent/30">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={16} className="text-st-premium" />
        <span className="text-sm font-semibold text-white">Unlock Premium</span>
      </div>
      <p className="text-xs text-[var(--st-text-secondary)] mb-3">
        Get unlimited signals, full analytics, and Chrome extension access.
      </p>
      <button
        onClick={() => navigate('/pricing')}
        className="w-full py-2 rounded-lg bg-gradient-to-r from-st-accent to-st-info text-white font-semibold text-sm hover:opacity-90 transition-opacity"
      >
        Upgrade Now
      </button>
    </div>
  );
}
