import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sparkles, Zap, BarChart3, Chrome, Shield, DollarSign, Trophy } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const updates = [
  {
    version: '2.6.0',
    date: 'Today',
    icon: Trophy,
    color: 'text-st-premium',
    bg: 'bg-st-premium/10',
    items: [
      'Top Performers widget showing best assets by win rate & P&L',
      'Signal Quality breakdown (Direct, Gale 1, Gale 2, Loss)',
      'Active Signals banner with next entry time',
      'Mobile notification dots for pending signals',
      'Auto-reconnect countdown when disconnected',
      'Streak motivation messages in Welcome Banner',
      'Simplified OTC market status indicator',
    ],
  },
  {
    version: '2.5.0',
    date: 'Last Update',
    icon: DollarSign,
    color: 'text-st-call',
    bg: 'bg-st-call/10',
    items: [
      'Full P&L tracking per signal with gale-level breakdown',
      'Daily P&L chart on Analytics page',
      'P&L badges on signal cards (Direct Win, Gale 1, Gale 2)',
      'Hover tooltips showing invested/return/net P&L',
      'Today\'s P&L in Welcome Banner and Stats',
      'CSV export now includes P&L and result type data',
    ],
  },
  {
    version: '2.4.0',
    date: '1 Week Ago',
    icon: Zap,
    color: 'text-st-accent',
    bg: 'bg-st-accent/10',
    items: [
      'Live notification sounds for new signals',
      'Weekly performance mini-chart on Dashboard',
      'Streak visualization showing recent W/L pattern',
      'UTC clock with OTC market status',
    ],
  },
  {
    version: '2.3.0',
    date: '2 Weeks Ago',
    icon: BarChart3,
    color: 'text-st-info',
    bg: 'bg-st-info/10',
    items: [
      'Asset performance leaderboard table',
      'Date range filters on Analytics & Reports',
      'CSV export for signals and reports',
      'Improved skeleton loading states',
    ],
  },
  {
    version: '2.2.0',
    date: '3 Weeks Ago',
    icon: Chrome,
    color: 'text-st-premium',
    bg: 'bg-st-premium/10',
    items: [
      'Chrome Extension settings with 7 config sections',
      'Scheduled & Instant signal types',
      'OTC pair support with dedicated badges',
      'Martingale schedule display on signal cards',
    ],
  },
  {
    version: '2.1.0',
    date: '4 Weeks Ago',
    icon: Shield,
    color: 'text-st-call',
    bg: 'bg-st-call/10',
    items: [
      'Admin dashboard with revenue overview',
      'User management with role switching',
      'Platform configuration panel',
      'Recent activity feed',
    ],
  },
];

export function WhatsNewModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--st-bg-card)] border-[var(--st-border)] text-white max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-st-accent/10 flex items-center justify-center">
              <Sparkles size={18} className="text-st-accent" />
            </div>
            <div>
              <DialogTitle className="text-white text-lg">What's New</DialogTitle>
              <p className="text-xs text-[var(--st-text-secondary)]">Latest updates and improvements</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {updates.map((update) => {
            const Icon = update.icon;
            return (
              <div key={update.version} className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-lg ${update.bg} flex items-center justify-center`}>
                    <Icon size={14} className={update.color} />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white">v{update.version}</span>
                    <span className="text-xs text-[var(--st-text-secondary)] ml-2">{update.date}</span>
                  </div>
                </div>
                <ul className="space-y-1.5 ml-11">
                  {update.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--st-text-primary)]">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${update.bg} flex-shrink-0`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}