import { useQuery } from '@tanstack/react-query';
import { statsService } from '@/services/statsService';

export function useStatsOverview() {
  return useQuery({ queryKey: ['stats', 'overview'], queryFn: statsService.getOverview });
}

export function useAssetPerformance() {
  return useQuery({ queryKey: ['stats', 'assets'], queryFn: statsService.getByAsset });
}

export function useHourlyData() {
  return useQuery({ queryKey: ['stats', 'hourly'], queryFn: statsService.getByHour });
}

export function usePnlCurve() {
  return useQuery({ queryKey: ['stats', 'pnl'], queryFn: statsService.getPnlCurve });
}

export function useWinRateHistory() {
  return useQuery({ queryKey: ['stats', 'winrate'], queryFn: statsService.getWinRateHistory });
}
