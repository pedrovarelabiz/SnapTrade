/**
 * Database Restore Script
 *
 * This script handles restoring PostgreSQL database backups from S3.
 * Features:
 * - Lists available backups from S3
 * - Downloads and decrypts specified backup
 * - Creates pre-restore safety backup
 * - Stops backend service before restore
 * - Restores database using pg_restore with --clean --if-exists
 * - Restarts backend service
 * - Includes confirmation prompts and rollback capability
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { DB_CONFIG, LOCAL_BACKUP_DIR } from './backup-config';
import { decryptFile } from './encryption';
import { Readable } from 'stream';

interface BackupInfo {
  key: string;
  size: number;
  lastModified: Date;
  displayName: string;
}

interface RestoreOptions {
  backupKey?: string;
  skipConfirmation?: boolean;
  skipPreRestoreBackup?: boolean;
  skipServiceControl?: boolean;
}

const RESTORE_TEMP_DIR = path.join(LOCAL_BACKUP_DIR, 'restore-temp');
const PRE_RESTORE_BACKUP_DIR = path.join(LOCAL_BACKUP_DIR, 'pre-restore-backups');

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
 * Prompts user for confirmation
 */
async function confirmAction(message: string): Promise<boolean> {
  const rl = createReadlineInterface();

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
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
  const s3BucketName = process.env.S3_BACKUP_BUCKET;
  const s3Region = process.env.AWS_REGION || 'us-east-1';

  if (!s3BucketName) {
    throw new Error('S3_BACKUP_BUCKET environment variable is not set');
  }

  console.log('Fetching available backups from S3...');
  console.log(`Bucket: ${s3BucketName}`);
  console.log(`Region: ${s3Region}`);

  const s3Client = new S3Client({ region: s3Region });

  const command = new ListObjectsV2Command({
    Bucket: s3BucketName,
    Prefix: 'backups/',
  });

  const response = await s3Client.send(command);

  if (!response.Contents || response.Contents.length === 0) {
    console.log('No backups found in S3');
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

  console.log(`\nFound ${backups.length} backup(s):\n`);
  backups.forEach((backup, index) => {
    const sizeMB = (backup.size / 1024 / 1024).toFixed(2);
    const dateStr = backup.lastModified.toISOString().replace('T', ' ').split('.')[0];
    console.log(`  ${index + 1}. ${backup.displayName}`);
    console.log(`     Size: ${sizeMB} MB | Date: ${dateStr}`);
  });

  return backups;
}

/**
 * Downloads a backup file from S3
 */
async function downloadBackupFromS3(backupKey: string, destinationPath: string): Promise<void> {
  const s3BucketName = process.env.S3_BACKUP_BUCKET;
  const s3Region = process.env.AWS_REGION || 'us-east-1';

  if (!s3BucketName) {
    throw new Error('S3_BACKUP_BUCKET environment variable is not set');
  }

  console.log(`\nDownloading backup from S3...`);
  console.log(`Source: s3://${s3BucketName}/${backupKey}`);
  console.log(`Destination: ${destinationPath}`);

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
      console.log('✓ Backup downloaded successfully');
      resolve();
    });

    writeStream.on('error', (error) => {
      console.error('✗ Download failed:', error.message);
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

  console.log('\nDecrypting backup file...');
  console.log(`Encrypted file: ${encryptedPath}`);
  console.log(`Decrypted file: ${decryptedPath}`);

  await decryptFile(encryptedPath, decryptedPath, encryptionKey);
  console.log('✓ Backup file decrypted successfully');
}

/**
 * Creates a pre-restore backup of the current database
 */
async function createPreRestoreBackup(): Promise<string> {
  console.log('\n=== Creating Pre-Restore Safety Backup ===');

  if (!fs.existsSync(PRE_RESTORE_BACKUP_DIR)) {
    fs.mkdirSync(PRE_RESTORE_BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('Z')[0];
  const filename = `pre-restore-${timestamp}.dump`;
  const backupPath = path.join(PRE_RESTORE_BACKUP_DIR, filename);

  console.log(`Creating backup: ${backupPath}`);

  return new Promise((resolve, reject) => {
    const pgDumpArgs = [
      '--host', DB_CONFIG.host,
      '--port', DB_CONFIG.port.toString(),
      '--username', DB_CONFIG.user,
      '--dbname', DB_CONFIG.database,
      '--format=custom',
      '--compress=9',
      '--file', backupPath,
      '--verbose',
    ];

    const pgDump = spawn('pg_dump', pgDumpArgs, {
      env: {
        ...process.env,
        PGPASSWORD: DB_CONFIG.password,
      },
    });

    pgDump.stdout.on('data', (data) => {
      console.log(`[pg_dump] ${data.toString().trim()}`);
    });

    pgDump.stderr.on('data', (data) => {
      console.log(`[pg_dump] ${data.toString().trim()}`);
    });

    pgDump.on('error', (error) => {
      reject(new Error(`Failed to create pre-restore backup: ${error.message}`));
    });

    pgDump.on('close', (code) => {
      if (code === 0) {
        console.log('✓ Pre-restore backup created successfully');
        console.log(`Backup saved at: ${backupPath}`);
        resolve(backupPath);
      } else {
        reject(new Error(`pg_dump failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Stops the backend service
 */
async function stopBackendService(): Promise<void> {
  console.log('\n=== Stopping Backend Service ===');

  return new Promise((resolve, reject) => {
    const serviceName = process.env.BACKEND_SERVICE_NAME || 'snaptrade-backend';
    console.log(`Service: ${serviceName}`);

    const stopProcess = spawn('systemctl', ['stop', serviceName]);

    stopProcess.on('error', (error) => {
      console.error(`✗ Failed to stop service: ${error.message}`);
      reject(error);
    });

    stopProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✓ Backend service stopped successfully');
        resolve();
      } else {
        reject(new Error(`Failed to stop service (exit code ${code})`));
      }
    });
  });
}

/**
 * Starts the backend service
 */
async function startBackendService(): Promise<void> {
  console.log('\n=== Starting Backend Service ===');

  return new Promise((resolve, reject) => {
    const serviceName = process.env.BACKEND_SERVICE_NAME || 'snaptrade-backend';
    console.log(`Service: ${serviceName}`);

    const startProcess = spawn('systemctl', ['start', serviceName]);

    startProcess.on('error', (error) => {
      console.error(`✗ Failed to start service: ${error.message}`);
      reject(error);
    });

    startProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✓ Backend service started successfully');
        resolve();
      } else {
        reject(new Error(`Failed to start service (exit code ${code})`));
      }
    });
  });
}

/**
 * Restores the database from a backup file using pg_restore
 */
async function restoreDatabase(backupPath: string): Promise<void> {
  console.log('\n=== Restoring Database ===');
  console.log(`Backup file: ${backupPath}`);
  console.log(`Target database: ${DB_CONFIG.database}`);

  return new Promise((resolve, reject) => {
    const pgRestoreArgs = [
      '--host', DB_CONFIG.host,
      '--port', DB_CONFIG.port.toString(),
      '--username', DB_CONFIG.user,
      '--dbname', DB_CONFIG.database,
      '--clean',
      '--if-exists',
      '--verbose',
      backupPath,
    ];

    const pgRestore = spawn('pg_restore', pgRestoreArgs, {
      env: {
        ...process.env,
        PGPASSWORD: DB_CONFIG.password,
      },
    });

    let errorOutput = '';

    pgRestore.stdout.on('data', (data) => {
      console.log(`[pg_restore] ${data.toString().trim()}`);
    });

    pgRestore.stderr.on('data', (data) => {
      const message = data.toString().trim();
      console.log(`[pg_restore] ${message}`);
      errorOutput += message + '\n';
    });

    pgRestore.on('error', (error) => {
      reject(new Error(`Failed to start pg_restore: ${error.message}`));
    });

    pgRestore.on('close', (code) => {
      if (code === 0) {
        console.log('✓ Database restored successfully');
        resolve();
      } else {
        console.error(`✗ pg_restore exited with code ${code}`);
        console.error(`Error output: ${errorOutput}`);
        reject(new Error(`pg_restore failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Performs a rollback by restoring the pre-restore backup
 */
async function performRollback(preRestoreBackupPath: string): Promise<void> {
  console.log('\n=== PERFORMING ROLLBACK ===');
  console.log('Restoring database to state before restore attempt...');

  try {
    await restoreDatabase(preRestoreBackupPath);
    console.log('✓ Rollback completed successfully');
  } catch (error) {
    console.error('✗ CRITICAL: Rollback failed!');
    throw error;
  }
}

/**
 * Ensures required directories exist
 */
function ensureDirectories(): void {
  [RESTORE_TEMP_DIR, PRE_RESTORE_BACKUP_DIR, LOCAL_BACKUP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Cleans up temporary files
 */
function cleanupTempFiles(files: string[]): void {
  console.log('\nCleaning up temporary files...');
  files.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`✓ Deleted: ${file}`);
    }
  });
}

/**
 * Main restore function
 */
async function performRestore(options: RestoreOptions = {}): Promise<void> {
  let preRestoreBackupPath: string | null = null;
  let serviceWasStopped = false;
  const tempFiles: string[] = [];

  try {
    console.log('=== Database Restore Process Started ===');
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    // Ensure directories exist
    ensureDirectories();

    // Step 1: List and select backup
    const backups = await listAvailableBackups();

    if (backups.length === 0) {
      throw new Error('No backups available to restore');
    }

    let selectedBackup: BackupInfo;

    if (options.backupKey) {
      const backup = backups.find(b => b.key === options.backupKey || b.displayName === options.backupKey);
      if (!backup) {
        throw new Error(`Backup not found: ${options.backupKey}`);
      }
      selectedBackup = backup;
      console.log(`\nSelected backup: ${selectedBackup.displayName}`);
    } else {
      const selection = await selectFromList('\nEnter the number of the backup to restore: ', backups.map(b => b.displayName));

      if (selection < 1 || selection > backups.length) {
        throw new Error('Invalid selection');
      }

      selectedBackup = backups[selection - 1];
    }

    // Step 2: Confirmation
    if (!options.skipConfirmation) {
      console.log('\n⚠️  WARNING: This will replace your current database!');
      console.log(`Backup to restore: ${selectedBackup.displayName}`);
      console.log(`Database: ${DB_CONFIG.database} on ${DB_CONFIG.host}`);

      const confirmed = await confirmAction('\nAre you sure you want to proceed?');

      if (!confirmed) {
        console.log('Restore cancelled by user');
        process.exit(0);
      }
    }

    // Step 3: Download backup from S3
    const encryptedPath = path.join(RESTORE_TEMP_DIR, selectedBackup.displayName);
    tempFiles.push(encryptedPath);

    await downloadBackupFromS3(selectedBackup.key, encryptedPath);

    // Step 4: Decrypt backup
    const decryptedPath = encryptedPath.replace('.enc', '');
    tempFiles.push(decryptedPath);

    await decryptBackupFile(encryptedPath, decryptedPath);

    // Step 5: Create pre-restore backup
    if (!options.skipPreRestoreBackup) {
      preRestoreBackupPath = await createPreRestoreBackup();
      console.log(`\n✓ Safety backup created: ${preRestoreBackupPath}`);
    }

    // Step 6: Stop backend service
    if (!options.skipServiceControl) {
      await stopBackendService();
      serviceWasStopped = true;
    }

    // Step 7: Restore database
    try {
      await restoreDatabase(decryptedPath);
      console.log('\n=== Database Restore Completed Successfully ===');
    } catch (restoreError) {
      console.error('\n✗ Database restore failed!');

      // Attempt rollback if we have a pre-restore backup
      if (preRestoreBackupPath) {
        const shouldRollback = options.skipConfirmation || await confirmAction('Do you want to rollback to the pre-restore backup?');

        if (shouldRollback) {
          await performRollback(preRestoreBackupPath);
        } else {
          console.log('⚠️  Skipping rollback - database may be in an inconsistent state!');
        }
      }

      throw restoreError;
    }

    // Step 8: Restart backend service
    if (serviceWasStopped && !options.skipServiceControl) {
      await startBackendService();
    }

    // Cleanup temporary files
    cleanupTempFiles(tempFiles);

    console.log('\n=== Restore Process Completed Successfully ===');
    if (preRestoreBackupPath) {
      console.log(`\nPre-restore backup is available at: ${preRestoreBackupPath}`);
      console.log('You can use this to rollback if needed.');
    }

  } catch (error) {
    console.error('\n=== Restore Process Failed ===');

    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
    } else {
      console.error('Unknown error occurred:', error);
    }

    // Try to restart service if it was stopped
    if (serviceWasStopped && !options.skipServiceControl) {
      console.log('\nAttempting to restart backend service...');
      try {
        await startBackendService();
      } catch (startError) {
        console.error('✗ Failed to restart service:', startError);
      }
    }

    process.exit(1);
  }
}

// Execute the restore if this script is run directly
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: RestoreOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--backup' || args[i] === '-b') {
      options.backupKey = args[++i];
    } else if (args[i] === '--yes' || args[i] === '-y') {
      options.skipConfirmation = true;
    } else if (args[i] === '--no-pre-backup') {
      options.skipPreRestoreBackup = true;
    } else if (args[i] === '--no-service-control') {
      options.skipServiceControl = true;
    }
  }

  performRestore(options);
}

export {
  performRestore,
  listAvailableBackups,
  downloadBackupFromS3,
  decryptBackupFile,
  createPreRestoreBackup,
  restoreDatabase,
};
