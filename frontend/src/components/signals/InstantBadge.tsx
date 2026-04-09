import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';

interface Props {
  createdAt: string;
}

export function InstantBadge({ createdAt }: Props) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const validityMs = 2 * 60 * 1000;
    const update = () => {
      const elapsed = Date.now() - new Date(createdAt).getTime();
      const remaining = validityMs - elapsed;
      if (remaining <= 0) {
        setTimeLeft('EXPIRED');
        setIsExpired(true);
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--st-border)]/50 text-[var(--st-text-secondary)] text-xs font-medium">
        Validity expired
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-bold border border-amber-500/30 animate-pulse">
        <Zap size={11} />
        EXECUTE NOW
      </span>
      <span className="text-[10px] text-[var(--st-text-secondary)] font-mono tabular-nums">
        valid {timeLeft}
      </span>
    </div>
  );
}