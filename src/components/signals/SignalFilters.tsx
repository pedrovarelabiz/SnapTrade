import { SignalStatus, SignalDirection } from '@/types';

interface Props {
  statusFilter: SignalStatus | 'all';
  directionFilter: SignalDirection | 'all';
  onStatusChange: (s: SignalStatus | 'all') => void;
  onDirectionChange: (d: SignalDirection | 'all') => void;
}

export function SignalFilters({ statusFilter, directionFilter, onStatusChange, onDirectionChange }: Props) {
  const statuses: (SignalStatus | 'all')[] = ['all', 'pending', 'active', 'win', 'loss'];
  const directions: (SignalDirection | 'all')[] = ['all', 'CALL', 'PUT'];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => onStatusChange(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === s ? 'bg-st-accent/15 text-st-accent' : 'text-[var(--st-text-secondary)] hover:text-white'
            }`}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
        {directions.map(d => (
          <button
            key={d}
            onClick={() => onDirectionChange(d)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              directionFilter === d
                ? d === 'CALL' ? 'bg-st-call/15 text-st-call' : d === 'PUT' ? 'bg-st-put/15 text-st-put' : 'bg-st-accent/15 text-st-accent'
                : 'text-[var(--st-text-secondary)] hover:text-white'
            }`}
          >
            {d === 'all' ? 'All' : d}
          </button>
        ))}
      </div>
    </div>
  );
}
