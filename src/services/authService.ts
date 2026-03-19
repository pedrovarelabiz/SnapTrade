import { apiGet, apiPost } from './api';
import type { User } from '../types';

// Map backend user shape to frontend User type
function mapUser(raw: Record<string, unknown>): User {
  return {
    id: raw.id as string,
    name: (raw.name as string) || (raw.email as string),
    email: raw.email as string,
    role: raw.role as User['role'],
    avatar: undefined,
    createdAt: raw.createdAt as string,
    isVerified: (raw.emailVerified as boolean) ?? false,
    subscription: raw.subscription
      ? {
          id: (raw.subscription as Record<string, unknown>).id as string,
          plan: (raw.subscription as Record<string, unknown>).plan as string as 'free' | 'premium_monthly' | 'premium_yearly',
          status: (raw.subscription as Record<string, unknown>).status as string as 'active' | 'cancelled' | 'expired' | 'trial',
          startDate: (raw.subscription as Record<string, unknown>).createdAt as string,
          endDate: (raw.subscription as Record<string, unknown>).expiresAt as string || new Date().toISOString(),
          autoRenew: true,
        }
      : undefined,
  };
}

export const authService = {
  async login(email: string, password: string): Promise<User> {
    const raw = await apiPost<Record<string, unknown>>('/auth/login', { email, password });
    const user = raw.user ? mapUser(raw.user as Record<string, unknown>) : mapUser(raw);
    return user;
  },

  async register(name: string, email: string, password: string): Promise<User> {
    const raw = await apiPost<Record<string, unknown>>('/auth/register', { name, email, password });
    const user = raw.user ? mapUser(raw.user as Record<string, unknown>) : mapUser(raw);
    return user;
  },

  async logout(): Promise<void> {
    await apiPost<void>('/auth/logout');
  },

  async getMe(): Promise<User | null> {
    try {
      const raw = await apiGet<Record<string, unknown>>('/auth/me');
      return mapUser(raw);
    } catch {
      return null;
    }
  },

  async verifyEmail(token: string): Promise<boolean> {
    try {
      await apiPost('/auth/verify-email', { token });
      return true;
    } catch {
      return false;
    }
  },

  async forgotPassword(email: string): Promise<boolean> {
    try {
      await apiPost('/auth/forgot-password', { email });
      return true;
    } catch {
      return false;
    }
  },

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    try {
      await apiPost('/auth/reset-password', { token, password: newPassword });
      return true;
    } catch {
      return false;
    }
  },

  // Keep switchRole for dev mode only - returns a mock user with the given role
  switchRole(role: 'free' | 'premium' | 'admin'): User {
    return {
      id: 'dev-user',
      name: `Dev ${role}`,
      email: `${role}@snaptrade.io`,
      role,
      createdAt: new Date().toISOString(),
      isVerified: true,
    };
  },
};
