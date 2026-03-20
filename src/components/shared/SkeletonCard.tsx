interface Props {
  height?: string;
  count?: number;
}

export function SkeletonCard({ height = 'h-28', count = 1 }: Props) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${height} rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] animate-pulse`}
        />
      ))}
    </>
  );
}