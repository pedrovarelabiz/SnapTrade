import { PublicLayout } from '@/components/layout/PublicLayout';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { CheckCircle, X, Crown, HelpCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const faqs = [
  { q: 'How accurate are the signals?', a: 'Our signals maintain a consistent 75-82% win rate across all supported currency pairs. Performance varies by market conditions and is tracked transparently in our daily reports.' },
  { q: 'Can I cancel anytime?', a: 'Yes! You can cancel your subscription at any time. Your access continues until the end of your billing period. No questions asked.' },
  { q: 'What payment methods do you accept?', a: 'We accept Bitcoin (BTC), Ethereum (ETH), Tether (USDT), and PayPal. Crypto payments are processed instantly.' },
  { q: 'How does the Chrome extension work?', a: 'Our Chrome extension connects to your broker platform and can execute trades automatically when signals arrive. You set your trade amount and risk parameters.' },
  { q: 'Is there a free trial?', a: 'The Free plan gives you 3 signals per day forever. This lets you evaluate signal quality before upgrading to Premium for unlimited access.' },
];

const freeFeatures = ['3 signals per day', 'Basic signal info', 'Community access', 'Email support'];
const freeExcluded = ['Real-time SSE feed', 'Full analytics', 'Chrome extension', 'Daily reports', 'Priority support', 'Martingale signals'];

const premiumFeatures = [
  'Unlimited signals',
  'Real-time SSE feed',
  'Full analytics suite',
  'Daily reports',
  'Chrome extension',
  'Priority support',
  'Martingale signals',
  'Custom alerts',
];

const yearlyBonusFeatures = [
  'Early access to new features',
  'Dedicated account manager',
  '1-on-1 strategy session',
];

export default function Pricing() {
  const navigate = useNavigate();
  const [isYearly, setIsYearly] = useState(false);

  return (
    <PublicLayout>
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">Choose Your Plan</h1>
            <p className="text-lg text-[var(--st-text-secondary)] max-w-2xl mx-auto">Start free, upgrade when you're ready. All plans include our core signal technology.</p>

            {/* Toggle */}
            <div className="flex items-center justify-center gap-4 mt-8">
              <span className={`text-sm font-medium ${!isYearly ? 'text-white' : 'text-[var(--st-text-secondary)]'}`}>Monthly</span>
              <button
                onClick={() => setIsYearly(!isYearly)}
                className={`relative w-14 h-7 rounded-full transition-colors ${isYearly ? 'bg-st-accent' : 'bg-[var(--st-border)]'}`}
              >
                <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform ${isYearly ? 'translate-x-7' : 'translate-x-0.5'}`} />
              </button>
              <span className={`text-sm font-medium ${isYearly ? 'text-white' : 'text-[var(--st-text-secondary)]'}`}>
                Yearly
                <span className="ml-2 px-2 py-0.5 rounded-full bg-st-call/15 text-st-call text-xs font-semibold">Save 32%</span>
              </span>
            </div>
          </div>

          {/* Plan Cards */}
          <div className="grid sm:grid-cols-3 gap-6 max-w-5xl mx-auto mb-20">
            {/* Free Plan — always the same */}
            <div className="relative p-6 sm:p-8 rounded-2xl border bg-[var(--st-bg-card)] border-[var(--st-border)] hover:border-[var(--st-text-secondary)]/30 transition-all">
              <h3 className="text-xl font-bold text-white mb-2">Free</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">$0</span>
                <span className="text-[var(--st-text-secondary)] text-sm ml-1">/forever</span>
              </div>
              <ul className="space-y-3 mb-8">
                {freeFeatures.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--st-text-primary)]">
                    <CheckCircle size={16} className="text-st-call flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
                {freeExcluded.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--st-text-secondary)]/50">
                    <X size={16} className="text-[var(--st-text-secondary)]/30 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/register')}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all border border-[var(--st-border)] text-white hover:bg-[var(--st-border)]/30"
              >
                Start Free
              </button>
            </div>

            {/* Center card — "Most Popular", adapts to toggle */}
            <div className="relative p-6 sm:p-8 rounded-2xl border bg-st-accent/5 border-st-accent/40 glow-accent scale-[1.02] transition-all">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 px-4 py-1 rounded-full bg-st-premium text-st-deep text-xs font-bold">
                  <Crown size={12} />
                  Most Popular
                </span>
              </div>

              <h3 className="text-xl font-bold text-white mb-2">
                {isYearly ? 'Premium Yearly' : 'Premium Monthly'}
              </h3>

              <div className="mb-6">
                {isYearly ? (
                  <>
                    <span className="text-4xl font-bold text-white">$399</span>
                    <span className="text-[var(--st-text-secondary)] text-sm ml-1">/year</span>
                    <p className="text-xs text-st-call mt-1">≈ $33/month — save $189 vs monthly</p>
                  </>
                ) : (
                  <>
                    <span className="text-4xl font-bold text-white">$49</span>
                    <span className="text-[var(--st-text-secondary)] text-sm ml-1">/month</span>
                  </>
                )}
              </div>

              <ul className="space-y-3 mb-8">
                {premiumFeatures.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--st-text-primary)]">
                    <CheckCircle size={16} className="text-st-call flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
                {isYearly && yearlyBonusFeatures.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--st-text-primary)]">
                    <CheckCircle size={16} className="text-st-call flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => navigate('/register')}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all bg-gradient-to-r from-st-accent to-st-info text-white hover:opacity-90"
              >
                Get Premium
              </button>
            </div>

            {/* Third card — shows the alternative billing option */}
            <div className="relative p-6 sm:p-8 rounded-2xl border bg-[var(--st-bg-card)] border-[var(--st-border)] hover:border-[var(--st-text-secondary)]/30 transition-all">
              <h3 className="text-xl font-bold text-white mb-2">
                {isYearly ? 'Premium Monthly' : 'Premium Yearly'}
              </h3>

              <div className="mb-6">
                {isYearly ? (
                  <>
                    <span className="text-4xl font-bold text-white">$49</span>
                    <span className="text-[var(--st-text-secondary)] text-sm ml-1">/month</span>
                    <p className="text-xs text-[var(--st-text-secondary)] mt-1">Flexible month-to-month billing</p>
                  </>
                ) : (
                  <>
                    <span className="text-4xl font-bold text-white">$399</span>
                    <span className="text-[var(--st-text-secondary)] text-sm ml-1">/year</span>
                    <p className="text-xs text-st-call mt-1">Save 32% — just $33/month</p>
                  </>
                )}
              </div>

              <ul className="space-y-3 mb-8">
                {isYearly ? (
                  premiumFeatures.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--st-text-primary)]">
                      <CheckCircle size={16} className="text-st-call flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))
                ) : (
                  ['Everything in Premium Monthly', 'Save 32% vs monthly', 'Early access to new features', 'Dedicated account manager', '1-on-1 strategy session'].map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--st-text-primary)]">
                      <CheckCircle size={16} className="text-st-call flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))
                )}
              </ul>

              <button
                onClick={() => navigate('/register')}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all border border-[var(--st-border)] text-white hover:bg-[var(--st-border)]/30"
              >
                {isYearly ? 'Choose Monthly' : 'Choose Yearly'}
              </button>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="text-center mb-20">
            <p className="text-smI'll fix all 5 issues in priority order. Let me start by reading the files I need to modify.

Now let me check for any other files that use dynamic Tailwind color interpolation beyond what I already have:

The `SignalFeed.tsx` and `SignalCounterBadge.tsx` don't use dynamic interpolation. The issue is isolated to `SignalCard.tsx` and the live signal preview in `Index.tsx`. Now I have everything I need. Let me fix all 5 issues.

---

**Fix 1: Tailwind dynamic class safety in SignalCard.tsx**

<dyad-write path="src/components/signals/SignalCard.tsx" description="Replacing all dynamic Tailwind class interpolation with explicit conditional class mappings for production safety">
import { Signal } from '@/types';
import { CountdownTimer } from '@/components/shared/CountdownTimer';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/hooks/useAuth';
import { TrendingUp, TrendingDown, Layers } from 'lucide-react';

interface SignalCardProps {
  signal: Signal;
  onUpdateStatus?: (id: string, status: Signal['status']) => void;
  isNew?: boolean;
}

const assetFlags: Record<string, string> = {
  'EUR/USD': '🇪🇺🇺🇸', 'GBP/JPY': '🇬🇧🇯🇵', 'USD/CHF': '🇺🇸🇨🇭', 'AUD/USD': '🇦🇺🇺🇸',
  'EUR/GBP': '🇪🇺🇬🇧', 'USD/JPY': '🇺🇸🇯🇵', 'NZD/USD': '🇳🇿🇺🇸', 'EUR/JPY': '🇪🇺🇯🇵',
  'GBP/USD': '🇬🇧🇺🇸', 'AUD/JPY': '🇦🇺🇯🇵', 'CAD/CHF': '🇨🇦🇨🇭', 'EUR/AUD': '🇪🇺🇦🇺',
  'USD/CAD': '🇺🇸🇨🇦', 'GBP/CHF': '🇬🇧🇨🇭', 'NZD/JPY': '🇳🇿🇯🇵', 'EUR/CHF': '🇪🇺🇨🇭',
  'AUD/NZD': '🇦🇺🇳🇿', 'GBP/AUD': '🇬🇧🇦🇺', 'CHF/JPY': '🇨🇭🇯🇵', 'EUR/NZD': '🇪🇺🇳🇿',
};

const dirStyles = {
  CALL: {
    borderActive: 'border-st-call/30',
    borderHover: 'hover:border-st-call/50',
    badgeBg: 'bg-st-call/10',
    badgeBorder: 'border-st-call/30',
    badgeText: 'text-st-call',
    confBg: 'bg-st-call/10',
    confText: 'text-st-call',
  },
  PUT: {
    borderActive: 'border-st-put/30',
    borderHover: 'hover:border-st-put/50',
    badgeBg: 'bg-st-put/10',
    badgeBorder: 'border-st-put/30',
    badgeText: 'text-st-put',
    confBg: 'bg-st-put/10',
    confText: 'text-st-put',
  },
} as const;

export function SignalCard({ signal, onUpdateStatus, isNew }: SignalCardProps) {
  const { user } = useAuth();
  const isCall = signal.direction === 'CALL';
  const styles = dirStyles[signal.direction];
  const isPendingOrActive = signal.status === 'pending' || signal.status === 'active';

  return (
    <div className={`rounded-xl bg-[var(--st-bg-card)] border transition-all duration-300 ${
      isNew ? 'animate-fade-up border-st-accent animate-signal-pulse' :
      isPendingOrActive ? `${styles.borderActive} ${styles.borderHover}` : 'border-[var(--st-border)]'
    }`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">{assetFlags[signal.asset] || '🌐'}</span>
            <span className="text-white font-semibold text-sm">{signal.asset}</span>
            {signal.martingaleLevel > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-st-premium/15 text-st-premium text-[10px] font-bold border border-st-premium/30">
                <Layers size={8} />
                M{signal.martingaleLevel}
              </span>
            )}
          </div>
          <StatusBadge status={signal.status} />
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${styles.badgeBg} border ${styles.badgeBorder}`}>
            {isCall ? <TrendingUp size={16} className={styles.badgeText} /> : <TrendingDown size={16} className={styles.badgeText} />}
            <span className={`${styles.badgeText} font-bold text-sm`}>{signal.direction}</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-md bg-[var(--st-bg-elevated)] text-[var(--st-text-secondary)] font-mono">{signal.timeframe}</span>
            <span className={`px-2 py-1 rounded-md ${styles.confBg} ${styles.confText} font-semibold`}>{signal.confidence}%</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          {isPendingOrActive && <CountdownTimer targetTime={signal.entryTime} />}
          {!isPendingOrActive && (
            <span className="text-xs text-[var(--st-text-secondary)]">
              {new Date(signal.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          {user?.role === 'admin' && isPendingOrActive && onUpdateStatus && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => onUpdateStatus(signal.id, 'win')} className="px-2.5 py-1 rounded-lg bg-st-call/10 text-st-call text-xs font-semibold hover:bg-st-call/20 transition-colors">WIN</button>
              <button onClick={() => onUpdateStatus(signal.id, 'loss')} className="px-2.5 py-1 rounded-lg bg-st-put/10 text-st-put text-xs font-semibold hover:bg-st-put/20 transition-colors">LOSS</button>
              <button onClick={() => onUpdateStatus(signal.id, 'skipped')} className="px-2.5 py-1 rounded-lg bg-[var(--st-border)]/50 text-[var(--st-text-secondary)] text-xs font-semibold hover:bg-[var(--st-border)] transition-colors">SKIP</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}