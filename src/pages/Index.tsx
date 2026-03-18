import { PublicLayout } from '@/components/layout/PublicLayout';
import { YesterdayResults } from '@/components/landing/YesterdayResults';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { useNavigate } from 'react-router-dom';
import {
  Zap, BarChart3, Chrome, Globe, FileText, Shield,
  ArrowRight, Star, TrendingUp, CheckCircle,
} from 'lucide-react';

const features = [
  { icon: Zap, title: 'Real-Time Signals', desc: 'Get instant CALL/PUT signals delivered via live stream with precise entry times.' },
  { icon: BarChart3, title: 'Analytics Suite', desc: 'Track win rates, P&L curves, and asset performance with interactive charts.' },
  { icon: Chrome, title: 'Chrome Extension', desc: 'Auto-trade directly on your broker platform with one-click execution.' },
  { icon: Globe, title: 'Multi-Asset', desc: '20+ currency pairs analyzed 24/5 with advanced pattern recognition.' },
  { icon: FileText, title: 'Daily Reports', desc: 'Comprehensive daily summaries with signal breakdowns and insights.' },
  { icon: Shield, title: 'Secure Payments', desc: 'Pay with BTC, ETH, USDT, or PayPal. Your data stays encrypted.' },
];

const testimonials = [
  { name: 'Alex M.', role: 'Day Trader', text: 'SnapTrade changed my trading game. The signals are incredibly accurate and the Chrome extension makes execution effortless.', rating: 5 },
  { name: 'Sarah K.', role: 'Forex Trader', text: 'I\'ve tried many signal services. SnapTrade\'s win rate is consistently above 75%. The analytics help me understand my performance.', rating: 5 },
  { name: 'David R.', role: 'Part-time Trader', text: 'Perfect for someone who can\'t watch charts all day. I get notifications, check the signal, and execute in seconds.', rating: 4 },
];

const stats = [
  { value: '10,000+', label: 'Signals Sent' },
  { value: '78%', label: 'Win Rate' },
  { value: '2,500+', label: 'Active Traders' },
  { value: '24/5', label: 'Market Coverage' },
];

const livePreviewSignals = [
  { asset: 'GBP/JPY', flag: '🇬🇧🇯🇵', dir: 'PUT' as const, time: '1:30', tf: 'M5', conf: 78 },
  { asset: 'USD/CHF', flag: '🇺🇸🇨🇭', dir: 'CALL' as const, time: '4:15', tf: 'M1', conf: 92 },
  { asset: 'AUD/USD', flag: '🇦🇺🇺🇸', dir: 'CALL' as const, time: '7:00', tf: 'M15', conf: 81 },
];

const previewDirStyles = {
  CALL: { badge: 'bg-st-call/15 text-st-call border border-st-call/30', conf: 'text-st-call' },
  PUT: { badge: 'bg-st-put/15 text-st-put border border-st-put/30', conf: 'text-st-put' },
} as const;

export default function Index() {
  const navigate = useNavigate();

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-40" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-st-accent/10 rounded-full blur-[120px]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pt-32 sm:pb-32">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-st-accent/10 border border-st-accent/20 text-st-accent text-sm font-medium mb-6 animate-fade-up">
              <Zap size={14} />
              Live signals streaming now
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6 animate-fade-up" style={{ animationDelay: '0.1s' }}>
              Trade Smarter with{' '}
              <span className="text-gradient">Real-Time Signals</span>
            </h1>

            <p className="text-lg sm:text-xl text-[var(--st-text-secondary)] mb-8 animate-fade-up" style={{ animationDelay: '0.2s' }}>
              Get precise CALL/PUT signals delivered in real-time. Powered by advanced algorithms with a proven 78% win rate across 20+ currency pairs.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: '0.3s' }}>
              <button
                onClick={() => navigate('/register')}
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-st-accent to-st-info text-white font-bold text-base hover:opacity-90 transition-opacity flex items-center justify-center gap-2 glow-accent"
              >
                Start Free Trial
                <ArrowRight size={18} />
              </button>
              <button
                onClick={() => navigate('/pricing')}
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl border border-[var(--st-border)] text-white font-semibold text-base hover:bg-[var(--st-bg-elevated)] transition-colors"
              >
                View Pricing
              </button>
            </div>
          </div>

          {/* Mock Signal Preview */}
          <div className="mt-16 max-w-md mx-auto animate-fade-up" style={{ animationDelay: '0.4s' }}>
            <div className="rounded-2xl bg-[var(--st-bg-card)] border border-[var(--st-border)] p-4 animate-float">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🇪🇺🇺🇸</span>
                  <span className="text-white font-semibold">EUR/USD</span>
                </div>
                <span className="px-3 py-1 rounded-lg bg-st-call/15 text-st-call font-bold text-sm border border-st-call/30">CALL ↑</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2 rounded-lg bg-[var(--st-bg-elevated)]">
                  <p className="text-[10px] text-[var(--st-text-secondary)]">Entry</p>
                  <p className="text-sm font-mono text-white">2:45</p>
                </div>
                <div className="p-2 rounded-lg bg-[var(--st-bg-elevated)]">
                  <p className="text-[10px] text-[var(--st-text-secondary)]">Timeframe</p>
                  <p className="text-sm font-mono text-white">M5</p>
                </div>
                <div className="p-2 rounded-lg bg-[var(--st-bg-elevated)]">
                  <p className="text-[10px] text-[var(--st-text-secondary)]">Confidence</p>
                  <p className="text-sm font-mono text-st-call">85%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-[var(--st-border)] bg-[var(--st-bg-card)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map(stat => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-gradient">{stat.value}</p>
                <p className="text-sm text-[var(--st-text-secondary)] mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Everything You Need to Trade</h2>
            <p className="text-[var(--st-text-secondary)] max-w-2xl mx-auto">A complete trading signal platform with real-time delivery, advanced analytics, and seamless broker integration.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="group p-6 rounded-2xl bg-[var(--st-bg-card)] border border-[var(--st-border)] hover:border-st-accent/40 transition-all duration-300 animate-fade-up"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="w-12 h-12 rounded-xl bg-st-accent/10 flex items-center justify-center mb-4 group-hover:bg-st-accent/20 transition-colors">
                  <f.icon size={22} className="text-st-accent" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-[var(--st-text-secondary)] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <HowItWorks />

      {/* Yesterday's Results */}
      <YesterdayResults />

      {/* Live Signal Preview */}
      <section className="py-20 bg-[var(--st-bg-card)] border-y border-[var(--st-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Watch Signals Flow in Real-Time</h2>
              <p className="text-[var(--st-text-secondary)] mb-6">Our SSE-powered feed delivers signals the instant they're generated. No refreshing, no delays — just pure, real-time trading intelligence.</p>
              <ul className="space-y-3">
                {['Instant signal delivery via SSE', 'Countdown timers to entry', 'Confidence scores for each signal', 'Martingale level tracking'].map(item => (
                  <li key={item} className="flex items-center gap-3 text-sm text-[var(--st-text-primary)]">
                    <CheckCircle size={16} className="text-st-call flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              {livePreviewSignals.map((s, i) => {
                const pStyles = previewDirStyles[s.dir];
                return (
                  <div key={s.asset} className="rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] p-4 animate-fade-up" style={{ animationDelay: `${i * 0.15}s` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{s.flag}</span>
                        <span className="text-white font-semibold">{s.asset}</span>
                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${pStyles.badge}`}>{s.dir}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--st-text-secondary)]">
                        <span className="font-mono">{s.time}</span>
                        <span className="px-1.5 py-0.5 rounded bg-[var(--st-border)]/50">{s.tf}</span>
                        <span className={`${pStyles.conf} font-semibold`}>{s.conf}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Trusted by Traders Worldwide</h2>
            <p className="text-[var(--st-text-secondary)]">Join thousands of traders who rely on SnapTrade for consistent results.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={t.name} className="p-6 rounded-2xl bg-[var(--st-bg-card)] border border-[var(--st-border)] animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} size={14} className={j < t.rating ? 'text-st-premium fill-st-premium' : 'text-[var(--st-border)]'} />
                  ))}
                </div>
                <p className="text-sm text-[var(--st-text-primary)] mb-4 leading-relaxed">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-st-accent/20 flex items-center justify-center text-st-accent font-bold text-sm">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-[var(--st-text-secondary)]">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 bg-[var(--st-bg-card)] border-y border-[var(--st-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
            <p className="text-[var(--st-text-secondary)]">Start free, upgrade when you're ready.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { name: 'Free', price: '$0', period: '/forever', features: ['3 signals/day', 'Basic analytics', 'Email support'] },
              { name: 'Premium', price: '$49', period: '/month', features: ['Unlimited signals', 'Full analytics', 'Chrome extension', 'Priority support'], popular: true },
              { name: 'Yearly', price: '$399', period: '/year', features: ['Everything in Premium', 'Save 32%', 'Dedicated manager'] },
            ].map(plan => (
              <div key={plan.name} className={`p-6 rounded-2xl border ${plan.popular ? 'bg-st-accent/5 border-st-accent/40 glow-accent' : 'bg-[var(--st-bg-elevated)] border-[var(--st-border)]'}`}>
                {plan.popular && (
                  <span className="inline-block px-3 py-1 rounded-full bg-st-accent/20 text-st-accent text-xs font-semibold mb-3">Most Popular</spanLet me review what's been built and identify the next meaningful improvements. Looking at the codebase, I can see:

1. **StreakVisualization** component exists but isn't in the Dashboard yet — let me add it
2. **AssetPerformanceTable** exists but isn't in Analytics yet — let me add it
3. **AdminOverview** page exists but isn't in the routes — let me add it
4. **HowItWorks** component exists but isn't on the landing page — let me verify it's there
5. **Skeleton loading states** exist but could be used more consistently
6. **The Analytics page** could use the AssetPerformanceTable
7. **Admin sidebar** links to `/admin/users` but there's no overview page linked

Let me implement these improvements and add some new features:

- **Add StreakVisualization to Dashboard**
- **Add AssetPerformanceTable to Analytics**
- **Wire up AdminOverview in routes and sidebar**
- **Add skeleton loading states to Analytics**
- **Improve the Admin sidebar with Overview link**

Looking at the existing files more carefully, I can see that most of these components and pages already exist in the codebase but some aren't properly wired up. Let me check what's actually missing vs. what's already connected.

After reviewing, I see:
- `StreakVisualization` exists but Dashboard already imports it ✅
- `AssetPerformanceTable` exists and Analytics already imports it ✅
- `AdminOverview` exists and App.tsx already has the route ✅
- `HowItWorks` exists and Index.tsx already imports it ✅
- Skeleton components exist and Analytics uses them ✅
- Sidebar already has Overview link ✅

Everything appears to be wired up! Let me focus on **new features** that would genuinely improve the app:

1. **Signal sound toggle** — persist sound preference
2. **Dashboard performance summary widget** — weekly mini-chart
3. **Improved Reports page** with CSV export and date filtering
4. **Better empty states across the app**
5. **A "What's New" changelog modal**

Let me build some genuinely new features:

<dyad-write path="src/components/dashboard/WeeklyMiniChart.tsx" description="Compact weekly performance sparkline chart for the dashboard">
import { useMemo } from 'react';
import { Signal } from '@/types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  signals: Signal[];
}

interface DayData {
  label: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

export function WeeklyMiniChart({ signals }: Props) {
  const weekData = useMemo(() => {
    const days: DayData[] = [];
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toDateString();
      const daySignals = signals.filter(s => new Date(s.createdAt).toDateString() === dateStr);
      const wins = daySignals.filter(s => s.result === 'win').length;
      const losses = daySignals.filter(s => s.result === 'loss').length;
      const total = wins + losses;

      days.push({
        label: dayLabels[date.getDay()],
        wins,
        losses,
        total,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
      });
    }

    return days;
  }, [signals]);

  const totalWins = weekData.reduce((sum, d) => sum + d.wins, 0);
  const totalLosses = weekData.reduce((sum, d) => sum + d.losses, 0);
  const totalResolved = totalWins + totalLosses;
  const weekWinRate = totalResolved > 0 ? Math.round((totalWins / totalResolved) * 100) : 0;
  const maxTotal = Math.max(...weekData.map(d => d.total), 1);

  const trend = weekData.length >= 2
    ? weekData[weekData.length - 1].winRate - weekData[weekData.length - 2].winRate
    : 0;

  return (
    <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">7-Day Performance</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-lg font-bold tabular-nums ${weekWinRate >= 70 ? 'text-st-call' : weekWinRate >= 50 ? 'text-st-premium' : 'text-st-put'}`}>
              {totalResolved > 0 ? `${weekWinRate}%` : '—'}
            </span>
            {trend !== 0 && totalResolved > 0 && (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${trend > 0 ? 'text-st-call' : 'text-st-put'}`}>
                {trend > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {Math.abs(trend)}%
              </span>
            )}
            {trend === 0 && totalResolved > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[var(--st-text-secondary)]">
                <Minus size={10} />
                Flat
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--st-text-secondary)]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-st-call" />
            {totalWins}W
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-st-put" />
            {totalLosses}L
          </span>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1.5 h-16">
        {weekData.map((day, i) => {
          const height = day.total > 0 ? Math.max((day.total / maxTotal) * 100, 12) : 4;
          const winHeight = day.total > 0 ? (day.wins / day.total) * height : 0;
          const lossHeight = height - winHeight;
          const isToday = i === weekData.length - 1;

          return (
            <div key={day.label} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="w-full flex flex-col rounded-sm overflow-hidden" style={{ height: `${height}%` }}>
                {day.total > 0 ? (
                  <>
                    <div
                      className="w-full bg-st-put/60 transition-all group-hover:bg-st-put"
                      style={{ height: `${(lossHeight / height) * 100}%` }}
                    />
                    <div
                      className="w-full bg-st-call/60 transition-all group-hover:bg-st-call"
                      style={{ height: `${(winHeight / height) * 100}%` }}
                    />
                  </>
                ) : (
                  <div className="w-full h-full bg-[var(--st-border)]/30 rounded-sm" />
                )}
              </div>
              <span className={`text-[8px] font-medium ${isToday ? 'text-st-accent' : 'text-[var(--st-text-secondary)]'}`}>
                {day.label}
              </span>

              {/* Tooltip */}
              {day.total > 0 && (
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                  <div className="px-2.5 py-1.5 rounded-lg bg-[var(--st-bg-elevated)] border border-[var(--st-border)] shadow-xl whitespace-nowrap text-center">
                    <p className="text-[10px] font-semibold text-white">{day.wins}W / {day.losses}L</p>
                    <p className={`text-[9px] font-bold ${day.winRate >= 70 ? 'text-st-call' : 'text-st-premium'}`}>
                      {day.winRate}%
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}