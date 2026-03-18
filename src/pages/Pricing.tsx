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
const premiumFeatures = ['Unlimited signals', 'Real-time SSE feed', 'Full analytics suite', 'Daily reports', 'Chrome extension', 'Priority support', 'Martingale signals', 'Custom alerts'];
const yearlyBonusFeatures = ['Early access to new features', 'Dedicated account manager', '1-on-1 strategy session'];

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
            <div className="flex items-center justify-center gap-4 mt-8">
              <span className={`text-sm font-medium ${!isYearly ? 'text-white' : 'text-[var(--st-text-secondary)]'}`}>Monthly</span>
              <button onClick={() => setIsYearly(!isYearly)} className={`relative w-14 h-7 rounded-full transition-colors ${isYearly ? 'bg-st-accent' : 'bg-[var(--st-border)]'}`}>
                <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform ${isYearly ? 'translate-x-7' : 'translate-x-0.5'}`} />
              </button>
              <span className={`text-sm font-medium ${isYearly ? 'text-white' : 'text-[var(--st-text-secondary)]'}`}>
                Yearly <span className="ml-2 px-2 py-0.5 rounded-full bg-st-call/15 text-st-call text-xs font-semibold">Save 32%</span>
              </span>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto mb-8">
            <div className="relative p-6 sm:p-8 rounded-2xl border bg-[var(--st-bg-card)] border-[var(--st-border)] hover:border-[var(--st-text-secondary)]/30 transition-all">
              <h3 className="text-xl font-bold text-white mb-2">Free</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">$0</span>
                <span className="text-[var(--st-text-secondary)] text-sm ml-1">/forever</span>
              </div>
              <ul className="space-y-3 mb-8">
                {freeFeatures.map(f => (<li key={f} className="flex items-start gap-2 text-sm text-[var(--st-text-primary)]"><CheckCircle size={16} className="text-st-call flex-shrink-0 mt-0.5" />{f}</li>))}
                {freeExcluded.map(f => (<li key={f} className="flex items-start gap-2 text-sm text-[var(--st-text-secondary)]/50"><X size={16} className="text-[var(--st-text-secondary)]/30 flex-shrink-0 mt-0.5" />{f}</li>))}
              </ul>
              <button onClick={() => navigate('/register')} className="w-full py-3 rounded-xl font-semibold text-sm transition-all border border-[var(--st-border)] text-white hover:bg-[var(--st-border)]/30">Start Free</button>
            </div>

            <div className="relative p-6 sm:p-8 rounded-2xl border bg-st-accent/5 border-st-accent/40 glow-accent transition-all">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 px-4 py-1 rounded-full bg-st-premium text-st-deep text-xs font-bold"><Crown size={12} />Most Popular</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{isYearly ? 'Premium Yearly' : 'Premium Monthly'}</h3>
              <div className="mb-6">
                {isYearly ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-white">$33</span>
                      <span className="text-[var(--st-text-secondary)] text-sm">/month</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-[var(--st-text-secondary)] line-through">$49/mo</span>
                      <span className="px-2 py-0.5 rounded-full bg-st-call/15 text-st-call text-xs font-semibold">Save $189/yr</span>
                    </div>
                    <p className="text-xs text-[var(--st-text-secondary)] mt-1">Billed as $399/year</p>
                  </>
                ) : (
                  <>
                    <span className="text-4xl font-bold text-white">$49</span>
                    <span className="text-[var(--st-text-secondary)] text-sm ml-1">/month</span>
                  </>
                )}
              </div>
              <ul className="space-y-3 mb-8">
                {premiumFeatures.map(f => (<li key={f} className="flex items-start gap-2 text-sm text-[var(--st-text-primary)]"><CheckCircle size={16} className="text-st-call flex-shrink-0 mt-0.5" />{f}</li>))}
                {isYearly && yearlyBonusFeatures.map(f => (<li key={f} className="flex items-start gap-2 text-sm text-[var(--st-text-primary)]"><CheckCircle size={16} className="text-st-premium flex-shrink-0 mt-0.5" />{f}</li>))}
              </ul>
              <button onClick={() => navigate('/register')} className="w-full py-3 rounded-xl font-semibold text-sm transition-all bg-gradient-to-r from-st-accent to-st-info text-white hover:opacity-90">Get Premium</button>
            </div>
          </div>

          <div className="text-center mb-20">
            {isYearly ? (
              <button onClick={() => setIsYearly(false)} className="text-sm text-[var(--st-text-secondary)] hover:text-white transition-colors">
                Prefer flexibility? <span className="text-st-accent font-medium">See monthly plan at $49/mo →</span>
              </button>
            ) : (
              <button onClick={() => setIsYearly(true)} className="text-sm text-[var(--st-text-secondary)] hover:text-white transition-colors">
                Save 32% with annual billing — <span className="text-st-call font-medium">just $33/mo billed yearly →</span>
              </button>
            )}
          </div>

          <div className="text-center mb-20">
            <p className="text-sm text-[var(--st-text-secondary)] mb-4">Accepted Payment Methods</p>
            <div className="flex items-center justify-center gap-6 flex-wrap">
              {['₿ BTC', 'Ξ ETH', '₮ USDT', '🅿 PayPal'].map(method => (
                <span key={method} className="px-4 py-2 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] text-sm text-[var(--st-text-primary)] font-medium">{method}</span>
              ))}
            </div>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 text-st-info mb-2"><HelpCircle size={18} /><span className="text-sm font-semibold">FAQ</span></div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">Frequently Asked Questions</h2>
            </div>
            <Accordion type="single" collapsible className="space-y-3">
              {faqs.map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] px-5 data-[state=open]:border-st-accent/30">
                  <AccordionTrigger className="text-sm font-medium text-white hover:no-underline py-4">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-[var(--st-text-secondary)] pb-4 leading-relaxed">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}