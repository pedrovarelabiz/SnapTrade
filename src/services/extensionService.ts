import { ExtensionConfig } from '@/types';

const defaultConfig: ExtensionConfig = {
  defaultAmount: 10,
  autoTrade: false,
  enabledPairs: ['EUR/USD', 'GBP/JPY', 'USD/CHF'],
  maxMartingale: 2,
  soundAlerts: true,
  token: 'st_ext_a1b2c3d4e5f6g7h8i9j0',
  isConnected: false,
};

export const extensionService = {
  async getExtensionConfig(): Promise<ExtensionConfig> {
    await new Promise(r => setTimeout(r, 300));
    return { ...defaultConfig };
  },

  async updateExtensionConfig(updates: Partial<ExtensionConfig>): Promise<ExtensionConfig> {
    await new Promise(r => setTimeout(r, 300));
    Object.assign(defaultConfig, updates);
    return { ...defaultConfig };
  },

  async generateToken(): Promise<string> {
    await new Promise(r => setTimeout(r, 500));
    const token = `st_ext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    defaultConfig.token = token;
    return token;
  },
};
