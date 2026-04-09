import dotenv from "dotenv";
dotenv.config();

import { getLastBackupStatus } from "./scripts/backup-status.js";
import { BACKUP_SCHEDULE, LOCAL_BACKUP_DIR } from "./scripts/backup-config.js";
import * as path from "path";

/**
 * Standalone test for the backup health endpoint logic
 */

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  if (!bytes || bytes < 0) return 'Unknown';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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

async function testBackupHealthEndpoint() {
  try {
    console.log("Testing /api/health/backup endpoint logic...\n");
    console.log(`LOCAL_BACKUP_DIR: ${LOCAL_BACKUP_DIR}`);
    console.log(`Expected status file: ${path.join(LOCAL_BACKUP_DIR, 'status', 'last-backup-status.json')}\n`);

    const backupStatus = await getLastBackupStatus();
    const now = new Date();
    const nextScheduled = getNextScheduledBackup();

    // Test Case 1: No backup status exists
    if (!backupStatus) {
      const response = {
        status: 503,
        body: {
          healthy: false,
          message: "No backup status available",
          lastBackup: null,
          nextScheduledBackup: nextScheduled.toISOString(),
        }
      };
      console.log("TEST CASE: No backup exists");
      console.log(`HTTP Status: ${response.status}`);
      console.log("Response:", JSON.stringify(response.body, null, 2));
      return response;
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

    const httpStatus = isHealthy ? 200 : 503;

    console.log("TEST CASE: Backup status exists");
    console.log(`HTTP Status: ${httpStatus}`);
    console.log("Response:", JSON.stringify(responseData, null, 2));

    return { status: httpStatus, body: responseData };

  } catch (err) {
    const errorResponse = {
      status: 503,
      body: {
        healthy: false,
        error: "Failed to check backup health",
        message: err instanceof Error ? err.message : "Unknown error",
      }
    };
    console.log("TEST CASE: Error occurred");
    console.log(`HTTP Status: ${errorResponse.status}`);
    console.log("Response:", JSON.stringify(errorResponse.body, null, 2));
    return errorResponse;
  }
}

// Run the test
testBackupHealthEndpoint()
  .then(() => {
    console.log("\n✓ Test completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n✗ Test failed:", err);
    process.exit(1);
  });
