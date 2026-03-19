import { apiGet, apiPut, apiPost } from './api';
import type { ExtensionConfig } from '../types';

const defaultConfig: ExtensionConfig = {
  token: '',
  connected: false,
  executionMode: 'manual',
  acceptScheduled: true,
  acceptInstant: true,
  defaultAmount: 10,
  instantDelay: 2,
  martingaleStrategy: 'off',
  maxMartingaleLevels: 2,
  fixedMultiplier: 2.0,
  autoExecuteMartingale: false,
  maxDailyTrades: 50,
  maxConsecutiveLosses: 3,
  minBalanceProtection: 100,
  maxSingleTradeAmount: 100,
  soundAlerts: true,
  browserNotifications: true,
  showOverlay: true,
  enabledPairs: [],
};

export const extensionService = {
  async getExtensionConfig(): Promise<ExtensionConfig> {
    try {
      const raw = await apiGet<Record<string, unknown>>('/extension/settings');
      return {
        token: (raw.token as string) || '',
        connected: (raw.connected as boolean) || false,
        executionMode: (raw.executionMode as ExtensionConfig['executionMode']) || 'manual',
        acceptScheduled: (raw.acceptScheduled as boolean) ?? true,
        acceptInstant: (raw.acceptInstant as boolean) ?? true,
        defaultAmount: (raw.defaultAmount as number) || (raw.baseAmount as number) || 10,
        instantDelay: (raw.instantDelay as number) || 2,
        martingaleStrategy: (raw.martingaleStrategy as ExtensionConfig['martingaleStrategy']) || (raw.strategy as ExtensionConfig['martingaleStrategy']) || 'off',
        maxMartingaleLevels: (raw.maxMartingaleLevels as number) || (raw.maxGale as number) || 2,
        fixedMultiplier: (raw.fixedMultiplier as number) || 2.0,
        autoExecuteMartingale: (raw.autoExecuteMartingale as boolean) ?? (raw.autoTrade as boolean) ?? false,
        maxDailyTrades: (raw.maxDailyTrades as number) || 50,
        maxConsecutiveLosses: (raw.maxConsecutiveLosses as number) || 3,
        minBalanceProtection: (raw.minBalanceProtection as number) || 100,
        maxSingleTradeAmount: (raw.maxSingleTradeAmount as number) || 100,
        soundAlerts: (raw.soundAlerts as boolean) ?? true,
        browserNotifications: (raw.browserNotifications as boolean) ?? true,
        showOverlay: (raw.showOverlay as boolean) ?? true,
        enabledPairs: (raw.enabledPairs as string[]) || (raw.enabledAssets as string[]) || [],
      };
    } catch {
      return { ...defaultConfig };
    }
  },

  async updateExtensionConfig(updates: Partial<ExtensionConfig>): Promise<ExtensionConfig> {
    try {
      await apiPut('/extension/settings', updates);
      return this.getExtensionConfig();
    } catch {
      return { ...defaultConfig, ...updates };
    }
  },

  async generateToken(): Promise<string> {
    try {
      const result = await apiPost<{ token: string }>('/extension/token/regenerate');
      return result.token;
    } catch {
      return '';
    }
  },
};
