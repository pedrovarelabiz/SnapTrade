import { apiGet } from './api';
import type { DailyReport } from '../types';

function mapReport(raw: Record<string, unknown>): DailyReport {
  return {
    id: raw.id as string,
    date: raw.date as string,
    totalSignals: (raw.totalSignals as number) || 0,
    wins: (raw.wins as number) || 0,
    losses: (raw.losses as number) || 0,
    skipped: 0,
    winRate: (raw.winRate as number) || 0,
    topAsset: (raw.bestAsset as string) || '',
    signals: [],
    dailyPnl: undefined,
    directWins: undefined,
    gale1Wins: undefined,
    gale2Wins: undefined,
    fullLosses: (raw.losses as number) || 0,
  };
}

export const reportService = {
  async getReports(): Promise<DailyReport[]> {
    const raw = await apiGet<Record<string, unknown>[]>('/reports');
    return raw.map(mapReport);
  },

  async getReportByDate(date: string): Promise<DailyReport | null> {
    try {
      const raw = await apiGet<Record<string, unknown>>(`/reports/${date}`);
      return mapReport(raw);
    } catch {
      return null;
    }
  },
};
