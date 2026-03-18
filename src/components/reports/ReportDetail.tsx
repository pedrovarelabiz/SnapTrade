import { DailyReport } from '@/types';
import { Calendar, TrendingUp, CheckCircle, XCircle, Award, X, DollarSign, Zap, AlertTriangle } from 'lucide-react';
import { formatPnl } from '@/lib/pnlCalculator';

interface Props {
  report: DailyReport;
  onClose: () => void;
}

export function ReportDetail({ report, onClose }: Props) {
  const date = new Date(report.date);
  const hasPnl = report.dailyPnl !== undefined;
  const hasGaleBreakdown = report.directWins !== undefined;
  const pnlPositive = (report.dailyPnl ?? 0) >= 0;

  return (
    <div className="rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calendar size={18} className="text-st-info" />
          <h2 className="text-lg font-bold text-white">
            {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--st-border)]/50 text-[var(--st-text-secondary)]">
          <X size={18} />
        </button>
      </div>

      <div className={`grid ${hasPnl ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'} gap-4 mb-6`}>
        <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-st-info" />
            <span className="text-xs text-[var(--st-text-secondary)]">Total Signals</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{report.totalSignals}</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
          <div className="flex items-center gap-2 mb-1">
            <Award size={14} className="text-st-call" />
            <span className="text-xs text-[var(--st-text-secondary)]">Win Rate</span>
          </div>
          <p className="text-2xl font-bold text-st-call tabular-nums">{report.winRate}%</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={14} className="text-st-call" />
            <span className="text-xs text-[var(--st-text-secondary)]">Wins</span>
          </div>
          <p className="text-2xl font-bold text-st-call tabular-nums">{report.wins}</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={14} className="text-st-put" />
            <span className="text-xs text-[var(--st-text-secondary)]">Losses</span>
          </div>
          <p className="text-2xl font-bold text-st-put tabular-nums">{report.losses}</p>
        </div>
        {hasPnl && (
          <div className={`p-4 rounded-xl border ${pnlPositive ? 'bg-st-call/5 border-st-call/20' : 'bg-st-put/5 border-st-put/20'}`}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={14} className={pnlPositive ? 'text-st-call' : 'text-st-put'} />
              <span className="text-xs text-[var(--st-text-secondary)]">Daily P&L</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${pnlPositive ? 'text-st-call' : 'text-st-put'}`}>
              {formatPnl(report.dailyPnl!)}
            </p>
          </div>
        )}
      </div>

      {/* Gale Breakdown */}
      {hasGaleBreakdown && (
        <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] mb-6">
          <h3 className="text-sm font-semibold text-white mb-3">Signal Quality Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-[var(--st-bg-card)] border border-st-call/15">
              <div className="w-8 h-8 rounded-lg bg-st-call/10 flex items-center justify-center">
                <Zap size={14} className="text-st-call" />
              </div>
              <div>
                <p className="text-lg font-bold text-st-call tabular-nums">{report.directWins}</p>
                <p className="text-[9px] text-[var(--st-text-secondary)]">Direct Wins</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-[var(--st-bg-card)] border border-st-premium/15">
              <div className="w-8 h-8 rounded-lg bg-st-premium/10 flex items-center justify-center">
                <TrendingUp size={14} className="text-st-premium" />
              </div>
              <div>
                <p className="text-lg font-bold text-st-premium tabular-nums">{report.gale1Wins}</p>
                <p className="text-[9px] text-[var(--st-text-secondary)]">Gale 1 Wins</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-[var(--st-bg-card)] border border-st-premium/15">
              <div className="w-8 h-8 rounded-lg bg-st-premium/10 flex items-center justify-center">
                <TrendingUp size={14} className="text-st-premium" />
              </div>
              <div>
                <p className="text-lg font-bold text-st-premium tabular-nums">{report.gale2Wins}</p>
                <p className="text-[9px] text-[var(--st-text-secondary)]">Gale 2 Wins</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-[var(--st-bg-card)] border border-st-put/15">
              <div className="w-8 h-8 rounded-lg bg-st-put/10 flex items-center justify-center">
                <AlertTriangle size={14} className="text-st-put" />
              </div>
              <div>
                <p className="text-lg font-bold text-st-put tabular-nums">{report.fullLosses}</p>
                <p className="text-[9px] text-[var(--st-text-secondary)]">Full Losses</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-white">Performance Breakdown</span>
          <span className="text-xs text-[var(--st-text-secondary)]">Top Asset: {report.topAsset}</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--st-text-secondary)] w-16">Wins</span>
            <div className="flex-1 h-2 rounded-full bg-[var(--st-border)] overflow-hidden">
              <div className="h-full rounded-full bg-st-call" style={{ width: `${(report.wins / report.totalSignals) * 100}%` }} />
            </div>
            <span className="text-xs text-st-call font-semibold w-8 text-right">{report.wins}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--st-text-secondary)] w-16">Losses</span>
            <div className="flex-1 h-2 rounded-full bg-[var(--st-border)] overflow-hidden">
              <div className="h-full rounded-full bg-st-put" style={{ width: `${(report.losses / report.totalSignals) * 100}%` }} />
            </div>
            <span className="text-xs text-st-put font-semibold w-8 text-right">{report.losses}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--st-text-secondary)] w-16">Skipped</span>
            <div className="flex-1 h-2 rounded-full bg-[var(--st-border)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--st-text-secondary)]" style={{ width: `${(report.skipped / report.totalSignals) * 100}%` }} />
            </div>
            <span className="text-xs text-[var(--st-text-secondary)] font-semibold w-8 text-right">{report.skipped}</span>
          </div>
        </div>
      </div>
    </div>
  );
}