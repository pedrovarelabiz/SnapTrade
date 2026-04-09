import { uploadToS3 } from '/opt/snaptrade-unified/backend/scripts/s3-upload';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createWriteStream } from 'fs';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

// Calculate MD5 hash of a file
async function calculateMD5(filePath: string): Promise<string> {
  const hash = createHash('md5');
  const stream = createReadStream(filePath);

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function testLargeFileUpload() {
  const testFile = '/tmp/test-large.bin';
  const testBucket = process.env.AWS_S3_BACKUP_BUCKET || 'snaptrade-test-backups';
  const testKey = `load-test-${Date.now()}-test-large.bin`;

  console.log('=== S3 Large File Upload Load Test ===\n');

  // Calculate original file hash
  console.log('Calculating MD5 hash of original file...');
  const originalHash = await calculateMD5(testFile);
  console.log(`Original file MD5: ${originalHash}\n`);

  // Upload the file
  console.log('Starting upload test...\n');
  const uploadStartTime = Date.now();

  const result = await uploadToS3({
    filePath: testFile,
    bucket: testBucket,
    key: testKey,
    databaseName: 'load-test',
  });

  const uploadEndTime = Date.now();
  const uploadDurationSeconds = ((uploadEndTime - uploadStartTime) / 1000).toFixed(2);

  if (!result.success) {
    console.error('\n❌ Upload failed:', result.error?.message);
    process.exit(1);
  }

  console.log(`\n✅ Upload completed in ${uploadDurationSeconds} seconds`);
  console.log(`   Location: ${result.location}`);
  console.log(`   Bucket: ${result.bucket}`);
  console.log(`   Key: ${result.key}\n`);

  // Download and verify integrity
  console.log('Downloading file to verify integrity...');
  const downloadPath = '/tmp/test-large-downloaded.bin';
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  const downloadStartTime = Date.now();
  const command = new GetObjectCommand({
    Bucket: result.bucket,
    Key: result.key,
  });

  const response = await s3Client.send(command);
  const writeStream = createWriteStream(downloadPath);

  if (response.Body) {
    await pipeline(response.Body as any, writeStream);
  }

  const downloadEndTime = Date.now();
  const downloadDurationSeconds = ((downloadEndTime - downloadStartTime) / 1000).toFixed(2);

  console.log(`Downloaded in ${downloadDurationSeconds} seconds`);

  // Verify integrity
  console.log('Verifying file integrity...');
  const downloadedHash = await calculateMD5(downloadPath);
  console.log(`Downloaded file MD5: ${downloadedHash}`);

  if (originalHash === downloadedHash) {
    console.log('\n✅ File integrity verified! Hashes match.');
  } else {
    console.error('\n❌ File integrity check failed! Hashes do not match.');
    process.exit(1);
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Upload time: ${uploadDurationSeconds}s`);
  console.log(`Download time: ${downloadDurationSeconds}s`);
  console.log(`Bucket: ${result.bucket}`);
  console.log(`Key: ${result.key}`);
  console.log(`Multipart upload: Yes (via @aws-sdk/lib-storage)`);
  console.log('Status: ✅ All tests passed');
}

testLargeFileUpload().catch((error) => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
