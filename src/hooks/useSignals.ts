import { useState, useEffect, useCallback, useRef } from 'react';
import { Signal } from '@/types';
import { signalService } from '@/services/signalService';

export function useSignals() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    signalService.getSignals().then(s => {
      setSignals(s);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    setIsConnected(true);
    unsubRef.current = signalService.subscribeToSignals((newSignal) => {
      setSignals(prev => {
        const idx = prev.findIndex(s => s.id === newSignal.id);
        if (idx >= 0) {
          // Update existing signal (e.g., active->resolved)
          const updated = [...prev];
          updated[idx] = newSignal;
          return updated;
        }
        // New signal - prepend
        return [newSignal, ...prev];
      });
    });

    return () => {
      if (unsubRef.current) unsubRef.current();
      setIsConnected(false);
    };
  }, []);

  const updateSignalStatus = useCallback(async (signalId: string, status: Signal['status']) => {
    const updated = await signalService.updateSignalResult(signalId, status);
    if (updated) {
      setSignals(prev => prev.map(s => s.id === signalId ? { ...s, ...updated } : s));
    }
  }, []);

  return { signals, isLoading, isConnected, updateSignalStatus };
}
