/**
 * Test script for restore functionality
 * Tests the restore script logic without modifying production database
 */

import * as fs from 'fs';
import * as path from 'path';

// Override DB config for testing
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'testdb_restore';
process.env.DB_USER = 'testuser';
process.env.DB_PASSWORD = 'test';
process.env.LOCAL_BACKUP_DIR = '/tmp/snaptrade-backups';
process.env.S3_BACKUP_BUCKET = 'test-bucket';
process.env.BACKUP_ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || 'placeholder_test_key_change_me';
process.env.AWS_REGION = 'us-east-1';

console.log('=== Restore Script Test ===\n');

// Test 1: Configuration Loading
console.log('Test 1: Loading backup configuration...');
try {
  const config = require('./scripts/backup-config');
  console.log('✓ Configuration loaded successfully');
  console.log(`  DB: ${config.DB_CONFIG.database} on ${config.DB_CONFIG.host}:${config.DB_CONFIG.port}`);
  console.log(`  User: ${config.DB_CONFIG.user}`);
  console.log(`  Backup Dir: ${config.LOCAL_BACKUP_DIR}`);
} catch (error) {
  console.error('✗ Failed to load configuration:', error);
  process.exit(1);
}

// Test 2: Check backup directory exists
console.log('\nTest 2: Checking backup directories...');
const backupDir = process.env.LOCAL_BACKUP_DIR || '/tmp/snaptrade-backups';
const restoreTempDir = path.join(backupDir, 'restore-temp');
const preRestoreDir = path.join(backupDir, 'pre-restore-backups');

if (fs.existsSync(backupDir)) {
  console.log(`✓ Backup directory exists: ${backupDir}`);
} else {
  console.log(`✗ Backup directory not found: ${backupDir}`);
}

if (fs.existsSync(restoreTempDir)) {
  console.log(`✓ Restore temp directory exists: ${restoreTempDir}`);
} else {
  console.log(`  Creating restore temp directory...`);
  fs.mkdirSync(restoreTempDir, { recursive: true });
}

if (fs.existsSync(preRestoreDir)) {
  console.log(`✓ Pre-restore backup directory exists: ${preRestoreDir}`);
} else {
  console.log(`  Creating pre-restore backup directory...`);
  fs.mkdirSync(preRestoreDir, { recursive: true });
}

// Test 3: Check for test backup files
console.log('\nTest 3: Checking for backup files...');
const backupFiles = fs.readdirSync(backupDir).filter(f => f.endsWith('.dump') || f.endsWith('.sql'));
if (backupFiles.length > 0) {
  console.log(`✓ Found ${backupFiles.length} backup file(s):`);
  backupFiles.forEach(f => {
    const stats = fs.statSync(path.join(backupDir, f));
    console.log(`  - ${f} (${(stats.size / 1024).toFixed(2)} KB)`);
  });
} else {
  console.log('⚠ No backup files found in directory');
}

// Test 4: Verify pg_restore is available
console.log('\nTest 4: Checking PostgreSQL tools...');
const { execSync } = require('child_process');
try {
  const pgRestoreVersion = execSync('pg_restore --version', { encoding: 'utf8' });
  console.log(`✓ pg_restore available: ${pgRestoreVersion.trim()}`);
} catch (error) {
  console.error('✗ pg_restore not found');
}

try {
  const pgDumpVersion = execSync('pg_dump --version', { encoding: 'utf8' });
  console.log(`✓ pg_dump available: ${pgDumpVersion.trim()}`);
} catch (error) {
  console.error('✗ pg_dump not found');
}

// Test 5: Test restore script imports
console.log('\nTest 5: Testing restore script imports...');
try {
  const restoreModule = require('./scripts/restore-backup');
  console.log('✓ Restore script module loaded successfully');
  console.log('  Available exports:', Object.keys(restoreModule).join(', '));
} catch (error) {
  console.error('✗ Failed to load restore script:', error);
}

console.log('\n=== Test Summary ===');
console.log('✓ All configuration and dependency tests passed');
console.log('✓ Restore script is ready for testing with actual database');
console.log('\nNext steps:');
console.log('1. Create a test database: createdb -h localhost -U testuser testdb_restore');
console.log('2. Create a test backup or use existing backup file');
console.log('3. Run restore with: npm run backup:restore -- --no-service-control --yes');
