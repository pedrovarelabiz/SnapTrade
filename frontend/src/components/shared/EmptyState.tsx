import { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  iconColor?: string;
  iconBg?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  iconColor = 'text-[var(--st-text-secondary)]',
  iconBg = 'bg-[var(--st-bg-card)]',
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center px-4">
      <div className={`w-16 h-16 rounded-2xl ${iconBg} border border-[var(--st-border)] flex items-center justify-center mb-4`}>
        <Icon size={28} className={iconColor} />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-[var(--st-text-secondary)] max-w-sm leading-relaxed">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 px-6 py-2.5 rounded-xl bg-st-accent text-white font-semibold text-sm hover:bg-st-accent/90 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}