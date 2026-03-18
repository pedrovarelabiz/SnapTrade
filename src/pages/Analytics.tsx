import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCards } from '@/components/analytics/StatsCards';
import { WinRateChart } from '@/components/analytics/WinRateChart';
import { AssetPerformanceChart } from '@/components/analytics/AssetPerformance';
import { HourlyDistribution } from '@/components/analytics/HourlyDistribution';
import { PnlCurve } from '@/components/analytics/PnlCurve';
import { LockedChartOverlay } from '@/components/analytics/LockedChartOverlay';
import { useStatsOverview, useAssetPerformance, useHourlyData, usePnlCurve, useWinRateHistory } from '@/hooks/useStats';
import { useAuth } from '@/hooks/useAuth';

export default function Analytics() {
  const { user } = useAuth();
  const { data: overview } = useStatsOverview();
  const { data: assets } = useAssetPerformance();
  const { data: hourly } = useHourlyData();
  const { data: pnl } = usePnlCurve();
  const { data: winRate } = useWinRateHistory();
  const isFree = user?.role === 'free';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-[var(--st-text-secondary)]">Track your signal performance and trading insights</p>
        </div>

        {overview && <StatsCards stats={overview} />}

        <div className="grid lg:grid-cols-2 gap-6">
          {winRate && (
            isFree ? (
              <LockedChartOverlay><WinRateChart data={winRate} /></LockedChartOverlay>
            ) : (
              <WinRateChart data={winRate} />
            )
          )}

          {assets && (
            isFree ? (
              <LockedChartOverlay><AssetPerformanceChart data={assets} /></LockedChartOverlay>
            ) : (
              <AssetPerformanceChart data={assets} />
            )
          )}

          {hourly && (
            isFree ? (
              <LockedChartOverlay><HourlyDistribution data={hourly} /></LockedChartOverlay>
            ) : (
              <HourlyDistribution data={hourly} />
            )
          )}

          {pnl && (
            isFree ? (
              <LockedChartOverlay><PnlCurve data={pnl} /></LockedChartOverlay>
            ) : (
              <PnlCurve data={pnl} />
            )
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
