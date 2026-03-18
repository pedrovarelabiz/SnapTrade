import { Signal, SignalStatus } from '@/types';
import { mockSignals, generateRandomSignal } from '@/data/mockSignals';

export const signalService = {
  async getSignals(): Promise<Signal[]> {
    await new Promise(r => setTimeout(r, 500));
    return [...mockSignals];
  },

  subscribeToSignals(onNewSignal: (signal: Signal) => void): () => void {
    const interval = setInterval(() => {
      const signal = generateRandomSignal();
      onNewSignal(signal);
    }, Math.random() * 15000 + 15000);

    return () => clearInterval(interval);
  },

  async updateSignalResult(signalId: string, status: SignalStatus): Promise<Signal | null> {
    await new Promise(r => setTimeout(r, 300));
    const signal = mockSignals.find(s => s.id === signalId);
    if (signal) {
      signal.status = status;
      if (status === 'win' || status === 'loss') signal.result = status;
      return { ...signal };
    }
    return null;
  },
};
