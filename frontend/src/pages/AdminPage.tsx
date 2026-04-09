import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useQuery } from '@tanstack/react-query';
import { Shield, Database, Download, RefreshCw, CheckCircle2, XCircle, Clock, HardDrive } from 'lucide-react';

interface BackupInfo {
  timestamp: string;
  size: number;
  status: 'success' | 'failure';
  filename: string;
}

interface BackupStatus {
  lastBackup: BackupInfo | null;
  nextScheduledBackup: string;
  recentBackups: BackupInfo[];
}

async function fetchBackupStatus(): Promise<BackupStatus> {
  const response = await fetch('/api/admin/backup-status');
  if (!response.ok) throw new Error('Failed to fetch backup status');
  return response.json();
}

async function triggerManualBackup(): Promise<void> {
  const response = await fetch('/api/admin/backup-status', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to trigger backup');
}

export default function AdminPage() {
  const { data: backupStatus, refetch } = useQuery({
    queryKey: ['admin', 'backup-status'],
    queryFn: fetchBackupStatus,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const handleManualBackup = async () => {
    try {
      await triggerManualBackup();
      refetch();
    } catch (error) {
      console.error('Manual backup failed:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-st-put/10 flex items-center justify-center">
              <Shield size={18} className="text-st-put" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-sm text-[var(--st-text-secondary)]">System backup and maintenance</p>
            </div>
          </div>
        </div>

        {/* Backup Status Section */}
        <div className="bg-[var(--st-bg-card)] border border-[var(--st-border)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Database size={20} className="text-st-accent" />
              <h2 className="text-lg font-semibold text-white">Backup Status</h2>
            </div>
            <button
              onClick={handleManualBackup}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-st-accent/10 border border-st-accent/30 text-sm text-st-accent hover:bg-st-accent/20 transition-colors"
            >
              <RefreshCw size={16} />
              Trigger Manual Backup
            </button>
          </div>

          {backupStatus ? (
            <>
              {/* Last Backup Info */}
              {backupStatus.lastBackup ? (
                <div className="grid md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-[var(--st-bg-secondary)] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={16} className="text-[var(--st-text-secondary)]" />
                      <span className="text-xs text-[var(--st-text-secondary)]">Last Backup</span>
                    </div>
                    <p className="text-sm font-medium text-white">
                      {formatTimestamp(backupStatus.lastBackup.timestamp)}
                    </p>
                  </div>

                  <div className="bg-[var(--st-bg-secondary)] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      {backupStatus.lastBackup.status === 'success' ? (
                        <CheckCircle2 size={16} className="text-green-500" />
                      ) : (
                        <XCircle size={16} className="text-red-500" />
                      )}
                      <span className="text-xs text-[var(--st-text-secondary)]">Status</span>
                    </div>
                    <p className={`text-sm font-medium ${backupStatus.lastBackup.status === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                      {backupStatus.lastBackup.status === 'success' ? 'Success' : 'Failed'}
                    </p>
                  </div>

                  <div className="bg-[var(--st-bg-secondary)] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive size={16} className="text-[var(--st-text-secondary)]" />
                      <span className="text-xs text-[var(--st-text-secondary)]">Backup Size</span>
                    </div>
                    <p className="text-sm font-medium text-white">
                      {formatFileSize(backupStatus.lastBackup.size)}
                    </p>
                  </div>

                  <div className="bg-[var(--st-bg-secondary)] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={16} className="text-[var(--st-text-secondary)]" />
                      <span className="text-xs text-[var(--st-text-secondary)]">Next Scheduled</span>
                    </div>
                    <p className="text-sm font-medium text-white">
                      {formatTimestamp(backupStatus.nextScheduledBackup)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--st-bg-secondary)] rounded-lg p-4 mb-6 text-center">
                  <p className="text-sm text-[var(--st-text-secondary)]">No backups found</p>
                </div>
              )}

              {/* Recent Backups List */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Recent Backups</h3>
                <div className="space-y-2">
                  {backupStatus.recentBackups.length > 0 ? (
                    backupStatus.recentBackups.map((backup, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-[var(--st-bg-secondary)] rounded-lg p-4 hover:bg-[var(--st-bg-secondary)]/80 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {backup.status === 'success' ? (
                            <CheckCircle2 size={16} className="text-green-500" />
                          ) : (
                            <XCircle size={16} className="text-red-500" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-white">{backup.filename}</p>
                            <p className="text-xs text-[var(--st-text-secondary)]">
                              {formatTimestamp(backup.timestamp)} • {formatFileSize(backup.size)}
                            </p>
                          </div>
                        </div>
                        {backup.status === 'success' && (
                          <a
                            href={`/api/admin/backup-status/download/${encodeURIComponent(backup.filename)}`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-st-accent/10 border border-st-accent/30 text-xs text-st-accent hover:bg-st-accent/20 transition-colors"
                            download
                          >
                            <Download size={14} />
                            Download
                          </a>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="bg-[var(--st-bg-secondary)] rounded-lg p-4 text-center">
                      <p className="text-sm text-[var(--st-text-secondary)]">No recent backups available</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="animate-spin text-st-accent" size={24} />
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
