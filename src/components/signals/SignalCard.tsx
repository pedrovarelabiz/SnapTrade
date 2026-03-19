import { Signal } from '@/types';
import { CountdownTimer } from '@/components/shared/CountdownTimer';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { InstantBadge } from '@/components/signals/InstantBadge';
import { PnlBadge } from '@/components/signals/PnlBadge';
import { PnlTooltip } from '@/components/signals/PnlTooltip';
import { useAuth } from '@/hooks/useAuth';
import { getAssetFlag } from '@/lib/assetFlags';
import { TrendingUp, TrendingDown, Layers, Clock, Zap } from 'lucide-react';

interface SignalCardProps {
  signal: Signal;
  onUpdateStatus?: (id: string, status: Signal['status']) => void;
  isNew?: boolean;
  onClick?: () => void;
}

const dirStyles = {
  CALL: { borderActive: 'border-st-call/30', borderHover: 'hover:border-st-call/50', badgeBg: 'bg-st-call/10', badgeBorder: 'border-st-call/30', badgeText: 'text-st-call', confBg: 'bg-st-call/10', confText: 'text-st-call' },
  PUT: { borderActive: 'border-st-put/30', borderHover: 'hover:border-st-put/50', badgeBg: 'bg-st-put/10', badgeBorder: 'border-st-put/30', badgeText: 'text-st-put', confBg: 'bg-st-put/10', confText: 'text-st-put' },
} as const;

export function SignalCard({ signal, onUpdateStatus, isNew, onClick }: SignalCardProps) {
  const { user } = useAuth();
  const isCall = signal.direction === 'CALL';
  const styles = dirStyles[signal.direction];
  const isPendingOrActive = signal.status === 'pending' || signal.status === 'active';
  const isResolved = signal.status === 'win' || signal.status === 'loss';
  const isScheduled = signal.signalType === 'scheduled';
  const isOTC = signal.asset.includes('OTC');
  const hasMartingaleSchedule = signal.martingaleSchedule && signal.martingaleSchedule.length > 0;
  const hasResultTracking = !!signal.resultType;

  return (
    <div
      onClick={onClick}
      className={`rounded-xl bg-[var(--st-bg-card)] border transition-all duration-300 ${onClick ? 'cursor-pointer' : ''} ${
        isNew ? 'animate-fade-up border-st-accent animate-signal-pulse' :
        isPendingOrActive ? `${styles.borderActive} ${styles.borderHover}` : 'border-[var(--st-border)]'
      }`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-lg">{getAssetFlag(signal.asset)}</span>
            <span className="text-white font-semibold text-sm">{signal.asset}</span>
            {isOTC && <span className="px-1.5 py-0.5 rounded-md bg-st-info/10 text-st-info text-[9px] font-bold border border-st-info/20">OTC</span>}

          </div>
          <div className="flex items-center gap-2">
            {isScheduled ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-st-info/10 text-st-info text-[10px] font-semibold border border-st-info/20"><Clock size={9} />Scheduled</span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-semibold border border-amber-500/20"><Zap size={9} />Instant</span>
            )}
            <StatusBadge status={signal.status} />
            {signal.channel?.slug && (() => {
              const badges: Record<string, { label: string; bg: string }> = {
                tyl_vip: { label: 'TYL VIP', bg: '#2979ff' },
                tyl_trading: { label: 'TYL', bg: '#7c4dff' },
                sinais_mil: { label: 'SM', bg: '#00e676' },
                blacklist: { label: 'BL', bg: '#ff9100' },
              };
              const b = badges[signal.channel!.slug];
              return b ? (
                <span style={{ background: b.bg + '22', color: b.bg, border: `1px solid ${b.bg}44` }} className="px-1.5 py-0.5 rounded-md text-[9px] font-bold">{b.label}</span>
              ) : null;
            })()}
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${styles.badgeBg} border ${styles.badgeBorder}`}>
            {isCall ? <TrendingUp size={16} className={styles.badgeText} /> : <TrendingDown size={16} className={styles.badgeText} />}
            <span className={`${styles.badgeText} font-bold text-sm`}>{signal.direction}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-md bg-[var(--st-bg-elevated)] text-[var(--st-text-secondary)] font-mono">{signal.timeframe}</span>

          </div>
        </div>

        {/* Result tracking row */}
        {isResolved && hasResultTracking && (
          <div className="flex items-center justify-between mb-3">
            <PnlBadge signal={signal} />
            {signal.pnl && (
              <div onClick={e => e.stopPropagation()}>
                <PnlTooltip pnl={signal.pnl} />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            {isPendingOrActive && isScheduled && <CountdownTimer targetTime={signal.entryTime} />}
            {isPendingOrActive && !isScheduled && <InstantBadge createdAt={signal.createdAt} />}
            {!isPendingOrActive && (
              <span className="text-xs text-[var(--st-text-secondary)]">
                {new Date(signal.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {isScheduled && hasMartingaleSchedule && isPendingOrActive && (
              <div className="flex items-center gap-2 flex-wrap">
                {signal.martingaleSchedule!.map((step) => (
                  <span key={step.level} className="text-[10px] text-[var(--st-text-secondary)] font-mono">Gale {step.level} @ {step.time}</span>
                ))}
              </div>
            )}
          </div>

          {user?.role === 'admin' && isPendingOrActive && onUpdateStatus && (
            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
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