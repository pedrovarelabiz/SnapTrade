import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CurrentPlanCard } from '@/components/subscription/CurrentPlanCard';
import { PaymentHistory } from '@/components/subscription/PaymentHistory';
import { CancelModal } from '@/components/subscription/CancelModal';
import { UpgradeCTA } from '@/components/shared/UpgradeCTA';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMySubscription, usePaymentHistory } from '@/hooks/useSubscription';
import { toast } from 'sonner';

export default function Subscription() {
  usePageTitle('Subscription');
  const { user } = useAuth();
  const { data: subscription } = useMySubscription();
  const { data: payments = [] } = usePaymentHistory();
  const [cancelOpen, setCancelOpen] = useState(false);
  const isFree = user?.role === 'free';

  const handleCancel = (reason: string) => {
    toast.success(`Subscription cancelled. Reason: ${reason}`);
    setCancelOpen(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Subscription</h1>
          <p className="text-sm text-[var(--st-text-secondary)]">Manage your plan and billing</p>
        </div>

        {subscription && <CurrentPlanCard subscription={isFree ? { id: 'free', plan: 'free', status: 'active', startDate: '', endDate: '', autoRenew: false } : subscription} />}

        {isFree ? (
          <div className="max-w-md">
            <UpgradeCTA />
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setCancelOpen(true)}
              className="px-4 py-2 rounded-xl border border-st-put/30 text-st-put text-sm font-medium hover:bg-st-put/10 transition-colors"
            >
              Cancel Subscription
            </button>
          </div>
        )}

        {!isFree && (
          <>
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Payment History</h2>
              <PaymentHistory payments={payments} />
            </div>
          </>
        )}

        <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={handleCancel} />
      </div>
    </DashboardLayout>
  );
}