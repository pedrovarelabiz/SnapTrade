import { Router, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { getLastBackupStatus } from "../scripts/backup-status.js";
import { BACKUP_SCHEDULE } from "../scripts/backup-config.js";
import * as Sentry from "@sentry/node";

const router = Router();

/**
 * Calculate the next scheduled backup time based on cron schedule
 * Assumes BACKUP_SCHEDULE is '0 2 * * *' (daily at 2 AM UTC)
 */
function getNextScheduledBackup(): Date {
  const now = new Date();
  const next = new Date();

  // Set to 2 AM UTC
  next.setUTCHours(2, 0, 0, 0);

  // If 2 AM has already passed today, schedule for tomorrow
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  if (!bytes || bytes < 0) return 'Unknown';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * GET /api/health/backup
 * Health check endpoint for backup status
 * Returns 200 if last backup was within 25 hours and successful
 * Returns 503 if backup is stale, failed, or missing
 */
router.get("/backup", async (_req: Request, res: Response) => {
  try {
    const backupStatus = await getLastBackupStatus();
    const now = new Date();
    const nextScheduled = getNextScheduledBackup();

    // If no backup status exists
    if (!backupStatus) {
      logger.warn("No backup status found");
      Sentry.captureMessage("No backup status found", "warning");
      return res.status(503).json({
        healthy: false,
        message: "No backup status available",
        lastBackup: null,
        nextScheduledBackup: nextScheduled.toISOString(),
      });
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

    // Log unhealthy status
    if (!isHealthy) {
      logger.warn({ backupStatus, hoursSinceBackup }, "Backup health check failed");
      Sentry.captureMessage(
        `Backup health check failed: ${hoursSinceBackup > 25 ? "stale backup" : "backup failed"}`,
        "warning"
      );
    }

    // Return 503 if unhealthy, 200 if healthy
    return res.status(isHealthy ? 200 : 503).json(responseData);

  } catch (err) {
    logger.error({ err }, "Error checking backup health");
    Sentry.captureMessage(
      `Error checking backup health: ${err instanceof Error ? err.message : "Unknown error"}`,
      "warning"
    );
    return res.status(503).json({
      healthy: false,
      error: "Failed to check backup health",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

export default router;
