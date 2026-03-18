import { PublicLayout } from '@/components/layout/PublicLayout';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { CheckCircle, X, Crown, HelpCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const plans = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: ['3 signals per day', 'Basic signal info', 'Community access', 'Email support'],
    excluded: ['Real-time SSE feed', 'Full analytics', 'Chrome extension', 'Daily reports', 'Priority support', 'Martingale signals'],
  },
  {
    id: 'premium_monthly',
    name: 'Premium',
    monthlyPrice: 49,
    yearlyPrice: 33,
    features: ['Unlimited signals', 'Real-time SSE feed', 'Full analytics suite', 'Daily reports', 'Chrome extension', 'Priority support', 'Martingale signals', 'Custom alerts'],
    excluded: [],
    popular: true,
  },
  {
    id: 'premium_yearly',
    name: 'Premium Yearly',
    monthlyPrice: 399,
    yearlyPrice: 399,
    features: ['Everything in Premium', 'Save 32% vs monthly', 'Early access to features', 'Dedicated account manager', '1-on-1 strategy session'],
    excluded: [],
  },
];

const faqs = [
  { q: 'How accurate are the signals?', a: 'Our signals maintain a consistent 75-82% win rate across all supported currency pairs. Performance varies by market conditions and is tracked transparently in our daily reports.' },
  { q: 'Can I cancel anytime?', a: 'Yes! You can cancel your subscription at any time. Your access continues until the end of your billing period. No questions asked.' },
  { q: 'What payment methods do you accept?', a: 'We accept Bitcoin (BTC), Ethereum (ETH), Tether (USDT), and PayPal. Crypto payments are processed instantly.' },
  { q: 'How does the Chrome extension work?', a: 'Our Chrome extension connects to your broker platform and can execute trades automatically when signals arrive. You set your trade amount and risk parameters.' },
  { q: 'Is there a free trial?', a: 'The Free plan gives you 3 signals per day forever. This lets you evaluate signal quality before upgrading to Premium for unlimited access.' },
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
            {plans.map(plan => (
              <div
                key={plan.id}
                className={`relative p-6 sm:p-8 rounded-2xl border transition-all ${
                  plan.popular
                    ? 'bg-st-accent/5 border-st-accent/40 glow-accent scale-[1.02]'
                    : 'bg-[var(--st-bg-card)] border-[var(--st-border)] hover:border-[var(--st-text-secondary)]/30'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 px-4 py-1 rounded-full bg-st-premium text-st-deep text-xs font-bold">
                      <Crown size={12} />
                      Most Popular
                    </span>
                  </div>
                )}

                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>

                <div className="mb-6">
                  {plan.id === 'free' ? (
                    <>
                      <span className="text-4xl font-bold text-white">$0</span>
                      <span className="text-[var(--st-text-secondary)] text-sm ml-1">/forever</span>
                    </>
                  ) : plan.id === 'premium_yearly' ? (
                    <>
                      <span className="text-4xl font-bold text-white">${isYearly ? '399' : '399'}</span>
                      <span className="text-[var(--st-text-secondary)] text-sm ml-1">/year</span>
                      {isYearly && <p className="text-xs text-st-call mt-1">≈ $33/month</p>}
                    </>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-white">${isYearly ? '33' : '49'}</span>
                      <span className="text-[var(--st-text-secondary)] text-sm ml-1">/month</span>
                      {isYearly && <p className="text-xs text-st-call mt-1 line-through opacity-60">$49/month</p>}
                    </>
                  )}
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--st-text-primary)]">
                      <CheckCircle size={16} className="text-st-call flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                  {plan.excluded.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--st-text-secondary)]/50">
                      <X size={16} className="text-[var(--st-text-secondary)]/30 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => navigate(plan.id === 'free' ? '/register' : '/register')}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                    plan.popular
                      ? 'bg-gradient-to-r from-st-accent to-st-info text-white hover:opacity-90'
                      : 'border border-[var(--st-border)] text-white hover:bg-[var(--st-border)]/30'
                  }`}
                >
                  {plan.id === 'free' ? 'Start Free' : 'Get Premium'}
                </button>
              </div>
            ))}
          </div>

          {/* Payment Methods */}
          <div className="text-center mb-20">
            <p className="text-sm text-[var(--st-text-secondary)] mb-4">Accepted Payment Methods</p>
            <div className="flex items-center justify-center gap-6">
              {['₿ BTC', 'Ξ ETH', '₮ USDT', '🅿 PayPal'].map(method => (
                <span key={method} className="px-4 py-2 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] text-sm text-[var(--st-text-primary)] font-medium">
                  {method}
                </span>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 text-st-info mb-2">
                <HelpCircle size={18} />
                <span className="text-sm font-semibold">FAQ</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">Frequently Asked Questions</h2>
            </div>

            <Accordion type="single" collapsible className="space-y-3">
              {faqs.map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] px-6 overflow-hidden">
                  <AccordionTrigger className="text-sm font-semibold text-white hover:no-underline py-4">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-[var(--st-text-secondary)] pb-4">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
