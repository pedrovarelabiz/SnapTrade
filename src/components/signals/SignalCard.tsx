import { Signal } from '@/types';
import { CountdownTimer } from '@/components/shared/CountdownTimer';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { InstantBadge } from '@/components/signals/InstantBadge';
import { useAuth } from '@/hooks/useAuth';
import { TrendingUp, TrendingDown, Layers, Clock, Zap } from 'lucide-react';

interface SignalCardProps {
  signal: Signal;
  onUpdateStatus?: (id: string, status: Signal['status']) => void;
  isNew?: boolean;
}

const assetFlags: Record<string, string> = {
  'EUR/USD': '🇪🇺🇺🇸', 'GBP/JPY': '🇬🇧🇯🇵', 'USD/CHF': '🇺🇸🇨🇭', 'AUD/USD': '🇦🇺🇺🇸',
  'EUR/GBP': '🇪🇺🇬🇧', 'USD/JPY': '🇺🇸🇯🇵', 'NZD/USD': '🇳🇿🇺🇸', 'EUR/JPY': '🇪🇺🇯🇵',
  'GBP/USD': '🇬🇧🇺🇸', 'AUD/JPY': '🇦🇺🇯🇵', 'CAD/CHF': '🇨🇦🇨🇭', 'EUR/AUD': '🇪🇺🇦🇺',
  'USD/CAD': '🇺🇸🇨🇦', 'GBP/CHF': '🇬🇧🇨🇭', 'NZD/JPY': '🇳🇿🇯🇵', 'EUR/CHF': '🇪🇺🇨🇭',
  'AUD/NZD': '🇦🇺🇳🇿', 'GBP/AUD': '🇬🇧🇦🇺', 'CHF/JPY': '🇨🇭🇯🇵', 'EUR/NZD': '🇪🇺🇳🇿',
  'EUR/USD OTC': '🇪🇺🇺🇸', 'GBP/JPY OTC': '🇬🇧🇯🇵', 'USD/CHF OTC': '🇺🇸🇨🇭',
  'AUD/USD OTC': '🇦🇺🇺🇸', 'EUR/CHF OTC': '🇪🇺🇨🇭', 'EUR/JPY OTC': '🇪🇺🇯🇵',
  'USD/JPY OTC': '🇺🇸🇯🇵', 'CAD/CHF OTC': '🇨🇦🇨🇭', 'NZD/JPY OTC': '🇳🇿🇯🇵',
  'AUD/NZD OTC': '🇦🇺🇳🇿', 'EUR/NZD OTC': '🇪🇺🇳🇿', 'USD/CAD OTC': '🇺🇸🇨🇦',
  'CRYPTO IDX': '₿',
};

const dirStyles = {
  CALL: {
    borderActive: 'border-st-call/30',
    borderHover: 'hover:border-st-call/50',
    badgeBg: 'bg-st-call/10',
    badgeBorder: 'border-st-call/30',
    badgeText: 'text-st-call',
    confBg: 'bg-st-call/10',
    confText: 'text-st-call',
  },
  PUT: {
    borderActive: 'border-st-put/30',
    borderHover: 'hover:border-st-put/50',
    badgeBg: 'bg-st-put/10',
    badgeBorder: 'border-st-put/30',
    badgeText: 'text-st-put',
    confBg: 'bg-st-put/10',
    confText: 'text-st-put',
  },
} as const;

export function SignalCard({ signal, onUpdateStatus, isNew }: SignalCardProps) {
  const { user } = useAuth();
  const isCall = signal.direction === 'CALL';
  const styles = dirStyles[signal.direction];
  const isPendingOrActive = signal.status === 'pending' || signal.status === 'active';
  const isScheduled = signal.signalType === 'scheduled';
  const isOTC = signal.asset.includes('OTC');
  const hasMartingaleSchedule = signal.martingaleSchedule && signal.martingaleSchedule.length > 0;

  return (
    <div className={`rounded-xl bg-[var(--st-bg-card)] border transition-all duration-300 ${
      isNew ? 'animate-fade-up border-st-accent animate-signal-pulse' :
      isPendingOrActive ? `${styles.borderActive} ${styles.borderHover}` : 'border-[var(--st-border)]'
    }`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-lg">{assetFlags[signal.asset] || '🌐'}</span>
            <span className="text-white font-semibold text-sm">{signal.asset}</span>
            {isOTC && (
              <span className="px-1.5 py-0.5 rounded-md bg-st-info/10 text-st-info text-[9px] font-bold border border-st-info/20">OTC</span>
            )}
            {signal.martingaleLevel > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-st-premium/15 text-st-premium text-[10px] font-bold border border-st-premium/30">
                <Layers size={8} />
                M{signal.martingaleLevel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isScheduled ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-st-info/10 text-st-info text-[10px] font-semibold border border-st-info/20">
                <Clock size={9} />
                Scheduled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-semibold border border-amber-500/20">
                <Zap size={9} />
                Instant
              </span>
            )}
            <StatusBadge status={signal.status} />
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${styles.badgeBg} border ${styles.badgeBorder}`}>
            {isCall ? <TrendingUp size={16} className={styles.badgeText} /> : <TrendingDown size={16} className={styles.badgeText} />}
            <span className={`${styles.badgeText} font-bold text-sm`}>{signal.direction}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-md bg-[var(--st-bg-elevated)] text-[var(--st-text-secondary)] font-mono">{signal.timeframe}</span>
            <span className={`px-2 py-1 rounded-md ${styles.confBg} ${styles.confText} font-semibold`}>{signal.confidence}%</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            {isPendingOrActive && isScheduled && <CountdownTimer targetTime={signal.entryTime} />}
            {isPendingOrActive && !isScheduled && <InstantBadge createdAt={signal.createdAt} />}
            {!isPendingOrActive && (
              <span className="text-xs text-[var(--st-text-secondary)]">
                {new Date(signal.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {isScheduled && hasMartingaleSchedule && (
              <div className="flex items-center gap-2 flex-wrap">
                {signal.martingaleSchedule!.map((step) => (
                  <span key={step.level} className="text-[10px] text-[var(--st-text-secondary)] font-mono">
                    Gale {step.level} @ {step.time}
                  </span>
                ))}
              </div>
            )}
          </div>

          {user?.role === 'admin' && isPendingOrActive && onUpdateStatus && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => onUpdateStatus(signal.id, 'win')} className="px-2.5 py-1 rounded-lg bg-st-call/10 text-st-call text-xs font-semibold hover:bg-st-call/20 transition-colors">WIN</button>
              <button onClick={() => onUpdateStatus(signal.id, 'loss')} className="px-2.5 py-1 rounded-lg bg-st-put/10 text-st-put text-xs font-semibold hover:bg-st-put/20 transition-colors">LOSS</button>
              <button onClick={() => onUpdateStatus(signal.id, 'skipped')} className="px-2.5 py-1 rounded-lg bg-[var(--st-border)]/50 text-[var(--st-text-secondary)] text-xs font-semibold hover:bg-[var(--st-border)] transition-colors">SKIP</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}