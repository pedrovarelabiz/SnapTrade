import { User, PlatformConfig, RevenueStats } from '@/types';
import { mockUsers } from '@/data/mockUsers';

const platformConfig: PlatformConfig = {
  maxFreeSignals: 3,
  signalCooldownSeconds: 60,
  enabledAssets: ['EUR/USD', 'GBP/JPY', 'USD/CHF', 'AUD/USD', 'EUR/GBP', 'USD/JPY', 'NZD/USD', 'GBP/USD'],
  maintenanceMode: false,
  announcementMessage: '',
  minConfidence: 65,
};

const revenueStats: RevenueStats = {
  mrr: 12450,
  totalRevenue: 89340,
  totalUsers: 2547,
  activeSubscriptions: 312,
  churnRate: 4.2,
  newSubscriptionsThisMonth: 28,
  revenueHistory: [
    { month: 'Jun', revenue: 8200 },
    { month: 'Jul', revenue: 9100 },
    { month: 'Aug', revenue: 9800 },
    { month: 'Sep', revenue: 10500 },
    { month: 'Oct', revenue: 11200 },
    { month: 'Nov', revenue: 12450 },
  ],
};

export const adminService = {
  async getUsers(): Promise<User[]> {
    await new Promise(r => setTimeout(r, 400));
    return [...mockUsers];
  },

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    await new Promise(r => setTimeout(r, 300));
    const user = mockUsers.find(u => u.id === userId);
    if (user) return { ...user, ...updates };
    return null;
  },

  async getPlatformConfig(): Promise<PlatformConfig> {
    await new Promise(r => setTimeout(r, 300));
    return { ...platformConfig };
  },

  async updatePlatformConfig(updates: Partial<PlatformConfig>): Promise<PlatformConfig> {
    await new Promise(r => setTimeout(r, 300));
    Object.assign(platformConfig, updates);
    return { ...platformConfig };
  },

  async getRevenueStats(): Promise<RevenueStats> {
    await new Promise(r => setTimeout(r, 400));
    return { ...revenueStats };
  },
};
