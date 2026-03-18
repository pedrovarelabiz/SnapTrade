import { Payment } from '@/types';

interface Props {
  payments: Payment[];
}

const methodLabels: Record<string, string> = { btc: '₿ BTC', eth: 'Ξ ETH', usdt: '₮ USDT', paypal: '🅿 PayPal' };

export function PaymentHistory({ payments }: Props) {
  if (payments.length === 0) {
    return (
      <div className="p-8 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] text-center">
        <p className="text-[var(--st-text-secondary)]">No payment history</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--st-border)]">
              <th className="text-left text-xs font-medium text-[var(--st-text-secondary)] px-4 py-3">Date</th>
              <th className="text-left text-xs font-medium text-[var(--st-text-secondary)] px-4 py-3">Description</th>
              <th className="text-left text-xs font-medium text-[var(--st-text-secondary)] px-4 py-3">Method</th>
              <th className="text-right text-xs font-medium text-[var(--st-text-secondary)] px-4 py-3">Amount</th>
              <th className="text-right text-xs font-medium text-[var(--st-text-secondary)] px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(payment => (
              <tr key={payment.id} className="border-b border-[var(--st-border)] last:border-0">
                <td className="px-4 py-3 text-sm text-white whitespace-nowrap">{new Date(payment.date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-sm text-[var(--st-text-secondary)]">{payment.description}</td>
                <td className="px-4 py-3 text-sm text-[var(--st-text-primary)]">{methodLabels[payment.method]}</td>
                <td className="px-4 py-3 text-sm text-white text-right font-mono tabular-nums">${payment.amount}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    payment.status === 'completed' ? 'bg-st-call/15 text-st-call' :
                    payment.status === 'refunded' ? 'bg-st-premium/15 text-st-premium' :
                    payment.status === 'failed' ? 'bg-st-put/15 text-st-put' :
                    'bg-st-info/15 text-st-info'
                  }`}>
                    {payment.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
