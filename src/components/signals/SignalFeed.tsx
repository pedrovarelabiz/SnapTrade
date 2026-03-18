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

  return (
    <>
      <div className="space-y-3">
        {sorted.map(signal => (
          <SignalCard
            key={signal.id}
            signal={signal}
            onUpdateStatus={onUpdateStatus}
            isNew={newSignalIds?.has(signal.id)}
            onClick={() => setSelectedSignal(signal)}
          />
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