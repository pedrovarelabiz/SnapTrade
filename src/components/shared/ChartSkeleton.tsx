export function ChartSkeleton() {
  return (
    <div className="p-5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] animate-pulse">
      <div className="h-4 w-40 rounded bg-[var(--st-border)]/50 mb-4" />
      <div className="h-64 rounded-lg bg-[var(--st-border)]/20 flex items-end justify-around px-4 pb-4 gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-[var(--st-border)]/30"
            style={{ height: `${20 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}