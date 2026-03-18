export function StatsSkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-[var(--st-border)]/50 mb-2" />
          <div className="h-6 w-16 rounded bg-[var(--st-border)]/50 mb-1" />
          <div className="h-3 w-12 rounded bg-[var(--st-border)]/30" />
        </div>
      ))}
    </div>
  );
}