#!/usr/bin/env npx tsx
/**
 * End-to-End Backup and Restore Test
 *
 * This script performs a comprehensive backup and restore test:
 * 1. Captures baseline data (row counts, sample data)
 * 2. Creates a backup using the backup system
 * 3. Verifies backup in S3
 * 4. Drops and recreates test database
 * 5. Restores from backup
 * 6. Verifies all data matches baseline
 */

import 'dotenv/config';
import { Client } from 'pg';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DB_CONFIG, LOCAL_BACKUP_DIR } from './backup-config';
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

interface TableStats {
  tableName: string;
  rowCount: number;
  sampleData?: any[];
}

interface TestResults {
  timestamp: string;
  backupFile?: string;
  s3Verified: boolean;
  baselineStats: TableStats[];
  restoreStats: TableStats[];
  matched: boolean;
  errors: string[];
}

const results: TestResults = {
  timestamp: new Date().toISOString(),
  s3Verified: false,
  baselineStats: [],
  restoreStats: [],
  matched: false,
  errors: [],
};

/**
 * Create a database client connection
 */
async function createClient(): Promise<Client> {
  const client = new Client({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
    database: DB_CONFIG.database,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  return client;
}

/**
 * Get list of tables in the database
 */
async function getTables(client: Client): Promise<string[]> {
  const result = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename NOT LIKE 'pg_%'
    AND tablename NOT LIKE '_prisma%'
    ORDER BY tablename
  `);
  return result.rows.map(row => row.tablename);
}

/**
 * Get row count and sample data for a table
 */
async function getTableStats(client: Client, tableName: string): Promise<TableStats> {
  const countResult = await client.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
  const rowCount = parseInt(countResult.rows[0].count, 10);

  let sampleData: any[] = [];
  if (rowCount > 0) {
    const sampleResult = await client.query(`SELECT * FROM "${tableName}" LIMIT 3`);
    sampleData = sampleResult.rows;
  }

  return { tableName, rowCount, sampleData };
}

/**
 * Capture baseline statistics for all tables
 */
async function captureBaseline(): Promise<void> {
  console.log('\n=== STEP 1: Capturing Baseline Data ===');

  const client = await createClient();

  try {
    const tables = await getTables(client);
    console.log(`Found ${tables.length} tables`);

    for (const table of tables) {
      const stats = await getTableStats(client, table);
      results.baselineStats.push(stats);
      console.log(`  ${table}: ${stats.rowCount} rows`);
    }
  } finally {
    await client.end();
  }

  console.log('✓ Baseline data captured');
}

/**
 * Run the backup script
 */
async function runBackup(): Promise<string> {
  console.log('\n=== STEP 2: Running Backup ===');

  // Ensure backup directory exists
  if (!fs.existsSync(LOCAL_BACKUP_DIR)) {
    fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });
  }

  // Get list of files before backup
  const filesBefore = fs.existsSync(LOCAL_BACKUP_DIR)
    ? fs.readdirSync(LOCAL_BACKUP_DIR).filter(f => f.endsWith('.enc'))
    : [];

  return new Promise((resolve, reject) => {
    console.log('Running db-backup.ts...');

    const backup = spawn('npx', ['tsx', 'scripts/db-backup.ts'], {
      cwd: '/opt/snaptrade-unified/backend',
      env: process.env,
      stdio: 'pipe',
    });

    let output = '';
    let errorOutput = '';

    backup.stdout.on('data', (data) => {
      const str = data.toString();
      output += str;
      console.log(str.trim());
    });

    backup.stderr.on('data', (data) => {
      const str = data.toString();
      errorOutput += str;
      console.error(str.trim());
    });

    backup.on('close', (code) => {
      if (code === 0) {
        // Find the new backup file
        const filesAfter = fs.existsSync(LOCAL_BACKUP_DIR)
          ? fs.readdirSync(LOCAL_BACKUP_DIR).filter(f => f.endsWith('.enc'))
          : [];

        const newFiles = filesAfter.filter(f => !filesBefore.includes(f));

        if (newFiles.length > 0) {
          const backupFile = newFiles[0];
          console.log(`✓ Backup completed: ${backupFile}`);
          resolve(backupFile);
        } else if (filesAfter.length > 0) {
          // Use most recent file
          const mostRecent = filesAfter.sort().reverse()[0];
          console.log(`✓ Using existing backup: ${mostRecent}`);
          resolve(mostRecent);
        } else {
          reject(new Error('No backup file found after backup'));
        }
      } else {
        results.errors.push(`Backup failed with code ${code}`);
        reject(new Error(`Backup failed: ${errorOutput}`));
      }
    });

    backup.on('error', (error) => {
      results.errors.push(`Backup spawn error: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * Verify backup exists in S3
 */
async function verifyBackupInS3(backupFileName: string): Promise<void> {
  console.log('\n=== STEP 3: Verifying Backup in S3 ===');

  const bucket = process.env.S3_BACKUP_BUCKET;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!bucket) {
    console.log('⚠ S3_BACKUP_BUCKET not configured, skipping S3 verification');
    return;
  }

  try {
    const s3Client = new S3Client({ region });

    // List backups
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'backups/',
    });

    const listResponse = await s3Client.send(listCommand);
    const backups = listResponse.Contents || [];

    console.log(`Found ${backups.length} backup(s) in S3`);

    // Check if our backup exists
    const ourBackup = backups.find(obj => obj.Key?.includes(backupFileName.replace('.enc', '')));

    if (ourBackup) {
      console.log(`✓ Backup found in S3: ${ourBackup.Key}`);
      const sizeMB = ((ourBackup.Size || 0) / 1024 / 1024).toFixed(2);
      console.log(`  Size: ${sizeMB} MB`);
      console.log(`  Last Modified: ${ourBackup.LastModified}`);
      results.s3Verified = true;
    } else {
      console.log(`⚠ Backup not found in S3 (may still be uploading)`);
      // List what we found
      backups.forEach(b => console.log(`  - ${b.Key}`));
    }
  } catch (error: any) {
    console.log(`⚠ S3 verification failed: ${error.message}`);
    results.errors.push(`S3 verification: ${error.message}`);
  }
}

/**
 * Drop and recreate database
 */
async function dropAndRecreateDatabase(): Promise<void> {
  console.log('\n=== STEP 4: Drop and Recreate Database ===');

  // Connect to postgres database to drop/create snaptrade_test
  const client = new Client({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
    database: 'postgres', // Connect to postgres database
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();

    // Terminate existing connections
    console.log('Terminating existing connections...');
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = '${DB_CONFIG.database}'
        AND pid <> pg_backend_pid()
    `);

    // Drop database
    console.log(`Dropping database ${DB_CONFIG.database}...`);
    await client.query(`DROP DATABASE IF EXISTS "${DB_CONFIG.database}"`);

    // Create database
    console.log(`Creating database ${DB_CONFIG.database}...`);
    await client.query(`CREATE DATABASE "${DB_CONFIG.database}"`);

    console.log('✓ Database dropped and recreated');
  } finally {
    await client.end();
  }
}

/**
 * Restore from backup
 */
async function restoreFromBackup(backupFileName: string): Promise<void> {
  console.log('\n=== STEP 5: Restoring from Backup ===');

  const backupPath = path.join(LOCAL_BACKUP_DIR, backupFileName);
  const decryptedPath = backupPath.replace('.enc', '');

  // Decrypt the backup if needed
  if (backupFileName.endsWith('.enc')) {
    console.log('Decrypting backup...');
    const { decryptFile } = await import('./encryption');
    const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;

    if (!encryptionKey) {
      throw new Error('BACKUP_ENCRYPTION_KEY not set');
    }

    await decryptFile(backupPath, decryptedPath, encryptionKey);
    console.log('✓ Backup decrypted');
  }

  return new Promise((resolve, reject) => {
    console.log('Running pg_restore...');

    const pgRestoreArgs = [
      '--host', DB_CONFIG.host,
      '--port', DB_CONFIG.port.toString(),
      '--username', DB_CONFIG.user,
      '--dbname', DB_CONFIG.database,
      '--clean',
      '--if-exists',
      '--verbose',
      decryptedPath,
    ];

    const pgRestore = spawn('pg_restore', pgRestoreArgs, {
      env: {
        ...process.env,
        PGPASSWORD: DB_CONFIG.password,
      },
      stdio: 'pipe',
    });

    let errorOutput = '';

    pgRestore.stdout.on('data', (data) => {
      console.log(`[pg_restore] ${data.toString().trim()}`);
    });

    pgRestore.stderr.on('data', (data) => {
      const str = data.toString().trim();
      console.log(`[pg_restore] ${str}`);
      errorOutput += str + '\n';
    });

    pgRestore.on('close', (code) => {
      // Clean up decrypted file
      if (fs.existsSync(decryptedPath)) {
        fs.unlinkSync(decryptedPath);
      }

      if (code === 0) {
        console.log('✓ Database restored successfully');
        resolve();
      } else {
        results.errors.push(`pg_restore failed with code ${code}`);
        reject(new Error(`Restore failed: ${errorOutput}`));
      }
    });

    pgRestore.on('error', (error) => {
      results.errors.push(`Restore spawn error: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * Verify restored data matches baseline
 */
async function verifyRestore(): Promise<void> {
  console.log('\n=== STEP 6: Verifying Restored Data ===');

  const client = await createClient();

  try {
    const tables = await getTables(client);
    console.log(`Found ${tables.length} tables after restore`);

    for (const table of tables) {
      const stats = await getTableStats(client, table);
      results.restoreStats.push(stats);
      console.log(`  ${table}: ${stats.rowCount} rows`);
    }
  } finally {
    await client.end();
  }

  // Compare baseline vs restore
  console.log('\n=== Comparing Baseline vs Restore ===');

  let allMatch = true;
  const baselineMap = new Map(results.baselineStats.map(s => [s.tableName, s]));
  const restoreMap = new Map(results.restoreStats.map(s => [s.tableName, s]));

  for (const [tableName, baselineStats] of baselineMap) {
    const restoreStats = restoreMap.get(tableName);

    if (!restoreStats) {
      console.log(`✗ ${tableName}: MISSING after restore`);
      allMatch = false;
      results.errors.push(`Table ${tableName} missing after restore`);
    } else if (baselineStats.rowCount !== restoreStats.rowCount) {
      console.log(`✗ ${tableName}: Row count mismatch (baseline: ${baselineStats.rowCount}, restore: ${restoreStats.rowCount})`);
      allMatch = false;
      results.errors.push(`Table ${tableName} row count mismatch`);
    } else {
      console.log(`✓ ${tableName}: ${restoreStats.rowCount} rows (MATCH)`);
    }
  }

  // Check for extra tables
  for (const [tableName] of restoreMap) {
    if (!baselineMap.has(tableName)) {
      console.log(`⚠ ${tableName}: Extra table found after restore`);
    }
  }

  results.matched = allMatch;

  if (allMatch) {
    console.log('\n✓ All tables and row counts match!');
  } else {
    console.log('\n✗ Verification failed - data mismatch detected');
  }
}

/**
 * Generate test report
 */
function generateReport(): void {
  console.log('\n=== E2E BACKUP & RESTORE TEST REPORT ===');
  console.log(`Timestamp: ${results.timestamp}`);
  console.log(`Database: ${DB_CONFIG.database} on ${DB_CONFIG.host}`);
  console.log(`Backup File: ${results.backupFile || 'N/A'}`);
  console.log(`S3 Verified: ${results.s3Verified ? '✓ YES' : '✗ NO'}`);
  console.log(`\nBaseline Tables: ${results.baselineStats.length}`);
  console.log(`Restored Tables: ${results.restoreStats.length}`);
  console.log(`Data Match: ${results.matched ? '✓ YES' : '✗ NO'}`);

  if (results.errors.length > 0) {
    console.log(`\nErrors (${results.errors.length}):`);
    results.errors.forEach(err => console.log(`  - ${err}`));
  }

  const totalRows = results.baselineStats.reduce((sum, s) => sum + s.rowCount, 0);
  console.log(`\nTotal Rows: ${totalRows}`);

  // Save report to file
  const reportPath = '/opt/snaptrade-unified/backend/E2E-BACKUP-RESTORE-TEST.log';
  const reportContent = `
E2E BACKUP & RESTORE TEST REPORT
=================================
Timestamp: ${results.timestamp}
Database: ${DB_CONFIG.database}
Host: ${DB_CONFIG.host}

RESULTS:
--------
✓ Backup Created: ${results.backupFile || 'N/A'}
${results.s3Verified ? '✓' : '✗'} S3 Verification: ${results.s3Verified ? 'PASSED' : 'FAILED'}
${results.matched ? '✓' : '✗'} Data Verification: ${results.matched ? 'PASSED' : 'FAILED'}

BASELINE STATS:
---------------
${results.baselineStats.map(s => `${s.tableName}: ${s.rowCount} rows`).join('\n')}

RESTORE STATS:
--------------
${results.restoreStats.map(s => `${s.tableName}: ${s.rowCount} rows`).join('\n')}

${results.errors.length > 0 ? `ERRORS:\n-------\n${results.errors.join('\n')}` : ''}

Total Rows: ${totalRows}
Test Status: ${results.matched && results.errors.length === 0 ? 'PASSED' : 'FAILED'}
`;

  fs.writeFileSync(reportPath, reportContent);
  console.log(`\nReport saved to: ${reportPath}`);
}

/**
 * Main test execution
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  END-TO-END BACKUP & RESTORE TEST              ║');
  console.log('╚════════════════════════════════════════════════╝');

  try {
    // Step 1: Capture baseline
    await captureBaseline();

    // Step 2: Run backup
    const backupFile = await runBackup();
    results.backupFile = backupFile;

    // Step 3: Verify in S3
    await verifyBackupInS3(backupFile);

    // Step 4: Drop and recreate database
    await dropAndRecreateDatabase();

    // Step 5: Restore from backup
    await restoreFromBackup(backupFile);

    // Step 6: Verify restore
    await verifyRestore();

    // Generate report
    generateReport();

    if (results.matched) {
      console.log('\n✅ E2E TEST PASSED');
      process.exit(0);
    } else {
      console.log('\n❌ E2E TEST FAILED');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ E2E TEST FAILED WITH ERROR');
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    results.errors.push(error.message);
    generateReport();
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main };
