import { Signal } from '@/types';
import { Zap } from 'lucide-react';

interface Props {
  signals: Signal[];
  maxFree: number;
}

export function SignalCounterBadge({ signals, maxFree }: Props) {
  const today = new Date().toDateString();
  const usedToday = signals.filter(s => !s.isPremium && new Date(s.createdAt).toDateString() === today).length;
  const remaining = Math.max(0, maxFree - usedToday);
  const percentage = Math.min(100, (usedToday / maxFree) * 100);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <Zap size={16} className="text-st-premium" />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-[var(--st-text-secondary)]">Free signals today</span>
          <span className="text-xs font-semibold text-white">{usedToday}/{maxFree}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--st-border)] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${remaining === 0 ? 'bg-st-put' : 'bg-st-accent'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
