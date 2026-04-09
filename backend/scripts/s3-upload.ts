import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream, statSync } from 'fs';
import { basename } from 'path';

interface UploadOptions {
  filePath: string;
  bucket: string;
  key?: string;
  databaseName: string;
  maxRetries?: number;
}

interface UploadResult {
  success: boolean;
  location?: string;
  bucket?: string;
  key?: string;
  error?: Error;
}

/**
 * Upload encrypted backup file to S3 with retry logic and progress logging
 */
export async function uploadToS3(options: UploadOptions): Promise<UploadResult> {
  const {
    filePath,
    bucket,
    key = basename(filePath),
    databaseName,
    maxRetries = 3,
  } = options;

  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT_URL,
    forcePathStyle: process.env.AWS_ENDPOINT_URL ? true : undefined,
  });

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();

      // Get file stats for metadata
      const stats = statSync(filePath);
      const fileSizeInBytes = stats.size;
      const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);

      // Structured log: Upload start
      console.log(JSON.stringify({
        event: 'upload_start',
        attempt: attempt,
        maxRetries: maxRetries,
        filePath: filePath,
        bucket: bucket,
        key: key,
        databaseName: databaseName,
        fileSizeBytes: fileSizeInBytes,
        fileSizeMB: fileSizeInMB,
        timestamp: new Date().toISOString(),
      }));

      const fileStream = createReadStream(filePath);

      const uploadParams: any = {
        Bucket: bucket,
        Key: key,
        Body: fileStream,
        Metadata: {
          timestamp: new Date().toISOString(),
          databaseName: databaseName,
          size: fileSizeInBytes.toString(),
          uploadAttempt: attempt.toString(),
        },
      };

      // Only add server-side encryption if not using a custom endpoint (e.g., MinIO)
      if (!process.env.AWS_ENDPOINT_URL) {
        uploadParams.ServerSideEncryption = 'AES256';
      }

      const upload = new Upload({
        client: s3Client,
        params: uploadParams,
      });

      // Progress logging
      upload.on('httpUploadProgress', (progress) => {
        if (progress.loaded && progress.total) {
          const percentage = ((progress.loaded / progress.total) * 100).toFixed(2);
          const loadedMB = (progress.loaded / (1024 * 1024)).toFixed(2);
          const totalMB = (progress.total / (1024 * 1024)).toFixed(2);

          // Structured log: Upload progress
          console.log(JSON.stringify({
            event: 'upload_progress',
            percentage: parseFloat(percentage),
            loadedBytes: progress.loaded,
            totalBytes: progress.total,
            loadedMB: loadedMB,
            totalMB: totalMB,
            attempt: attempt,
            timestamp: new Date().toISOString(),
          }));
        }
      });

      const result = await upload.done();
      const endTime = Date.now();
      const durationMs = endTime - startTime;
      const durationSeconds = (durationMs / 1000).toFixed(2);

      // Structured log: Upload completion
      console.log(JSON.stringify({
        event: 'upload_complete',
        success: true,
        s3Url: result.Location,
        bucket: result.Bucket,
        key: result.Key,
        fileSizeBytes: fileSizeInBytes,
        fileSizeMB: fileSizeInMB,
        durationMs: durationMs,
        durationSeconds: parseFloat(durationSeconds),
        attempt: attempt,
        timestamp: new Date().toISOString(),
      }));

      return {
        success: true,
        location: result.Location,
        bucket: result.Bucket,
        key: result.Key,
      };
    } catch (error) {
      lastError = error as Error;

      // Structured log: Upload error
      console.error(JSON.stringify({
        event: 'upload_error',
        attempt: attempt,
        maxRetries: maxRetries,
        error: lastError.message,
        errorStack: lastError.stack,
        filePath: filePath,
        bucket: bucket,
        key: key,
        timestamp: new Date().toISOString(),
      }));

      if (attempt < maxRetries) {
        const delaySeconds = attempt * 2; // Exponential backoff: 2s, 4s, 6s

        // Structured log: Retry attempt
        console.log(JSON.stringify({
          event: 'upload_retry',
          attempt: attempt,
          nextAttempt: attempt + 1,
          maxRetries: maxRetries,
          delaySeconds: delaySeconds,
          timestamp: new Date().toISOString(),
        }));

        await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
      }
    }
  }

  // Structured log: All attempts failed
  console.error(JSON.stringify({
    event: 'upload_failed',
    success: false,
    totalAttempts: maxRetries,
    error: lastError?.message,
    filePath: filePath,
    bucket: bucket,
    key: key,
    timestamp: new Date().toISOString(),
  }));

  return {
    success: false,
    error: lastError,
  };
}
