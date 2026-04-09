import { useAuth } from '@/hooks/useAuth';
import { useSignals } from '@/hooks/useSignals';
import { Zap, TrendingUp, ArrowRight, DollarSign, Flame } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MarketStatus } from './MarketStatus';
import { formatPnl } from '@/lib/pnlCalculator';

function getStreakMessage(streak: number, type: 'win' | 'loss' | null): string | null {
  if (!type || streak < 3) return null;
  if (type === 'win') {
    if (streak >= 10) return "Strong win streak!";
    if (streak >= 7) return '🔥 Amazing run! Keep the momentum going!';
    if (streak >= 5) return '🎯 Great streak! Stay focused and disciplined.';
    return '✨ Nice streak building! Keep it up.';
  }
  if (streak >= 5) return '💪 Tough stretch — consider reducing position size.';
  return '📊 Short losing streak — stay patient, the edge is real.';
}

export function WelcomeBanner() {
  const { user } = useAuth();
  const { signals } = useSignals();
  const navigate = useNavigate();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name?.split(' ')[0] || 'Trader';

  // Calculate today's P&L
  const today = new Date().toDateString();
  const todaySignals = signals.filter(s => new Date(s.createdAt).toDateString() === today);
  const todayPnl = todaySignals.reduce((sum, s) => {
    if (s.pnl?.netPnl !== undefined) return sum + s.pnl.netPnl;
    return sum;
  }, 0);
  const roundedPnl = Math.round(todayPnl * 100) / 100;
  const hasPnl = todaySignals.some(s => s.pnl !== undefined);
  const todayWins = todaySignals.filter(s => s.result === 'win').length;
  const todayLosses = todaySignals.filter(s => s.result === 'loss').length;

  // Calculate current streak across all signals
  const resolved = signals
    .filter(s => s.result === 'win' || s.result === 'loss')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let streak = 0;
  let streakType: 'win' | 'loss' | null = null;
  for (const s of resolved) {
    if (!streakType) {
      streakType = s.result!;
      streak = 1;
    } else if (s.result === streakType) {
      streak++;
    } else {
      break;
    }
  }

  const streakMessage = getStreakMessage(streak, streakType);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-st-accent/10 via-st-info/5 to-transparent border border-st-accent/20 p-5 sm:p-6">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-st-accent/5 rounded-full blur-[60px] -translate-y-1/2 translate-x-1/2" />

      <div className="relative space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
              {streakMessage && (
                <p className={`text-xs mt-1.5 font-medium ${
                  streakType === 'win' ? 'text-st-premium' : 'text-st-put/80'
                }`}>
                  {streakMessage}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Streak badge */}
            {streak >= 3 && user?.role !== 'free' && (
              <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border ${
                streakType === 'win'
                  ? 'bg-st-premium/5 border-st-premium/20'
                  : 'bg-st-put/5 border-st-put/20'
              }`}>
                <Flame size={14} className={streakType === 'win' ? 'text-st-premium' : 'text-st-put'} />
                <span className={`text-sm font-bold tabular-nums ${streakType === 'win' ? 'text-st-premium' : 'text-st-put'}`}>
                  {streak}{streakType === 'win' ? 'W' : 'L'}
                </span>
              </div>
            )}

            {/* Today's P&L badge */}
            {hasPnl && user?.role !== 'free' && (
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${
                roundedPnl >= 0
                  ? 'bg-st-call/5 border-st-call/20'
                  : 'bg-st-put/5 border-st-put/20'
              }`}>
                <DollarSign size={14} className={roundedPnl >= 0 ? 'text-st-call' : 'text-st-put'} />
                <div>
                  <p className={`text-sm font-bold tabular-nums ${roundedPnl >= 0 ? 'text-st-call' : 'text-st-put'}`}>
                    {formatPnl(roundedPnl)}
                  </p>
                  <p className="text-[9px] text-[var(--st-text-secondary)]">
                    {todayWins}W / {todayLosses}L today
                  </p>
                </div>
              </div>
            )}

            {user?.role === 'free' ? (
              <button
                onClick={() => navigate('/pricing')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-st-accent to-st-info text-white font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                <TrendingUp size={14} />
                Go Premium
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => navigate('/analytics')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--st-border)] text-white font-medium text-sm hover:bg-[var(--st-border)]/30 transition-colors"
              >
                <TrendingUp size={14} />
                View Analytics
              </button>
            )}
          </div>
        </div>

        {/* Market Status */}
        <MarketStatus />
      </div>
    </div>
  );
}