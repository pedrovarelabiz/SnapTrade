import { StatsOverview } from '@/types';
import { TrendingUp, Target, CheckCircle, XCircle, Flame, Award, BarChart3 } from 'lucide-react';

interface Props {
  stats: StatsOverview;
}

export function StatsCards({ stats }: Props) {
  const cards = [
    { label: 'Total Signals', value: stats.totalSignals.toLocaleString(), icon: BarChart3, color: 'text-st-info', bg: 'bg-st-info/10' },
    { label: 'Win Rate', value: `${stats.winRate}%`, icon: Target, color: 'text-st-call', bg: 'bg-st-call/10' },
    { label: 'Wins', value: stats.wins.toLocaleString(), icon: CheckCircle, color: 'text-st-call', bg: 'bg-st-call/10' },
    { label: 'Losses', value: stats.losses.toLocaleString(), icon: XCircle, color: 'text-st-put', bg: 'bg-st-put/10' },
    { label: 'Current Streak', value: `${stats.currentStreak}`, icon: Flame, color: 'text-st-premium', bg: 'bg-st-premium/10' },
    { label: 'Best Streak', value: `${stats.bestStreak}`, icon: Award, color: 'text-st-accent', bg: 'bg-st-accent/10' },
    { label: 'Avg/Day', value: stats.avgSignalsPerDay.toFixed(1), icon: TrendingUp, color: 'text-st-info', bg: 'bg-st-info/10' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {cards.map(card => (
        <div key={card.label} className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
          <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center mb-2`}>
            <card.icon size={16} className={card.color} />
          </div>
          <p className="text-xl font-bold text-white tabular-nums">{card.value}</p>
          <p className="text-[10px] text-[var(--st-text-secondary)] mt-0.5">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
