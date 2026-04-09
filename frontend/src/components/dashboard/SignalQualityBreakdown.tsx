import { Signal } from '@/types';
import { formatPnl } from '@/lib/pnlCalculator';
import { Zap, TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react';

interface Props {
  signals: Signal[];
}

export function SignalQualityBreakdown({ signals }: Props) {
  const resolved = signals.filter(s => s.resultType !== undefined);

  if (resolved.length < 3) return null;

  const directWins = resolved.filter(s => s.resultType === 'direct_victory');
  const gale1Wins = resolved.filter(s => s.resultType === 'victory_at_gale' && s.resultGaleLevel === 1);
  const gale2Wins = resolved.filter(s => s.resultType === 'victory_at_gale' && s.resultGaleLevel === 2);
  const fullLosses = resolved.filter(s => s.resultType === 'loss');

  const total = resolved.length;

  const categories = [
    {
      label: 'Direct Wins',
      count: directWins.length,
      pct: Math.round((directWins.length / total) * 100),
      icon: Zap,
      color: 'text-st-call',
      bg: 'bg-st-call',
      bgLight: 'bg-st-call/10',
      border: 'border-st-call/20',
      pnl: directWins.reduce((sum, s) => sum + (s.pnl?.netPnl ?? 0), 0),
      hasPnl: directWins.some(s => s.pnl !== undefined),
      desc: 'Won on initial trade',
    },
    {
      label: 'Gale 1 Wins',
      count: gale1Wins.length,
      pct: Math.round((gale1Wins.length / total) * 100),
      icon: TrendingUp,
      color: 'text-st-premium',
      bg: 'bg-st-premium',
      bgLight: 'bg-st-premium/10',
      border: 'border-st-premium/20',
      pnl: gale1Wins.reduce((sum, s) => sum + (s.pnl?.netPnl ?? 0), 0),
      hasPnl: gale1Wins.some(s => s.pnl !== undefined),
      desc: 'Won after 1st martingale',
    },
    {
      label: 'Gale 2 Wins',
      count: gale2Wins.length,
      pct: Math.round((gale2Wins.length / total) * 100),
      icon: TrendingUp,
      color: 'text-st-info',
      bg: 'bg-st-info',
      bgLight: 'bg-st-info/10',
      border: 'border-st-info/20',
      pnl: gale2Wins.reduce((sum, s) => sum + (s.pnl?.netPnl ?? 0), 0),
      hasPnl: gale2Wins.some(s => s.pnl !== undefined),
      desc: 'Won after 2nd martingale',
    },
    {
      label: 'Full Losses',
      count: fullLosses.length,
      pct: Math.round((fullLosses.length / total) * 100),
      icon: AlertTriangle,
      color: 'text-st-put',
      bg: 'bg-st-put',
      bgLight: 'bg-st-put/10',
      border: 'border-st-put/20',
      pnl: fullLosses.reduce((sum, s) => sum + (s.pnl?.netPnl ?? 0), 0),
      hasPnl: fullLosses.some(s => s.pnl !== undefined),
      desc: 'Lost all levels',
    },
  ].filter(c => c.count > 0);

  return (
    <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-st-accent" />
          <span className="text-sm font-semibold text-white">Signal Quality</span>
        </div>
        <span className="text-[10px] text-[var(--st-text-secondary)]">{total} resolved signals</span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-4 gap-0.5">
        {categories.map(cat => (
          <div
            key={cat.label}
            className={`${cat.bg} rounded-full transition-all duration-500`}
            style={{ width: `${Math.max(cat.pct, 2)}%`, opacity: 0.7 }}
            title={`${cat.label}: ${cat.count} (${cat.pct}%)`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {categories.map(cat => {
          const Icon = cat.icon;
          const roundedPnl = Math.round(cat.pnl * 100) / 100;
          return (
            <div key={cat.label} className={`flex items-center gap-2.5 p-2.5 rounded-xl ${cat.bgLight} border ${cat.border}`}>
              <div className={`w-7 h-7 rounded-lg ${cat.bgLight} flex items-center justify-center flex-shrink-0`}>
                <Icon size={12} className={cat.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${cat.color}`}>{cat.count}</span>
                  <span className="text-[9px] text-[var(--st-text-secondary)] tabular-nums">{cat.pct}%</span>
                </div>
                <p className="text-[9px] text-[var(--st-text-secondary)] truncate">{cat.label}</p>
                {cat.hasPnl && (
                  <p className={`text-[9px] font-bold tabular-nums ${roundedPnl >= 0 ? 'text-st-call' : 'text-st-put'}`}>
                    {formatPnl(roundedPnl)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}