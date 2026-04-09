import { CheckCircle, XCircle, BarChart3, Activity } from 'lucide-react';

interface Props {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}

export function ResultsSummaryBar({ total, wins, losses, winRate }: Props) {
  return (
    <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[var(--st-bg-deep)]/60 border border-[var(--st-border)]">
      <div className="flex items-center gap-1.5 text-xs text-[var(--st-text-secondary)]">
        <Activity size={12} />
        <span className="font-semibold text-white">{total}</span>
        <span>signals</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <CheckCircle size={12} className="text-st-call" />
        <span className="font-semibold text-st-call">{wins}</span>
        <span className="text-[var(--st-text-secondary)]">wins</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <XCircle size={12} className="text-st-put" />
        <span className="font-semibold text-st-put">{losses}</span>
        <span className="text-[var(--st-text-secondary)]">losses</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <BarChart3 size={12} className="text-st-accent" />
        <span className="font-bold text-white">{winRate}%</span>
      </div>
    </div>
  );
}