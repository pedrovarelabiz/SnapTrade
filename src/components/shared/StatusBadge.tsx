import { SignalStatus } from '@/types';
import { CheckCircle, XCircle, Clock, Zap, SkipForward, AlertCircle } from 'lucide-react';

const statusConfig: Record<SignalStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'text-st-info bg-st-info/15 border-st-info/30', icon: Clock },
  active: { label: 'Active', color: 'text-st-accent bg-st-accent/15 border-st-accent/30', icon: Zap },
  win: { label: 'Win', color: 'text-st-call bg-st-call/15 border-st-call/30', icon: CheckCircle },
  loss: { label: 'Loss', color: 'text-st-put bg-st-put/15 border-st-put/30', icon: XCircle },
  skipped: { label: 'Skipped', color: 'text-[var(--st-text-secondary)] bg-[var(--st-border)]/30 border-[var(--st-border)]', icon: SkipForward },
  expired: { label: 'Expired', color: 'text-[var(--st-text-secondary)] bg-[var(--st-border)]/30 border-[var(--st-border)]', icon: AlertCircle },
};

export function StatusBadge({ status }: { status: SignalStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
      <Icon size={10} />
      {config.label}
    </span>
  );
}
