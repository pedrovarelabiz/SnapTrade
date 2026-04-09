import { S3Client, ListObjectsV2Command, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import * as Sentry from '@sentry/node';

interface CleanupOptions {
  bucket: string;
  prefix?: string;
  retentionDays?: number;
  minRecentBackups?: number;
  dryRun?: boolean;
}

interface CleanupResult {
  success: boolean;
  deletedCount: number;
  deletedFiles: string[];
  skippedFiles: string[];
  errors: Array<{ key: string; error: Error }>;
}

/**
 * Send alert for critical cleanup failures
 */
async function sendCleanupAlert(bucket: string, error: Error, errorCount: number): Promise<void> {
  try {
    console.error(`[ALERT] Critical cleanup failure for bucket: ${bucket}`);
    console.error(`[ALERT] Error: ${error.message}`);
    console.error(`[ALERT] Total errors: ${errorCount}`);

    // Capture exception in Sentry - deletion failures affect storage costs
    Sentry.captureException(error, {
      tags: {
        bucket,
        errorCount,
        severity: 'critical',
        component: 'backup-cleanup',
      },
      contexts: {
        cleanup: {
          bucket,
          errorCount,
          errorMessage: error.message,
        },
      },
    });
  } catch (alertError) {
    console.error(`[ALERT] Failed to send alert:`, alertError);
  }
}

/**
 * Cleanup old backups from S3 bucket based on retention policy
 * Safety features:
 * - Dry-run mode for testing
 * - Never deletes if fewer than minRecentBackups exist
 * - Only deletes backups older than retentionDays
 */
export async function cleanupOldBackups(options: CleanupOptions): Promise<CleanupResult> {
  const {
    bucket,
    prefix = '',
    retentionDays = 30,
    minRecentBackups = 2,
    dryRun = false,
  } = options;

  let s3Client: S3Client;

  try {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  } catch (error) {
    const err = error as Error;
    console.error(`[Cleanup] Failed to initialize S3 client:`, err.message);
    await sendCleanupAlert(bucket, err, 1);
    throw new Error(`S3 client initialization failed: ${err.message}`);
  }

  const result: CleanupResult = {
    success: true,
    deletedCount: 0,
    deletedFiles: [],
    skippedFiles: [],
    errors: [],
  };

  console.log(`[Cleanup] Starting backup cleanup for bucket: ${bucket}`);
  console.log(`[Cleanup] Retention policy: ${retentionDays} days`);
  console.log(`[Cleanup] Minimum recent backups: ${minRecentBackups}`);
  console.log(`[Cleanup] Dry-run mode: ${dryRun ? 'ENABLED' : 'DISABLED'}`);

  try {
    // Verify S3 connection and bucket access
    console.log(`[Cleanup] Verifying S3 connection and bucket access...`);
    try {
      const headBucketCommand = new HeadBucketCommand({ Bucket: bucket });
      await s3Client.send(headBucketCommand);
      console.log(`[Cleanup] S3 connection verified successfully`);
    } catch (error) {
      const err = error as Error;
      console.error(`[Cleanup] S3 connection failed:`, err.message);
      await sendCleanupAlert(bucket, err, 1);
      throw new Error(`Cannot access S3 bucket "${bucket}": ${err.message}`);
    }

    // List all objects in the bucket
    console.log(`[Cleanup] Listing objects with prefix: ${prefix || '(none)'}`);

    let listResponse;
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      });
      listResponse = await s3Client.send(listCommand);
    } catch (error) {
      const err = error as Error;
      console.error(`[Cleanup] Failed to list objects:`, err.message);
      await sendCleanupAlert(bucket, err, 1);
      throw new Error(`Failed to list S3 objects: ${err.message}`);
    }
    const objects = listResponse.Contents || [];

    if (objects.length === 0) {
      console.log(`[Cleanup] No objects found in bucket`);
      return result;
    }

    console.log(`[Cleanup] Found ${objects.length} total objects`);

    // Sort by LastModified (most recent first)
    const sortedObjects = objects
      .filter((obj) => obj.Key && obj.LastModified)
      .sort((a, b) => {
        const dateA = a.LastModified!.getTime();
        const dateB = b.LastModified!.getTime();
        return dateB - dateA; // Descending order (newest first)
      });

    // Safety check: ensure minimum number of recent backups
    if (sortedObjects.length < minRecentBackups) {
      console.log(
        `[Cleanup] Safety check: Only ${sortedObjects.length} backups exist, ` +
        `which is less than minimum required (${minRecentBackups}). Skipping cleanup.`
      );
      return result;
    }

    // Calculate cutoff date for retention
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    console.log(`[Cleanup] Cutoff date for deletion: ${cutoffDate.toISOString()}`);

    // Identify old backups to delete
    const oldBackups = sortedObjects.filter((obj, index) => {
      // Always keep the most recent minRecentBackups, regardless of age
      if (index < minRecentBackups) {
        return false;
      }
      // Check if LastModified is older than retention period
      return obj.LastModified && obj.LastModified < cutoffDate;
    });

    console.log(`[Cleanup] Found ${oldBackups.length} backups older than ${retentionDays} days`);

    // Delete old backups with retry logic
    for (const backup of oldBackups) {
      const key = backup.Key!;
      const lastModified = backup.LastModified!;
      const ageInDays = Math.floor(
        (Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (dryRun) {
        console.log(
          `[Cleanup] [DRY-RUN] Would delete: ${key} ` +
          `(LastModified: ${lastModified.toISOString()}, Age: ${ageInDays} days)`
        );
        result.skippedFiles.push(key);
        continue;
      }

      // Attempt deletion with retries for transient errors
      const maxRetries = 3;
      let deleted = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `[Cleanup] [Attempt ${attempt}/${maxRetries}] Deleting: ${key} ` +
            `(LastModified: ${lastModified.toISOString()}, Age: ${ageInDays} days)`
          );

          const deleteCommand = new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          });

          await s3Client.send(deleteCommand);
          result.deletedCount++;
          result.deletedFiles.push(key);
          console.log(`[Cleanup] ✓ Successfully deleted: ${key}`);
          deleted = true;
          break;
        } catch (error) {
          const err = error as any;
          const errorCode = err.Code || err.code || err.$metadata?.httpStatusCode || 'UNKNOWN';
          const errorMessage = err.message || String(err);

          console.error(
            `[Cleanup] ✗ ERROR [Attempt ${attempt}/${maxRetries}] - Failed to delete ${key}`
          );
          console.error(`[Cleanup]   Error Code: ${errorCode}`);
          console.error(`[Cleanup]   Error Message: ${errorMessage}`);

          // Check if error is retryable (throttling, timeouts, network issues)
          const isRetryable =
            errorCode === 'RequestTimeout' ||
            errorCode === 'ServiceUnavailable' ||
            errorCode === 503 ||
            errorCode === 429 ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('ECONNRESET') ||
            errorMessage.includes('ETIMEDOUT');

          if (attempt < maxRetries && isRetryable) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`[Cleanup]   Retryable error detected. Retrying in ${backoffMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          } else {
            // Final attempt failed or non-retryable error
            console.error(`[Cleanup]   All retry attempts exhausted or non-retryable error`);
            console.error(`[Cleanup]   Stack trace:`, err.stack);

            // Capture deletion failure in Sentry - affects storage costs
            Sentry.captureException(err, {
              tags: {
                bucket,
                key,
                errorCode,
                retryable: isRetryable,
                component: 'backup-cleanup',
              },
              contexts: {
                deletion: {
                  bucket,
                  key,
                  errorCode,
                  errorMessage,
                  attempts: attempt,
                  ageInDays,
                },
              },
            });

            result.errors.push({ key, error: err });
            break;
          }
        }
      }

      // Log continuation message if deletion failed
      if (!deleted) {
        console.log(`[Cleanup] Continuing with remaining deletions despite failure for: ${key}`);
      }
    }

    // Determine overall success based on error rate
    const totalDeletionAttempts = oldBackups.length;
    const errorRate = totalDeletionAttempts > 0 ? result.errors.length / totalDeletionAttempts : 0;

    // Mark as failure if more than 50% of deletions failed or if we had no attempts but expected some
    if (errorRate > 0.5 && totalDeletionAttempts > 0) {
      result.success = false;
      console.error(`[Cleanup] High error rate detected: ${(errorRate * 100).toFixed(1)}%`);
    } else if (result.errors.length > 0) {
      // Partial failure - some errors but acceptable rate
      console.warn(`[Cleanup] Completed with ${result.errors.length} partial failures`);
      result.success = true; // Still consider successful if error rate is acceptable
    }

    // Summary
    console.log(`[Cleanup] Cleanup complete!`);
    console.log(`[Cleanup] Total objects: ${sortedObjects.length}`);
    console.log(`[Cleanup] Protected (recent): ${minRecentBackups}`);
    if (dryRun) {
      console.log(`[Cleanup] Would delete: ${result.skippedFiles.length}`);
    } else {
      console.log(`[Cleanup] Deleted: ${result.deletedCount}`);
      console.log(`[Cleanup] Failed: ${result.errors.length}`);
      if (result.errors.length > 0) {
        console.log(`[Cleanup] Error rate: ${(errorRate * 100).toFixed(1)}%`);
      }
    }

    // Send alert if cleanup failed critically
    if (!result.success && result.errors.length > 0) {
      await sendCleanupAlert(bucket, result.errors[0].error, result.errors.length);
    }

    return result;
  } catch (error) {
    const err = error as Error;
    console.error(`[Cleanup] FATAL ERROR during cleanup:`, err.message);
    console.error(`[Cleanup] FATAL ERROR stack trace:`, err.stack);
    result.success = false;
    result.errors.push({ key: 'FATAL', error: err });

    // Send alert for fatal errors
    await sendCleanupAlert(bucket, err, result.errors.length);

    // Return result gracefully instead of throwing
    console.log(`[Cleanup] Exiting gracefully after fatal error`);
    return result;
  }
}

// CLI execution
if (require.main === module) {
  const bucket = process.env.S3_BACKUP_BUCKET || process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  if (!bucket) {
    console.error('Error: S3_BACKUP_BUCKET environment variable or bucket argument required');
    console.error('Usage: ts-node cleanup-old-backups.ts <bucket-name> [--dry-run]');
    process.exit(1);
  }

  cleanupOldBackups({
    bucket,
    prefix: process.env.S3_BACKUP_PREFIX || '',
    retentionDays: parseInt(process.env.RETENTION_DAYS || '30', 10),
    minRecentBackups: parseInt(process.env.MIN_RECENT_BACKUPS || '2', 10),
    dryRun,
  })
    .then((result) => {
      if (result.success) {
        console.log('✓ Cleanup completed successfully');
        if (result.errors.length > 0) {
          console.warn(`  Note: ${result.errors.length} non-critical errors occurred`);
        }
        process.exit(0);
      } else {
        console.error('✗ Cleanup completed with critical errors');
        console.error(`  Total errors: ${result.errors.length}`);
        console.error(`  Successful deletions: ${result.deletedCount}`);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('✗ Cleanup failed catastrophically:', error.message);
      console.error('Stack trace:', error.stack);
      process.exit(1);
    });
}
