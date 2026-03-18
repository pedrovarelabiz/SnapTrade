import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Activity, BarChart3, FileText, Settings, Shield } from 'lucide-react';

const tabs = [
  { label: 'Signals', icon: Activity, path: '/dashboard' },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { label: 'Reports', icon: FileText, path: '/reports' },
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
      <div className="flex items-center justify-around h-16 px-2">
        {allTabs.map(tab => (
          <Link
            key={tab.path}
            to={tab.path}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors ${
              isActive(tab.path) ? 'text-st-accent' : 'text-[var(--st-text-secondary)]'
            }`}
          >
            <tab.icon size={20} />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
