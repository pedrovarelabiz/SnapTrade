import { Signal } from '@/types';
import { SignalCard } from './SignalCard';
import { LockedSignalCard } from './LockedSignalCard';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  signals: Signal[];
  onUpdateStatus?: (id: string, status: Signal['status']) => void;
  newSignalIds?: Set<string>;
}

const statusOrder: Record<string, number> = { pending: 0, active: 1, win: 2, loss: 3, skipped: 4, expired: 5 };

export function SignalFeed({ signals, onUpdateStatus, newSignalIds }: Props) {
  const { user } = useAuth();
  const isFree = user?.role === 'free';

  const sorted = [...signals].sort((a, b) => {
    const orderDiff = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
    if (orderDiff !== 0) return orderDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const freeSignals = sorted.filter(s => !s.isPremium);
  const premiumSignals = sorted.filter(s => s.isPremium);

  if (isFree) {
    return (
      <div className="space-y-3">
        {freeSignals.map(signal => (
          <SignalCard key={signal.id} signal={signal} onUpdateStatus={onUpdateStatus} isNew={newSignalIds?.has(signal.id)} />
        ))}
        {premiumSignals.slice(0, 5).map((_, i) => (
          <LockedSignalCard key={`locked-${i}`} index={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map(signal => (
        <SignalCard key={signal.id} signal={signal} onUpdateStatus={onUpdateStatus} isNew={newSignalIds?.has(signal.id)} />
      ))}
    </div>
  );
}
