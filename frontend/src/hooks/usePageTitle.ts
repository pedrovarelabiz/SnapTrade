import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} — SnapTrade` : 'SnapTrade — Real-Time Trading Signals';
    return () => {
      document.title = prev;
    };
  }, [title]);
}