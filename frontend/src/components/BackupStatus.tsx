import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock, HardDrive } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface BackupStatusProps {
  status: 'success' | 'failure' | 'in_progress';
  lastBackupTime?: Date;
  backupSize?: number;
  progress?: number;
  errorMessage?: string;
  isAdmin?: boolean;
  onTriggerBackup?: () => void;
}

export function BackupStatus({
  status,
  lastBackupTime,
  backupSize,
  progress = 0,
  errorMessage,
  isAdmin = false,
  onTriggerBackup,
}: BackupStatusProps) {
  const getRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const formatSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'success':
        return (
          <Badge variant="default" className="bg-st-call/10 text-st-call border-st-call/20">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Success
          </Badge>
        );
      case 'failure':
        return (
          <Badge variant="destructive" className="bg-st-put/10 text-st-put border-st-put/20">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge variant="secondary" className="bg-st-info/10 text-st-info border-st-info/20">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            In Progress
          </Badge>
        );
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Backup Status</CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Last Backup Time */}
        {lastBackupTime && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Last backup:</span>
            <span className="font-medium">{getRelativeTime(lastBackupTime)}</span>
          </div>
        )}

        {/* Backup Size */}
        {backupSize !== undefined && (
          <div className="flex items-center gap-2 text-sm">
            <HardDrive className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Backup size:</span>
            <span className="font-medium">{formatSize(backupSize)}</span>
          </div>
        )}

        {/* Progress Bar (only show when in progress) */}
        {status === 'in_progress' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Error Message */}
        {status === 'failure' && errorMessage && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-st-put/5 border border-st-put/20">
            <AlertCircle className="w-4 h-4 text-st-put mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-st-put">Error</p>
              <p className="text-xs text-muted-foreground mt-1">{errorMessage}</p>
            </div>
          </div>
        )}
      </CardContent>

      {/* Manual Trigger Button (Admin Only) */}
      {isAdmin && (
        <CardFooter>
          <Button
            onClick={onTriggerBackup}
            disabled={status === 'in_progress'}
            variant="outline"
            className="w-full"
            size="sm"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${status === 'in_progress' ? 'animate-spin' : ''}`} />
            {status === 'in_progress' ? 'Backup in Progress...' : 'Trigger Manual Backup'}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
