#!/usr/bin/env ts-node
/**
 * Backup Health Monitoring Script
 *
 * Standalone monitoring script that checks:
 * - Last backup status
 * - Backup exists in S3
 * - File integrity (size > 0)
 * - Sends alerts if issues found
 *
 * Exit codes:
 * - 0: Success - all checks passed
 * - 1: Failure - one or more checks failed
 *
 * Can be run by external monitoring services (cron, uptime robot, etc.)
 */

import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getLastBackupStatus } from './backup-status';
import { sendBackupAlert } from './alerts';
import { S3_BUCKET_NAME, AWS_REGION } from './backup-config';

interface HealthCheckResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  details: {
    lastBackupTimestamp?: string;
    lastBackupSuccess?: boolean;
    s3KeyChecked?: string;
    s3FileSize?: number;
    hoursSinceLastBackup?: number;
  };
}

const MAX_HOURS_SINCE_BACKUP = 26; // Alert if no backup in 26 hours (daily backups)
const MIN_BACKUP_SIZE_BYTES = 1; // Minimum file size to be considered valid

/**
 * Main health check function
 */
async function checkBackupHealth(): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    passed: true,
    errors: [],
    warnings: [],
    details: {},
  };

  try {
    // Step 1: Check last backup status from local status file
    console.log('[Health Check] Reading last backup status...');
    const lastStatus = await getLastBackupStatus();

    if (!lastStatus) {
      result.passed = false;
      result.errors.push('No backup status file found. Backup may have never run.');
      return result;
    }

    result.details.lastBackupTimestamp = lastStatus.timestamp;
    result.details.lastBackupSuccess = lastStatus.success;

    // Step 2: Check if last backup was successful
    if (!lastStatus.success) {
      result.passed = false;
      result.errors.push(
        `Last backup failed at ${lastStatus.timestamp}${
          lastStatus.errorMessage ? `: ${lastStatus.errorMessage}` : ''
        }`
      );
    }

    // Step 3: Check backup age
    const backupDate = new Date(lastStatus.timestamp);
    const now = new Date();
    const hoursSinceBackup = (now.getTime() - backupDate.getTime()) / (1000 * 60 * 60);
    result.details.hoursSinceLastBackup = Math.round(hoursSinceBackup * 10) / 10;

    if (hoursSinceBackup > MAX_HOURS_SINCE_BACKUP) {
      result.passed = false;
      result.errors.push(
        `Last backup is too old: ${result.details.hoursSinceLastBackup} hours ago (max: ${MAX_HOURS_SINCE_BACKUP}h)`
      );
    }

    // Step 4: Verify backup exists in S3 and check integrity
    if (lastStatus.s3Url) {
      console.log('[Health Check] Verifying S3 backup exists and checking integrity...');

      // Extract S3 key from URL
      // S3 URL format: https://bucket.s3.region.amazonaws.com/key or s3://bucket/key
      const s3Key = extractS3KeyFromUrl(lastStatus.s3Url);

      if (!s3Key) {
        result.passed = false;
        result.errors.push(`Could not parse S3 key from URL: ${lastStatus.s3Url}`);
      } else {
        result.details.s3KeyChecked = s3Key;

        try {
          const s3Client = new S3Client({ region: AWS_REGION });
          const headCommand = new HeadObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: s3Key,
          });

          const s3Object = await s3Client.send(headCommand);
          const fileSize = s3Object.ContentLength || 0;
          result.details.s3FileSize = fileSize;

          console.log(`[Health Check] S3 file found: ${s3Key}, size: ${fileSize} bytes`);

          // Check file size integrity
          if (fileSize < MIN_BACKUP_SIZE_BYTES) {
            result.passed = false;
            result.errors.push(
              `Backup file size is too small: ${fileSize} bytes (min: ${MIN_BACKUP_SIZE_BYTES})`
            );
          }

          // Warn if file size doesn't match status
          if (lastStatus.fileSize && Math.abs(fileSize - lastStatus.fileSize) > 1000) {
            result.warnings.push(
              `S3 file size (${fileSize}) differs from recorded size (${lastStatus.fileSize})`
            );
          }
        } catch (error) {
          result.passed = false;
          const errorMsg = error instanceof Error ? error.message : String(error);
          result.errors.push(`S3 backup file not found or inaccessible: ${errorMsg}`);
        }
      }
    } else {
      result.warnings.push('No S3 URL found in backup status (backup may not have uploaded to S3)');
    }
  } catch (error) {
    result.passed = false;
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Health check failed with error: ${errorMsg}`);
  }

  return result;
}

/**
 * Extract S3 key from S3 URL
 */
function extractS3KeyFromUrl(s3Url: string): string | null {
  try {
    // Handle s3:// URL format
    if (s3Url.startsWith('s3://')) {
      const parts = s3Url.replace('s3://', '').split('/');
      parts.shift(); // Remove bucket name
      return parts.join('/');
    }

    // Handle https:// URL format
    if (s3Url.startsWith('https://')) {
      const url = new URL(s3Url);
      // Remove leading slash from pathname
      return url.pathname.substring(1);
    }

    // Assume it's already just the key
    return s3Url;
  } catch (error) {
    console.error('[Health Check] Error parsing S3 URL:', error);
    return null;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('=================================================');
  console.log('Backup Health Check - Starting');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('=================================================\n');

  const result = await checkBackupHealth();

  // Print results
  console.log('\n=================================================');
  console.log('Health Check Results');
  console.log('=================================================');
  console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`\nDetails:`);
  Object.entries(result.details).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });

  if (result.warnings.length > 0) {
    console.log(`\nWarnings (${result.warnings.length}):`);
    result.warnings.forEach((warning, i) => {
      console.log(`  ${i + 1}. ${warning}`);
    });
  }

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    result.errors.forEach((error, i) => {
      console.log(`  ${i + 1}. ${error}`);
    });
  }

  console.log('=================================================\n');

  // Send alert if failed
  if (!result.passed) {
    try {
      const errorSummary = result.errors.join('\n• ');
      await sendBackupAlert(
        'failure',
        `Backup health check FAILED\n\n*Errors:*\n• ${errorSummary}`,
        result.errors[0]
      );
      console.log('[Health Check] Alert sent successfully');
    } catch (alertError) {
      console.error('[Health Check] Failed to send alert:', alertError);
      // Don't fail the health check just because alert failed
    }
  }

  // Exit with appropriate code
  if (result.passed) {
    console.log('✅ Health check passed - exiting with code 0');
    process.exit(0);
  } else {
    console.log('❌ Health check failed - exiting with code 1');
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
