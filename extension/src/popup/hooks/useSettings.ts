import { useState, useEffect, useCallback } from 'react';
import type { ExtensionSettings } from '../../types';
import {
  getSettings,
  updateSettings as storageUpdateSettings,
  onStorageChange,
} from '../../lib/storage';

interface UseSettingsResult {
  readonly settings: ExtensionSettings | null;
  readonly updateSettings: (partial: Partial<ExtensionSettings>) => Promise<void>;
  readonly isLoading: boolean;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getSettings()
      .then((loaded) => {
        if (!cancelled) {
          setSettings(loaded);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('[useSettings] Failed to load settings:', err);
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // FIX: properly clean up storage listener
  useEffect(() => {
    const unsubscribe = onStorageChange((changes) => {
      if (changes.settings?.newValue) {
        setSettings(changes.settings.newValue as ExtensionSettings);
      }
    });
    return unsubscribe;
  }, []);

  const handleUpdateSettings = useCallback(
    async (partial: Partial<ExtensionSettings>): Promise<void> => {
      try {
        const updated = await storageUpdateSettings(partial);
        setSettings(updated);
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings: partial });
      } catch (err) {
        console.error('[useSettings] Failed to update settings:', err);
      }
    },
    [],
  );

  return { settings, updateSettings: handleUpdateSettings, isLoading };
}
