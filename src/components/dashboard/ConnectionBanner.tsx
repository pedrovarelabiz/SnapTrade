import { WifiOff, RefreshCw } from 'lucide-react';

interface Props {
  isConnected: boolean;
}

export function ConnectionBanner({ isConnected }: Props) {
  if (isConnected) return null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-st-put/10 border border-st-put/30 animate-fade-up">
      <WifiOff size={16} className="text-st-put flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-st-put">Connection Lost</p>
        <p className="text-xs text-st-put/70">Signal feed is disconnected. New signals won't appear until reconnected.</p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-st-put/20 text-st-put text-xs font-semibold hover:bg-st-put/30 transition-colors flex-shrink-0"
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  );
}