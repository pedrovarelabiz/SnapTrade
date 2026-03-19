import { apiGet, apiPatch } from './api';
import type { Signal, SignalStatus } from '../types';

// Map backend signal to frontend Signal type
function mapSignal(raw: Record<string, unknown>): Signal {
  const channel = raw.channel as Record<string, unknown> | null;
  const isWin = raw.result === 'win';
  const galeLevel = (raw.galeLevel as number) ?? 0;

  let resultType: Signal['resultType'] = undefined;
  if (raw.status === 'resolved' && raw.result) {
    if (isWin && galeLevel === 0) resultType = 'direct_victory';
    else if (isWin && galeLevel > 0) resultType = 'victory_at_gale';
    else resultType = 'loss';
  }

  // Calculate P&L
  const baseAmount = 10;
  const payoutRate = 0.88;
  let pnl: Signal['pnl'] = undefined;
  if (raw.status === 'resolved' && raw.result) {
    const multiplier = 2.0;
    const tradesExecuted = [];
    const maxGale = galeLevel;
    let totalInvested = 0;
    let totalReturn = 0;

    for (let i = 0; i <= maxGale; i++) {
      const bet = baseAmount * Math.pow(multiplier, i);
      totalInvested += bet;
      if (i === galeLevel && isWin) {
        totalReturn = bet * (1 + payoutRate);
        tradesExecuted.push({ level: i, amount: bet, result: 'win' as const });
        break;
      } else {
        tradesExecuted.push({ level: i, amount: bet, result: 'loss' as const });
      }
    }
    if (!isWin) {
      totalReturn = 0;
    }

    pnl = {
      baseAmount,
      tradesExecuted,
      totalInvested,
      totalReturn,
      netPnl: totalReturn - totalInvested,
      payoutRate,
    };
  }

  // Map status: backend uses 'resolved', frontend expects 'win'/'loss'
  let mappedStatus: SignalStatus = raw.status as SignalStatus;
  if (raw.status === 'resolved') {
    mappedStatus = isWin ? 'win' : 'loss';
  }

  return {
    id: raw.id as string,
    asset: raw.asset as string,
    direction: raw.direction as Signal['direction'],
    signalType: 'scheduled',
    entryTime: raw.entryTimeUtc as string,
    timeframe: 'M5',
    martingaleLevel: galeLevel,
    martingaleSchedule: ((raw.martingaleTimes as string[]) || []).map((t, i) => ({
      level: i + 1,
      time: t,
    })),
    status: mappedStatus,
    result: raw.result as 'win' | 'loss' | undefined,
    createdAt: raw.createdAt as string,
    isPremium: raw.visibility === 'premium',
    confidence: 85,
    resultType,
    resultGaleLevel: raw.status === 'resolved' ? galeLevel : undefined,
    resultTimestamp: raw.resolvedAt as string | undefined,
    resultRawText: raw.rawText as string | undefined,
    pnl,
    // Channel info
    channel: channel
      ? { name: channel.name as string, slug: channel.slug as string }
      : undefined,
  };
}

export const signalService = {
  async getSignals(params?: Record<string, string>): Promise<Signal[]> {
    const result = await apiGet<{
      signals: Record<string, unknown>[];
      total: number;
      page: number;
      totalPages: number;
    }>('/signals', { limit: '100', ...params });
    return result.signals.map(mapSignal);
  },

  subscribeToSignals(onNewSignal: (signal: Signal) => void): () => void {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    async function connect() {
      try {
        // Get SSE token
        const { token } = await apiGet<{ token: string }>('/auth/sse-token');
        eventSource = new EventSource(`/api/signals/stream?token=${token}`);

        eventSource.onopen = () => {
          attempt = 0;
        };

        eventSource.addEventListener('signal:active', (e) => {
          try {
            const data = JSON.parse(e.data);
            onNewSignal(mapSignal(data));
          } catch { /* ignore parse errors */ }
        });

        eventSource.addEventListener('signal:result', (e) => {
          try {
            const data = JSON.parse(e.data);
            onNewSignal(mapSignal(data));
          } catch { /* ignore parse errors */ }
        });

        eventSource.onerror = () => {
          eventSource?.close();
          // Exponential backoff reconnect
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          attempt++;
          reconnectTimer = setTimeout(connect, delay);
        };
      } catch {
        // SSE token fetch failed, retry
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        attempt++;
        reconnectTimer = setTimeout(connect, delay);
      }
    }

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  },

  async updateSignalResult(signalId: string, status: SignalStatus): Promise<Signal | null> {
    try {
      const result = status === 'win' ? 'win' : status === 'loss' ? 'loss' : null;
      if (!result) return null;
      const raw = await apiPatch<Record<string, unknown>>(`/signals/${signalId}/result`, {
        result,
        galeLevel: 0,
      });
      return mapSignal(raw);
    } catch {
      return null;
    }
  },

  async getYesterdaySummary() {
    return apiGet<{
      date: string;
      total: number;
      wins: number;
      losses: number;
      winRate: number;
      byChannel?: Record<string, { total: number; wins: number; losses: number; winRate: number }>;
    }>('/signals/yesterday-summary');
  },
};
