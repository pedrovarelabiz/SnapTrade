import { ExtensionConfig } from '@/types';

const defaultConfig: ExtensionConfig = {
  token: 'st_ext_a1b2c3d4e5f6g7h8i9j0',
  connected: false,
  executionMode: 'manual',
  acceptScheduled: true,
  acceptInstant: true,
  defaultAmount: 5,
  instantDelay: 5,
  martingaleStrategy: 'dynamic',
  maxMartingaleLevels: 2,
  fixedMultiplier: 2.0,
  autoExecuteMartingale: false,
  maxDailyTrades: 0,
  maxConsecutiveLosses: 3,
  minBalanceProtection: 10,
  maxSingleTradeAmount: 50,
  soundAlerts: true,
  browserNotifications: true,
  showOverlay: true,
  enabledPairs: [],
};

let currentConfig = { ...defaultConfig };

export const extensionService = {
  async getExtensionConfig(): Promise<ExtensionConfig> {
    await new Promise(r => setTimeout(r, 300));
    return { ...currentConfig };
  },

  async updateExtensionConfig(updates: Partial<ExtensionConfig>): Promise<ExtensionConfig> {
    await new Promise(r => setTimeout(r, 300));
    Object.assign(currentConfig, updates);
    return { ...currentConfig };
  },

  async generateToken(): Promise<string> {
    await new Promise(r => setTimeout(r, 500));
    const token = `st_ext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    currentConfig.token = token;
    return token;
  },
};