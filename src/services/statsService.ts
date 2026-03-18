import { StatsOverview, AssetPerformance, HourlyData, PnlPoint, WinRatePoint } from '@/types';
import { mockStatsOverview, mockAssetPerformance, mockHourlyData, mockPnlData, mockWinRateData } from '@/data/mockStats';

export const statsService = {
  async getOverview(): Promise<StatsOverview> {
    await new Promise(r => setTimeout(r, 300));
    return { ...mockStatsOverview };
  },

  async getByAsset(): Promise<AssetPerformance[]> {
    await new Promise(r => setTimeout(r, 300));
    return [...mockAssetPerformance];
  },

  async getByHour(): Promise<HourlyData[]> {
    await new Promise(r => setTimeout(r, 300));
    return [...mockHourlyData];
  },

  async getPnlCurve(): Promise<PnlPoint[]> {
    await new Promise(r => setTimeout(r, 300));
    return [...mockPnlData];
  },

  async getWinRateHistory(): Promise<WinRatePoint[]> {
    await new Promise(r => setTimeout(r, 300));
    return [...mockWinRateData];
  },
};
