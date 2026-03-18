import { tickerResults } from '@/data/mockYesterdayResults';

export function ResultsTicker() {
  const items = [...tickerResults, ...tickerResults];

  return (
    <div className="w-full overflow-hidden bg-[var(--st-bg-card)]/80 border-y border-[var(--st-border)] py-2.5">
      <div className="flex animate-ticker whitespace-nowrap">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 mx-4 text-xs font-medium flex-shrink-0">
            <span className={item.result === 'win' ? 'text-st-call' : 'text-st-put'}>
              {item.result === 'win' ? '✅' : '❌'}
            </span>
            <span className="text-[var(--st-text-primary)]">{item.asset}</span>
            <span className={`font-semibold ${item.direction === 'CALL' ? 'text-st-call' : 'text-st-put'}`}>
              {item.direction}
            </span>
            <span className={`font-mono ${item.result === 'win' ? 'text-st-call' : 'text-st-put'}`}>
              {item.pnl}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}