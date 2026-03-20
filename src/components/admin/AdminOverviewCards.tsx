import { Users, DollarSign, Activity, TrendingUp, AlertTriangle, Zap } from 'lucide-react';
import { RevenueStats, User } from '@/types';

interface Props {
  revenueStats: RevenueStats;
  users: User[];
  totalSignalsToday: number;
}

export function AdminOverviewCards({ revenueStats, users, totalSignalsToday }: Props) {
  const premiumUsers = users.filter(u => u.role === 'premium').length;
  const freeUsers = users.filter(u => u.role === 'free').length;
  const conversionRate = users.length > 0 ? Math.round((premiumUsers / users.length) * 100) : 0;

  const cards = [
    {
      label: 'Monthly Revenue',
      value: `$${revenueStats.mrr.toLocaleString()}`,
      subtext: `${revenueStats.newSubscriptionsThisMonth} new this month`,
      icon: DollarSign,
      color: 'text-st-call',
      bg: 'bg-st-call/10',
      border: 'border-st-call/20',
    },
    {
      label: 'Total Users',
      value: users.length.toString(),
      subtext: `${premiumUsers} premium · ${freeUsers} free`,
      icon: Users,
      color: 'text-st-info',
      bg: 'bg-st-info/10',
      border: 'border-st-info/20',
    },
    {
      label: 'Conversion Rate',
      value: `${conversionRate}%`,
      subtext: `${premiumUsers} of ${users.length} users`,
      icon: TrendingUp,
      color: 'text-st-accent',
      bg: 'bg-st-accent/10',
      border: 'border-st-accent/20',
    },
    {
      label: 'Signals Today',
      value: totalSignalsToday.toString(),
      subtext: 'Generated today',
      icon: Zap,
      color: 'text-st-premium',
      bg: 'bg-st-premium/10',
      border: 'border-st-premium/20',
    },
    {
      label: 'Churn Rate',
      value: `${revenueStats.churnRate}%`,
      subtext: 'Monthly churn',
      icon: AlertTriangle,
      color: revenueStats.churnRate > 5 ? 'text-st-put' : 'text-st-call',
      bg: revenueStats.churnRate > 5 ? 'bg-st-put/10' : 'bg-st-call/10',
      border: revenueStats.churnRate > 5 ? 'border-st-put/20' : 'border-st-call/20',
    },
    {
      label: 'Active Subs',
      value: revenueStats.activeSubscriptions.toString(),
      subtext: `$${Math.round(revenueStats.mrr / Math.max(revenueStats.activeSubscriptions, 1))}/avg`,
      icon: Activity,
      color: 'text-st-info',
      bg: 'bg-st-info/10',
      border: 'border-st-info/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`p-4 rounded-xl bg-[var(--st-bg-card)] border ${card.border}`}>
          <div className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
            <card.icon size={16} className={card.color} />
          </div>
          <p className={`text-xl font-bold tabular-nums ${card.color}`}>{card.value}</p>
          <p className="text-[10px] text-[var(--st-text-secondary)] mt-0.5 font-medium">{card.label}</p>
          <p className="text-[9px] text-[var(--st-text-secondary)]/60 mt-0.5">{card.subtext}</p>
        </div>
      ))}
    </div>
  );
}