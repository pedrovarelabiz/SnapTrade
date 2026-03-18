import { Subscription } from '@/types';
import { CreditCard, Calendar, RefreshCw } from 'lucide-react';
import { PremiumBadge } from '@/components/shared/PremiumBadge';

interface Props {
  subscription: Subscription;
}

const planNames: Record<string, string> = {
  free: 'Free Plan',
  premium_monthly: 'Premium Monthly',
  premium_yearly: 'Premium Yearly',
};

export function CurrentPlanCard({ subscription }: Props) {
  const isPremium = subscription.plan !== 'free';

  return (
    <div className={`p-6 rounded-xl border ${isPremium ? 'bg-st-accent/5 border-st-accent/30' : 'bg-[var(--st-bg-card)] border-[var(--st-border)]'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isPremium ? 'bg-st-accent/15' : 'bg-[var(--st-bg-elevated)]'}`}>
            <CreditCard size={18} className={isPremium ? 'text-st-accent' : 'text-[var(--st-text-secondary)]'} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">{planNames[subscription.plan]}</h3>
              {isPremium && <PremiumBadge />}
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              subscription.status === 'active' ? 'bg-st-call/15 text-st-call' :
              subscription.status === 'cancelled' ? 'bg-st-put/15 text-st-put' :
              'bg-[var(--st-border)] text-[var(--st-text-secondary)]'
            }`}>
              {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
            </span>
          </div>
        </div>
      </div>

      {isPremium && (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 text-sm text-[var(--st-text-secondary)]">
            <Calendar size={14} />
            <span>Renews: {new Date(subscription.endDate).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--st-text-secondary)]">
            <RefreshCw size={14} />
            <span>Auto-renew: {subscription.autoRenew ? 'On' : 'Off'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
