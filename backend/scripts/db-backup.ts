import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { encryptFile } from './encryption';
import { uploadToS3 } from './s3-upload';
import { updateBackupStatus } from './backup-status';
import { sendBackupAlert } from './alerts';

/**
 * Security Audit Logger
 *
 * Dedicated audit logging for compliance and security monitoring.
 * All backup operations, file access, and encryption key usage are logged.
 */
const AUDIT_LOG_FILE = path.join(__dirname, '../logs/backup-audit.log');

interface AuditLogEntry {
  timestamp: string;
  event: string;
  triggeredBy: 'scheduled' | 'manual';
  sourceIp?: string;
  user?: string;
  pid: number;
  details: Record<string, any>;
}

function writeAuditLog(entry: AuditLogEntry): void {
  const logDir = path.dirname(AUDIT_LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
  }

  const logLine = JSON.stringify(entry) + '\n';
  const logExists = fs.existsSync(AUDIT_LOG_FILE);
  fs.appendFileSync(AUDIT_LOG_FILE, logLine, { encoding: 'utf8', mode: 0o600 });

  // Ensure restrictive permissions on audit log file
  if (!logExists) {
    fs.chmodSync(AUDIT_LOG_FILE, 0o600);
  }
}

function getSourceInfo(): { triggeredBy: 'scheduled' | 'manual'; sourceIp?: string; user?: string } {
  // Determine if triggered by cron/scheduler or manually
  const triggeredBy = process.env.BACKUP_TRIGGER === 'scheduled' || !process.stdin.isTTY ? 'scheduled' : 'manual';

  // Try to get source IP from environment (set by web interface or API)
  const sourceIp = process.env.SOURCE_IP || process.env.SSH_CLIENT?.split(' ')[0];

  // Get user who triggered the backup
  const user = process.env.USER || process.env.USERNAME || 'unknown';

  return { triggeredBy, sourceIp, user };
}

function auditLog(event: string, details: Record<string, any> = {}): void {
  const sourceInfo = getSourceInfo();
  const entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    event,
    triggeredBy: sourceInfo.triggeredBy,
    sourceIp: sourceInfo.sourceIp,
    user: sourceInfo.user,
    pid: process.pid,
    details,
  };
  writeAuditLog(entry);
}

/**
 * Database Backup Script
 *
 * This script orchestrates a complete PostgreSQL database backup workflow with the following steps:
 * 1. Environment validation - Verifies all required environment variables are present
 * 2. Directory setup - Creates backup directory if it doesn't exist
 * 3. Pre-backup checks - Validates database connectivity, disk space, write permissions, and S3 access
 * 4. Database dump - Executes pg_dump with custom format and maximum compression
 * 5. Encryption - Encrypts the backup file using AES-256 encryption
 * 6. S3 upload - Uploads encrypted backup to S3 (if configured)
 * 7. Status tracking - Updates backup status and sends alerts on completion/failure
 *
 * @environment Required Environment Variables:
 * - DB_HOST: PostgreSQL server hostname
 * - DB_PORT: PostgreSQL server port (typically 5432)
 * - DB_NAME: Name of the database to backup
 * - DB_USER: Database username for authentication
 * - DB_PASSWORD: Database password for authentication
 * - ENCRYPTION_KEY: AES-256 encryption key for securing backups
 *
 * @environment Optional Environment Variables:
 * - BACKUP_DIR: Directory to store backups (default: ../backups)
 * - S3_BACKUP_BUCKET: S3 bucket name for remote storage (if not set, backup remains local only)
 * - AWS_REGION: AWS region for S3 bucket (default: us-east-1)
 * - CLEANUP_LOCAL_BACKUP: Set to 'true' to delete local backup after S3 upload (default: false)
 *
 * @errorHandling Error Handling Strategy:
 * - All errors are caught in main() and result in process.exit(1)
 * - Backup status is updated on both success and failure
 * - Alerts are sent via sendBackupAlert() for monitoring
 * - If encryption fails, unencrypted backup is retained for manual recovery
 * - If S3 upload fails, encrypted backup is retained locally
 * - All errors include detailed messages and stack traces for debugging
 *
 * @exitCodes Exit Codes:
 * - 0: Backup completed successfully
 * - 1: Backup failed (check error logs for details)
 */

/**
 * Configuration object for database backup operations
 * Contains all parameters needed to connect to PostgreSQL and store backups
 */
interface BackupConfig {
  /** PostgreSQL server hostname or IP address */
  host: string;
  /** PostgreSQL server port number (typically 5432) */
  port: string;
  /** Name of the database to backup */
  database: string;
  /** Database username for authentication */
  user: string;
  /** Database password for authentication */
  password: string;
  /** Local directory path where backups will be stored */
  backupDir: string;
}

/**
 * Validates required environment variables
 *
 * Checks that all required database connection parameters are present in environment.
 * Sets default backup directory if BACKUP_DIR is not specified.
 *
 * @returns {BackupConfig} Configuration object containing validated database connection parameters
 * @throws {Error} If any required environment variables are missing
 */
function validateEnvVars(): BackupConfig {
  const requiredVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const backupDir = process.env.BACKUP_DIR || path.join(__dirname, '../backups');

  console.log('✓ Environment variables validated');

  return {
    host: process.env.DB_HOST!,
    port: process.env.DB_PORT!,
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    backupDir
  };
}

/**
 * Creates backup directory if it doesn't exist
 *
 * Uses recursive mode to create all parent directories if needed.
 *
 * @param {string} backupDir - Path to the backup directory
 * @returns {void}
 */
function createBackupDirectory(backupDir: string): void {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    console.log(`✓ Created backup directory: ${backupDir}`);
  } else {
    console.log(`✓ Backup directory exists: ${backupDir}`);
    // Ensure directory has restrictive permissions (not world-readable)
    fs.chmodSync(backupDir, 0o700);
    console.log(`✓ Verified backup directory permissions: ${backupDir}`);
  }
}

/**
 * Performs pre-backup validation checks to ensure all prerequisites are met
 *
 * Executes four critical validation checks:
 * 1. Database connectivity - Tests connection with 5s timeout
 * 2. Write permissions - Verifies backup directory is writable
 * 3. Disk space - Ensures at least 5GB is available
 * 4. S3 access - Validates S3 bucket accessibility (if configured)
 *
 * @param {BackupConfig} config - Database configuration containing connection parameters and backup directory
 * @returns {Promise<void>} Resolves if all checks pass
 * @throws {Error} If any validation check fails with detailed error message
 */
async function runPreBackupChecks(config: BackupConfig): Promise<void> {
  console.log('Running pre-backup validation checks...');
  console.log('');

  // Check 1: Verify database connectivity
  console.log('1. Testing database connection...');
  const client = new Client({
    host: config.host,
    port: parseInt(config.port, 10),
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    console.log('   ✓ Database connection successful');
  } catch (dbError) {
    throw new Error(`Database connection failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
  }

  // Check 2: Verify backup directory is writable
  console.log('2. Testing backup directory write access...');
  const testFile = path.join(config.backupDir, '.write-test');
  try {
    fs.writeFileSync(testFile, 'test', 'utf8');
    fs.unlinkSync(testFile);
    console.log('   ✓ Backup directory is writable');
  } catch (writeError) {
    throw new Error(`Backup directory is not writable: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
  }

  // Check 3: Verify sufficient disk space (at least 5GB)
  console.log('3. Checking available disk space...');
  try {
    const { execSync } = require('child_process');
    const dfOutput = execSync(`df -k "${config.backupDir}" | tail -1 | awk '{print $4}'`, { encoding: 'utf8' });
    const availableKB = parseInt(dfOutput.trim(), 10);
    const availableGB = (availableKB / (1024 * 1024)).toFixed(2);
    const requiredGB = 5;

    if (availableKB < requiredGB * 1024 * 1024) {
      throw new Error(`Insufficient disk space: ${availableGB}GB available, ${requiredGB}GB required`);
    }
    console.log(`   ✓ Sufficient disk space available: ${availableGB}GB`);
  } catch (diskError) {
    throw new Error(`Disk space check failed: ${diskError instanceof Error ? diskError.message : String(diskError)}`);
  }

  // Check 4: Verify S3 credentials (if S3 upload is configured)
  const s3Bucket = process.env.S3_BACKUP_BUCKET;
  if (s3Bucket) {
    console.log('4. Testing S3 access...');
    try {
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
      });
      await s3Client.send(new HeadBucketCommand({ Bucket: s3Bucket }));
      console.log('   ✓ S3 bucket is accessible');
    } catch (s3Error) {
      throw new Error(`S3 access test failed: ${s3Error instanceof Error ? s3Error.message : String(s3Error)}`);
    }
  } else {
    console.log('4. S3 upload not configured, skipping S3 test');
  }

  console.log('');
  console.log('✓ All pre-backup checks passed');
  console.log('');
}

/**
 * Generates timestamp-based filename for backup
 *
 * Creates a unique filename using current date and time to prevent collisions.
 * Format: YYYY-MM-DD-HHmmss-postgres-backup.dump
 *
 * @returns {string} Timestamped backup filename
 * @example
 * // Returns something like: "2026-03-22-143052-postgres-backup.dump"
 * const filename = generateBackupFilename();
 */
function generateBackupFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}-${hours}${minutes}${seconds}-postgres-backup.dump`;
}

/**
 * Executes pg_dump to create database backup
 *
 * Spawns a child process to run pg_dump with the following options:
 * - Custom format (--format=custom) for flexibility in restoration
 * - Maximum compression (--compress=9) to minimize file size
 * - Streams stderr for real-time error monitoring
 * - Verifies backup file size after completion
 *
 * @param {BackupConfig} config - Database configuration containing connection parameters
 * @returns {Promise<string>} Path to the created backup file
 * @throws {Error} If pg_dump fails to start or exits with non-zero code
 */
function executeBackup(config: BackupConfig): Promise<string> {
  return new Promise((resolve, reject) => {
    const filename = generateBackupFilename();
    const backupPath = path.join(config.backupDir, filename);

    console.log('');
    console.log(`Starting backup: ${filename}`);
    console.log(`Database: ${config.database}`);
    console.log(`Host: ${config.host}:${config.port}`);
    console.log('');

    const args = [
      '--format=custom',
      '--compress=9',
      '--host', config.host,
      '--port', config.port,
      '--username', config.user,
      '--dbname', config.database,
      '--file', backupPath
    ];

    const pgDump = spawn('pg_dump', args, {
      env: {
        ...process.env,
        PGPASSWORD: config.password
      }
    });

    let stderr = '';

    pgDump.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[pg_dump] ${output}`);
      }
    });

    pgDump.stderr.on('data', (data) => {
      const output = data.toString().trim();
      stderr += output + '\n';
      if (output) {
        console.error(`[pg_dump] ${output}`);
      }
    });

    pgDump.on('error', (error) => {
      console.error('');
      console.error(`✗ Failed to start pg_dump: ${error.message}`);
      reject(error);
    });

    pgDump.on('close', (code) => {
      if (code === 0) {
        try {
          const stats = fs.statSync(backupPath);
          const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          console.log('');
          console.log(`✓ Backup completed successfully`);
          console.log(`✓ File: ${backupPath}`);
          console.log(`✓ Size: ${sizeMB} MB`);

          // AUDIT: Log backup file creation
          auditLog('FILE_CREATED', {
            filePath: backupPath,
            sizeBytes: stats.size,
            sizeMB,
            database: config.database,
            host: config.host,
          });

          resolve(backupPath);
        } catch (statError) {
          reject(new Error(`Backup file verification failed: ${statError instanceof Error ? statError.message : 'Unknown error'}`));
        }
      } else {
        console.error('');
        console.error(`✗ pg_dump exited with code ${code}`);
        if (stderr) {
          console.error(`✗ Error output: ${stderr}`);
        }
        reject(new Error(`pg_dump failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Main execution function
 *
 * Orchestrates the entire backup process with the following flow:
 * 1. Check for concurrent backup (lock file)
 * 2. Update status to 'running'
 * 3. Validate environment variables and create configuration
 * 4. Create backup directory
 * 5. Execute pre-backup validation checks
 * 6. Run pg_dump to create database backup
 * 7. Encrypt backup file with AES-256
 * 8. Upload to S3 (if configured) or retain locally
 * 9. Update status with success/failure
 * 10. Send monitoring alerts
 * 11. Exit with appropriate status code
 *
 * @returns {Promise<void>} Resolves on successful backup, calls process.exit() on completion
 * @throws Never throws - all errors are caught and result in process.exit(1)
 */
async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  const lockFile = '/tmp/db-backup.lock';
  const startTime = Date.now();

  // Dry-run mode: validate config and connectivity without writing any files
  if (isDryRun) {
    console.log('=== PostgreSQL Database Backup (DRY RUN) ===');
    console.log(`Started: ${new Date().toISOString()}`);
    console.log('');
    try {
      if (!process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_ENCRYPTION_KEY.length !== 64) {
        throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-char hex string');
      }
      const config = validateEnvVars();
      createBackupDirectory(config.backupDir);
      await runPreBackupChecks(config);
      console.log('✓ Dry run complete — all pre-flight checks passed');
      process.exit(0);
    } catch (dryRunError) {
      const msg = dryRunError instanceof Error ? dryRunError.message : String(dryRunError);
      console.error(`✗ Dry run failed: ${msg}`);
      process.exit(1);
    }
  }

  // Check for concurrent backup
  if (fs.existsSync(lockFile)) {
    try {
      const pid = parseInt(fs.readFileSync(lockFile, 'utf8').trim(), 10);

      // Check if process is still running
      try {
        process.kill(pid, 0); // Signal 0 checks if process exists without killing it
        console.error('✗ Backup already running (PID: ' + pid + ')');
        console.error('✗ Lock file: ' + lockFile);
        process.exit(1);
      } catch (e) {
        // Process not running - stale lock file
        console.log('ℹ Removing stale lock file (PID ' + pid + ' not running)');
        fs.unlinkSync(lockFile);
      }
    } catch (readError) {
      // Invalid lock file - remove it
      console.log('ℹ Removing invalid lock file');
      fs.unlinkSync(lockFile);
    }
  }

  // Create lock file with current PID
  try {
    fs.writeFileSync(lockFile, String(process.pid), 'utf8');
  } catch (lockError) {
    console.error('✗ Failed to create lock file: ' + lockFile);
    console.error('✗ Error: ' + (lockError instanceof Error ? lockError.message : String(lockError)));
    process.exit(1);
  }

  try {
    console.log('=== PostgreSQL Database Backup ===');
    console.log(`Started: ${new Date().toISOString()}`);
    console.log('');

    // AUDIT: Log backup initiation
    auditLog('BACKUP_STARTED', {
      startTime: new Date().toISOString(),
      lockFile,
      auditLogFile: AUDIT_LOG_FILE,
    });

    // Update status: backup started
    await updateBackupStatus({
      timestamp: new Date().toISOString(),
      success: false,
    });

    // Guard: Validate BACKUP_ENCRYPTION_KEY before any S3/encryption operation
    if (!process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_ENCRYPTION_KEY.length !== 64) {
      throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-char hex string');
    }

    // Step 1: Validate environment variables
    const config = validateEnvVars();

    // Step 2: Create backup directory
    createBackupDirectory(config.backupDir);

    // Step 3: Run pre-backup validation checks
    await runPreBackupChecks(config);

    // Step 4: Execute pg_dump
    const backupPath = await executeBackup(config);

    // Step 5: Encrypt the backup
    // Use AES-256 encryption to secure the backup file before storage/upload
    const encryptedPath = `${backupPath}.enc`;
    const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;

    if (!encryptionKey) {
      throw new Error('Missing required environment variable: BACKUP_ENCRYPTION_KEY');
    }

    // AUDIT: Log encryption key access
    auditLog('ENCRYPTION_KEY_ACCESSED', {
      purpose: 'backup_encryption',
      keyLength: encryptionKey.length,
      algorithm: 'AES-256',
    });

    try {
      console.log('');
      console.log('Starting encryption...');
      await encryptFile(backupPath, encryptedPath, encryptionKey);
      console.log(`✓ Backup encrypted: ${encryptedPath}`);

      const encryptedStats = fs.statSync(encryptedPath);
      // AUDIT: Log encrypted file creation
      auditLog('FILE_CREATED', {
        filePath: encryptedPath,
        sizeBytes: encryptedStats.size,
        sizeMB: (encryptedStats.size / (1024 * 1024)).toFixed(2),
        encrypted: true,
      });

      // Delete unencrypted dump after successful encryption
      // This ensures sensitive data is never stored in plaintext
      fs.unlinkSync(backupPath);
      console.log(`✓ Unencrypted backup deleted: ${backupPath}`);

      // AUDIT: Log unencrypted file deletion
      auditLog('FILE_DELETED', {
        filePath: backupPath,
        reason: 'encryption_complete',
        encrypted: false,
      });
    } catch (encryptError) {
      console.error('');
      console.error(`✗ Encryption failed: ${encryptError instanceof Error ? encryptError.message : String(encryptError)}`);
      console.error('✗ Unencrypted backup retained for manual recovery');
      // Re-throw to halt the backup process - we never store unencrypted backups remotely
      throw new Error(`Backup encryption failed: ${encryptError instanceof Error ? encryptError.message : String(encryptError)}`);
    }

    // Step 5.5: Encrypt and prepare metrics.json for backup
    // Include listener metrics to preserve crash/reconnection history
    const metricsPath = path.join(__dirname, '../listener/metrics.json');
    let encryptedMetricsPath: string | null = null;

    if (fs.existsSync(metricsPath)) {
      encryptedMetricsPath = `${config.backupDir}/metrics-${generateBackupFilename().replace('.dump', '.json')}.enc`;
      try {
        console.log('');
        console.log('Encrypting listener metrics...');
        await encryptFile(metricsPath, encryptedMetricsPath, encryptionKey);
        console.log(`✓ Metrics encrypted: ${encryptedMetricsPath}`);

        const metricsStats = fs.statSync(encryptedMetricsPath);
        auditLog('FILE_CREATED', {
          filePath: encryptedMetricsPath,
          sizeBytes: metricsStats.size,
          type: 'listener_metrics',
          encrypted: true,
        });
      } catch (metricsEncryptError) {
        console.error(`✗ Metrics encryption failed: ${metricsEncryptError instanceof Error ? metricsEncryptError.message : String(metricsEncryptError)}`);
        encryptedMetricsPath = null; // Continue backup without metrics
      }
    } else {
      console.log('');
      console.log('ℹ Metrics file not found, skipping metrics backup');
    }

    // Step 6: Upload to S3 (optional - depends on S3_BACKUP_BUCKET configuration)
    // If S3 bucket is configured, upload for off-site storage; otherwise keep local only
    const s3Bucket = process.env.S3_BACKUP_BUCKET;
    const cleanupLocalFile = process.env.CLEANUP_LOCAL_BACKUP === 'true';

    if (s3Bucket) {
      try {
        console.log('');
        console.log('Starting S3 upload...');

        // AUDIT: Log S3 upload initiation
        auditLog('S3_UPLOAD_STARTED', {
          bucket: s3Bucket,
          filePath: encryptedPath,
          region: process.env.AWS_REGION || 'us-east-1',
        });

        const uploadResult = await uploadToS3({
          filePath: encryptedPath,
          bucket: s3Bucket,
          databaseName: config.database,
        });

        if (uploadResult.success && uploadResult.location) {
          console.log(`✓ Backup uploaded to S3: ${uploadResult.location}`);
          console.log(`✓ S3 Bucket: ${uploadResult.bucket}`);
          console.log(`✓ S3 Key: ${uploadResult.key}`);

          // Upload encrypted metrics.json if available
          // RETENTION POLICY: Metrics files follow the same retention policy as database backups
          // to preserve crash/reconnection history alongside corresponding database state
          if (encryptedMetricsPath && fs.existsSync(encryptedMetricsPath)) {
            try {
              const metricsUploadResult = await uploadToS3({
                filePath: encryptedMetricsPath,
                bucket: s3Bucket,
                databaseName: config.database,
              });

              if (metricsUploadResult.success) {
                console.log(`✓ Metrics uploaded to S3: ${metricsUploadResult.location}`);
                auditLog('S3_UPLOAD_SUCCESS', {
                  bucket: metricsUploadResult.bucket,
                  key: metricsUploadResult.key,
                  location: metricsUploadResult.location,
                  filePath: encryptedMetricsPath,
                  type: 'listener_metrics',
                });

                // Cleanup local metrics file if configured
                if (cleanupLocalFile) {
                  fs.unlinkSync(encryptedMetricsPath);
                  console.log(`✓ Local encrypted metrics deleted: ${encryptedMetricsPath}`);
                  auditLog('FILE_DELETED', {
                    filePath: encryptedMetricsPath,
                    reason: 's3_upload_complete',
                    type: 'listener_metrics',
                    s3Location: metricsUploadResult.location,
                  });
                }
              }
            } catch (metricsUploadError) {
              console.error(`✗ Metrics upload failed: ${metricsUploadError instanceof Error ? metricsUploadError.message : String(metricsUploadError)}`);
              console.error(`✗ Encrypted metrics retained locally: ${encryptedMetricsPath}`);
            }
          }

          // AUDIT: Log successful S3 upload
          auditLog('S3_UPLOAD_SUCCESS', {
            bucket: uploadResult.bucket,
            key: uploadResult.key,
            location: uploadResult.location,
            filePath: encryptedPath,
          });

          // Collect metrics for status tracking and monitoring
          const encryptedStats = fs.statSync(encryptedPath);
          const duration = Date.now() - startTime;

          // Update status: backup succeeded
          // This persists the backup metadata for monitoring and restore operations
          await updateBackupStatus({
            timestamp: new Date().toISOString(),
            success: true,
            fileSize: encryptedStats.size,
            s3Url: uploadResult.location,
            duration,
          });

          // Send success alert (non-blocking)
          // Alert failures don't fail the backup - we catch and log them
          try {
            const sizeMB = (encryptedStats.size / (1024 * 1024)).toFixed(2);
            await sendBackupAlert(
              'success',
              `Database backup completed successfully.\n\n*File Size:* ${sizeMB} MB\n*S3 URL:* ${uploadResult.location}`
            );
          } catch (alertError) {
            console.error(`✗ Failed to send success alert: ${alertError instanceof Error ? alertError.message : String(alertError)}`);
          }

          // Cleanup local encrypted file if configured
          // When CLEANUP_LOCAL_BACKUP=true, we delete local copy to save disk space
          // since backup is now safely stored in S3
          if (cleanupLocalFile) {
            fs.unlinkSync(encryptedPath);
            console.log(`✓ Local encrypted backup deleted: ${encryptedPath}`);

            // AUDIT: Log local file cleanup
            auditLog('FILE_DELETED', {
              filePath: encryptedPath,
              reason: 's3_upload_complete',
              s3Location: uploadResult.location,
            });
          } else {
            // Keep local copy as additional backup (default behavior for safety)
            console.log(`✓ Local encrypted backup retained: ${encryptedPath}`);
          }
        } else {
          throw new Error(uploadResult.error?.message || 'S3 upload failed');
        }
      } catch (s3Error) {
        console.error('');
        console.error(`✗ S3 upload failed: ${s3Error instanceof Error ? s3Error.message : String(s3Error)}`);
        console.error(`✗ Encrypted backup retained locally: ${encryptedPath}`);

        // AUDIT: Log S3 upload failure
        auditLog('S3_UPLOAD_FAILED', {
          bucket: s3Bucket,
          filePath: encryptedPath,
          error: s3Error instanceof Error ? s3Error.message : String(s3Error),
        });

        throw new Error(`S3 upload failed: ${s3Error instanceof Error ? s3Error.message : String(s3Error)}`);
      }
    } else {
      console.log('');
      console.log('ℹ S3_BACKUP_BUCKET not configured, skipping S3 upload');
      console.log(`✓ Encrypted backup retained locally: ${encryptedPath}`);

      // Get file size for status update
      const encryptedStats = fs.statSync(encryptedPath);
      const duration = Date.now() - startTime;

      // Update status: backup succeeded (local only)
      await updateBackupStatus({
        timestamp: new Date().toISOString(),
        success: true,
        fileSize: encryptedStats.size,
        duration,
      });

      // Send success alert (non-blocking)
      try {
        const sizeMB = (encryptedStats.size / (1024 * 1024)).toFixed(2);
        await sendBackupAlert(
          'success',
          `Database backup completed successfully (local only).\n\n*File Size:* ${sizeMB} MB\n*Location:* ${encryptedPath}`
        );
      } catch (alertError) {
        console.error(`✗ Failed to send success alert: ${alertError instanceof Error ? alertError.message : String(alertError)}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('');
    console.log('=== Backup Completed ===');
    console.log(`Duration: ${duration} seconds`);

    // AUDIT: Log backup completion
    auditLog('BACKUP_COMPLETED', {
      status: 'success',
      endTime: new Date().toISOString(),
      durationSeconds: parseFloat(duration),
      s3Upload: !!s3Bucket,
      localCleanup: cleanupLocalFile,
    });

    // Remove lock file
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }

    process.exit(0);
  } catch (error) {
    // Comprehensive error handler - catches all failures from any step
    // Extract error details for logging and monitoring
    const duration = Date.now() - startTime;
    const durationSeconds = (duration / 1000).toFixed(2);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stackTrace = error instanceof Error && error.stack ? error.stack : 'No stack trace available';

    // AUDIT: Log backup failure
    auditLog('BACKUP_FAILED', {
      status: 'failure',
      endTime: new Date().toISOString(),
      durationSeconds: parseFloat(durationSeconds),
      error: errorMessage,
      stackTrace,
    });

    // Update status: backup failed
    // Record failure in backup status for monitoring and alerting systems
    await updateBackupStatus({
      timestamp: new Date().toISOString(),
      success: false,
      errorMessage,
      duration,
    });

    // Send failure alert with full context (non-blocking)
    // Include stack trace for debugging - alert failures won't prevent error logging
    try {
      const stackTrace = error instanceof Error && error.stack ? error.stack : 'No stack trace available';
      await sendBackupAlert(
        'failure',
        `Database backup failed.\n\n*Error:* ${errorMessage}\n*Duration:* ${durationSeconds}s\n\n*Stack Trace:*\n\`\`\`\n${stackTrace}\n\`\`\``,
        error instanceof Error ? error : undefined
      );
    } catch (alertError) {
      console.error(`✗ Failed to send failure alert: ${alertError instanceof Error ? alertError.message : String(alertError)}`);
    }

    console.error('');
    console.error('=== Backup Failed ===');
    console.error(`Error: ${errorMessage}`);
    console.error(`Duration: ${durationSeconds} seconds`);

    // Remove lock file
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }

    // Exit with code 1 to signal failure to calling process (CI/CD, cron, etc.)
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

export { main, validateEnvVars, createBackupDirectory, generateBackupFilename, executeBackup };
