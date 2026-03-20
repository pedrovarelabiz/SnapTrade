import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ReportList } from '@/components/reports/ReportList';
import { ReportDetail } from '@/components/reports/ReportDetail';
import { ReportsSummaryChart } from '@/components/reports/ReportsSummaryChart';
import { ReportsPnlChart } from '@/components/reports/ReportsPnlChart';
import { DateRangeFilter, DateRange } from '@/components/shared/DateRangeFilter';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { UpgradeCTA } from '@/components/shared/UpgradeCTA';
import { LockedChartOverlay } from '@/components/analytics/LockedChartOverlay';
import { DailyReport } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { reportService } from '@/services/reportService';
import { exportToCsv } from '@/utils/exportCsv';
import { formatPnl } from '@/lib/pnlCalculator';
import { FileText, Download, Calendar } from 'lucide-react';
import { toast } from 'sonner';

function getDaysForRange(range: DateRange): number {
  switch (range) {
    case '7d': return 7;
    case '30d': return 30;
    case '90d': return 90;
    case 'all': return Infinity;
  }
}

export default function Reports() {
  usePageTitle('Reports');
  const { user } = useAuth();
  const { data: reports = [], isLoading } = useQuery({ queryKey: ['reports'], queryFn: reportService.getReports });
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const isFree = user?.role === 'free';

  const filteredReports = useMemo(() => {
    const days = getDaysForRange(dateRange);
    if (days === Infinity) return reports;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return reports.filter(r => new Date(r.date) >= cutoff);
  }, [reports, dateRange]);

  const handleExport = () => {
    if (filteredReports.length === 0) {
      toast.error('No reports to export');
      return;
    }

    const headers = ['Date', 'Total Signals', 'Wins', 'Losses', 'Skipped', 'Win Rate (%)', 'Top Asset', 'Daily P&L', 'Direct Wins', 'Gale 1 Wins', 'Gale 2 Wins', 'Full Losses'];
    const rows = filteredReports.map(r => [
      r.date,
      String(r.totalSignals),
      String(r.wins),
      String(r.losses),
      String(r.skipped),
      String(r.winRate),
      r.topAsset,
      r.dailyPnl !== undefined ? formatPnl(r.dailyPnl) : 'N/A',
      String(r.directWins ?? 'N/A'),
      String(r.gale1Wins ?? 'N/A'),
      String(r.gale2Wins ?? 'N/A'),
      String(r.fullLosses ?? 'N/A'),
    ]);

    exportToCsv(`snaptrade-reports-${dateRange}`, headers, rows);
    toast.success(`Exported ${filteredReports.length} reports as CSV`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Daily Reports</h1>
            <p className="text-sm text-[var(--st-text-secondary)]">{filteredReports.length} reports available</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] text-sm text-[var(--st-text-primary)] hover:border-st-accent/30 transition-colors"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>

        {isFree && (
          <div className="p-4 rounded-xl bg-st-premium/5 border border-st-premium/20">
            <div className="flex items-start gap-3">
              <FileText size={18} className="text-st-premium mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-white mb-1">Limited Report Access</p>
                <p className="text-xs text-[var(--st-text-secondary)] mb-3">Free users can view report summaries. Upgrade for full signal breakdowns and detailed analytics.</p>
                <UpgradeCTA variant="button" />
              </div>
            </div>
          </div>
        )}

        {/* Charts Row */}
        {!isLoading && filteredReports.length > 0 && (
          <div className="grid lg:grid-cols-2 gap-6">
            {isFree ? (
              <>
                <LockedChartOverlay>
                  <ReportsSummaryChart reports={filteredReports} />
                </LockedChartOverlay>
                <LockedChartOverlay>
                  <ReportsPnlChart reports={filteredReports} />
                </LockedChartOverlay>
              </>
            ) : (
              <>
                <ReportsSummaryChart reports={filteredReports} />
                <ReportsPnlChart reports={filteredReports} />
              </>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] animate-pulse" />
            ))}
          </div>
        ) : selectedReport ? (
          <ReportDetail report={selectedReport} onClose={() => setSelectedReport(null)} />
        ) : filteredReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--st-bg-card)] border border-[var(--st-border)] flex items-center justify-center mb-4">
              <Calendar size={28} className="text-[var(--st-text-secondary)]" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No Reports Found</h3>
            <p className="text-sm text-[var(--st-text-secondary)] max-w-sm">
              No reports match the selected date range. Try expanding the range or check back later.
            </p>
          </div>
        ) : (
          <ReportList reports={filteredReports} onSelect={setSelectedReport} />
        )}
      </div>
    </DashboardLayout>
  );
}