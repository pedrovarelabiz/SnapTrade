import { Volume2, VolumeX } from 'lucide-react';

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