import { useState, useEffect, useCallback, useRef } from 'react';
import type { ExtensionStatus } from '../../types';
import { MAX_STATUS_RETRY } from '../../lib/constants';

export function useStatus() {
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const retryCount = useRef(0);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      if (response && typeof response === 'object' && 'isConnected' in response) {
        setStatus(response as ExtensionStatus);
        setIsLoading(false);
        retryCount.current = 0;
      }
    } catch {
      retryCount.current++;
      if (retryCount.current < MAX_STATUS_RETRY) {
        setTimeout(() => fetchStatus(), 1000 * retryCount.current);
      } else {
        setIsLoading(false); // give up
      }
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);

    const listener = (msg: { type: string; status?: ExtensionStatus }): void => {
      if (msg.type === 'STATUS_UPDATE' && msg.status) {
        setStatus(msg.status);
        setIsLoading(false);
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [fetchStatus]);

  return { status, isLoading };
}
