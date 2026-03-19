import { useState } from 'react';
import { Signal } from '@/types';
import { SignalCard } from './SignalCard';
import { LockedSignalCard } from './LockedSignalCard';
import { SignalDetailModal } from './SignalDetailModal';
import { useAuth } from '@/hooks/useAuth';
import { Zap } from 'lucide-react';

interface Props {
  signals: Signal[];
  onUpdateStatus?: (id: string, status: Signal['status']) => void;
  newSignalIds?: Set<string>;
}

const statusOrder: Record<string, number> = { pending: 0, active: 1, win: 2, loss: 3, skipped: 4, expired: 5 };

export function SignalFeed({ signals, onUpdateStatus, newSignalIds }: Props) {
  const { user } = useAuth();
  const isFree = user?.role === 'free';
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);

  if (signals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-st-accent/10 flex items-center justify-center mb-4">
          <Zap size={24} className="text-st-accent" />
        </div>
        <h3 className="text-base font-semibold text-white mb-1">No Signals Yet</h3>
        <p className="text-sm text-[var(--st-text-secondary)] max-w-xs">
          Signals will appear here as they're generated. Stay tuned!
        </p>
      </div>
    );
  }

  const sorted = [...signals].sort((a, b) => {
    const orderDiff = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
    if (orderDiff !== 0) return orderDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const freeSignals = sorted.filter(s => !s.isPremium);
  const premiumSignals = sorted.filter(s => s.isPremium);

  if (isFree) {
    return (
      <>
        <div className="space-y-3">
          {freeSignals.map(signal => (
            <SignalCard
              key={signal.id}
              signal={signal}
              onUpdateStatus={onUpdateStatus}
              isNew={newSignalIds?.has(signal.id)}
              onClick={() => setSelectedSignal(signal)}
            />
          ))}
          {premiumSignals.slice(0, 5).map((_, i) => (
            <LockedSignalCard key={`locked-${i}`} index={i} />
          ))}
        </div>
        <SignalDetailModal
          signal={selectedSignal}
          open={!!selectedSignal}
          onClose={() => setSelectedSignal(null)}
        />
      </>
    );
  }

  // Group signals by day
  const grouped: { label: string; signals: Signal[] }[] = [];
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  let currentDay = '';
  for (const sig of sorted) {
    const dayStr = new Date(sig.createdAt).toDateString();
    if (dayStr !== currentDay) {
      currentDay = dayStr;
      const label = dayStr === today ? 'Today' : dayStr === yesterday ? 'Yesterday' : new Date(sig.createdAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      grouped.push({ label, signals: [sig] });
    } else {
      grouped[grouped.length - 1].signals.push(sig);
    }
  }

  return (
    <>
      <div className="space-y-3">
        {grouped.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && (
              <div className="flex items-center gap-3 py-3">
                <div className="flex-1 h-px bg-[var(--st-border)]" />
                <span className="text-xs font-medium text-[var(--st-text-secondary)]">{group.label}</span>
                <div className="flex-1 h-px bg-[var(--st-border)]" />
              </div>
            )}
            {group.signals.map(signal => (
              <div key={signal.id} className="mb-3">
                <SignalCard
                  signal={signal}
                  onUpdateStatus={onUpdateStatus}
                  isNew={newSignalIds?.has(signal.id)}
                  onClick={() => setSelectedSignal(signal)}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      <SignalDetailModal
        signal={selectedSignal}
        open={!!selectedSignal}
        onClose={() => setSelectedSignal(null)}
      />
    </>
  );
}