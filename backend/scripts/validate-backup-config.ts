/**
 * Backup Configuration Validation Script
 *
 * Validates the entire backup configuration by checking:
 * - Environment variables existence
 * - S3 connection and credentials
 * - Encryption key validity
 * - PostgreSQL connectivity with pg_dump
 * - Local directories existence and writability
 * - Disk space availability
 *
 * Usage: npm run backup:validate or tsx scripts/validate-backup-config.ts
 */

// Load environment variables from .env file FIRST, before any other imports
import { config } from 'dotenv';
import * as path from 'path';

// Load .env from the backend directory
config({ path: path.join(__dirname, '..', '.env') });

import { S3Client, HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { DB_CONFIG, LOCAL_BACKUP_DIR, S3_BUCKET_NAME, AWS_REGION } from './backup-config';

interface ValidationResult {
  category: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: string;
}

const results: ValidationResult[] = [];

/**
 * Adds a validation result to the results array
 */
function addResult(
  category: string,
  check: string,
  status: 'PASS' | 'FAIL' | 'WARN',
  message: string,
  details?: string
): void {
  results.push({ category, check, status, message, details });
}

/**
 * Validates required environment variables
 */
function validateEnvironmentVariables(): void {
  console.log('\n=== Checking Environment Variables ===\n');

  // Required database variables
  const dbVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  dbVars.forEach((varName) => {
    if (process.env[varName]) {
      addResult('Environment', varName, 'PASS', `${varName} is set`);
    } else {
      addResult('Environment', varName, 'FAIL', `${varName} is missing`, 'Database backups will fail without this variable');
    }
  });

  // AWS credentials
  const awsVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  awsVars.forEach((varName) => {
    if (process.env[varName]) {
      addResult('Environment', varName, 'PASS', `${varName} is set`);
    } else {
      addResult('Environment', varName, 'FAIL', `${varName} is missing`, 'S3 uploads will fail without AWS credentials');
    }
  });

  // Encryption key
  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
  if (encryptionKey) {
    addResult('Environment', 'BACKUP_ENCRYPTION_KEY', 'PASS', 'Encryption key is set');
  } else {
    addResult('Environment', 'BACKUP_ENCRYPTION_KEY', 'FAIL', 'Encryption key is missing', 'Encrypted backups require this key');
  }

  // Optional variables with defaults
  const optionalVars = ['BACKUP_S3_BUCKET', 'AWS_REGION', 'LOCAL_BACKUP_DIR'];
  optionalVars.forEach((varName) => {
    if (process.env[varName]) {
      addResult('Environment', varName, 'PASS', `${varName} is set to custom value`);
    } else {
      addResult('Environment', varName, 'WARN', `${varName} not set, using default`, 'Using default value');
    }
  });
}

/**
 * Validates encryption key format and length
 */
function validateEncryptionKey(): void {
  console.log('\n=== Validating Encryption Key ===\n');

  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;

  if (!encryptionKey) {
    addResult('Encryption', 'Key Existence', 'FAIL', 'BACKUP_ENCRYPTION_KEY not set');
    return;
  }

  // Check key length (should be 64 hex characters for 32 bytes)
  const expectedHexLength = 64; // 32 bytes * 2 hex chars per byte

  if (encryptionKey.length === expectedHexLength) {
    addResult('Encryption', 'Key Length', 'PASS', `Key is correct length (${expectedHexLength} hex characters / 32 bytes)`);
  } else {
    addResult(
      'Encryption',
      'Key Length',
      'FAIL',
      `Key has invalid length: ${encryptionKey.length} characters`,
      `Expected ${expectedHexLength} hex characters (32 bytes). Current: ${encryptionKey.length} characters`
    );
  }

  // Validate hex format
  const hexRegex = /^[0-9a-fA-F]+$/;
  if (hexRegex.test(encryptionKey)) {
    addResult('Encryption', 'Key Format', 'PASS', 'Key is valid hexadecimal format');
  } else {
    addResult('Encryption', 'Key Format', 'FAIL', 'Key contains non-hexadecimal characters', 'Key must be hexadecimal (0-9, a-f)');
  }
}

/**
 * Tests S3 connection and bucket access
 */
async function validateS3Connection(): Promise<void> {
  console.log('\n=== Testing S3 Connection ===\n');

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    addResult('S3', 'Connection Test', 'FAIL', 'Cannot test S3 - AWS credentials missing');
    return;
  }

  try {
    const s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    addResult('S3', 'Client Creation', 'PASS', `S3 client created for region: ${AWS_REGION}`);

    // Test bucket access
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET_NAME }));
      addResult('S3', 'Bucket Access', 'PASS', `Successfully accessed bucket: ${S3_BUCKET_NAME}`);
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        addResult('S3', 'Bucket Access', 'FAIL', `Bucket does not exist: ${S3_BUCKET_NAME}`, error.message);
      } else if (error.name === 'Forbidden' || error.$metadata?.httpStatusCode === 403) {
        addResult('S3', 'Bucket Access', 'FAIL', `Access denied to bucket: ${S3_BUCKET_NAME}`, 'Check IAM permissions');
      } else {
        addResult('S3', 'Bucket Access', 'FAIL', `Failed to access bucket: ${S3_BUCKET_NAME}`, error.message);
      }
      return;
    }

    // Test list objects permission
    try {
      await s3Client.send(new ListObjectsV2Command({ Bucket: S3_BUCKET_NAME, MaxKeys: 1 }));
      addResult('S3', 'List Objects', 'PASS', 'Successfully listed objects in bucket');
    } catch (error: any) {
      addResult('S3', 'List Objects', 'WARN', 'Cannot list objects in bucket', 'Upload may still work, but cleanup will fail');
    }

  } catch (error: any) {
    addResult('S3', 'Connection Test', 'FAIL', 'Failed to create S3 client', error.message);
  }
}

/**
 * Checks PostgreSQL connectivity using pg_dump
 */
async function validatePostgreSQLConnection(): Promise<void> {
  console.log('\n=== Testing PostgreSQL Connection ===\n');

  if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    addResult('PostgreSQL', 'Connection Test', 'FAIL', 'Cannot test PostgreSQL - database credentials missing');
    return;
  }

  return new Promise((resolve) => {
    // Test pg_dump availability
    const versionCheck = spawn('pg_dump', ['--version']);
    let versionOutput = '';

    versionCheck.stdout.on('data', (data) => {
      versionOutput += data.toString();
    });

    versionCheck.on('close', (code) => {
      if (code === 0) {
        addResult('PostgreSQL', 'pg_dump Available', 'PASS', `pg_dump found: ${versionOutput.trim()}`);

        // Test database connection
        const connectionTest = spawn('pg_dump', [
          '--host', DB_CONFIG.host,
          '--port', DB_CONFIG.port.toString(),
          '--username', DB_CONFIG.user,
          '--dbname', DB_CONFIG.database,
          '--schema-only',
          '--format=custom',
        ], {
          env: {
            ...process.env,
            PGPASSWORD: DB_CONFIG.password,
          },
        });

        let errorOutput = '';
        let testCompleted = false;

        // Add 10 second timeout for connection test
        const connectionTimeout = setTimeout(() => {
          if (!testCompleted) {
            testCompleted = true;
            connectionTest.kill();
            addResult(
              'PostgreSQL',
              'Database Connection',
              'FAIL',
              `Connection test timed out after 10 seconds`,
              'Database may be unreachable or credentials may be incorrect'
            );
            resolve();
          }
        }, 10000);

        connectionTest.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        connectionTest.on('close', (code) => {
          if (!testCompleted) {
            testCompleted = true;
            clearTimeout(connectionTimeout);
            if (code === 0) {
              addResult(
                'PostgreSQL',
                'Database Connection',
                'PASS',
                `Successfully connected to ${DB_CONFIG.database} at ${DB_CONFIG.host}:${DB_CONFIG.port}`
              );
            } else {
              addResult(
                'PostgreSQL',
                'Database Connection',
                'FAIL',
                `Failed to connect to ${DB_CONFIG.database}`,
                errorOutput || 'Connection failed'
              );
            }
            resolve();
          }
        });

        connectionTest.on('error', (error) => {
          if (!testCompleted) {
            testCompleted = true;
            clearTimeout(connectionTimeout);
            addResult('PostgreSQL', 'Database Connection', 'FAIL', 'Failed to run pg_dump', error.message);
            resolve();
          }
        });

      } else {
        addResult('PostgreSQL', 'pg_dump Available', 'FAIL', 'pg_dump not found', 'Install postgresql-client package');
        resolve();
      }
    });

    versionCheck.on('error', (error) => {
      addResult('PostgreSQL', 'pg_dump Available', 'FAIL', 'pg_dump not found', error.message);
      resolve();
    });
  });
}

/**
 * Validates local backup directories
 */
function validateLocalDirectories(): void {
  console.log('\n=== Validating Local Directories ===\n');

  // Check if directory exists
  if (fs.existsSync(LOCAL_BACKUP_DIR)) {
    addResult('Local Storage', 'Directory Exists', 'PASS', `Backup directory exists: ${LOCAL_BACKUP_DIR}`);
  } else {
    addResult('Local Storage', 'Directory Exists', 'WARN', `Backup directory does not exist: ${LOCAL_BACKUP_DIR}`, 'Will be created on first backup');
  }

  // Check if directory is writable (create it if it doesn't exist for testing)
  try {
    if (!fs.existsSync(LOCAL_BACKUP_DIR)) {
      fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });
      addResult('Local Storage', 'Directory Creation', 'PASS', 'Successfully created backup directory');
    }

    // Test write permissions
    const testFile = `${LOCAL_BACKUP_DIR}/.write-test-${Date.now()}`;
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    addResult('Local Storage', 'Write Permission', 'PASS', 'Directory is writable');
  } catch (error: any) {
    addResult('Local Storage', 'Write Permission', 'FAIL', 'Directory is not writable', error.message);
  }

  // Check parent directory permissions
  const parentDir = require('path').dirname(LOCAL_BACKUP_DIR);
  if (fs.existsSync(parentDir)) {
    try {
      fs.accessSync(parentDir, fs.constants.W_OK);
      addResult('Local Storage', 'Parent Directory', 'PASS', `Parent directory is writable: ${parentDir}`);
    } catch (error) {
      addResult('Local Storage', 'Parent Directory', 'WARN', `Parent directory may not be writable: ${parentDir}`);
    }
  }
}

/**
 * Checks available disk space
 */
function validateDiskSpace(): void {
  console.log('\n=== Checking Disk Space ===\n');

  try {
    const stats = fs.statfsSync || require('fs').statfsSync;

    if (!stats) {
      // Fallback for systems without statfsSync
      addResult('Disk Space', 'Space Check', 'WARN', 'Cannot check disk space on this system', 'statfsSync not available');
      return;
    }

    const diskStats = stats(LOCAL_BACKUP_DIR.startsWith('/') ? LOCAL_BACKUP_DIR : '/');
    const availableGB = (diskStats.bavail * diskStats.bsize) / (1024 ** 3);
    const totalGB = (diskStats.blocks * diskStats.bsize) / (1024 ** 3);
    const usedGB = totalGB - availableGB;
    const usedPercent = ((usedGB / totalGB) * 100).toFixed(1);

    addResult(
      'Disk Space',
      'Available Space',
      availableGB > 10 ? 'PASS' : (availableGB > 5 ? 'WARN' : 'FAIL'),
      `${availableGB.toFixed(2)} GB available (${usedPercent}% used)`,
      `Total: ${totalGB.toFixed(2)} GB, Used: ${usedGB.toFixed(2)} GB`
    );

    if (availableGB < 5) {
      addResult('Disk Space', 'Space Warning', 'FAIL', 'Low disk space', 'Less than 5 GB available - backups may fail');
    } else if (availableGB < 10) {
      addResult('Disk Space', 'Space Warning', 'WARN', 'Disk space is getting low', 'Consider cleanup or expansion');
    }

  } catch (error: any) {
    addResult('Disk Space', 'Space Check', 'WARN', 'Could not check disk space', error.message);
  }
}

/**
 * Prints a formatted validation report
 */
function printReport(): void {
  console.log('\n\n');
  console.log('═'.repeat(80));
  console.log('  BACKUP CONFIGURATION VALIDATION REPORT');
  console.log('═'.repeat(80));
  console.log();

  let currentCategory = '';
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  results.forEach((result) => {
    if (result.category !== currentCategory) {
      currentCategory = result.category;
      console.log();
      console.log(`┌─ ${currentCategory} ${'─'.repeat(77 - currentCategory.length)}`);
    }

    const statusIcon = result.status === 'PASS' ? '✓' : (result.status === 'WARN' ? '⚠' : '✗');
    const statusColor = result.status === 'PASS' ? '\x1b[32m' : (result.status === 'WARN' ? '\x1b[33m' : '\x1b[31m');
    const resetColor = '\x1b[0m';

    console.log(`│ ${statusColor}${statusIcon} ${result.check}${resetColor}: ${result.message}`);
    if (result.details) {
      console.log(`│   └─ ${result.details}`);
    }

    if (result.status === 'PASS') passCount++;
    else if (result.status === 'WARN') warnCount++;
    else failCount++;
  });

  console.log('└' + '─'.repeat(79));
  console.log();
  console.log('═'.repeat(80));
  console.log('  SUMMARY');
  console.log('═'.repeat(80));
  console.log();
  console.log(`  Total Checks: ${results.length}`);
  console.log(`  \x1b[32m✓ Passed: ${passCount}\x1b[0m`);
  console.log(`  \x1b[33m⚠ Warnings: ${warnCount}\x1b[0m`);
  console.log(`  \x1b[31m✗ Failed: ${failCount}\x1b[0m`);
  console.log();

  if (failCount === 0 && warnCount === 0) {
    console.log('  \x1b[32m✓ All checks passed! Backup system is properly configured.\x1b[0m');
  } else if (failCount === 0) {
    console.log('  \x1b[33m⚠ All critical checks passed, but there are warnings to review.\x1b[0m');
  } else {
    console.log('  \x1b[31m✗ Some checks failed. Please fix the issues before running backups.\x1b[0m');
  }

  console.log();
  console.log('═'.repeat(80));
  console.log();

  // Exit with appropriate code
  if (failCount > 0) {
    process.exit(1);
  } else if (warnCount > 0) {
    process.exit(0); // Warnings don't cause failure
  } else {
    process.exit(0);
  }
}

/**
 * Main validation function
 */
async function main(): Promise<void> {
  console.log('\x1b[1m\x1b[36m');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║        BACKUP CONFIGURATION VALIDATOR                                      ║');
  console.log('║        Validating backup system configuration...                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log('\x1b[0m');

  try {
    // Run all validation checks
    validateEnvironmentVariables();
    validateEncryptionKey();
    await validateS3Connection();
    await validatePostgreSQLConnection();
    validateLocalDirectories();
    validateDiskSpace();

    // Print the final report
    printReport();

  } catch (error: any) {
    console.error('\n\x1b[31m✗ Validation failed with error:\x1b[0m', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the validation
main();
