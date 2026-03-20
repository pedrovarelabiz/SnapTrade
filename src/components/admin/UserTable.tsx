import { useState } from 'react';
import { User } from '@/types';
import { PremiumBadge } from '@/components/shared/PremiumBadge';
import { Search, Shield, Crown, UserIcon } from 'lucide-react';

interface Props {
  users: User[];
  onUpdateRole: (userId: string, role: User['role']) => void;
}

const roleIcons: Record<string, React.ElementType> = { admin: Shield, premium: Crown, free: UserIcon };

export function UserTable({ users, onUpdateRole }: Props) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--st-text-secondary)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] text-white text-sm placeholder:text-[var(--st-text-secondary)]/50 focus:outline-none focus:border-st-accent"
          />
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
          {['all', 'admin', 'premium', 'free'].map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                roleFilter === r ? 'bg-st-accent/15 text-st-accent' : 'text-[var(--st-text-secondary)] hover:text-white'
              }`}
            >
              {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--st-border)]">
                <th className="text-left text-xs font-medium text-[var(--st-text-secondary)] px-4 py-3">User</th>
                <th className="text-left text-xs font-medium text-[var(--st-text-secondary)] px-4 py-3">Role</th>
                <th className="text-left text-xs font-medium text-[var(--st-text-secondary)] px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-[var(--st-text-secondary)] px-4 py-3">Joined</th>
                <th className="text-right text-xs font-medium text-[var(--st-text-secondary)] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => {
                const RoleIcon = roleIcons[user.role] || UserIcon;
                return (
                  <tr key={user.id} className="border-b border-[var(--st-border)] last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-st-accent/20 flex items-center justify-center text-st-accent text-xs font-bold">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{user.name}</p>
                          <p className="text-xs text-[var(--st-text-secondary)]">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <RoleIcon size={12} className={user.role === 'admin' ? 'text-st-put' : user.role === 'premium' ? 'text-st-premium' : 'text-[var(--st-text-secondary)]'} />
                        <span className="text-sm text-[var(--st-text-primary)]">{user.role}</span>
                        {user.role !== 'free' && <PremiumBadge />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${user.isVerified ? 'bg-st-call/15 text-st-call' : 'bg-st-premium/15 text-st-premium'}`}>
                        {user.isVerified ? 'Verified' : 'Unverified'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--st-text-secondary)]">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <select
                        value={user.role}
                        onChange={e => onUpdateRole(user.id, e.target.value as User['role'])}
                        className="px-2 py-1 rounded-lg bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-xs focus:outline-none focus:border-st-accent"
                      >
                        <option value="free">Free</option>
                        <option value="premium">Premium</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-[var(--st-text-secondary)] text-center">{filtered.length} of {users.length} users</p>
    </div>
  );
}
