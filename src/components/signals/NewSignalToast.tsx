import { Signal } from '@/types';
import { TrendingUp, TrendingDown, Zap, Clock } from 'lucide-react';

interface Props {
  signal: Signal;
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

export function NewSignalToast({ signal }: Props) {
  const isCall = signal.direction === 'CALL';
  const isScheduled = signal.signalType === 'scheduled';

  return (
    <div className="flex items-center gap-3">
      <span className="text-xl">{assetFlags[signal.asset] || '🌐'}</span>
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