import { useState, useEffect } from 'react';
import { Globe, Wifi } from 'lucide-react';

export function MarketStatus() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--st-bg-card)] border border-[var(--st-border)] text-xs">
        <Globe size={11} className="text-[var(--st-text-secondary)]" />
        <span className="text-[var(--st-text-secondary)] font-mono tabular-nums">
          {timeStr} UTC
        </span>
      </div>

      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-st-call/10 border border-st-call/20 text-xs font-medium text-st-call">
        <Wifi size={10} />
        OTC Markets Open 24/7
      </span>
    </div>
  );
}