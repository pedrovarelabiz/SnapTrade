import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export function CountdownTimer({ targetTime }: { targetTime: string }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const diff = new Date(targetTime).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('NOW');
        setIsExpired(true);
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return (
    <span className={`inline-flex items-center gap-1 font-mono text-sm tabular-nums ${isExpired ? 'text-st-premium animate-pulse' : 'text-[var(--st-text-secondary)]'}`}>
      <Clock size={12} />
      {timeLeft}
    </span>
  );
}
