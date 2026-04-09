import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PlatformConfigForm } from '@/components/admin/PlatformConfigForm';
import { SignalManager } from '@/components/admin/SignalManager';
import { useSignals } from '@/hooks/useSignals';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function AdminConfig() {
  usePageTitle('Admin — Config');
  const { signals, updateSignalStatus } = useSignals();

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Configuration</h1>
          <p className="text-sm text-[var(--st-text-secondary)]">Manage platform settings and signal generation</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-4">General Settings</h2>
          <PlatformConfigForm />
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Signal Management</h2>
          <SignalManager signals={signals} onUpdateStatus={updateSignalStatus} />
        </div>
      </div>
    </DashboardLayout>
  );
}