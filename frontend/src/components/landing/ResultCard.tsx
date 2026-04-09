import { YesterdayResult } from '@/data/mockYesterdayResults';
import { getAssetFlag } from '@/lib/assetFlags';
import { TrendingUp, TrendingDown, CheckCircle, XCircle, Layers } from 'lucide-react';

interface Props {
  result: YesterdayResult;
  index: number;
}

export function ResultCard({ result, index }: Props) {
  const isWin = result.result === 'win';
  const isCall = result.direction === 'CALL';
  const entryDate = new Date(result.entryTime);
  const timeStr = entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl bg-[var(--st-bg-elevated)] border-l-[3px] transition-all animate-fade-up ${
        isWin ? 'border-l-st-call' : 'border-l-st-put'
      }`}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      {/* Asset */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-base flex-shrink-0">{getAssetFlag(result.asset)}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-white truncate">{result.asset}</span>
            {result.martingaleLevel > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-st-premium/15 text-st-premium text-[9px] font-bold border border-st-premium/30">
                <Layers size={7} />
                G{result.martingaleLevel}
              </span>
            )}
          </div>
          <span className="text-[10px] text-[var(--st-text-secondary)] font-mono">{timeStr} UTC · {result.timeframe}</span>
        </div>
      </div>

      {/* Direction */}
      <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold flex-shrink-0 ${
        isCall ? 'bg-st-call/10 text-st-call border border-st-call/20' : 'bg-st-put/10 text-st-put border border-st-put/20'
      }`}>
        {isCall ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {result.direction}
      </div>

      {/* Result */}
      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold flex-shrink-0 ${
        isWin ? 'bg-st-call/15 text-st-call' : 'bg-st-put/15 text-st-put'
      }`}>
        {isWin ? <CheckCircle size={13} /> : <XCircle size={13} />}
        {isWin ? 'WIN' : 'LOSS'}
      </div>
    </div>
  );
}