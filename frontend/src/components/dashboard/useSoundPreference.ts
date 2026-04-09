import { useState, useEffect } from 'react';

const STORAGE_KEY = 'snaptrade_sound_enabled';

export function useSoundPreference() {
  const [enabled, setEnabled] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== 'false';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  }, [enabled]);

  return { soundEnabled: enabled, setSoundEnabled: setEnabled };
}
