/**
 * Database Backup Scheduler Script
 *
 * This script uses node-cron to schedule automated daily backups at 2 AM UTC.
 * It imports and executes the db-backup script with proper error handling and logging.
 */

import * as cron from 'node-cron';
import { main as runDatabaseBackup } from './db-backup';
import { cleanupOldBackups } from './cleanup-old-backups';

// Configuration
const CRON_SCHEDULE = '0 2 * * *'; // Daily at 2 AM UTC
const CLEANUP_CRON_SCHEDULE = '0 3 * * *'; // Daily at 3 AM UTC (1 hour after backups)
const RUN_ON_STARTUP = process.env.RUN_BACKUP_ON_STARTUP === 'true';

/**
 * Executes the backup with error handling and logging
 */
async function runScheduledBackup(): Promise<void> {
  try {
    console.log('\n=== Scheduled Backup Job Started ===');
    console.log(`Timestamp: ${new Date().toISOString()}`);

    // Execute the complete backup process (validation, backup, encryption, S3 upload)
    await runDatabaseBackup();

    console.log('=== Scheduled Backup Job Completed Successfully ===');
  } catch (error) {
    console.error('\n=== Scheduled Backup Job Failed ===');
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
    } else {
      console.error('Unknown error occurred:', error);
    }
    // Don't exit the process - let the scheduler continue
  }
}

/**
 * Executes the cleanup with error handling and logging
 */
async function runScheduledCleanup(): Promise<void> {
  try {
    console.log('\n=== Scheduled Cleanup Job Started ===');
    console.log(`Timestamp: ${new Date().toISOString()}`);

    const bucket = process.env.S3_BACKUP_BUCKET;
    if (!bucket) {
      throw new Error('S3_BACKUP_BUCKET environment variable is not set');
    }

    // Execute the cleanup
    const result = await cleanupOldBackups({
      bucket,
      prefix: process.env.S3_BACKUP_PREFIX || '',
      retentionDays: parseInt(process.env.RETENTION_DAYS || '30', 10),
      minRecentBackups: parseInt(process.env.MIN_RECENT_BACKUPS || '2', 10),
      dryRun: false,
    });

    if (result.success) {
      console.log('=== Scheduled Cleanup Job Completed Successfully ===');
      console.log(`Deleted: ${result.deletedCount} old backups`);
      if (result.errors.length > 0) {
        console.warn(`Note: ${result.errors.length} non-critical errors occurred`);
      }
    } else {
      console.error('=== Scheduled Cleanup Job Completed with Errors ===');
      console.error(`Total errors: ${result.errors.length}`);
      console.error(`Successful deletions: ${result.deletedCount}`);
    }
  } catch (error) {
    console.error('\n=== Scheduled Cleanup Job Failed ===');
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
    } else {
      console.error('Unknown error occurred:', error);
    }
    // Don't exit the process - let the scheduler continue
  }
}

/**
 * Validates the cron schedule expressions
 */
function validateCronSchedule(): void {
  if (!cron.validate(CRON_SCHEDULE)) {
    throw new Error(`Invalid cron schedule: ${CRON_SCHEDULE}`);
  }
  console.log(`✓ Backup cron schedule validated: ${CRON_SCHEDULE}`);

  if (!cron.validate(CLEANUP_CRON_SCHEDULE)) {
    throw new Error(`Invalid cleanup cron schedule: ${CLEANUP_CRON_SCHEDULE}`);
  }
  console.log(`✓ Cleanup cron schedule validated: ${CLEANUP_CRON_SCHEDULE}`);
}

/**
 * Main scheduler initialization function
 */
async function initializeScheduler(): Promise<void> {
  console.log('=== Database Backup Scheduler Starting ===');
  console.log(`Current time: ${new Date().toISOString()}`);
  console.log(`Backup schedule: ${CRON_SCHEDULE} (Daily at 2 AM UTC)`);
  console.log(`Cleanup schedule: ${CLEANUP_CRON_SCHEDULE} (Daily at 3 AM UTC)`);

  try {
    // Validate the cron schedules
    validateCronSchedule();

    // Schedule the backup job
    const backupTask = cron.schedule(CRON_SCHEDULE, runScheduledBackup, {
      scheduled: true,
      timezone: 'UTC'
    });

    // Schedule the cleanup job
    const cleanupTask = cron.schedule(CLEANUP_CRON_SCHEDULE, runScheduledCleanup, {
      scheduled: true,
      timezone: 'UTC'
    });

    console.log('✓ Backup scheduler initialized successfully');
    console.log('✓ Cleanup scheduler initialized successfully');
    console.log('Waiting for scheduled times...');

    // Optionally run backup immediately on startup for testing
    if (RUN_ON_STARTUP) {
      console.log('\n⚠ RUN_BACKUP_ON_STARTUP is enabled - running backup immediately');
      await runScheduledBackup();
    }

    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('\n\nReceived SIGINT signal');
      console.log('Stopping schedulers...');
      backupTask.stop();
      cleanupTask.stop();
      console.log('Schedulers stopped gracefully');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n\nReceived SIGTERM signal');
      console.log('Stopping schedulers...');
      backupTask.stop();
      cleanupTask.stop();
      console.log('Schedulers stopped gracefully');
      process.exit(0);
    });

  } catch (error) {
    console.error('=== Scheduler Initialization Failed ===');
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
    } else {
      console.error('Unknown error occurred:', error);
    }
    process.exit(1);
  }
}

// Start the scheduler if this script is run directly
if (require.main === module) {
  initializeScheduler().catch((error) => {
    console.error('Fatal error during scheduler initialization:', error);
    process.exit(1);
  });
}

export { initializeScheduler, runScheduledBackup, runScheduledCleanup, CRON_SCHEDULE, CLEANUP_CRON_SCHEDULE };
