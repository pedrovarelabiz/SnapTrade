import { Zap } from 'lucide-react';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl' };
  const iconSizes = { sm: 16, md: 20, lg: 28 };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-st-accent to-st-info flex items-center justify-center">
          <Zap size={iconSizes[size]} className="text-white" fill="white" />
        </div>
      </div>
      <span className={`font-bold tracking-tight ${sizes[size]}`}>
        <span className="text-white">Snap</span>
        <span className="text-st-accent">Trade</span>
      </span>
    </div>
  );
}
