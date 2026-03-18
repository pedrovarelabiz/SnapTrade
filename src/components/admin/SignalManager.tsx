import { Signal } from '@/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

interface Props {
  signals: Signal[];
  onUpdateStatus: (id: string, status: Signal['status']) => void;
}

export function SignalManager({ signals, onUpdateStatus }: Props) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const toggleVisibility = (id: string) => {
    setHiddenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const activeSignals = signals.filter(s => s.status === 'pending' || s.status === 'active');
  const recentSignals = signals.filter(s => s.status !== 'pending' && s.status !== 'active').slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Active Signals ({activeSignals.length})</h3>
        <div className="space-y-2">
          {activeSignals.length === 0 && <p className="text-sm text-[var(--st-text-secondary)]">No active signals</p>}
          {activeSignals.map(signal => (
            <div key={signal.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-white">{signal.asset}</span>
                <span className={`text-xs font-bold ${signal.direction === 'CALL' ? 'text-st-call' : 'text-st-put'}`}>{signal.direction}</span>
                <StatusBadge status={signal.status} />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleVisibility(signal.id)} className="p-1.5 rounded-lg hover:bg-[var(--st-border)]/50 text-[var(--st-text-secondary)]">
                  {hiddenIds.has(signal.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button onClick={() => onUpdateStatus(signal.id, 'win')} className="px-2 py-1 rounded-lg bg-st-call/10 text-st-call text-xs font-semibold hover:bg-st-call/20">WIN</button>
                <button onClick={() => onUpdateStatus(signal.id, 'loss')} className="px-2 py-1 rounded-lg bg-st-put/10 text-st-put text-xs font-semibold hover:bg-st-put/20">LOSS</button>
                <button onClick={() => onUpdateStatus(signal.id, 'skipped')} className="px-2 py-1 rounded-lg bg-[var(--st-border)]/50 text-[var(--st-text-secondary)] text-xs font-semibold hover:bg-[var(--st-border)]">SKIP</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Recent Results</h3>
        <div className="space-y-2">
          {recentSignals.map(signal => (
            <div key={signal.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-white">{signal.asset}</span>
                <span className={`text-xs font-bold ${signal.direction === 'CALL' ? 'text-st-call' : 'text-st-put'}`}>{signal.direction}</span>
                <StatusBadge status={signal.status} />
              </div>
              <span className="text-xs text-[var(--st-text-secondary)]">
                {new Date(signal.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
