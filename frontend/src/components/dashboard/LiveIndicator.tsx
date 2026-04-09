import { Wifi, WifiOff } from 'lucide-react';

interface Props {
  isConnected: boolean;
  signalCount: number;
}

export function LiveIndicator({ isConnected, signalCount }: Props) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
        isConnected
          ? 'bg-st-call/10 text-st-call border border-st-call/30'
          : 'bg-st-put/10 text-st-put border border-st-put/30'
      }`}>
        {isConnected ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-st-call opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-st-call" />
            </span>
            <Wifi size={12} />
            <span>Live</span>
          </>
        ) : (
          <>
            <WifiOff size={12} />
            <span>Offline</span>
          </>
        )}
      </div>
      <span className="text-xs text-[var(--st-text-secondary)] tabular-nums">
        {signalCount} signals
      </span>
    </div>
  );
}