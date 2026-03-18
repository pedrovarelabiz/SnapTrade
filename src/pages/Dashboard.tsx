import { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SignalFeed } from '@/components/signals/SignalFeed';
import { SignalFilters } from '@/components/signals/SignalFilters';
import { SignalCounterBadge } from '@/components/signals/SignalCounterBadge';
import { useSignals } from '@/hooks/useSignals';
import { useAuth } from '@/hooks/useAuth';
import { Signal, SignalStatus, SignalDirection } from '@/types';
import { Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const { user } = useAuth();
  const { signals, isLoading, isConnected, updateSignalStatus } = useSignals();
  const [statusFilter, setStatusFilter] = useState<SignalStatus | 'all'>('all');
  const [directionFilter, setDirectionFilter] = useState<SignalDirection | 'all'>('all');
  const [newSignalIds, setNewSignalIds] = useState<Set<string>>(new Set());
  const prevCountRef = useRef(signals.length);

  useEffect(() => {
    if (signals.length > prevCountRef.current) {
      const newSignal = signals[0];
      if (newSignal) {
        setNewSignalIds(prev => new Set(prev).add(newSignal.id));
        toast(`New Signal: ${newSignal.asset} ${newSignal.direction}`, {
          description: `Confidence: ${newSignal.confidence}% | ${newSignal.timeframe}`,
        });
        setTimeout(() => {
          setNewSignalIds(prev => {
            const next = new Set(prev);
            next.delete(newSignal.id);
            return next;
          });
        }, 5000);
      }
    }
    prevCountRef.current = signals.length;
  }, [signals]);

  const filtered = signals.filter((s: Signal) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (directionFilter !== 'all' && s.direction !== directionFilter) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Live Signals</h1>
            <p className="text-sm text-[var(--st-text-secondary)]">{filtered.length} signals • Updated in real-time</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
              isConnected ? 'bg-st-call/10 text-st-call border border-st-call/30' : 'bg-st-put/10 text-st-put border border-st-put/30'
            }`}>
              {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>

        {/* Free user counter */}
        {user?.role === 'free' && (
          <SignalCounterBadge signals={signals} maxFree={3} />
        )}

        {/* Filters */}
        <SignalFilters
          statusFilter={statusFilter}
          directionFilter={directionFilter}
          onStatusChange={setStatusFilter}
          onDirectionChange={setDirectionFilter}
        />

        {/* Signal Feed */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] animate-pulse" />
            ))}
          </div>
        ) : (
          <SignalFeed signals={filtered} onUpdateStatus={updateSignalStatus} newSignalIds={newSignalIds} />
        )}
      </div>
    </DashboardLayout>
  );
}
