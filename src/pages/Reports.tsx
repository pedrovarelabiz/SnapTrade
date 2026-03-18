import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ReportList } from '@/components/reports/ReportList';
import { ReportDetail } from '@/components/reports/ReportDetail';
import { useAuth } from '@/hooks/useAuth';
import { UpgradeCTA } from '@/components/shared/UpgradeCTA';
import { DailyReport } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { reportService } from '@/services/reportService';
import { FileText, Download } from 'lucide-react';
import { toast } from 'sonner';

export default function Reports() {
  const { user } = useAuth();
  const { data: reports = [] } = useQuery({ queryKey: ['reports'], queryFn: reportService.getReports });
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const isFree = user?.role === 'free';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Daily Reports</h1>
            <p className="text-sm text-[var(--st-text-secondary)]">{reports.length} reports available</p>
          </div>
          <button
            onClick={() => toast.success('PDF export coming soon!')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] text-sm text-[var(--st-text-primary)] hover:border-st-accent/30 transition-colors"
          >
            <Download size={14} />
            Export PDF
          </button>
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

        {selectedReport ? (
          <ReportDetail report={selectedReport} onClose={() => setSelectedReport(null)} />
        ) : (
          <ReportList reports={reports} onSelect={setSelectedReport} />
        )}
      </div>
    </DashboardLayout>
  );
}
