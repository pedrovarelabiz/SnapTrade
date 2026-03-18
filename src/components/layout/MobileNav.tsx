import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Activity, BarChart3, CreditCard, Settings, Shield } from 'lucide-react';

const tabs = [
  { label: 'Signals', icon: Activity, path: '/dashboard' },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { label: 'Billing', icon: CreditCard, path: '/subscription' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

const adminTab = { label: 'Admin', icon: Shield, path: '/admin/users' };

export function MobileNav() {
  const { user } = useAuth();
  const location = useLocation();

  const allTabs = user?.role === 'admin' ? [...tabs, adminTab] : tabs;
  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-[var(--st-border)]">
      <div className="flex items-center justify-around h-16 px-1">
        {allTabs.map(tab => (
          <Link
            key={tab.path}
            to={tab.path}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors min-w-0 ${
              isActive(tab.path) ? 'text-st-accent' : 'text-[var(--st-text-secondary)]'
            }`}
          >
            <tab.icon size={18} />
            <span className="text-[9px] font-medium truncate">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}