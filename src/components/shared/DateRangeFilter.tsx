type DateRange = '7d' | '30d' | '90d' | 'all';

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const options: { value: DateRange; label: string }[] = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'all', label: 'All Time' },
];

export function DateRangeFilter({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            value === opt.value ? 'bg-st-accent/15 text-st-accent' : 'text-[var(--st-text-secondary)] hover:text-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export type { DateRange };