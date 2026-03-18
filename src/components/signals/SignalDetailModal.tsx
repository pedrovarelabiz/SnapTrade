import { Signal } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { CountdownTimer } from '@/components/shared/CountdownTimer';
import { InstantBadge } from '@/components/signals/InstantBadge';
import { PnlBadge } from '@/components/signals/PnlBadge';
import { getAssetFlag } from '@/lib/assetFlags';
import { formatPnl } from '@/lib/pnlCalculator';
import {
  TrendingUp, TrendingDown, Clock, Zap, Layers, Copy, CheckCircle,
  BarChart3, Target, Calendar, DollarSign,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface Props {
  signal: Signal | null;
  open: boolean;
  onClose: () => void;
}

export function SignalDetailModal({ signal, open, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!signal) return null;

  const isCall = signal.direction === 'CALL';
  const isPendingOrActive = signal.status === 'pending' || signal.status === 'active';
  const isScheduled = signal.signalType === 'scheduled';
  const isOTC = signal.asset.includes('OTC');
  const hasMartingale = signal.martingaleSchedule && signal.martingaleSchedule.length > 0;
  const hasResultTracking = !!signal.resultType;
  const hasPnl = !!signal.pnl;

  const entryDate = new Date(signal.entryTime);
  const createdDate = new Date(signal.createdAt);

  const handleCopy = () => {
    const text = [
      `📊 ${signal.asset}`,
      `${isCall ? '🟢 CALL ↑' : '🔴 PUT ↓'}`,
      `⏰ Entry: ${entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} UTC`,
      `📈 Timeframe: ${signal.timeframe}`,
      `🎯 Confidence: ${signal.confidence}%`,
      `📋 Type: ${isScheduled ? 'Scheduled' : 'Instant'}`,
      hasMartingale ? `🔄 Martingale: ${signal.martingaleSchedule!.map(s => `G${s.level} @ ${s.time}`).join(', ')}` : '',
      hasResultTracking ? `📊 Result: ${signal.resultType === 'direct_victory' ? 'Direct Win' : signal.resultType === 'victory_at_gale' ? `Win @ Gale ${signal.resultGaleLevel}` : 'Loss'}` : '',
      hasPnl ? `💰 P&L: ${formatPnl(signal.pnl!.netPnl)}` : '',
      '',
      '— SnapTrade Signal',
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Signal copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--st-bg-card)] border-[var(--st-border)] text-white max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getAssetFlag(signal.asset)}</span>
              <div>
                <DialogTitle className="text-white text-lg flex items-center gap-2">
                  {signal.asset}
                  {isOTC && (
                    <span className="px-1.5 py-0.5 rounded-md bg-st-info/10 text-st-info text-[9px] font-bold border border-st-info/20">OTC</span>
                  )}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge status={signal.status} />
                  {isScheduled ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-st-info">
                      <Clock size={9} /> Scheduled
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
                      <Zap size={9} /> Instant
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleCopy}
              className={`p-2.5 rounded-xl transition-all ${
                copied
                  ? 'bg-st-call/15 text-st-call'
                  : 'bg-[var(--st-bg-elevated)] text-[var(--st-text-secondary)] hover:text-white border border-[var(--st-border)]'
              }`}
            >
              {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </DialogHeader>

        {/* Direction Banner */}
        <div className={`flex items-center justify-center gap-3 py-4 rounded-xl ${
          isCall ? 'bg-st-call/10 border border-st-call/20' : 'bg-st-put/10 border border-st-put/20'
        }`}>
          {isCall ? <TrendingUp size={28} className="text-st-call" /> : <TrendingDown size={28} className="text-st-put" />}
          <span className={`text-3xl font-bold ${isCall ? 'text-st-call' : 'text-st-put'}`}>
            {signal.direction}
          </span>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={12} className="text-[var(--st-text-secondary)]" />
              <span className="text-[10px] text-[var(--st-text-secondary)]">Entry Time</span>
            </div>
            <p className="text-sm font-semibold text-white font-mono">
              {entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart3 size={12} className="text-[var(--st-text-secondary)]" />
              <span className="text-[10px] text-[var(--st-text-secondary)]">Timeframe</span>
            </div>
            <p className="text-sm font-semibold text-white font-mono">{signal.timeframe}</p>
          </div>

          <div className="p-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <div className="flex items-center gap-1.5 mb-1">
              <Target size={12} className="text-[var(--st-text-secondary)]" />
              <span className="text-[10px] text-[var(--st-text-secondary)]">Confidence</span>
            </div>
            <p className={`text-sm font-semibold font-mono ${
              signal.confidence >= 80 ? 'text-st-call' : signal.confidence >= 70 ? 'text-st-premium' : 'text-st-info'
            }`}>
              {signal.confidence}%
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar size={12} className="text-[var(--st-text-secondary)]" />
              <span className="text-[10px] text-[var(--st-text-secondary)]">Created</span>
            </div>
            <p className="text-sm font-semibold text-white font-mono">
              {createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </p>
          </div>
        </div>

        {/* Countdown / Status */}
        {isPendingOrActive && (
          <div className="p-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            {isScheduled ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--st-text-secondary)]">Time to entry</span>
                <CountdownTimer targetTime={signal.entryTime} />
              </div>
            ) : (
              <InstantBadge createdAt={signal.createdAt} />
            )}
          </div>
        )}

        {/* Martingale Schedule */}
        {hasMartingale && (
          <div className="p-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <div className="flex items-center gap-1.5 mb-2">
              <Layers size={12} className="text-st-premium" />
              <span className="text-xs font-semibold text-white">Martingale Schedule</span>
            </div>
            <div className="space-y-1.5">
              {signal.martingaleSchedule!.map(step => (
                <div key={step.level} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[var(--st-bg-card)]">
                  <span className="text-xs text-[var(--st-text-secondary)]">
                    Gale {step.level}
                  </span>
                  <span className="text-xs font-mono text-st-premium font-semibold">
                    {step.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {signal.result && (
          <div className={`p-4 rounded-xl text-center ${
            signal.result === 'win'
              ? 'bg-st-call/10 border border-st-call/20'
              : 'bg-st-put/10 border border-st-put/20'
          }`}>
            <span className={`text-lg font-bold ${signal.result === 'win' ? 'text-st-call' : 'text-st-put'}`}>
              {signal.result === 'win' ? '✅ WIN' : '❌ LOSS'}
            </span>
            {hasResultTracking && (
              <div className="mt-2">
                <PnlBadge signal={signal} />
              </div>
            )}
          </div>
        )}

        {/* P&L Breakdown */}
        {hasPnl && (
          <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <div className="flex items-center gap-1.5 mb-3">
              <DollarSign size={12} className="text-st-premium" />
              <span className="text-xs font-semibold text-white">P&L Breakdown</span>
            </div>

            {/* Trade execution rows */}
            <div className="space-y-2 mb-3">
              {signal.pnl!.tradesExecuted.map((trade) => (
                <div key={trade.level} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--st-bg-card)]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--st-text-secondary)]">
                      {trade.level === 0 ? 'Initial Trade' : `Gale ${trade.level}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-white">${trade.amount.toFixed(2)}</span>
                    <span className={`text-xs font-bold ${trade.result === 'win' ? 'text-st-call' : 'text-st-put'}`}>
                      {trade.result === 'win' ? '✓ WIN' : '✗ LOSS'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="h-px bg-[var(--st-border)] mb-3" />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--st-text-secondary)]">Total Invested</span>
                <span className="text-white font-mono">${signal.pnl!.totalInvested.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--st-text-secondary)]">Total Return</span>
                <span className="text-white font-mono">${signal.pnl!.totalReturn.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--st-text-secondary)]">Payout Rate</span>
                <span className="text-white font-mono">{(signal.pnl!.payoutRate * 100).toFixed(0)}%</span>
              </div>
              <div className="h-px bg-[var(--st-border)]" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-white font-semibold">Net P&L</span>
                <span className={`font-bold font-mono ${signal.pnl!.netPnl >= 0 ? 'text-st-call' : 'text-st-put'}`}>
                  {formatPnl(signal.pnl!.netPnl)}
                </span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}