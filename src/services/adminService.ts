import { apiGet, apiPatch, apiPut, apiPost, apiDelete } from './api';
import type { User, PlatformConfig } from '../types';

interface RevenueStats {
  totalRevenue: number;
  monthlyRevenue: number;
  activeSubscriptions: number;
  churnRate: number;
  revenueByMonth: Array<{ month: string; revenue: number }>;
}

export const adminService = {
  async getUsers(params?: Record<string, string>): Promise<User[]> {
    try {
      const result = await apiGet<Record<string, unknown>[]>('/admin/users', params);
      return result.map((u) => ({
        id: u.id as string,
        name: (u.name as string) || (u.email as string),
        email: u.email as string,
        role: u.role as User['role'],
        createdAt: u.createdAt as string,
        isVerified: (u.emailVerified as boolean) ?? false,
      }));
    } catch {
      return [];
    }
  },

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    try {
      const raw = await apiPatch<Record<string, unknown>>(`/admin/users/${userId}`, updates);
      return {
        id: raw.id as string,
        name: (raw.name as string) || (raw.email as string),
        email: raw.email as string,
        role: raw.role as User['role'],
        createdAt: raw.createdAt as string,
        isVerified: (raw.emailVerified as boolean) ?? false,
      };
    } catch {
      return null;
    }
  },

  async getPlatformConfig(): Promise<PlatformConfig> {
    try {
      const configs = await apiGet<Array<{ key: string; value: string }>>('/admin/config');
      const configMap: Record<string, string> = {};
      for (const c of configs) {
        configMap[c.key] = c.value;
      }
      return {
        maxFreeSignals: parseInt(configMap.maxFreeSignals || '3'),
        signalCooldownSeconds: parseInt(configMap.signalCooldownSeconds || '60'),
        enabledAssets: (configMap.enabledAssets || '').split(',').filter(Boolean),
        maintenanceMode: configMap.maintenanceMode === 'true',
        announcementMessage: configMap.announcementMessage || '',
        minConfidence: parseInt(configMap.minConfidence || '70'),
      };
    } catch {
      return {
        maxFreeSignals: 3,
        signalCooldownSeconds: 60,
        enabledAssets: [],
        maintenanceMode: false,
        announcementMessage: '',
        minConfidence: 70,
      };
    }
  },

  async updatePlatformConfig(updates: Partial<PlatformConfig>): Promise<PlatformConfig> {
    for (const [key, value] of Object.entries(updates)) {
      await apiPut(`/admin/config/${key}`, {
        value: String(value),
        description: key,
      });
    }
    return this.getPlatformConfig();
  },

  async getRevenueStats(): Promise<RevenueStats> {
    try {
      return await apiGet<RevenueStats>('/admin/revenue-stats');
    } catch {
      return {
        totalRevenue: 0,
        monthlyRevenue: 0,
        activeSubscriptions: 0,
        churnRate: 0,
        revenueByMonth: [],
      };
    }
  },
};
