import { Signal } from '@/types';
import { Flame, DollarSign } from 'lucide-react';
import { formatPnl } from '@/lib/pnlCalculator';

interface Props {
  signals: Signal[];
}

export function StreakVisualization({ signals }: Props) {
  const resolved = signals
    .filter(s => s.result === 'win' || s.result === 'loss')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  if (resolved.length === 0) return null;

  let streak = 0;
  let streakType: 'win' | 'loss' | null = null;
  for (const s of resolved) {
    if (!streakType) {
      streakType = s.result!;
      streak = 1;
    } else if (s.result === streakType) {
      streak++;
    } else {
      break;
    }
  }

  const wins = resolved.filter(s => s.result === 'win').length;
  const recentWinRate = Math.round((wins / resolved.length) * 100);

  // Calculate P&L for recent signals
  const recentPnl = resolved.reduce((sum, s) => {
    if (s.pnl?.netPnl !== undefined) return sum + s.pnl.netPnl;
    return sum;
  }, 0);
  const roundedPnl = Math.round(recentPnl * 100) / 100;
  const hasPnl = resolved.some(s => s.pnl !== undefined);

  return (
    <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame size={14} className={streakType === 'win' ? 'text-st-premium' : 'text-st-put'} />
          <span className="text-sm font-semibold text-white">Recent Results</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--st-text-secondary)]">
            Last {resolved.length}: <span className={`font-semibold ${recentWinRate >= 70 ? 'text-st-call' : 'text-st-premium'}`}>{recentWinRate}%</span>
          </span>
          {hasPnl && (
            <span className={`inline-flex items-center gap-1 text-xs font-bold tabular-nums ${roundedPnl >= 0 ? 'text-st-call' : 'text-st-put'}`}>
              <DollarSign size={10} />
              {formatPnl(roundedPnl)}
            </span>
          )}
          {streak >= 3 && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
              streakType === 'win'
                ? 'bg-st-premium/15 text-st-premium border border-st-premium/30'
                : 'bg-st-put/15 text-st-put border border-st-put/30'
            }`}>
              <Flame size={9} />
              {streak} {streakType === 'win' ? 'W' : 'L'} streak
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {resolved.map((signal) => (
          <div
            key={signal.id}
            className="group relative flex-1 max-w-[24px]"
          >
            <div
              className={`h-6 rounded-sm transition-all ${
                signal.result === 'win'
                  ? 'bg-st-call/70 hover:bg-st-call'
                  : 'bg-st-put/70 hover:bg-st-put'
              }`}
            />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10">
              <div className="px-2 py-1.5 rounded-lg bg-[var(--st-bg-elevated)] border border-[var(--st-border)] shadow-xl whitespace-nowrap">
                <p className="text-[10px] font-medium text-white">{signal.asset}</p>
                <p className={`text-[9px] font-bold ${signal.result === 'win' ? 'text-st-call' : 'text-st-put'}`}>
                  {signal.direction} · {signal.result?.toUpperCase()}
                </p>
                {signal.resultType && (
                  <p className="text-[8px] text-[var(--st-text-secondary)]">
                    {signal.resultType === 'direct_victory' ? 'Direct' : signal.resultType === 'victory_at_gale' ? `Gale ${signal.resultGaleLevel}` : 'Loss'}
                  </p>
                )}
                {signal.pnl && (
                  <p className={`text-[9px] font-bold tabular-nums ${signal.pnl.netPnl >= 0 ? 'text-st-call' : 'text-st-put'}`}>
                    {formatPnl(signal.pnl.netPnl)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[9px] text-[var(--st-text-secondary)]">← Newest</span>
        <span className="text-[9px] text-[var(--st-text-secondary)]">Oldest →</span>
      </div>
    </div>
  );
}