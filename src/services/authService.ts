import { User } from '@/types';
import { defaultFreeUser, defaultPremiumUser, defaultAdminUser } from '@/data/mockUsers';

const STORAGE_KEY = 'snaptrade_user';

function getStoredUser(): User | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch { return null; }
  }
  return null;
}

function storeUser(user: User | null) {
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export const authService = {
  async login(email: string, _password: string): Promise<User> {
    await new Promise(r => setTimeout(r, 800));
    if (email === 'admin@snaptrade.io') {
      storeUser(defaultAdminUser);
      return defaultAdminUser;
    }
    if (email === 'premium@snaptrade.io') {
      storeUser(defaultPremiumUser);
      return defaultPremiumUser;
    }
    const user = { ...defaultFreeUser, email, name: email.split('@')[0] };
    storeUser(user);
    return user;
  },

  async register(name: string, email: string, _password: string): Promise<User> {
    await new Promise(r => setTimeout(r, 800));
    const user: User = {
      id: `u${Date.now()}`,
      name,
      email,
      role: 'free',
      createdAt: new Date().toISOString(),
      isVerified: false,
      subscription: {
        id: `sub${Date.now()}`,
        plan: 'free',
        status: 'active',
        startDate: new Date().toISOString(),
        endDate: '2099-12-31T23:59:59Z',
        autoRenew: false,
      },
    };
    storeUser(user);
    return user;
  },

  async logout(): Promise<void> {
    await new Promise(r => setTimeout(r, 300));
    storeUser(null);
  },

  async getMe(): Promise<User | null> {
    await new Promise(r => setTimeout(r, 300));
    return getStoredUser();
  },

  async verifyEmail(_token: string): Promise<boolean> {
    await new Promise(r => setTimeout(r, 500));
    const user = getStoredUser();
    if (user) {
      user.isVerified = true;
      storeUser(user);
    }
    return true;
  },

  async forgotPassword(_email: string): Promise<boolean> {
    await new Promise(r => setTimeout(r, 500));
    return true;
  },

  async resetPassword(_token: string, _newPassword: string): Promise<boolean> {
    await new Promise(r => setTimeout(r, 500));
    return true;
  },

  switchRole(role: User['role']): User {
    const roleMap = { free: defaultFreeUser, premium: defaultPremiumUser, admin: defaultAdminUser };
    const user = { ...roleMap[role] };
    storeUser(user);
    return user;
  },
};
