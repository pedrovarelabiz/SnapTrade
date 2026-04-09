import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

interface Props {
  isConnected: boolean;
}

export function ConnectionBanner({ isConnected }: Props) {
  const [countdown, setCountdown] = useState(30);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    if (isConnected) {
      setCountdown(30);
      setIsReconnecting(false);
      return;
    }

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Auto-reconnect attempt
          setIsReconnecting(true);
          setTimeout(() => {
            window.location.reload();
          }, 500);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isConnected]);

  if (isConnected) return null;

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-st-put/8 border border-st-put/25 animate-fade-up">
      <div className="w-10 h-10 rounded-xl bg-st-put/15 flex items-center justify-center flex-shrink-0">
        <WifiOff size={18} className="text-st-put" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-st-put">Signal Feed Disconnected</p>
        <p className="text-xs text-st-put/70 mt-0.5">
          {isReconnecting
            ? 'Reconnecting...'
            : `New signals won't appear until reconnected. Auto-retry in ${countdown}s.`
          }
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        disabled={isReconnecting}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-st-put/15 border border-st-put/30 text-st-put text-xs font-semibold hover:bg-st-put/25 transition-colors flex-shrink-0 disabled:opacity-50"
      >
        <RefreshCw size={12} className={isReconnecting ? 'animate-spin' : ''} />
        {isReconnecting ? 'Retrying...' : 'Reconnect'}
      </button>
    </div>
  );
}