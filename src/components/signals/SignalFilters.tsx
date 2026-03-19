import { SignalStatus, SignalDirection } from '@/types';

const CHANNEL_OPTIONS = [
  { value: 'all', label: 'All', color: '' },
  { value: 'tyl_vip', label: 'Source A', color: '#2979ff' },
  { value: 'tyl_trading', label: 'Source B', color: '#7c4dff' },
  { value: 'sinais_mil', label: 'Source C', color: '#00e676' },
  { value: 'blacklist', label: 'Source D', color: '#ff9100' },
  { value: 'cole_carter', label: 'Source E', color: '#e040fb' },
  { value: 'private_team', label: 'Source F', color: '#00bcd4' },
];

interface Props {
  statusFilter: SignalStatus | 'all';
  directionFilter: SignalDirection | 'all';
  channelFilter?: string;
  onStatusChange: (s: SignalStatus | 'all') => void;
  onDirectionChange: (d: SignalDirection | 'all') => void;
  onChannelChange?: (c: string) => void;
}

export function SignalFilters({ statusFilter, directionFilter, channelFilter = 'all', onStatusChange, onDirectionChange, onChannelChange }: Props) {
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

      {onChannelChange && (
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
          {CHANNEL_OPTIONS.map(ch => (
            <button
              key={ch.value}
              onClick={() => onChannelChange(ch.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                channelFilter === ch.value
                  ? 'text-white'
                  : 'text-[var(--st-text-secondary)] hover:text-white'
              }`}
              style={channelFilter === ch.value && ch.color ? { background: ch.color + '22', color: ch.color } : undefined}
            >
              {ch.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
