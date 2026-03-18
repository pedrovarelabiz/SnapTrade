import { useContext, useState } from 'react';
import { AuthContext } from '@/contexts/AuthContext';
import { UserRole } from '@/types';
import { Shield, Crown, User, ChevronUp, ChevronDown } from 'lucide-react';

const roles: { role: UserRole; label: string; icon: React.ElementType; color: string }[] = [
  { role: 'free', label: 'Free', icon: User, color: 'text-[var(--st-text-secondary)]' },
  { role: 'premium', label: 'Premium', icon: Crown, color: 'text-st-premium' },
  { role: 'admin', label: 'Admin', icon: Shield, color: 'text-st-put' },
];

export function RoleSwitcher() {
  const context = useContext(AuthContext);
  const [open, setOpen] = useState(false);

  if (!context || !context.user) return null;

  const { user, switchRole } = context;

  return (
    <div className="fixed bottom-4 right-4 z-[100] lg:bottom-6 lg:right-6">
      <div className={`transition-all duration-200 ${open ? 'mb-2' : ''}`}>
        {open && (
          <div className="mb-2 p-2 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] shadow-xl space-y-1 animate-fade-up">
            <p className="text-[10px] text-[var(--st-text-secondary)] px-2 py-1 font-semibold uppercase tracking-wider">Switch Role</p>
            {roles.map(r => (
              <button
                key={r.role}
                onClick={() => { switchRole(r.role); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  user.role === r.role ? 'bg-st-accent/15 text-st-accent' : 'text-[var(--st-text-secondary)] hover:text-white hover:bg-[var(--st-border)]/30'
                }`}
              >
                <r.icon size={14} className={user.role === r.role ? 'text-st-accent' : r.color} />
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] shadow-xl text-sm font-medium text-[var(--st-text-primary)] hover:border-st-accent/30 transition-all"
      >
        <div className="w-2 h-2 rounded-full bg-st-accent animate-pulse" />
        <span>Demo: {user.role}</span>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
    </div>
  );
}
