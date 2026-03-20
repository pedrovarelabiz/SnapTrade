import { DailyReport } from '@/types';
import { ReportCard } from './ReportCard';

interface Props {
  reports: DailyReport[];
  onSelect: (report: DailyReport) => void;
}

export function ReportList({ reports, onSelect }: Props) {
  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--st-text-secondary)]">No reports available</p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {reports.map(report => (
        <ReportCard key={report.id} report={report} onClick={() => onSelect(report)} />
      ))}
    </div>
  );
}
