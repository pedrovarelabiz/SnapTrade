import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { RevenueStatsPanel } from '@/components/admin/RevenueStats';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function AdminRevenue() {
  usePageTitle('Admin — Revenue');
  const { data: stats } = useQuery({ queryKey: ['admin', 'revenue'], queryFn: adminService.getRevenueStats });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Revenue Dashboard</h1>
          <p className="text-sm text-[var(--st-text-secondary)]">Financial overview and subscription metrics</p>
        </div>
        {stats && <RevenueStatsPanel stats={stats} />}
      </div>
    </DashboardLayout>
  );
}