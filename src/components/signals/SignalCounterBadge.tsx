import { Signal } from '@/types';
import { Zap, DollarSign } from 'lucide-react';
import { formatPnl } from '@/lib/pnlCalculator';

interface Props {
  signals: Signal[];
  maxFree: number;
}

export function SignalCounterBadge({ signals, maxFree }: Props) {
  const today = new Date().toDateString();
  const todayFreeSignals = signals.filter(s => !s.isPremium && new Date(s.createdAt).toDateString() === today);
  const usedToday = todayFreeSignals.length;
  const remaining = Math.max(0, maxFree - usedToday);
  const percentage = Math.min(100, (usedToday / maxFree) * 100);

  // Calculate P&L for today's free signals
  const todayPnl = todayFreeSignals.reduce((sum, s) => {
    if (s.pnl?.netPnl !== undefined) return sum + s.pnl.netPnl;
    return sum;
  }, 0);
  const roundedPnl = Math.round(todayPnl * 100) / 100;
  const hasPnl = todayFreeSignals.some(s => s.pnl !== undefined);

  const wins = todayFreeSignals.filter(s => s.result === 'win').length;
  const losses = todayFreeSignals.filter(s => s.result === 'loss').length;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <Zap size={16} className="text-st-premium flex-shrink-0" />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-[var(--st-text-secondary)]">Free signals today</span>
          <div className="flex items-center gap-2">
            {hasPnl && (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums ${roundedPnl >= 0 ? 'text-st-call' : 'text-st-put'}`}>
                <DollarSign size={9} />
                {formatPnl(roundedPnl)}
              </span>
            )}
            {(wins > 0 || losses > 0) && (
              <span className="text-[10px] text-[var(--st-text-secondary)]">
                {wins}W / {losses}L
              </span>
            )}
            <span className="text-xs font-semibold text-white">{usedToday}/{maxFree}</span>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--st-border)] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${remaining === 0 ? 'bg-st-put' : 'bg-st-accent'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {remaining === 0 && (
          <p className="text-[10px] text-st-premium mt-1 font-medium">
            All free signals used — upgrade for unlimited access
          </p>
        )}
      </div>
    </div>
  );
}