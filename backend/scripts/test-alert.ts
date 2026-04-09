import { sendBackupAlert } from './alerts';

async function testAlerts() {
  const timestamp = new Date().toISOString();

  console.log('Testing Telegram alerts...\n');

  // Test 1: Success alert
  console.log('1. Sending SUCCESS alert...');
  try {
    await sendBackupAlert(
      'success',
      `🧪 Test Alert - SUCCESS\nTimestamp: ${timestamp}\nEnvironment: ${process.env.NODE_ENV || 'development'}\nHost: ${process.env.HOSTNAME || 'localhost'}`
    );
    console.log('✓ Success alert sent\n');
  } catch (error) {
    console.error('✗ Failed to send success alert:', error);
  }

  // Wait 2 seconds between messages
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Failure alert with error
  console.log('2. Sending FAILURE alert with error...');
  try {
    await sendBackupAlert(
      'failure',
      `🧪 Test Alert - FAILURE\nTimestamp: ${timestamp}\nEnvironment: ${process.env.NODE_ENV || 'development'}\nHost: ${process.env.HOSTNAME || 'localhost'}`,
      new Error('Test error: Database connection timeout after 30s')
    );
    console.log('✓ Failure alert sent\n');
  } catch (error) {
    console.error('✗ Failed to send failure alert:', error);
  }

  console.log('Alert testing complete!');
}

testAlerts().catch(console.error);
