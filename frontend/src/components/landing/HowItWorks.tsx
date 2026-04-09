import { UserPlus, Zap, TrendingUp, DollarSign } from 'lucide-react';

const steps = [
  {
    step: 1,
    icon: UserPlus,
    title: 'Create Account',
    desc: 'Sign up in seconds. No credit card required. Start with 3 free signals per day.',
    color: 'text-st-info',
    bg: 'bg-st-info/10',
    border: 'border-st-info/20',
  },
  {
    step: 2,
    icon: Zap,
    title: 'Receive Signals',
    desc: 'Get real-time CALL/PUT signals with entry times, confidence scores, and martingale levels.',
    color: 'text-st-accent',
    bg: 'bg-st-accent/10',
    border: 'border-st-accent/20',
  },
  {
    step: 3,
    icon: TrendingUp,
    title: 'Execute Trades',
    desc: 'Trade manually or use our Chrome extension for one-click and auto-execution on Pocket Option.',
    color: 'text-st-call',
    bg: 'bg-st-call/10',
    border: 'border-st-call/20',
  },
  {
    step: 4,
    icon: DollarSign,
    title: 'Track & Profit',
    desc: 'Monitor your performance with detailed analytics, daily reports, and P&L tracking.',
    color: 'text-st-premium',
    bg: 'bg-st-premium/10',
    border: 'border-st-premium/20',
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 sm:py-28 relative overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-10" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            How It Works
          </h2>
          <p className="text-[var(--st-text-secondary)] max-w-2xl mx-auto text-lg">
            From sign-up to profit in four simple steps.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden lg:block absolute top-16 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-st-info/30 via-st-accent/30 via-st-call/30 to-st-premium/30" />

          {steps.map((step, i) => (
            <div
              key={step.step}
              className="relative flex flex-col items-center text-center animate-fade-up"
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              {/* Step number */}
              <div className="relative mb-5">
                <div className={`w-14 h-14 rounded-2xl ${step.bg} border ${step.border} flex items-center justify-center`}>
                  <step.icon size={24} className={step.color} />
                </div>
                <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--st-bg-deep)] border-2 ${step.border} flex items-center justify-center`}>
                  <span className={`text-[10px] font-bold ${step.color}`}>{step.step}</span>
                </div>
              </div>

              <h3 className="text-base font-semibold text-white mb-2">{step.title}</h3>
              <p className="text-sm text-[var(--st-text-secondary)] leading-relaxed max-w-[240px]">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}