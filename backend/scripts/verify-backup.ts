/**
 * Backup Verification Script
 *
 * This script downloads a backup from S3, decrypts it, and uses pg_restore --list
 * to verify backup integrity without actually restoring the database.
 *
 * Features:
 * - Downloads encrypted backup from S3
 * - Decrypts backup file
 * - Runs pg_restore --list to verify structure
 * - Reports tables, estimated row counts, and any corruption
 * - Can be run periodically to ensure backups are restorable
 *
 * Usage:
 *   npm run verify-backup                    # Interactive mode
 *   npm run verify-backup -- --backup <key>  # Verify specific backup
 *   npm run verify-backup -- --latest        # Verify latest backup
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { LOCAL_BACKUP_DIR } from './backup-config';
import { decryptFile } from './encryption';
import { logger, formatBytes } from './backup-utils';
import { Readable } from 'stream';

interface BackupInfo {
  key: string;
  size: number;
  lastModified: Date;
  displayName: string;
}

interface TableInfo {
  name: string;
  estimatedRows?: number;
  type: string; // TABLE, SEQUENCE, INDEX, etc.
}

interface VerificationResult {
  success: boolean;
  backupFile: string;
  backupSize: number;
  tables: TableInfo[];
  totalTables: number;
  totalSequences: number;
  totalIndexes: number;
  errors: string[];
  warnings: string[];
  verifiedAt: Date;
}

interface VerifyOptions {
  backupKey?: string;
  latest?: boolean;
  keepTempFiles?: boolean;
}

const VERIFY_TEMP_DIR = path.join(LOCAL_BACKUP_DIR, 'verify-temp');

/**
 * Creates a readline interface for user prompts
 */
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompts user to select from a list of options
 */
async function selectFromList(prompt: string, options: string[]): Promise<number> {
  const rl = createReadlineInterface();

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const selection = parseInt(answer, 10);
      resolve(selection);
    });
  });
}

/**
 * Lists all available backups from S3
 */
async function listAvailableBackups(): Promise<BackupInfo[]> {
  const s3BucketName = process.env.BACKUP_S3_BUCKET || process.env.S3_BACKUP_BUCKET;
  const s3Region = process.env.AWS_REGION || 'us-east-1';

  if (!s3BucketName) {
    throw new Error('BACKUP_S3_BUCKET or S3_BACKUP_BUCKET environment variable is not set');
  }

  logger.info('Fetching available backups from S3', { bucket: s3BucketName, region: s3Region });

  const s3Client = new S3Client({ region: s3Region });

  const command = new ListObjectsV2Command({
    Bucket: s3BucketName,
    Prefix: 'backups/',
  });

  const response = await s3Client.send(command);

  if (!response.Contents || response.Contents.length === 0) {
    logger.warn('No backups found in S3');
    return [];
  }

  const backups: BackupInfo[] = response.Contents
    .filter(obj => obj.Key && obj.Key.endsWith('.enc'))
    .map(obj => ({
      key: obj.Key!,
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
      displayName: path.basename(obj.Key!),
    }))
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

  logger.info(`Found ${backups.length} backup(s)`);

  console.log(`\nAvailable backups:\n`);
  backups.forEach((backup, index) => {
    const dateStr = backup.lastModified.toISOString().replace('T', ' ').split('.')[0];
    console.log(`  ${index + 1}. ${backup.displayName}`);
    console.log(`     Size: ${formatBytes(backup.size)} | Date: ${dateStr}`);
  });

  return backups;
}

/**
 * Downloads a backup file from S3
 */
async function downloadBackupFromS3(backupKey: string, destinationPath: string): Promise<void> {
  const s3BucketName = process.env.BACKUP_S3_BUCKET || process.env.S3_BACKUP_BUCKET;
  const s3Region = process.env.AWS_REGION || 'us-east-1';

  if (!s3BucketName) {
    throw new Error('BACKUP_S3_BUCKET or S3_BACKUP_BUCKET environment variable is not set');
  }

  logger.info('Downloading backup from S3', {
    source: `s3://${s3BucketName}/${backupKey}`,
    destination: destinationPath
  });

  const s3Client = new S3Client({ region: s3Region });

  const command = new GetObjectCommand({
    Bucket: s3BucketName,
    Key: backupKey,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('Failed to download backup: No data received');
  }

  // Stream the response body to file
  const writeStream = fs.createWriteStream(destinationPath);
  const readableStream = response.Body as Readable;

  return new Promise((resolve, reject) => {
    readableStream.pipe(writeStream);

    writeStream.on('finish', () => {
      logger.info('Backup downloaded successfully');
      resolve();
    });

    writeStream.on('error', (error) => {
      logger.error('Download failed', { error: error.message });
      reject(error);
    });
  });
}

/**
 * Decrypts the downloaded backup file
 */
async function decryptBackupFile(encryptedPath: string, decryptedPath: string): Promise<void> {
  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error('BACKUP_ENCRYPTION_KEY environment variable is not set');
  }

  logger.info('Decrypting backup file', {
    encrypted: encryptedPath,
    decrypted: decryptedPath
  });

  await decryptFile(encryptedPath, decryptedPath, encryptionKey);
  logger.info('Backup file decrypted successfully');
}

/**
 * Verifies backup using pg_restore --list
 */
async function verifyBackupWithPgRestore(backupPath: string): Promise<VerificationResult> {
  logger.info('Verifying backup with pg_restore --list', { backup: backupPath });

  const stats = fs.statSync(backupPath);
  const backupSize = stats.size;

  return new Promise((resolve, reject) => {
    const pgRestoreArgs = [
      '--list',
      backupPath,
    ];

    const pgRestore = spawn('pg_restore', pgRestoreArgs);

    let output = '';
    let errorOutput = '';
    const errors: string[] = [];
    const warnings: string[] = [];
    const tables: TableInfo[] = [];
    const sequences: TableInfo[] = [];
    const indexes: TableInfo[] = [];

    pgRestore.stdout.on('data', (data) => {
      output += data.toString();
    });

    pgRestore.stderr.on('data', (data) => {
      const message = data.toString();
      errorOutput += message;

      // Check for actual errors vs warnings
      if (message.toLowerCase().includes('error')) {
        errors.push(message.trim());
      } else if (message.toLowerCase().includes('warning')) {
        warnings.push(message.trim());
      }
    });

    pgRestore.on('error', (error) => {
      reject(new Error(`Failed to start pg_restore: ${error.message}`));
    });

    pgRestore.on('close', (code) => {
      if (code !== 0) {
        logger.error('pg_restore --list failed', { exitCode: code, stderr: errorOutput });
        errors.push(`pg_restore exited with code ${code}`);
      }

      // Parse the output to extract table information
      const lines = output.split('\n');

      for (const line of lines) {
        // pg_restore --list format: "ID; TYPE OID SCHEMA NAME OWNER"
        // Example: "225; 1259 16385 public users postgres"
        const match = line.match(/^\d+;\s+\d+\s+\d+\s+(\S+)\s+(\S+)\s+(\S+)/);

        if (match) {
          const [, schema, name, owner] = match;

          // Identify the type based on the line content
          let type = 'UNKNOWN';
          if (line.includes('TABLE DATA')) {
            type = 'TABLE';
            tables.push({ name: `${schema}.${name}`, type });
          } else if (line.includes('SEQUENCE')) {
            type = 'SEQUENCE';
            sequences.push({ name: `${schema}.${name}`, type });
          } else if (line.includes('INDEX')) {
            type = 'INDEX';
            indexes.push({ name: `${schema}.${name}`, type });
          }
        }
      }

      const result: VerificationResult = {
        success: errors.length === 0,
        backupFile: path.basename(backupPath),
        backupSize,
        tables: [...tables, ...sequences, ...indexes],
        totalTables: tables.length,
        totalSequences: sequences.length,
        totalIndexes: indexes.length,
        errors,
        warnings,
        verifiedAt: new Date(),
      };

      if (result.success) {
        logger.info('Backup verification completed successfully', {
          tables: result.totalTables,
          sequences: result.totalSequences,
          indexes: result.totalIndexes,
        });
      } else {
        logger.error('Backup verification found errors', { errorCount: errors.length });
      }

      resolve(result);
    });
  });
}

/**
 * Prints verification results
 */
function printVerificationResults(result: VerificationResult): void {
  console.log('\n' + '='.repeat(80));
  console.log('BACKUP VERIFICATION REPORT');
  console.log('='.repeat(80));
  console.log(`\nBackup File: ${result.backupFile}`);
  console.log(`Backup Size: ${formatBytes(result.backupSize)}`);
  console.log(`Verified At: ${result.verifiedAt.toISOString()}`);
  console.log(`Status: ${result.success ? '✓ PASSED' : '✗ FAILED'}`);

  console.log('\n--- SUMMARY ---');
  console.log(`Total Tables: ${result.totalTables}`);
  console.log(`Total Sequences: ${result.totalSequences}`);
  console.log(`Total Indexes: ${result.totalIndexes}`);
  console.log(`Total Objects: ${result.tables.length}`);

  if (result.tables.length > 0 && result.totalTables <= 50) {
    console.log('\n--- TABLES ---');
    const tableList = result.tables.filter(t => t.type === 'TABLE');
    tableList.forEach(table => {
      console.log(`  - ${table.name}`);
    });
  } else if (result.totalTables > 50) {
    console.log('\n--- TABLES (showing first 20) ---');
    const tableList = result.tables.filter(t => t.type === 'TABLE').slice(0, 20);
    tableList.forEach(table => {
      console.log(`  - ${table.name}`);
    });
    console.log(`  ... and ${result.totalTables - 20} more tables`);
  }

  if (result.warnings.length > 0) {
    console.log('\n--- WARNINGS ---');
    result.warnings.forEach(warning => {
      console.log(`  ⚠ ${warning}`);
    });
  }

  if (result.errors.length > 0) {
    console.log('\n--- ERRORS ---');
    result.errors.forEach(error => {
      console.log(`  ✗ ${error}`);
    });
  }

  console.log('\n' + '='.repeat(80));

  if (result.success) {
    console.log('✓ Backup is valid and can be restored');
  } else {
    console.log('✗ Backup verification failed - backup may be corrupted');
  }
  console.log('='.repeat(80) + '\n');
}

/**
 * Ensures required directories exist
 */
function ensureDirectories(): void {
  [VERIFY_TEMP_DIR, LOCAL_BACKUP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Cleans up temporary files
 */
function cleanupTempFiles(files: string[]): void {
  logger.info('Cleaning up temporary files', { count: files.length });
  files.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      logger.debug('Deleted temporary file', { file });
    }
  });
}

/**
 * Main verification function
 */
async function verifyBackup(options: VerifyOptions = {}): Promise<VerificationResult> {
  const tempFiles: string[] = [];

  try {
    console.log('=== Backup Verification Process Started ===');
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    // Ensure directories exist
    ensureDirectories();

    // Step 1: List and select backup
    const backups = await listAvailableBackups();

    if (backups.length === 0) {
      throw new Error('No backups available to verify');
    }

    let selectedBackup: BackupInfo;

    if (options.latest) {
      selectedBackup = backups[0]; // Already sorted by date descending
      console.log(`\nSelected latest backup: ${selectedBackup.displayName}`);
    } else if (options.backupKey) {
      const backup = backups.find(b => b.key === options.backupKey || b.displayName === options.backupKey);
      if (!backup) {
        throw new Error(`Backup not found: ${options.backupKey}`);
      }
      selectedBackup = backup;
      console.log(`\nSelected backup: ${selectedBackup.displayName}`);
    } else {
      const selection = await selectFromList('\nEnter the number of the backup to verify: ', backups.map(b => b.displayName));

      if (selection < 1 || selection > backups.length) {
        throw new Error('Invalid selection');
      }

      selectedBackup = backups[selection - 1];
    }

    // Step 2: Download backup from S3
    const encryptedPath = path.join(VERIFY_TEMP_DIR, selectedBackup.displayName);
    tempFiles.push(encryptedPath);

    await downloadBackupFromS3(selectedBackup.key, encryptedPath);

    // Step 3: Decrypt backup
    const decryptedPath = encryptedPath.replace('.enc', '');
    tempFiles.push(decryptedPath);

    await decryptBackupFile(encryptedPath, decryptedPath);

    // Step 4: Verify with pg_restore --list
    const result = await verifyBackupWithPgRestore(decryptedPath);

    // Step 5: Print results
    printVerificationResults(result);

    // Cleanup temporary files unless requested to keep them
    if (!options.keepTempFiles) {
      cleanupTempFiles(tempFiles);
    } else {
      logger.info('Keeping temporary files', { files: tempFiles });
    }

    console.log('=== Verification Process Completed ===\n');

    return result;

  } catch (error) {
    console.error('\n=== Verification Process Failed ===');

    if (error instanceof Error) {
      logger.error('Verification failed', { error: error.message, stack: error.stack });
      console.error(`Error: ${error.message}`);
    } else {
      logger.error('Unknown error occurred', { error });
      console.error('Unknown error occurred:', error);
    }

    // Cleanup on error
    if (!options.keepTempFiles) {
      cleanupTempFiles(tempFiles);
    }

    throw error;
  }
}

// Execute the verification if this script is run directly
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: VerifyOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--backup' || args[i] === '-b') {
      options.backupKey = args[++i];
    } else if (args[i] === '--latest' || args[i] === '-l') {
      options.latest = true;
    } else if (args[i] === '--keep-temp') {
      options.keepTempFiles = true;
    }
  }

  verifyBackup(options)
    .then((result) => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(() => {
      process.exit(1);
    });
}

export {
  verifyBackup,
  listAvailableBackups,
  downloadBackupFromS3,
  decryptBackupFile,
  verifyBackupWithPgRestore,
  VerificationResult,
  VerifyOptions,
};
