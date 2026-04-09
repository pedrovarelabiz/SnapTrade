import { apiGet } from './api';
import type { StatsOverview, AssetPerformance } from '../types';

interface HourlyData {
  hour: number;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

interface PnlPoint {
  index: number;
  date: string;
  asset: string;
  result: string;
  pnl: number;
  cumulative: number;
}

interface WinRatePoint {
  index: number;
  date: string;
  winRate: number;
}

function mapOverview(raw: Record<string, unknown>): StatsOverview {
  const resolved = (raw.resolved as number) || 0;
  const wins = (raw.wins as number) || 0;
  const losses = (raw.losses as number) || 0;
  const galeDist = (raw.galeDistribution as Record<string, number>) || { 0: 0, 1: 0, 2: 0 };

  return {
    totalSignals: resolved,
    winRate: (raw.winRate as number) || 0,
    wins,
    losses,
    currentStreak: 0,
    bestStreak: 0,
    avgSignalsPerDay: resolved > 0 ? Math.round(resolved / 365) : 0,
    totalPnl: undefined,
    avgPnlPerSignal: undefined,
    directWins: galeDist[0] || 0,
    gale1Wins: galeDist[1] || 0,
    gale2Wins: galeDist[2] || 0,
  };
}

export const statsService = {
  async getOverview(channel?: string): Promise<StatsOverview> {
    const params: Record<string, string> = {};
    if (channel) params.channel = channel;
    const raw = await apiGet<Record<string, unknown>>('/stats/overview', params);
    return mapOverview(raw);
  },

  async getByAsset(channel?: string): Promise<AssetPerformance[]> {
    const params: Record<string, string> = {};
    if (channel) params.channel = channel;
    return apiGet<AssetPerformance[]>('/stats/by-asset', params);
  },

  async getByHour(channel?: string): Promise<HourlyData[]> {
    const params: Record<string, string> = {};
    if (channel) params.channel = channel;
    return apiGet<HourlyData[]>('/stats/by-hour', params);
  },

  async getPnlCurve(channel?: string): Promise<PnlPoint[]> {
    const params: Record<string, string> = {};
    if (channel) params.channel = channel;
    return apiGet<PnlPoint[]>('/stats/pnl-curve', params);
  },

  async getWinRateHistory(channel?: string): Promise<WinRatePoint[]> {
    const params: Record<string, string> = {};
    if (channel) params.channel = channel;
    return apiGet<WinRatePoint[]>('/stats/win-rate-history', params);
  },

  async getByChannel() {
    return apiGet<Array<{
      name: string;
      slug: string;
      totalSignals: number;
      totalWins: number;
      totalLosses: number;
      winRate: string;
      maxGaleLevel: number;
    }>>('/stats/by-channel');
  },

  async getPublicSummary() {
    return apiGet<{ totalSignals: number; winRate: number; totalChannels: number }>(
      '/stats/public-summary'
    );
  },
};
