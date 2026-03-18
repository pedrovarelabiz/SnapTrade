import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AdminOverviewCards } from '@/components/admin/AdminOverviewCards';
import { RevenueStatsPanel } from '@/components/admin/RevenueStats';
import { RecentActivityFeed } from '@/components/admin/RecentActivityFeed';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { useSignals } from '@/hooks/useSignals';
import { Shield } from 'lucide-react';

export default function AdminOverview() {
  const { data: revenueStats } = useQuery({ queryKey: ['admin', 'revenue'], queryFn: adminService.getRevenueStats });
  const { data: users = [] } = useQuery({ queryKey: ['admin', 'users'], queryFn: adminService.getUsers });
  const { signals } = useSignals();

  const today = new Date().toDateString();
  const todaySignals = signals.filter(s => new Date(s.createdAt).toDateString() === today).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-st-put/10 flex items-center justify-center">
            <Shield size={18} className="text-st-put" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-sm text-[var(--st-text-secondary)]">Platform overview and key metrics</p>
          </div>
        </div>

        {revenueStats && (
          <AdminOverviewCards
            revenueStats={revenueStats}
            users={users}
            totalSignalsToday={todaySignals}
          />
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {revenueStats && <RevenueStatsPanel stats={revenueStats} />}
          </div>
          <div>
            <RecentActivityFeed users={users} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}