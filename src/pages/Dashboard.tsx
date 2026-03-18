import { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SignalFeed } from '@/components/signals/SignalFeed';
import { SignalFilters } from '@/components/signals/SignalFilters';
import { SignalCounterBadge } from '@/components/signals/SignalCounterBadge';
import { ScrollToTopButton } from '@/components/signals/ScrollToTopButton';
import { WelcomeBanner } from '@/components/dashboard/WelcomeBanner';
import { TodayStats } from '@/components/dashboard/TodayStats';
import { LiveIndicator } from '@/components/dashboard/LiveIndicator';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { NewSignalToast } from '@/components/signals/NewSignalToast';
import { useSignals } from '@/hooks/useSignals';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { Signal, SignalStatus, SignalDirection } from '@/types';
import { Zap } from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const { user } = useAuth();
  const { signals, isLoading, isConnected, updateSignalStatus } = useSignals();
  const { playNewSignalSound } = useNotificationSound();
  const [statusFilter, setStatusFilter] = useState<SignalStatus | 'all'>('all');
  const [directionFilter, setDirectionFilter] = useState<SignalDirection | 'all'>('all');
  const [newSignalIds, setNewSignalIds] = useState<Set<string>>(new Set());
  const [unseenCount, setUnseenCount] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const prevCountRef = useRef(signals.length);
  const feedTopRef = useRef<HTMLDivElement>(null);
  const isNearTopRef = useRef(true);

  // Track scroll position
  useEffect(() => {
    const handleScroll = () => {
      isNearTopRef.current = window.scrollY < 400;
      if (isNearTopRef.current && unseenCount > 0) {
        setUnseenCount(0);
        setShowScrollTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [unseenCount]);

  useEffect(() => {
    if (signals.length > prevCountRef.current) {
      const newSignal = signals[0];
      if (newSignal) {
        setNewSignalIds(prev => new Set(prev).add(newSignal.id));

        // Play sound
        playNewSignalSound();

        // Show rich toast
        toast.custom(() => <NewSignalToast signal={newSignal} />, {
          duration: 5000,
          position: 'top-right',
        });

        // If user scrolled down, show "scroll to top" button
        if (!isNearTopRef.current) {
          setUnseenCount(prev => prev + 1);
          setShowScrollTop(true);
        }

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
  }, [signals, playNewSignalSound]);

  const handleScrollToTop = useCallback(() => {
    feedTopRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnseenCount(0);
    setShowScrollTop(false);
  }, []);

  const filtered = signals.filter((s: Signal) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (directionFilter !== 'all' && s.direction !== directionFilter) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Welcome Banner */}
        <WelcomeBanner />

        {/* Today's Stats */}
        <TodayStats signals={signals} />

        {/* Header Row */}
        <div ref={feedTopRef} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Live Signals</h1>
            <div className="mt-1">
              <QuickActions signals={signals} />
            </div>
          </div>
          <LiveIndicator isConnected={isConnected} signalCount={filtered.length} />
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--st-bg-card)] border border-[var(--st-border)] flex items-center justify-center mb-4">
              <Zap size={28} className="text-[var(--st-text-secondary)]" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No Signals Match</h3>
            <p className="text-sm text-[var(--st-text-secondary)] max-w-sm">
              No signals match your current filters. Try adjusting the status or direction filters above.
            </p>
          </div>
        ) : (
          <SignalFeed signals={filtered} onUpdateStatus={updateSignalStatus} newSignalIds={newSignalIds} />
        )}

        {/* Scroll to top for new signals */}
        <ScrollToTopButton show={showScrollTop} count={unseenCount} onClick={handleScrollToTop} />
      </div>
    </DashboardLayout>
  );
}