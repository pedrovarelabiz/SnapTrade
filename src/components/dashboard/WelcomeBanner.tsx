import { useAuth } from '@/hooks/useAuth';
import { Zap, TrendingUp, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function WelcomeBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name?.split(' ')[0] || 'Trader';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-st-accent/10 via-st-info/5 to-transparent border border-st-accent/20 p-5 sm:p-6">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-st-accent/5 rounded-full blur-[60px] -translate-y-1/2 translate-x-1/2" />

      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-st-accent/15 flex items-center justify-center flex-shrink-0">
            <Zap size={20} className="text-st-accent" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {greeting}, {firstName}
            </h2>
            <p className="text-sm text-[var(--st-text-secondary)] mt-0.5">
              {user?.role === 'free'
                ? 'You have 3 free signals today. Upgrade for unlimited access.'
                : 'Your signals are streaming live. Stay sharp and trade smart.'}
            </p>
          </div>
        </div>

        {user?.role === 'free' ? (
          <button
            onClick={() => navigate('/pricing')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-st-accent to-st-info text-white font-semibold text-sm hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <TrendingUp size={14} />
            Go Premium
            <ArrowRight size={14} />
          </button>
        ) : (
          <button
            onClick={() => navigate('/analytics')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--st-border)] text-white font-medium text-sm hover:bg-[var(--st-border)]/30 transition-colors flex-shrink-0"
          >
            <TrendingUp size={14} />
            View Analytics
          </button>
        )}
      </div>
    </div>
  );
}