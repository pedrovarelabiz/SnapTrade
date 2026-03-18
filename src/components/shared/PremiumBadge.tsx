import { Crown } from 'lucide-react';

export function PremiumBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-st-premium/20 text-st-premium border border-st-premium/30 ${className}`}>
      <Crown size={10} />
      PRO
    </span>
  );
}
