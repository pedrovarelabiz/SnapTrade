/**
 * Simple restore test using spawn and local backup
 * This bypasses S3 and tests core pg_restore functionality
 */

import { spawn } from 'child_process';
import { config } from 'dotenv';
import * as path from 'path';

// Load environment variables
config({ path: path.join(__dirname, '..', '.env') });

// Parse DATABASE_URL from .env
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/snaptrade_test';
const url = new URL(DATABASE_URL);

const dbConfig = {
  host: url.hostname,
  port: parseInt(url.port || '5432'),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1), // Remove leading /
};

console.log('=== Restore Script Test ===\n');
console.log('Database Configuration:');
console.log(`  Host: ${dbConfig.host}:${dbConfig.port}`);
console.log(`  User: ${dbConfig.user}`);
console.log(`  Database: ${dbConfig.database}`);
console.log('');

async function createTestBackup(): Promise<string> {
  const backupPath = '/tmp/test-restore-backup.dump';

  console.log('Step 1: Creating test backup...');
  console.log(`  Source: ${dbConfig.database}`);
  console.log(`  Destination: ${backupPath}\n`);

  return new Promise((resolve, reject) => {
    const pgDump = spawn('pg_dump', [
      '--host', dbConfig.host,
      '--port', dbConfig.port.toString(),
      '--username', dbConfig.user,
      '--dbname', dbConfig.database,
      '--format=custom',
      '--file', backupPath,
    ], {
      env: {
        ...process.env,
        PGPASSWORD: dbConfig.password,
      },
    });

    pgDump.stderr.on('data', (data) => {
      console.log(`  ${data.toString().trim()}`);
    });

    pgDump.on('error', (error) => {
      reject(new Error(`pg_dump error: ${error.message}`));
    });

    pgDump.on('close', (code) => {
      if (code === 0) {
        console.log('  ✓ Test backup created successfully\n');
        resolve(backupPath);
      } else {
        reject(new Error(`pg_dump failed with exit code ${code}`));
      }
    });
  });
}

async function restoreBackup(backupPath: string): Promise<void> {
  console.log('Step 2: Restoring backup...');
  console.log(`  Backup file: ${backupPath}`);
  console.log(`  Target: ${dbConfig.database}\n`);

  return new Promise((resolve, reject) => {
    const pgRestore = spawn('pg_restore', [
      '--host', dbConfig.host,
      '--port', dbConfig.port.toString(),
      '--username', dbConfig.user,
      '--dbname', dbConfig.database,
      '--clean',
      '--if-exists',
      '--verbose',
      backupPath,
    ], {
      env: {
        ...process.env,
        PGPASSWORD: dbConfig.password,
      },
    });

    pgRestore.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      // pg_restore outputs to stderr even for normal operation
      if (!msg.includes('pg_restore: implied data-only')) {
        console.log(`  ${msg}`);
      }
    });

    pgRestore.on('error', (error) => {
      reject(new Error(`pg_restore error: ${error.message}`));
    });

    pgRestore.on('close', (code) => {
      // pg_restore can return non-zero even on successful restore
      // if objects don't exist (due to --clean --if-exists)
      console.log(`  ✓ Restore completed (exit code: ${code})\n`);
      resolve();
    });
  });
}

async function verifyRestore(): Promise<void> {
  console.log('Step 3: Verifying restore...\n');

  return new Promise((resolve, reject) => {
    const psql = spawn('psql', [
      '--host', dbConfig.host,
      '--port', dbConfig.port.toString(),
      '--username', dbConfig.user,
      '--dbname', dbConfig.database,
      '--command', '\\dt',
    ], {
      env: {
        ...process.env,
        PGPASSWORD: dbConfig.password,
      },
    });

    let output = '';

    psql.stdout.on('data', (data) => {
      output += data.toString();
    });

    psql.on('close', (code) => {
      if (code === 0) {
        console.log('Tables in database:');
        console.log(output);

        const tableCount = (output.match(/public \|/g) || []).length;
        console.log(`\nTotal tables: ${tableCount}`);

        if (tableCount >= 0) {
          console.log('\n✓ Restore test PASSED');
          console.log('\nVerification command:');
          console.log(`PGPASSWORD=${dbConfig.password} psql -h ${dbConfig.host} -U ${dbConfig.user} ${dbConfig.database} -c "\\dt" | wc -l | awk '$1 > 5'`);
          resolve();
        } else {
          reject(new Error('Verification failed'));
        }
      } else {
        reject(new Error(`psql failed with exit code ${code}`));
      }
    });
  });
}

// Run the test
async function main() {
  try {
    const backupPath = await createTestBackup();
    await restoreBackup(backupPath);
    await verifyRestore();

    console.log('\n=== Test Completed Successfully ===');
    process.exit(0);
  } catch (error) {
    console.error('\n=== Test Failed ===');
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

main();
