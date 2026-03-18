import { Signal } from '@/types';
import { Activity, Target, CheckCircle, XCircle, Flame, Clock } from 'lucide-react';

interface Props {
  signals: Signal[];
}

export function TodayStats({ signals }: Props) {
  const today = new Date().toDateString();
  const todaySignals = signals.filter(s => new Date(s.createdAt).toDateString() === today);
  const activeCount = todaySignals.filter(s => s.status === 'pending' || s.status === 'active').length;
  const wins = todaySignals.filter(s => s.result === 'win').length;
  const losses = todaySignals.filter(s => s.result === 'loss').length;
  const resolved = wins + losses;
  const winRate = resolved > 0 ? Math.round((wins / resolved) * 100) : 0;

  // Calculate current streak
  const resolvedSignals = todaySignals
    .filter(s => s.result === 'win' || s.result === 'loss')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let streak = 0;
  let streakType: 'win' | 'loss' | null = null;
  for (const s of resolvedSignals) {
    if (!streakType) {
      streakType = s.result!;
      streak = 1;
    } else if (s.result === streakType) {
      streak++;
    } else {
      break;
    }
  }

  const stats = [
    {
      label: 'Active',
      value: activeCount,
      icon: Activity,
      color: 'text-st-accent',
      bg: 'bg-st-accent/10',
      pulse: activeCount > 0,
    },
    {
      label: 'Win Rate',
      value: resolved > 0 ? `${winRate}%` : '—',
      icon: Target,
      color: winRate >= 70 ? 'text-st-call' : winRate >= 50 ? 'text-st-premium' : 'text-st-put',
      bg: winRate >= 70 ? 'bg-st-call/10' : winRate >= 50 ? 'bg-st-premium/10' : 'bg-st-put/10',
    },
    {
      label: 'Wins',
      value: wins,
      icon: CheckCircle,
      color: 'text-st-call',
      bg: 'bg-st-call/10',
    },
    {
      label: 'Losses',
      value: losses,
      icon: XCircle,
      color: 'text-st-put',
      bg: 'bg-st-put/10',
    },
    {
      label: 'Streak',
      value: streak > 0 ? `${streak}${streakType === 'win' ? 'W' : 'L'}` : '—',
      icon: Flame,
      color: streakType === 'win' ? 'text-st-premium' : streakType === 'loss' ? 'text-st-put' : 'text-[var(--st-text-secondary)]',
      bg: streakType === 'win' ? 'bg-st-premium/10' : streakType === 'loss' ? 'bg-st-put/10' : 'bg-[var(--st-border)]/30',
    },
    {
      label: 'Total',
      value: todaySignals.length,
      icon: Clock,
      color: 'text-st-info',
      bg: 'bg-st-info/10',
    },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {stats.map(stat => (
        <div
          key={stat.label}
          className="flex items-center gap-2.5 p-3 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]"
        >
          <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center flex-shrink-0 ${stat.pulse ? 'animate-pulse' : ''}`}>
            <stat.icon size={14} className={stat.color} />
          </div>
          <div className="min-w-0">
            <p className={`text-base font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
            <p className="text-[9px] text-[var(--st-text-secondary)] leading-tight">{stat.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}