#!/usr/bin/env tsx
/**
 * Standalone test script for backup health endpoint
 * Tests the backup health endpoint logic without requiring database
 */

// Set env vars before any imports
process.env.LOCAL_BACKUP_DIR = '/tmp/snaptrade-backups';

import { getLastBackupStatus } from "./scripts/backup-status.js";
import { BACKUP_SCHEDULE } from "./scripts/backup-config.js";

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

async function testBackupHealth() {
  console.log("=== Testing Backup Health Endpoint ===\n");

  try {
    const backupStatus = await getLastBackupStatus();
    const now = new Date();
    const nextScheduled = getNextScheduledBackup();

    // If no backup status exists
    if (!backupStatus) {
      console.log("HTTP Status: 503");
      console.log(JSON.stringify({
        healthy: false,
        message: "No backup status available",
        lastBackup: null,
        nextScheduledBackup: nextScheduled.toISOString(),
      }, null, 2));
      return;
    }

    // Parse backup timestamp
    const lastBackupTime = new Date(backupStatus.timestamp);
    const hoursSinceBackup = (now.getTime() - lastBackupTime.getTime()) / (1000 * 60 * 60);

    // Check if backup is within 25 hours and was successful
    const isHealthy = hoursSinceBackup <= 25 && backupStatus.success;

    // Prepare response data
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

    console.log(`HTTP Status: ${isHealthy ? 200 : 503}`);
    console.log(JSON.stringify(responseData, null, 2));

  } catch (err) {
    console.log("HTTP Status: 503");
    console.log(JSON.stringify({
      healthy: false,
      error: "Failed to check backup health",
      message: err instanceof Error ? err.message : "Unknown error",
    }, null, 2));
  }
}

testBackupHealth();
