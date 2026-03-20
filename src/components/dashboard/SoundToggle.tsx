import { useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

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

interface Props {
  enabled: boolean;
  onToggle: () => void;
}

export function SoundToggle({ enabled, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
        enabled
          ? 'bg-st-accent/10 text-st-accent border border-st-accent/30'
          : 'bg-[var(--st-border)]/30 text-[var(--st-text-secondary)] border border-[var(--st-border)]'
      }`}
      title={enabled ? 'Sound on — click to mute' : 'Sound off — click to unmute'}
    >
      {enabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
      {enabled ? 'Sound On' : 'Muted'}
    </button>
  );
}