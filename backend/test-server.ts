#!/usr/bin/env tsx
/**
 * Minimal test server for backup health endpoint
 */

import express from "express";
import * as fs from 'fs';
import * as path from 'path';

const app = express();
const PORT = 3002;

const LOCAL_BACKUP_DIR = '/tmp/snaptrade-backups';
const STATUS_FILE_PATH = path.join(LOCAL_BACKUP_DIR, 'status', 'last-backup-status.json');
const BACKUP_SCHEDULE = '0 2 * * *';

interface BackupStatus {
  timestamp: string;
  success: boolean;
  fileSize?: number;
  s3Url?: string;
  duration?: number;
  errorMessage?: string;
}

function getLastBackupStatus(): BackupStatus | null {
  if (!fs.existsSync(STATUS_FILE_PATH)) {
    return null;
  }
  const data = fs.readFileSync(STATUS_FILE_PATH, 'utf-8');
  return JSON.parse(data) as BackupStatus;
}

function getNextScheduledBackup(): Date {
  const now = new Date();
  const next = new Date();
  next.setUTCHours(2, 0, 0, 0);
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  if (!bytes || bytes < 0) return 'Unknown';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

app.get("/api/health/backup", async (req, res) => {
  try {
    const backupStatus = getLastBackupStatus();
    const now = new Date();
    const nextScheduled = getNextScheduledBackup();

    if (!backupStatus) {
      return res.status(503).json({
        healthy: false,
        message: "No backup status available",
        lastBackup: null,
        nextScheduledBackup: nextScheduled.toISOString(),
      });
    }

    const lastBackupTime = new Date(backupStatus.timestamp);
    const hoursSinceBackup = (now.getTime() - lastBackupTime.getTime()) / (1000 * 60 * 60);
    const isHealthy = hoursSinceBackup <= 25 && backupStatus.success;

    const responseData = {
      healthy: isHealthy,
      message: isHealthy
        ? "Backup system is healthy"
        : hoursSinceBackup > 25
          ? "Last backup is stale (>25 hours old)"
          : "Last backup failed",
      lastBackup: {
        timestamp: backupStatus.timestamp,
        success: backupStatus.success,
        fileSize: backupStatus.fileSize ? formatBytes(backupStatus.fileSize) : 'Unknown',
        fileSizeBytes: backupStatus.fileSize,
        hoursSinceBackup: parseFloat(hoursSinceBackup.toFixed(2)),
        s3Url: backupStatus.s3Url,
        duration: backupStatus.duration,
        errorMessage: backupStatus.errorMessage,
      },
      nextScheduledBackup: nextScheduled.toISOString(),
      schedule: BACKUP_SCHEDULE,
    };

    return res.status(isHealthy ? 200 : 503).json(responseData);

  } catch (err) {
    return res.status(503).json({
      healthy: false,
      error: "Failed to check backup health",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log(`Test: curl -s http://localhost:${PORT}/api/health/backup | jq .`);
});
