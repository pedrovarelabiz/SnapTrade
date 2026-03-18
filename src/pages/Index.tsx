import { PublicLayout } from '@/components/layout/PublicLayout';
import { YesterdayResults } from '@/components/landing/YesterdayResults';
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

      {/* Yesterday's Results — Primary Conversion Driver */}
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
                  <span className="inline-block px-3 py-1 rounded-full bg-st-accent/20 text-st-accent text-xs font-semibold mb-3">Most Popular</span>
                )}
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-bold text-white">{plan.price}</span>
                  <span className="text-sm text-[var(--st-text-secondary)]">{plan.period}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-[var(--st-text-primary)]">
                      <CheckCircle size={14} className="text-st-call" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/pricing')}
                  className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    plan.popular
                      ? 'bg-st-accent text-white hover:bg-st-accent/90'
                      : 'border border-[var(--st-border)] text-white hover:bg-[var(--st-border)]/30'
                  }`}
                >
                  {plan.name === 'Free' ? 'Get Started' : 'Choose Plan'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 sm:py-28 relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-20" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-st-accent/10 rounded-full blur-[100px]" />

        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <TrendingUp size={48} className="text-st-accent mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Start Trading Smarter Today</h2>
          <p className="text-[var(--st-text-secondary)] mb-8 text-lg">Join 2,500+ traders who trust SnapTrade for consistent, data-driven trading signals.</p>
          <button
            onClick={() => navigate('/register')}
            className="px-10 py-4 rounded-2xl bg-gradient-to-r from-st-accent to-st-info text-white font-bold text-lg hover:opacity-90 transition-opacity glow-accent"
          >
            Create Free Account
          </button>
        </div>
      </section>
    </PublicLayout>
  );
}