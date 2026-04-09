/**
 * Demo: Simulates the disk space check failure
 * Shows exactly what error message users will see
 */

async function simulateDiskSpaceCheck(availableGB: number, requiredGB: number = 5) {
  console.log('=== Simulating Backup with Low Disk Space ===');
  console.log('');
  console.log('Starting backup: 2026-03-22-143052-postgres-backup.dump');
  console.log('Database: production_db');
  console.log('Host: localhost:5432');
  console.log('');
  console.log('Running pre-backup validation checks...');
  console.log('');
  console.log('1. Testing database connection...');
  console.log('   ✓ Database connection successful');
  console.log('2. Testing backup directory write access...');
  console.log('   ✓ Backup directory is writable');
  console.log('3. Checking available disk space...');

  // Simulate the disk space check
  if (availableGB < requiredGB) {
    const error = `Insufficient disk space: ${availableGB.toFixed(2)}GB available, ${requiredGB}GB required`;
    console.log(`   ✗ ${error}`);
    console.log('');
    console.log('=== Backup Failed ===');
    console.log(`Error: Disk space check failed: ${error}`);
    console.log('');
    console.log('✓ pg_dump was NEVER executed');
    console.log('✓ No partial backup files created');
    console.log('✓ Backup directory remains clean');
    console.log('');
    return false;
  } else {
    console.log(`   ✓ Sufficient disk space available: ${availableGB.toFixed(2)}GB`);
    console.log('4. S3 upload not configured, skipping S3 test');
    console.log('');
    console.log('✓ All pre-backup checks passed');
    console.log('');
    console.log('[Would proceed to pg_dump...]');
    return true;
  }
}

async function main() {
  console.log('Scenario 1: Insufficient Disk Space (0.98GB available)');
  console.log('='.repeat(60));
  await simulateDiskSpaceCheck(0.98);

  console.log('');
  console.log('');
  console.log('Scenario 2: Sufficient Disk Space (54.74GB available)');
  console.log('='.repeat(60));
  await simulateDiskSpaceCheck(54.74);
}

main();
