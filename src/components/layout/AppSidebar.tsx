import { Link, useLocation } from 'react-router-dom';
import { Logo } from '@/components/shared/Logo';
import { PremiumBadge } from '@/components/shared/PremiumBadge';
import { UpgradeCTA } from '@/components/shared/UpgradeCTA';
import { useAuth } from '@/hooks/useAuth';
import { useSidebarContext } from '@/contexts/SidebarContext';
import {
  BarChart3, FileText, Settings, CreditCard, Users, Sliders, DollarSign,
  Activity, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react';

const navItems = [
  { label: 'Signals', icon: Activity, path: '/dashboard' },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { label: 'Reports', icon: FileText, path: '/reports' },
  { label: 'Subscription', icon: CreditCard, path: '/subscription' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

const adminItems = [
  { label: 'Users', icon: Users, path: '/admin/users' },
  { label: 'Config', icon: Sliders, path: '/admin/config' },
  { label: 'Revenue', icon: DollarSign, path: '/admin/revenue' },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { collapsed, toggleCollapsed } = useSidebarContext();

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-40 bg-[var(--st-bg-elevated)] border-r border-[var(--st-border)] transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-[260px]'}`}>
      <div className="flex items-center justify-between p-4 border-b border-[var(--st-border)]">
        {!collapsed && <Logo size="sm" />}
        <button onClick={toggleCollapsed} className="p-1.5 rounded-lg hover:bg-[var(--st-border)]/50 text-[var(--st-text-secondary)] transition-colors">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive(item.path)
                ? 'bg-st-accent/15 text-st-accent'
                : 'text-[var(--st-text-secondary)] hover:text-white hover:bg-[var(--st-border)]/30'
            }`}
          >
            <item.icon size={18} />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}

        {user?.role === 'admin' && (
          <>
            <div className={`pt-4 pb-2 ${collapsed ? 'px-3' : 'px-3'}`}>
              {!collapsed && <span className="text-[10px] uppercase tracking-wider text-[var(--st-text-secondary)] font-semibold">Admin</span>}
              {collapsed && <div className="h-px bg-[var(--st-border)]" />}
            </div>
            {adminItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive(item.path)
                    ? 'bg-st-accent/15 text-st-accent'
                    : 'text-[var(--st-text-secondary)] hover:text-white hover:bg-[var(--st-border)]/30'
                }`}
              >
                <item.icon size={18} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            ))}
          </>
        )}
      </nav>

      {!collapsed && user?.role === 'free' && (
        <div className="p-3">
          <UpgradeCTA />
        </div>
      )}

      <div className="p-3 border-t border-[var(--st-border)]">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="w-8 h-8 rounded-full bg-st-accent/20 flex items-center justify-center text-st-accent text-sm font-bold flex-shrink-0">
            {user?.name?.charAt(0) || 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white truncate">{user?.name}</span>
                {user?.role !== 'free' && <PremiumBadge />}
              </div>
              <p className="text-xs text-[var(--st-text-secondary)] truncate">{user?.email}</p>
            </div>
          )}
          {!collapsed && (
            <button onClick={logout} className="p-1.5 rounded-lg hover:bg-[var(--st-border)]/50 text-[var(--st-text-secondary)] transition-colors">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}