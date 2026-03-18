import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ExtensionSettings } from '@/components/extension/ExtensionSettings';
import { LockedChartOverlay } from '@/components/analytics/LockedChartOverlay';
import { useAuth } from '@/hooks/useAuth';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Bell, Monitor, Chrome } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const { user } = useAuth();
  const isFree = user?.role === 'free';
  const [name, setName] = useState(user?.name || '');
  const [email] = useState(user?.email || '');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm text-[var(--st-text-secondary)]">Manage your account preferences</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-[var(--st-bg-card)] border border-[var(--st-border)] p-1 rounded-xl">
            <TabsTrigger value="profile" className="rounded-lg data-[state=active]:bg-st-accent/15 data-[state=active]:text-st-accent text-[var(--st-text-secondary)] text-sm gap-2">
              <User size={14} /> Profile
            </TabsTrigger>
            <TabsTrigger value="notifications" className="rounded-lg data-[state=active]:bg-st-accent/15 data-[state=active]:text-st-accent text-[var(--st-text-secondary)] text-sm gap-2">
              <Bell size={14} /> Notifications
            </TabsTrigger>
            <TabsTrigger value="display" className="rounded-lg data-[state=active]:bg-st-accent/15 data-[state=active]:text-st-accent text-[var(--st-text-secondary)] text-sm gap-2">
              <Monitor size={14} /> Display
            </TabsTrigger>
            <TabsTrigger value="extension" className="rounded-lg data-[state=active]:bg-st-accent/15 data-[state=active]:text-st-accent text-[var(--st-text-secondary)] text-sm gap-2">
              <Chrome size={14} /> Extension
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <div className="max-w-lg space-y-4">
              <div className="p-6 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--st-text-primary)] mb-2">Full Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm focus:outline-none focus:border-st-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--st-text-primary)] mb-2">Email</label>
                  <input type="email" value={email} readOnly
                    className="w-full px-4 py-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-[var(--st-text-secondary)] text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--st-text-primary)] mb-2">New Password</label>
                  <input type="password" placeholder="Leave blank to keep current"
                    className="w-full px-4 py-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm placeholder:text-[var(--st-text-secondary)]/50 focus:outline-none focus:border-st-accent" />
                </div>
                <button onClick={() => toast.success('Profile updated!')} className="px-6 py-2.5 rounded-xl bg-st-accent text-white font-semibold text-sm hover:bg-st-accent/90 transition-colors">
                  Save Changes
                </button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications">
            <div className="max-w-lg space-y-3">
              {[
                { label: 'Sound Alerts', desc: 'Play sound when new signals arrive', default: true },
                { label: 'Push Notifications', desc: 'Browser push notifications for signals', default: false },
                { label: 'Email Digest', desc: 'Daily email summary of signals and results', default: true },
                { label: 'Marketing Emails', desc: 'Product updates and promotions', default: false },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
                  <div>
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="text-xs text-[var(--st-text-secondary)]">{item.desc}</p>
                  </div>
                  <Switch defaultChecked={item.default} />
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="display">
            <div className="max-w-lg space-y-3">
              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
                <div>
                  <p className="text-sm font-medium text-white">Auto-hide Resolved Signals</p>
                  <p className="text-xs text-[var(--st-text-secondary)]">Hide win/loss/skipped signals after 30 minutes</p>
                </div>
                <Switch defaultChecked={false} />
              </div>
              <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
                <label className="block text-sm font-medium text-white mb-2">Timezone</label>
                <select className="w-full px-3 py-2 rounded-lg bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm focus:outline-none focus:border-st-accent">
                  <option>Auto (Browser)</option>
                  <option>UTC</option>
                  <option>EST (UTC-5)</option>
                  <option>CET (UTC+1)</option>
                  <option>JST (UTC+9)</option>
                </select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="extension">
            <div className="max-w-lg">
              {isFree ? (
                <LockedChartOverlay>
                  <ExtensionSettings />
                </LockedChartOverlay>
              ) : (
                <ExtensionSettings />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
