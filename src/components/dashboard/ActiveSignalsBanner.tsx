import { Signal } from '@/types';
import { Zap, Clock, ArrowDown } from 'lucide-react';

interface Props {
  signals: Signal[];
  onScrollToSignals?: () => void;
}

export function ActiveSignalsBanner({ signals, onScrollToSignals }: Props) {
  const activeSignals = signals.filter(s => s.status === 'pending' || s.status === 'active');
  const pendingCount = activeSignals.filter(s => s.status === 'pending').length;
  const activeCount = activeSignals.filter(s => s.status === 'active').length;

  if (activeSignals.length === 0) return null;

  // Find the soonest entry time
  const soonest = activeSignals
    .filter(s => s.status === 'pending')
    .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime())[0];

  const soonestTime = soonest
    ? new Date(soonest.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  return (
    <button
      onClick={onScrollToSignals}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-st-accent/8 border border-st-accent/25 hover:border-st-accent/40 transition-all group"
    >
      <div className="w-9 h-9 rounded-lg bg-st-accent/15 flex items-center justify-center flex-shrink-0">
        <Zap size={16} className="text-st-accent" />
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">
            {activeSignals.length} Active Signal{activeSignals.length > 1 ? 's' : ''}
          </span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-st-info/15 text-st-info text-[9px] font-bold border border-st-info/25">
              {pendingCount} PENDING
            </span>
          )}
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-st-accent/15 text-st-accent text-[9px] font-bold border border-st-accent/25">
              {activeCount} LIVE
            </span>
          )}
        </div>
        {soonestTime && (
          <p className="text-[10px] text-[var(--st-text-secondary)] mt-0.5 flex items-center gap-1">
            <Clock size={9} />
            Next entry at {soonestTime} UTC
          </p>
        )}
      </div>
      <ArrowDown size={14} className="text-[var(--st-text-secondary)] group-hover:text-st-accent transition-colors flex-shrink-0" />
    </button>
  );
}