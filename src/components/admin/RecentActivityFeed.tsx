import { User } from '@/types';
import { UserPlus, Crown, CreditCard, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'signup' | 'upgrade' | 'payment' | 'cancellation' | 'verification';
  description: string;
  time: string;
}

function generateMockActivity(users: User[]): ActivityItem[] {
  const activities: ActivityItem[] = [];
  const now = Date.now();

  users.slice(0, 6).forEach((user, i) => {
    const types: ActivityItem['type'][] = ['signup', 'upgrade', 'payment', 'cancellation', 'verification'];
    const type = types[i % types.length];

    const descriptions: Record<ActivityItem['type'], string> = {
      signup: `${user.name} created a new account`,
      upgrade: `${user.name} upgraded to Premium`,
      payment: `Payment received from ${user.name}`,
      cancellation: `${user.name} cancelled subscription`,
      verification: `${user.name} verified their email`,
    };

    activities.push({
      id: `act-${i}`,
      type,
      description: descriptions[type],
      time: new Date(now - (i * 45 + Math.random() * 30) * 60000).toISOString(),
    });
  });

  return activities;
}

const typeConfig: Record<ActivityItem['type'], { icon: React.ElementType; color: string; bg: string }> = {
  signup: { icon: UserPlus, color: 'text-st-info', bg: 'bg-st-info/10' },
  upgrade: { icon: Crown, color: 'text-st-premium', bg: 'bg-st-premium/10' },
  payment: { icon: CreditCard, color: 'text-st-call', bg: 'bg-st-call/10' },
  cancellation: { icon: AlertTriangle, color: 'text-st-put', bg: 'bg-st-put/10' },
  verification: { icon: CheckCircle, color: 'text-st-accent', bg: 'bg-st-accent/10' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Props {
  users: User[];
}

export function RecentActivityFeed({ users }: Props) {
  const activities = generateMockActivity(users);

  return (
    <div className="rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] overflow-hidden">
      <div className="p-4 border-b border-[var(--st-border)] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
        <Clock size={14} className="text-[var(--st-text-secondary)]" />
      </div>

      <div className="divide-y divide-[var(--st-border)]">
        {activities.map(activity => {
          const config = typeConfig[activity.type];
          const Icon = config.icon;

          return (
            <div key={activity.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--st-bg-elevated)]/50 transition-colors">
              <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={14} className={config.color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--st-text-primary)] truncate">{activity.description}</p>
              </div>
              <span className="text-[10px] text-[var(--st-text-secondary)] whitespace-nowrap flex-shrink-0">
                {timeAgo(activity.time)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}