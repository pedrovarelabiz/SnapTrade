import { ArrowUp } from 'lucide-react';

interface Props {
  show: boolean;
  count: number;
  onClick: () => void;
}

export function ScrollToTopButton({ show, count, onClick }: Props) {
  if (!show) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-24 left-1/2 -translate-x-1/2 lg:bottom-8 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-st-accent text-white text-sm font-semibold shadow-lg glow-accent animate-fade-up hover:bg-st-accent/90 transition-colors"
    >
      <ArrowUp size={14} />
      {count} new signal{count > 1 ? 's' : ''}
    </button>
  );
}