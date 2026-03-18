import { Signal } from '@/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Eye, EyeOff, Zap } from 'lucide-react';
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
          {activeSignals.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
              <div className="w-12 h-12 rounded-xl bg-st-accent/10 flex items-center justify-center mb-3">
                <Zap size={20} className="text-st-accent" />
              </div>
              <p className="text-sm font-medium text-white mb-1">No Active Signals</p>
              <p className="text-xs text-[var(--st-text-secondary)]">New signals will appear here when generated</p>
            </div>
          )}
          {activeSignals.map(signal => (
            <div key={signal.id} className="p-3 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
              <div className="flex items-center justify-between mb-2 sm:mb-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-white">{signal.asset}</span>
                  <span className={`text-xs font-bold ${signal.direction === 'CALL' ? 'text-st-call' : 'text-st-put'}`}>{signal.direction}</span>
                  <StatusBadge status={signal.status} />
                </div>
                <button onClick={() => toggleVisibility(signal.id)} className="p-1.5 rounded-lg hover:bg-[var(--st-border)]/50 text-[var(--st-text-secondary)] sm:hidden">
                  {hiddenIds.has(signal.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div className="flex items-center gap-1.5 mt-2 sm:mt-0 sm:justify-end">
                <button onClick={() => toggleVisibility(signal.id)} className="hidden sm:block p-1.5 rounded-lg hover:bg-[var(--st-border)]/50 text-[var(--st-text-secondary)]">
                  {hiddenIds.has(signal.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button onClick={() => onUpdateStatus(signal.id, 'win')} className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-st-call/10 text-st-call text-xs font-semibold hover:bg-st-call/20 transition-colors">WIN</button>
                <button onClick={() => onUpdateStatus(signal.id, 'loss')} className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-st-put/10 text-st-put text-xs font-semibold hover:bg-st-put/20 transition-colors">LOSS</button>
                <button onClick={() => onUpdateStatus(signal.id, 'skipped')} className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-[var(--st-border)]/50 text-[var(--st-text-secondary)] text-xs font-semibold hover:bg-[var(--st-border)] transition-colors">SKIP</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Recent Results</h3>
        <div className="space-y-2">
          {recentSignals.length === 0 && (
            <p className="text-sm text-[var(--st-text-secondary)] text-center py-6">No recent results yet</p>
          )}
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