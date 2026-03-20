import { RevenueStats as RevenueStatsType } from '@/types';
import { DollarSign, Users, CreditCard, TrendingDown, TrendingUp, UserPlus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  stats: RevenueStatsType;
}

export function RevenueStatsPanel({ stats }: Props) {
  const cards = [
    { label: 'MRR', value: `$${stats.mrr.toLocaleString()}`, icon: DollarSign, color: 'text-st-call', bg: 'bg-st-call/10' },
    { label: 'Total Revenue', value: `$${stats.totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-st-accent', bg: 'bg-st-accent/10' },
    { label: 'Total Users', value: stats.totalUsers.toLocaleString(), icon: Users, color: 'text-st-info', bg: 'bg-st-info/10' },
    { label: 'Active Subs', value: stats.activeSubscriptions.toString(), icon: CreditCard, color: 'text-st-premium', bg: 'bg-st-premium/10' },
    { label: 'Churn Rate', value: `${stats.churnRate}%`, icon: TrendingDown, color: 'text-st-put', bg: 'bg-st-put/10' },
    { label: 'New This Month', value: stats.newSubscriptionsThisMonth.toString(), icon: UserPlus, color: 'text-st-call', bg: 'bg-st-call/10' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(card => (
          <div key={card.label} className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
            <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center mb-2`}>
              <card.icon size={16} className={card.color} />
            </div>
            <p className="text-lg font-bold text-white tabular-nums">{card.value}</p>
            <p className="text-[10px] text-[var(--st-text-secondary)]">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="p-5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
        <h3 className="text-sm font-semibold text-white mb-4">Revenue History</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.revenueHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
              <XAxis dataKey="month" tick={{ fill: '#8888a8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#8888a8', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#12121a', border: '1px solid #2a2a3e', borderRadius: '12px', fontSize: '12px' }}
                labelStyle={{ color: '#e8e8f0' }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
              />
              <Bar dataKey="revenue" fill="#7c4dff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
