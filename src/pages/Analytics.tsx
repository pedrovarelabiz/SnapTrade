import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCards } from '@/components/analytics/StatsCards';
import { WinRateChart } from '@/components/analytics/WinRateChart';
import { AssetPerformanceChart } from '@/components/analytics/AssetPerformance';
import { AssetPerformanceTable } from '@/components/analytics/AssetPerformanceTable';
import { HourlyDistribution } from '@/components/analytics/HourlyDistribution';
import { PnlCurve } from '@/components/analytics/PnlCurve';
import { LockedChartOverlay } from '@/components/analytics/LockedChartOverlay';
import { DateRangeFilter, DateRange } from '@/components/shared/DateRangeFilter';
import { StatsSkeletonGrid } from '@/components/shared/StatsSkeletonGrid';
import { ChartSkeleton } from '@/components/shared/ChartSkeleton';
import { useStatsOverview, useAssetPerformance, useHourlyData, usePnlCurve, useWinRateHistory } from '@/hooks/useStats';
import { useAuth } from '@/hooks/useAuth';

function getDaysForRange(range: DateRange): number {
  switch (range) {
    case '7d': return 7;
    case '30d': return 30;
    case '90d': return 90;
    case 'all': return Infinity;
  }
}

export default function Analytics() {
  const { user } = useAuth();
  const { data: overview, isLoading: overviewLoading } = useStatsOverview();
  const { data: assets, isLoading: assetsLoading } = useAssetPerformance();
  const { data: hourly, isLoading: hourlyLoading } = useHourlyData();
  const { data: pnl, isLoading: pnlLoading } = usePnlCurve();
  const { data: winRate, isLoading: winRateLoading } = useWinRateHistory();
  const isFree = user?.role === 'free';
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  const filteredPnl = useMemo(() => {
    if (!pnl) return undefined;
    const days = getDaysForRange(dateRange);
    if (days === Infinity) return pnl;
    return pnl.slice(-days);
  }, [pnl, dateRange]);

  const filteredWinRate = useMemo(() => {
    if (!winRate) return undefined;
    const days = getDaysForRange(dateRange);
    if (days === Infinity) return winRate;
    return winRate.slice(-days);
  }, [winRate, dateRange]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Analytics</h1>
            <p className="text-sm text-[var(--st-text-secondary)]">Track your signal performance and trading insights</p>
          </div>
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
        </div>

        {/* Stats Overview */}
        {overviewLoading ? <StatsSkeletonGrid /> : overview && <StatsCards stats={overview} />}

        {/* Charts Grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          {winRateLoading ? (
            <ChartSkeleton />
          ) : filteredWinRate ? (
            isFree ? (
              <LockedChartOverlay><WinRateChart data={filteredWinRate} /></LockedChartOverlay>
            ) : (
              <WinRateChart data={filteredWinRate} />
            )
          ) : null}

          {assetsLoading ? (
            <ChartSkeleton />
          ) : assets ? (
            isFree ? (
              <LockedChartOverlay><AssetPerformanceChart data={assets} /></LockedChartOverlay>
            ) : (
              <AssetPerformanceChart data={assets} />
            )
          ) : null}

          {hourlyLoading ? (
            <ChartSkeleton />
          ) : hourly ? (
            isFree ? (
              <LockedChartOverlay><HourlyDistribution data={hourly} /></LockedChartOverlay>
            ) : (
              <HourlyDistribution data={hourly} />
            )
          ) : null}

          {pnlLoading ? (
            <ChartSkeleton />
          ) : filteredPnl ? (
            isFree ? (
              <LockedChartOverlay><PnlCurve data={filteredPnl} /></LockedChartOverlay>
            ) : (
              <PnlCurve data={filteredPnl} />
            )
          ) : null}
        </div>

        {/* Asset Performance Table */}
        {assetsLoading ? (
          <div className="h-64 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] animate-pulse" />
        ) : assets ? (
          isFree ? (
            <LockedChartOverlay><AssetPerformanceTable data={assets} /></LockedChartOverlay>
          ) : (
            <AssetPerformanceTable data={assets} />
          )
        ) : null}
      </div>
    </DashboardLayout>
  );
}