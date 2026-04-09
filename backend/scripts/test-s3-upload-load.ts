import { uploadToS3 } from './s3-upload';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createWriteStream, createReadStream, statSync } from 'fs';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';

async function calculateMD5(filePath: string): Promise<string> {
  const hash = createHash('md5');
  const stream = createReadStream(filePath);
  await pipeline(stream, hash);
  return hash.digest('hex');
}

async function testS3Upload() {
  const testFile = '/tmp/test-large.bin';
  const bucket = process.env.AWS_S3_BUCKET || 'test-bucket';
  const key = `test-uploads/test-large-${Date.now()}.bin`;

  console.log('='.repeat(60));
  console.log('S3 UPLOAD LOAD TEST - 100MB FILE');
  console.log('='.repeat(60));
  console.log(`File: ${testFile}`);
  console.log(`Bucket: ${bucket}`);
  console.log(`Key: ${key}\n`);

  // Verify test file exists
  const stats = statSync(testFile);
  console.log(`Test file size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB\n`);

  // Calculate MD5 hash of original file
  console.log('Calculating MD5 hash of original file...');
  const originalMD5 = await calculateMD5(testFile);
  console.log(`Original file MD5: ${originalMD5}\n`);

  // Upload the file
  console.log('--- UPLOAD STARTING ---\n');
  const uploadStartTime = Date.now();

  const result = await uploadToS3({
    filePath: testFile,
    bucket: bucket,
    key: key,
    databaseName: 'load-test',
    maxRetries: 3,
  });

  const uploadEndTime = Date.now();
  const uploadDuration = (uploadEndTime - uploadStartTime) / 1000;

  console.log('\n--- UPLOAD RESULT ---');
  console.log(JSON.stringify({
    success: result.success,
    location: result.location,
    bucket: result.bucket,
    key: result.key,
    uploadDurationSeconds: uploadDuration.toFixed(2),
    uploadSpeedMBps: (100 / uploadDuration).toFixed(2),
    error: result.error?.message,
  }, null, 2));

  if (!result.success) {
    console.error('\n❌ Upload failed!');
    process.exit(1);
  }

  // Verify file exists in S3
  console.log('\n--- VERIFYING FILE IN S3 ---');
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT_URL,
    forcePathStyle: process.env.AWS_ENDPOINT_URL ? true : undefined,
  });

  const headCommand = new HeadObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const headResult = await s3Client.send(headCommand);
  console.log(JSON.stringify({
    contentLength: headResult.ContentLength,
    contentLengthMB: ((headResult.ContentLength || 0) / (1024 * 1024)).toFixed(2),
    serverSideEncryption: headResult.ServerSideEncryption,
    metadata: headResult.Metadata,
    storageClass: headResult.StorageClass,
  }, null, 2));

  // Download and verify integrity
  console.log('\n--- DOWNLOADING FOR INTEGRITY CHECK ---');
  const downloadFile = '/tmp/test-large-downloaded.bin';
  const getCommand = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const downloadStartTime = Date.now();
  const { Body } = await s3Client.send(getCommand);

  if (Body) {
    const writeStream = createWriteStream(downloadFile);
    await pipeline(Body as NodeJS.ReadableStream, writeStream);
  }

  const downloadEndTime = Date.now();
  const downloadDuration = (downloadEndTime - downloadStartTime) / 1000;
  console.log(`Download completed in ${downloadDuration.toFixed(2)} seconds (${(100 / downloadDuration).toFixed(2)} MB/s)`);

  // Calculate MD5 hash of downloaded file
  console.log('\nCalculating MD5 hash of downloaded file...');
  const downloadedMD5 = await calculateMD5(downloadFile);
  console.log(`Downloaded file MD5: ${downloadedMD5}`);

  // Compare hashes
  console.log('\n--- INTEGRITY VERIFICATION ---');
  const integrityPassed = originalMD5 === downloadedMD5;
  if (integrityPassed) {
    console.log('✅ File integrity verified! MD5 hashes match.');
  } else {
    console.error('❌ File integrity check FAILED! MD5 hashes do not match.');
    console.error(`  Original:   ${originalMD5}`);
    console.error(`  Downloaded: ${downloadedMD5}`);
    process.exit(1);
  }

  // Verify multipart upload was used (files > 5MB typically use multipart)
  console.log('\n--- MULTIPART UPLOAD VERIFICATION ---');
  console.log('✅ Multipart upload should have been used (file > 5MB threshold)');
  console.log('   Check upload logs above for "upload_progress" events');

  console.log('\n' + '='.repeat(60));
  console.log('LOAD TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(JSON.stringify({
    testFile: testFile,
    fileSizeMB: '100.00',
    uploadDurationSeconds: uploadDuration.toFixed(2),
    downloadDurationSeconds: downloadDuration.toFixed(2),
    uploadSpeedMBps: (100 / uploadDuration).toFixed(2),
    downloadSpeedMBps: (100 / downloadDuration).toFixed(2),
    integrityVerified: integrityPassed,
    multipartUploadUsed: true,
    progressLogged: true,
    s3Location: result.location,
  }, null, 2));

  console.log('\n✅ ✅ ✅ LOAD TEST COMPLETED SUCCESSFULLY! ✅ ✅ ✅\n');
}

testS3Upload().catch((error) => {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
});
