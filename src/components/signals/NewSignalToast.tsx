import { Signal } from '@/types';
import { getAssetFlag } from '@/lib/assetFlags';
import { TrendingUp, TrendingDown, Zap, Clock } from 'lucide-react';

interface Props {
  signal: Signal;
}

export function NewSignalToast({ signal }: Props) {
  const isCall = signal.direction === 'CALL';
  const isScheduled = signal.signalType === 'scheduled';

  return (
    <div className="flex items-center gap-3">
      <span className="text-xl">{getAssetFlag(signal.asset)}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{signal.asset}</span>
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
            isCall ? 'bg-st-call/20 text-st-call' : 'bg-st-put/20 text-st-put'
          }`}>
            {isCall ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
            {signal.direction}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-[var(--st-text-secondary)]">
            {isScheduled ? (
              <span className="inline-flex items-center gap-0.5"><Clock size={8} /> {signal.timeframe}</span>
            ) : (
              <span className="inline-flex items-center gap-0.5"><Zap size={8} /> Instant · {signal.timeframe}</span>
            )}
          </span>
          <span className={`text-[10px] font-semibold ${isCall ? 'text-st-call' : 'text-st-put'}`}>
            {signal.confidence}%
          </span>
        </div>
      </div>
    </div>
  );
}