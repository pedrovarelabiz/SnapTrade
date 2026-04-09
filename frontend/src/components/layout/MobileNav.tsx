import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSignals } from '@/hooks/useSignals';
import { Activity, BarChart3, CreditCard, FileText, Settings, Shield, LogOut } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const tabs = [
  { label: 'Signals', icon: Activity, path: '/dashboard' },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { label: 'Subscription', icon: CreditCard, path: '/subscription' },
  { label: 'Reports', icon: FileText, path: '/reports' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

const adminTab = { label: 'Admin', icon: Shield, path: '/admin' };

export function MobileNav() {
  const { user, logout } = useAuth();
  const { signals } = useSignals();
  const location = useLocation();
  const navigate = useNavigate();
  const [showLogout, setShowLogout] = useState(false);

  const allTabs = user?.role === 'admin' ? [...tabs, adminTab] : tabs;
  const isActive = (path: string) => location.pathname.startsWith(path);

  // Count active/pending signals for notification dot
  const activeSignalCount = signals.filter(
    s => s.status === 'pending' || s.status === 'active'
  ).length;

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out successfully');
    navigate('/');
  };

  return (
    <>
      {showLogout && (
        <div className="lg:hidden fixed inset-0 z-[60] flex items-end justify-center pb-20">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowLogout(false)} />
          <div className="relative w-[calc(100%-2rem)] max-w-sm p-4 rounded-2xl bg-[var(--st-bg-card)] border border-[var(--st-border)] shadow-2xl animate-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-st-accent/20 flex items-center justify-center text-st-accent text-sm font-bold">{user?.name?.charAt(0) || 'U'}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-[var(--st-text-secondary)] truncate">{user?.email}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowLogout(false)} className="flex-1 py-2.5 rounded-xl border border-[var(--st-border)] text-white text-sm font-medium hover:bg-[var(--st-border)]/30 transition-colors">Cancel</button>
              <button onClick={handleLogout} className="flex-1 py-2.5 rounded-xl bg-st-put/10 border border-st-put/30 text-st-put text-sm font-semibold hover:bg-st-put/20 transition-colors flex items-center justify-center gap-2">
                <LogOut size={14} />Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-[var(--st-border)]">
        <div className="flex items-center justify-around h-16 px-1">
          {allTabs.map(tab => {
            const showDot = tab.path === '/dashboard' && activeSignalCount > 0 && !isActive('/dashboard');
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors min-w-0 ${
                  isActive(tab.path) ? 'text-st-accent' : 'text-[var(--st-text-secondary)]'
                }`}
              >
                <tab.icon size={18} />
                <span className="text-[9px] font-medium truncate">{tab.label}</span>
                {showDot && (
                  <span className="absolute top-0.5 right-0.5 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-st-accent opacity-75" />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-st-accent items-center justify-center">
                      <span className="text-[7px] font-bold text-white">{activeSignalCount > 9 ? '9+' : activeSignalCount}</span>
                    </span>
                  </span>
                )}
              </Link>
            );
          })}
          <button onClick={() => setShowLogout(true)} className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors min-w-0 text-[var(--st-text-secondary)]">
            <div className="w-[18px] h-[18px] rounded-full bg-st-accent/30 flex items-center justify-center text-st-accent text-[8px] font-bold">{user?.name?.charAt(0) || 'U'}</div>
            <span className="text-[9px] font-medium truncate">Account</span>
          </button>
        </div>
      </nav>
    </>
  );
}