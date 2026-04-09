import { useNavigate } from 'react-router-dom';
import { getYesterdaySummary, YesterdayResult } from '@/data/mockYesterdayResults';
import { ResultCard } from './ResultCard';
import { BlurredResultRow } from './BlurredResultRow';
import { ResultsSummaryBar } from './ResultsSummaryBar';
import { ResultsTicker } from './ResultsTicker';
import { Sparkles, ArrowRight, Zap, Crown } from 'lucide-react';

interface YesterdayResultsProps {
  data?: ReturnType<typeof getYesterdaySummary>;
}

export function YesterdayResults({ data }: YesterdayResultsProps) {
  const navigate = useNavigate();
  const summary = data || getYesterdaySummary();

  const freeWins = summary.free.filter(r => r.result === 'win').length;
  const freeLosses = summary.free.filter(r => r.result === 'loss').length;
  const freeWinRate = Math.round((freeWins / summary.free.length) * 1000) / 10;

  return (
    <section className="py-0">
      {/* Ticker */}
      <ResultsTicker />

      <div className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-st-call/10 border border-st-call/20 text-st-call text-sm font-medium mb-4">
              <Zap size={14} />
              Verified Results
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Yesterday's Results — <span className="text-gradient">Live & Transparent</span>
            </h2>
            <p className="text-[var(--st-text-secondary)] max-w-2xl mx-auto text-lg">
              Every signal. Every result. No cherry-picking.
            </p>
          </div>

          {/* Two Columns */}
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Free Column */}
            <div className="rounded-2xl bg-[var(--st-bg-card)] border border-[var(--st-border)] overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-[var(--st-border)] flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-st-info/10 flex items-center justify-center">
                  <Zap size={16} className="text-st-info" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Free Tier</h3>
                    <span className="px-2 py-0.5 rounded-full bg-st-info/15 text-st-info text-[10px] font-semibold border border-st-info/25">
                      OPEN
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--st-text-secondary)]">Accessible to everyone — no account needed</p>
                </div>
              </div>

              <div className="p-4 sm:p-5 space-y-2.5">
                {summary.free.map((result, i) => (
                  <ResultCard key={result.id} result={result} index={i} />
                ))}
              </div>

              <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                <ResultsSummaryBar
                  total={summary.free.length}
                  wins={freeWins}
                  losses={freeLosses}
                  winRate={freeWinRate}
                />
              </div>
            </div>

            {/* Premium Column */}
            <div className="rounded-2xl bg-[var(--st-bg-card)] border border-st-premium/25 overflow-hidden relative">
              {/* Subtle gold top glow */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-st-premium/50 to-transparent" />

              <div className="p-4 sm:p-5 border-b border-st-premium/15 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-st-premium/10 flex items-center justify-center">
                  <Crown size={16} className="text-st-premium" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Premium</h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-st-premium/15 text-st-premium text-[10px] font-semibold border border-st-premium/25">
                      <Sparkles size={9} />
                      PRO
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--st-text-secondary)]">
                    {summary.premium.stats.total} signals yesterday — {summary.premium.stats.winRate}% win rate
                  </p>
                </div>
              </div>

              <div className="p-4 sm:p-5 space-y-2.5">
                {/* Visible premium signals */}
                {summary.premium.visible.map((result, i) => (
                  <ResultCard key={result.id} result={result} index={i} />
                ))}

                {/* Blurred rows */}
                {Array.from({ length: Math.min(summary.premium.blurredCount, 8) }).map((_, i) => (
                  <BlurredResultRow key={`blur-${i}`} index={i} />
                ))}

                {summary.premium.blurredCount > 8 && (
                  <p className="text-center text-xs text-[var(--st-text-secondary)] py-1">
                    +{summary.premium.blurredCount - 8} more signals...
                  </p>
                )}
              </div>

              <div className="px-4 sm:px-5 space-y-3 pb-4 sm:pb-5">
                <ResultsSummaryBar
                  total={summary.premium.stats.total}
                  wins={summary.premium.stats.wins}
                  losses={summary.premium.stats.losses}
                  winRate={summary.premium.stats.winRate}
                />

                <button
                  onClick={() => navigate('/pricing')}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-st-accent to-st-info text-white font-semibold text-sm hover:opacity-90 transition-opacity glow-accent"
                >
                  <Sparkles size={14} />
                  Unlock All Premium Signals
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}