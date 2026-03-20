import { Signal, ResultType, Timeframe } from '@/types';

export function parseResultMessage(rawText: string): { type: ResultType } | null {
  const normalized = rawText.toUpperCase().trim();
  if (normalized.includes('DIRECT VICTORY') || normalized.includes('VITÓRIA DIRETA')) {
    return { type: 'direct_victory' };
  }
  if (normalized.includes('VICTORY AT GALE') || normalized.includes('VITÓRIA NO GALE')) {
    return { type: 'victory_at_gale' };
  }
  if (normalized.includes('LOSS') || normalized.includes('PERDA') || normalized.includes('❌')) {
    return { type: 'loss' };
  }
  return null;
}

function getExpirationMinutes(timeframe: Timeframe): number {
  const map: Record<Timeframe, number> = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60 };
  return map[timeframe];
}

export function calculateGaleLevel(
  entryTime: Date, resultTime: Date, timeframe: Timeframe
): number {
  const deltaMinutes = (resultTime.getTime() - entryTime.getTime()) / (1000 * 60);
  const level = Math.round(deltaMinutes / getExpirationMinutes(timeframe)) - 1;
  return Math.max(0, Math.min(level, 2));
}

export function matchResultToSignal(
  resultMessage: { text: string; timestamp: Date },
  activeSignals: Signal[]
): { signalId: string; galeLevel: number; resultType: ResultType } | null {
  const parsed = parseResultMessage(resultMessage.text);
  if (!parsed) return null;

  const TOLERANCE_MS = 90 * 1000;
  let bestMatch: { signalId: string; galeLevel: number; delta: number } | null = null;

  for (const signal of activeSignals) {
    if (signal.status !== 'active' && signal.status !== 'pending') continue;
    const entryTime = new Date(signal.entryTime);
    const expirationMs = getExpirationMinutes(signal.timeframe) * 60 * 1000;

    for (let gale = 0; gale <= 2; gale++) {
      const expected = new Date(entryTime.getTime() + (gale + 1) * expirationMs);
      const delta = Math.abs(resultMessage.timestamp.getTime() - expected.getTime());
      if (delta <= TOLERANCE_MS && (!bestMatch || delta < bestMatch.delta)) {
        bestMatch = { signalId: signal.id, galeLevel: gale, delta };
      }
    }
  }

  if (!bestMatch) return null;
  return { signalId: bestMatch.signalId, galeLevel: bestMatch.galeLevel, resultType: parsed.type };
}