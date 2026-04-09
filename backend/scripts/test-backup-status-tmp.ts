#!/usr/bin/env ts-node
/**
 * Test script for backup status tracking (using /tmp for testing)
 */
import * as fs from 'fs';
import * as path from 'path';

// Override the backup dir for testing
const TEST_BACKUP_DIR = '/tmp/snaptrade-backups-test';
const STATUS_FILE_PATH = path.join(TEST_BACKUP_DIR, 'status', 'last-backup-status.json');

interface BackupStatus {
  timestamp: string;
  success: boolean;
  fileSize?: number;
  s3Url?: string;
  duration?: number;
  errorMessage?: string;
}

async function updateBackupStatus(status: BackupStatus): Promise<void> {
  try {
    const dir = path.dirname(STATUS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    }

    const statusData = {
      ...status,
      timestamp: status.timestamp || new Date().toISOString(),
    };

    fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(statusData, null, 2), 'utf-8');
    // Make file readable by all users
    fs.chmodSync(STATUS_FILE_PATH, 0o644);
  } catch (error) {
    throw new Error(`Failed to update backup status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getLastBackupStatus(): Promise<BackupStatus | null> {
  try {
    if (!fs.existsSync(STATUS_FILE_PATH)) {
      return null;
    }

    const data = fs.readFileSync(STATUS_FILE_PATH, 'utf-8');
    return JSON.parse(data) as BackupStatus;
  } catch (error) {
    throw new Error(`Failed to read backup status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runTests() {
  console.log('=== Testing Backup Status Tracking ===');
  console.log(`Test location: ${STATUS_FILE_PATH}\n`);

  // Clean up any existing test data
  if (fs.existsSync(TEST_BACKUP_DIR)) {
    fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
  }

  // Test 1: Write successful backup status with all fields
  console.log('Test 1: Writing successful backup status with all fields...');
  const successStatus: BackupStatus = {
    timestamp: new Date().toISOString(),
    success: true,
    fileSize: 1024567890,
    s3Url: 's3://snaptrade-unified-backups/backup-2026-03-22.sql.gz',
    duration: 45.5,
  };

  await updateBackupStatus(successStatus);
  console.log('✓ Status written successfully\n');

  // Test 2: Read back the status
  console.log('Test 2: Reading backup status...');
  const readStatus = await getLastBackupStatus();

  if (!readStatus) {
    console.error('✗ Failed to read status');
    process.exit(1);
  }

  console.log('✓ Status read successfully');
  console.log('Status data:', JSON.stringify(readStatus, null, 2));
  console.log();

  // Test 3: Verify all expected fields
  console.log('Test 3: Verifying all expected fields...');
  const expectedFields = ['timestamp', 'success', 'fileSize', 's3Url', 'duration'];

  for (const field of expectedFields) {
    if (!(field in readStatus)) {
      console.error(`✗ Missing expected field: ${field}`);
      process.exit(1);
    }
  }
  console.log('✓ All expected fields present for success case');
  console.log(`✓ Fields: ${Object.keys(readStatus).join(', ')}\n`);

  // Test 4: Write failure status with error message
  console.log('Test 4: Writing failed backup status with error...');
  const errorStatus: BackupStatus = {
    timestamp: new Date().toISOString(),
    success: false,
    errorMessage: 'Database connection timeout',
    duration: 10.2,
  };

  await updateBackupStatus(errorStatus);
  const errorReadStatus = await getLastBackupStatus();

  if (!errorReadStatus || !errorReadStatus.errorMessage) {
    console.error('✗ Failed to write/read error status');
    process.exit(1);
  }

  console.log('✓ Error status written and read successfully');
  console.log('Error status:', JSON.stringify(errorReadStatus, null, 2));
  console.log();

  // Test 5: Verify file permissions (readable by non-root users)
  console.log('Test 5: Verifying file permissions...');
  const stats = fs.statSync(STATUS_FILE_PATH);
  const mode = (stats.mode & parseInt('777', 8)).toString(8);
  console.log(`File permissions: ${mode} (should be 644 or more permissive)`);

  if ((stats.mode & 0o004) === 0) {
    console.error('✗ File is not readable by others');
    process.exit(1);
  }
  console.log('✓ File is readable by non-root users\n');

  // Test 6: Verify JSON structure
  console.log('Test 6: Verifying JSON file structure...');
  const rawContent = fs.readFileSync(STATUS_FILE_PATH, 'utf-8');
  console.log('Raw JSON content:');
  console.log(rawContent);

  try {
    JSON.parse(rawContent);
    console.log('✓ Valid JSON structure\n');
  } catch (e) {
    console.error('✗ Invalid JSON');
    process.exit(1);
  }

  console.log('=== All Tests Passed ===');
  console.log(`\nTest file location: ${STATUS_FILE_PATH}`);
  console.log('Verify with: test -f', STATUS_FILE_PATH, '&& cat', STATUS_FILE_PATH, '| jq .');
}

runTests().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
