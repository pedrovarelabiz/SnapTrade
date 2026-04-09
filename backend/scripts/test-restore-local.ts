/**
 * Test script for restore functionality using local backup file
 * This script tests the restore process without requiring S3 access
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { DB_CONFIG } from './backup-config';

// Override DB config for testing
const TEST_DB_CONFIG = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
  database: process.env.TEST_DB_NAME || 'testdb',
  user: process.env.TEST_DB_USER || 'testuser',
  password: process.env.TEST_DB_PASSWORD || 'test',
};

async function testRestore(backupPath: string): Promise<void> {
  console.log('=== Testing Database Restore ===');
  console.log(`Backup file: ${backupPath}`);
  console.log(`Target database: ${TEST_DB_CONFIG.database}`);
  console.log(`Host: ${TEST_DB_CONFIG.host}:${TEST_DB_CONFIG.port}`);
  console.log(`User: ${TEST_DB_CONFIG.user}\n`);

  return new Promise((resolve, reject) => {
    const pgRestoreArgs = [
      '--host', TEST_DB_CONFIG.host,
      '--port', TEST_DB_CONFIG.port.toString(),
      '--username', TEST_DB_CONFIG.user,
      '--dbname', TEST_DB_CONFIG.database,
      '--clean',
      '--if-exists',
      '--verbose',
      backupPath,
    ];

    console.log(`Running: pg_restore ${pgRestoreArgs.join(' ')}\n`);

    const pgRestore = spawn('pg_restore', pgRestoreArgs, {
      env: {
        ...process.env,
        PGPASSWORD: TEST_DB_CONFIG.password,
      },
    });

    pgRestore.stdout.on('data', (data) => {
      console.log(`[pg_restore] ${data.toString().trim()}`);
    });

    pgRestore.stderr.on('data', (data) => {
      console.log(`[pg_restore] ${data.toString().trim()}`);
    });

    pgRestore.on('error', (error) => {
      reject(new Error(`Failed to start pg_restore: ${error.message}`));
    });

    pgRestore.on('close', (code) => {
      if (code === 0) {
        console.log('\n✓ Database restored successfully');
        resolve();
      } else {
        console.error(`\n✗ pg_restore exited with code ${code}`);
        reject(new Error(`pg_restore failed with exit code ${code}`));
      }
    });
  });
}

async function verifyRestore(): Promise<void> {
  console.log('\n=== Verifying Restore ===');

  return new Promise((resolve, reject) => {
    const psqlArgs = [
      '--host', TEST_DB_CONFIG.host,
      '--port', TEST_DB_CONFIG.port.toString(),
      '--username', TEST_DB_CONFIG.user,
      '--dbname', TEST_DB_CONFIG.database,
      '--command', '\\dt',
    ];

    const psql = spawn('psql', psqlArgs, {
      env: {
        ...process.env,
        PGPASSWORD: TEST_DB_CONFIG.password,
      },
    });

    let output = '';

    psql.stdout.on('data', (data) => {
      output += data.toString();
    });

    psql.stderr.on('data', (data) => {
      console.log(`[psql] ${data.toString().trim()}`);
    });

    psql.on('close', (code) => {
      if (code === 0) {
        console.log('\nTables in database:');
        console.log(output);

        const tableCount = (output.match(/public \|/g) || []).length;
        console.log(`\nTotal tables found: ${tableCount}`);

        if (tableCount > 0) {
          console.log('✓ Restore verification PASSED');
          resolve();
        } else {
          console.log('✗ No tables found - restore may have failed');
          reject(new Error('No tables found in database'));
        }
      } else {
        reject(new Error(`psql failed with exit code ${code}`));
      }
    });
  });
}

// Main execution
const backupPath = process.argv[2] || '/tmp/snaptrade-backups/test-minimal.dump';

testRestore(backupPath)
  .then(() => verifyRestore())
  .then(() => {
    console.log('\n=== Test Completed Successfully ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n=== Test Failed ===');
    console.error(error.message);
    process.exit(1);
  });
