import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { BarChart3, FileText, Chrome, Download } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { Signal } from '@/types';
import { formatPnl, getResultLabel } from '@/lib/pnlCalculator';
import { toast } from 'sonner';

interface Props {
  signals: Signal[];
}

export function QuickActions({ signals }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPremium = user?.role !== 'free';

  const handleExportToday = () => {
    const today = new Date().toDateString();
    const todaySignals = signals.filter(s => new Date(s.createdAt).toDateString() === today);

    if (todaySignals.length === 0) {
      toast.error('No signals to export today');
      return;
    }

    const headers = ['Asset', 'Direction', 'Timeframe', 'Status', 'Entry Time', 'Result Type', 'Gale Level', 'Net P&L'];
    const rows = todaySignals.map(s => [
      s.asset,
      s.direction,
      s.signalType,
      s.timeframe,
      s.status,
      `${s.confidence}%`,
      new Date(s.entryTime).toLocaleTimeString(),
      s.resultType ? getResultLabel(s.resultType, s.resultGaleLevel ?? 0) : '',
      s.resultGaleLevel !== undefined ? String(s.resultGaleLevel) : '',
      s.pnl ? formatPnl(s.pnl.netPnl) : '',
    ]);

    exportToCsv(`snaptrade-signals-${new Date().toISOString().split('T')[0]}`, headers, rows);
    toast.success(`Exported ${todaySignals.length} signals`);
  };

  const actions = [
    { label: 'Analytics', icon: BarChart3, onClick: () => navigate('/analytics'), color: 'text-st-info', bg: 'bg-st-info/10', border: 'border-st-info/20' },
    { label: 'Reports', icon: FileText, onClick: () => navigate('/reports'), color: 'text-st-accent', bg: 'bg-st-accent/10', border: 'border-st-accent/20' },
    ...(isPremium ? [
      { label: 'Extension', icon: Chrome, onClick: () => navigate('/settings'), color: 'text-st-premium', bg: 'bg-st-premium/10', border: 'border-st-premium/20' },
    ] : []),
    { label: 'Export', icon: Download, onClick: handleExportToday, color: 'text-st-call', bg: 'bg-st-call/10', border: 'border-st-call/20' },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {actions.map(action => (
        <button
          key={action.label}
          onClick={action.onClick}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl ${action.bg} border ${action.border} ${action.color} text-xs font-medium hover:opacity-80 transition-opacity`}
        >
          <action.icon size={13} />
          {action.label}
        </button>
      ))}
    </div>
  );
}