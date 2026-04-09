import { Signal } from '@/types';
import { getResultLabel, formatPnl } from '@/lib/pnlCalculator';
import { Zap, TrendingUp, AlertTriangle } from 'lucide-react';

interface Props {
  signal: Signal;
}

export function PnlBadge({ signal }: Props) {
  if (!signal.resultType || signal.resultGaleLevel === undefined) return null;

  const label = getResultLabel(signal.resultType, signal.resultGaleLevel);
  const pnl = signal.pnl?.netPnl;
  const isDirectWin = signal.resultType === 'direct_victory';
  const isGaleWin = signal.resultType === 'victory_at_gale';
  const isWin = signal.resultType !== 'loss';

  const labelColor = isDirectWin ? 'text-st-call' : isGaleWin ? 'text-st-premium' : 'text-st-put';
  const labelBg = isDirectWin ? 'bg-st-call/10 border-st-call/25' : isGaleWin ? 'bg-st-premium/10 border-st-premium/25' : 'bg-st-put/10 border-st-put/25';
  const LabelIcon = isDirectWin ? Zap : isGaleWin ? TrendingUp : AlertTriangle;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${labelBg} ${labelColor}`}>
        <LabelIcon size={9} />
        {label}
      </span>
      {pnl !== undefined && (
        <span className={`text-xs font-bold tabular-nums ${isWin ? 'text-st-call' : 'text-st-put'}`}>
          {formatPnl(pnl)}
        </span>
      )}
    </div>
  );
}