import { DailyReport } from '@/types';
import { Calendar, CheckCircle, XCircle, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
import { formatPnl } from '@/lib/pnlCalculator';

interface Props {
  report: DailyReport;
  onClick: () => void;
}

export function ReportCard({ report, onClick }: Props) {
  const date = new Date(report.date);
  const isToday = new Date().toDateString() === date.toDateString();
  const hasPnl = report.dailyPnl !== undefined;
  const hasGaleBreakdown = report.directWins !== undefined;
  const pnlPositive = (report.dailyPnl ?? 0) >= 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] hover:border-st-accent/30 transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-st-info" />
          <span className="text-sm font-semibold text-white">
            {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          {isToday && <span className="px-2 py-0.5 rounded-full bg-st-accent/15 text-st-accent text-[10px] font-semibold">Today</span>}
        </div>
        {hasPnl && (
          <span className={`text-sm font-bold tabular-nums ${pnlPositive ? 'text-st-call' : 'text-st-put'}`}>
            {formatPnl(report.dailyPnl!)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-3">
        <div>
          <p className="text-[10px] text-[var(--st-text-secondary)]">Signals</p>
          <p className="text-lg font-bold text-white tabular-nums">{report.totalSignals}</p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--st-text-secondary)]">Win Rate</p>
          <p className={`text-lg font-bold tabular-nums ${report.winRate >= 75 ? 'text-st-call' : 'text-st-premium'}`}>{report.winRate}%</p>
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle size={12} className="text-st-call" />
          <span className="text-lg font-bold text-st-call tabular-nums">{report.wins}</span>
        </div>
        <div className="flex items-center gap-1">
          <XCircle size={12} className="text-st-put" />
          <span className="text-lg font-bold text-st-put tabular-nums">{report.losses}</span>
        </div>
      </div>

      {/* Gale breakdown */}
      {hasGaleBreakdown && (
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] text-st-call font-medium">
            <Zap size={8} />
            {report.directWins} direct
          </span>
          {(report.gale1Wins ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-st-premium font-medium">
              <TrendingUp size={8} />
              {report.gale1Wins} G1
            </span>
          )}
          {(report.gale2Wins ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-st-premium font-medium">
              <TrendingUp size={8} />
              {report.gale2Wins} G2
            </span>
          )}
          {(report.fullLosses ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-st-put font-medium">
              <AlertTriangle size={8} />
              {report.fullLosses} loss
            </span>
          )}
        </div>
      )}

      <div className="h-1.5 rounded-full bg-[var(--st-border)] overflow-hidden">
        <div className="h-full rounded-full bg-st-call" style={{ width: `${report.winRate}%` }} />
      </div>
    </button>
  );
}