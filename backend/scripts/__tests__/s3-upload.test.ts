import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { uploadToS3 } from '../s3-upload';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

// Mock fs module to prevent actual file system access during tests
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    statSync: vi.fn(() => ({ size: 1024 })),
    createReadStream: vi.fn(() => {
      const stream = new Readable();
      stream.push(null); // Empty stream
      return stream;
    }),
  };
});

// Mock AWS SDK modules
vi.mock('@aws-sdk/client-s3', () => {
  const MockS3Client = vi.fn(function(this: any) {
    this.send = vi.fn();
    return this;
  });
  return {
    S3Client: MockS3Client,
  };
});

vi.mock('@aws-sdk/lib-storage', () => {
  const MockUpload = vi.fn(function(this: any) {
    this.done = vi.fn();
    this.on = vi.fn();
    return this;
  });
  return {
    Upload: MockUpload,
  };
});

import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

describe('S3 Upload Module', () => {
  const TEST_FILE_PATH = '/tmp/test-backup.sql';
  const TEST_BUCKET = 'test-bucket';
  const TEST_KEY = 'test-key.sql';
  const TEST_DATABASE = 'test-db';
  const originalEnv = process.env;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv, AWS_REGION: 'us-east-1' };

    // Create test file
    if (!fs.existsSync(TEST_FILE_PATH)) {
      fs.writeFileSync(TEST_FILE_PATH, 'test data content', 'utf-8');
    }

    // Spy on console methods
    consoleLogSpy = vi.fn();
    consoleErrorSpy = vi.fn();
    console.log = consoleLogSpy;
    console.error = consoleErrorSpy;

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup test file with error handling
    try {
      if (fs.existsSync(TEST_FILE_PATH)) {
        fs.unlinkSync(TEST_FILE_PATH);
      }
    } catch (error) {
      // Ignore cleanup errors - file may have already been deleted
    }

    // Restore environment variables
    process.env = originalEnv;

    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('mock S3Client initialization', () => {
    it('should initialize S3Client with correct configuration', async () => {
      const mockUploadDone = vi.fn().mockResolvedValue({
        Location: 's3://test-bucket/test-key.sql',
        Bucket: TEST_BUCKET,
        Key: TEST_KEY,
      });

      const mockUploadOn = vi.fn();

      (Upload as any).mockImplementation(function(this: any) {
        this.done = mockUploadDone;
        this.on = mockUploadOn;
        return this;
      });

      await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
      });

      expect(S3Client).toHaveBeenCalledWith({
        region: 'us-east-1',
      });
    });

    it('should use AWS_REGION from environment variable', async () => {
      process.env.AWS_REGION = 'eu-west-1';

      const mockUploadDone = vi.fn().mockResolvedValue({
        Location: 's3://test-bucket/test-key.sql',
        Bucket: TEST_BUCKET,
        Key: TEST_KEY,
      });

      (Upload as any).mockImplementation(function(this: any) {
        this.done = vi.fn().mockResolvedValue({});
        this.on = vi.fn();
        return this;
      });

      await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
      });

      expect(S3Client).toHaveBeenCalledWith({
        region: 'eu-west-1',
      });
    });
  });

  describe('successful upload', () => {
    it('should upload file successfully and return success result', async () => {
      const mockLocation = 's3://test-bucket/test-key.sql';
      const mockUploadDone = vi.fn().mockResolvedValue({
        Location: mockLocation,
        Bucket: TEST_BUCKET,
        Key: TEST_KEY,
      });

      const mockUploadOn = vi.fn();

      (Upload as any).mockImplementation(function(this: any) {
        this.done = mockUploadDone;
        this.on = mockUploadOn;
        return this;
      });

      const result = await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
      });

      expect(result.success).toBe(true);
      expect(result.location).toBe(mockLocation);
      expect(result.bucket).toBe(TEST_BUCKET);
      expect(result.key).toBe(TEST_KEY);
      expect(result.error).toBeUndefined();
    });

    it('should use basename of filePath as key when key is not provided', async () => {
      const mockUploadDone = vi.fn().mockResolvedValue({
        Location: 's3://test-bucket/test-backup.sql',
        Bucket: TEST_BUCKET,
        Key: 'test-backup.sql',
      });

      let uploadParams: any;
      (Upload as any).mockImplementation(function(this: any, config: any) {
        uploadParams = config.params;
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        databaseName: TEST_DATABASE,
      });

      expect(uploadParams.Key).toBe('test-backup.sql');
    });
  });

  describe('retry on failure', () => {
    it('should retry upload on failure up to maxRetries times', async () => {
      const mockError = new Error('Network error');
      const mockUploadDone = vi.fn()
        .mockRejectedValueOnce(mockError)
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce({
          Location: 's3://test-bucket/test-key.sql',
          Bucket: TEST_BUCKET,
          Key: TEST_KEY,
        });

      (Upload as any).mockImplementation(function(this: any) {
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      const result = await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
        maxRetries: 3,
      });

      expect(mockUploadDone).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
      expect(result.location).toBe('s3://test-bucket/test-key.sql');
    }, 15000); // 15 second timeout for retry logic

    it('should return failure when all retry attempts are exhausted', async () => {
      const mockError = new Error('Persistent network error');
      const mockUploadDone = vi.fn().mockRejectedValue(mockError);

      (Upload as any).mockImplementation(function(this: any) {
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      const result = await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
        maxRetries: 3,
      });

      expect(mockUploadDone).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Persistent network error');
    }, 15000); // 15 second timeout for retry logic

    it('should log retry attempts with exponential backoff', async () => {
      vi.useFakeTimers();

      const mockError = new Error('Temporary error');
      const mockUploadDone = vi.fn()
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce({
          Location: 's3://test-bucket/test-key.sql',
          Bucket: TEST_BUCKET,
          Key: TEST_KEY,
        });

      (Upload as any).mockImplementation(function(this: any) {
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      const uploadPromise = uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
        maxRetries: 2,
      });

      // Fast-forward timers
      await vi.runAllTimersAsync();
      const result = await uploadPromise;

      // Check that retry event was logged
      const retryLogs = consoleLogSpy.mock.calls
        .map((call: any) => {
          try {
            return JSON.parse(call[0]);
          } catch {
            return null;
          }
        })
        .filter((log: any) => log && log.event === 'upload_retry');

      expect(retryLogs.length).toBeGreaterThan(0);
      expect(retryLogs[0].delaySeconds).toBe(2); // 2 seconds for first retry

      vi.useRealTimers();
    });
  });

  describe('error handling for invalid credentials', () => {
    it('should handle invalid credentials error', async () => {
      const credentialsError = new Error('The security token included in the request is invalid');
      (credentialsError as any).name = 'InvalidToken';

      const mockUploadDone = vi.fn().mockRejectedValue(credentialsError);

      (Upload as any).mockImplementation(function(this: any) {
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      const result = await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
        maxRetries: 2,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('security token');
    });

    it('should handle access denied error', async () => {
      const accessDeniedError = new Error('Access Denied');
      (accessDeniedError as any).name = 'AccessDenied';

      const mockUploadDone = vi.fn().mockRejectedValue(accessDeniedError);

      (Upload as any).mockImplementation(function(this: any) {
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      const result = await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
        maxRetries: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Access Denied');
    });

    it('should log error details when upload fails', async () => {
      const mockError = new Error('Invalid credentials');
      const mockUploadDone = vi.fn().mockRejectedValue(mockError);

      (Upload as any).mockImplementation(function(this: any) {
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
        maxRetries: 1,
      });

      const errorLogs = consoleErrorSpy.mock.calls
        .map((call: any) => {
          try {
            return JSON.parse(call[0]);
          } catch {
            return null;
          }
        })
        .filter((log: any) => log && log.event === 'upload_error');

      expect(errorLogs.length).toBeGreaterThan(0);
      expect(errorLogs[0].error).toBe('Invalid credentials');
    });
  });

  describe('progress logging', () => {
    it('should log upload progress events', async () => {
      let progressCallback: any = null;

      const mockUploadDone = vi.fn().mockResolvedValue({
        Location: 's3://test-bucket/test-key.sql',
        Bucket: TEST_BUCKET,
        Key: TEST_KEY,
      });

      const mockUploadOn = vi.fn().mockImplementation((event: string, callback: any) => {
        if (event === 'httpUploadProgress') {
          progressCallback = callback;
        }
      });

      (Upload as any).mockImplementation(function(this: any) {
        this.done = mockUploadDone;
        this.on = mockUploadOn;
        return this;
      });

      const uploadPromise = uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
      });

      // Simulate progress events
      if (progressCallback) {
        progressCallback({ loaded: 512000, total: 1024000 });
        progressCallback({ loaded: 1024000, total: 1024000 });
      }

      await uploadPromise;

      const progressLogs = consoleLogSpy.mock.calls
        .map((call: any) => {
          try {
            return JSON.parse(call[0]);
          } catch {
            return null;
          }
        })
        .filter((log: any) => log && log.event === 'upload_progress');

      expect(progressLogs.length).toBe(2);
      expect(progressLogs[0].percentage).toBe(50);
      expect(progressLogs[0].loadedBytes).toBe(512000);
      expect(progressLogs[0].totalBytes).toBe(1024000);
      expect(progressLogs[1].percentage).toBe(100);
    });

    it('should log upload start event with file metadata', async () => {
      const mockUploadDone = vi.fn().mockResolvedValue({
        Location: 's3://test-bucket/test-key.sql',
        Bucket: TEST_BUCKET,
        Key: TEST_KEY,
      });

      (Upload as any).mockImplementation(function(this: any) {
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
      });

      const startLogs = consoleLogSpy.mock.calls
        .map((call: any) => {
          try {
            return JSON.parse(call[0]);
          } catch {
            return null;
          }
        })
        .filter((log: any) => log && log.event === 'upload_start');

      expect(startLogs.length).toBe(1);
      expect(startLogs[0].filePath).toBe(TEST_FILE_PATH);
      expect(startLogs[0].bucket).toBe(TEST_BUCKET);
      expect(startLogs[0].key).toBe(TEST_KEY);
      expect(startLogs[0].databaseName).toBe(TEST_DATABASE);
      expect(startLogs[0].fileSizeBytes).toBeGreaterThan(0);
    });

    it('should log upload completion event with duration', async () => {
      const mockUploadDone = vi.fn().mockResolvedValue({
        Location: 's3://test-bucket/test-key.sql',
        Bucket: TEST_BUCKET,
        Key: TEST_KEY,
      });

      (Upload as any).mockImplementation(function(this: any) {
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
      });

      const completeLogs = consoleLogSpy.mock.calls
        .map((call: any) => {
          try {
            return JSON.parse(call[0]);
          } catch {
            return null;
          }
        })
        .filter((log: any) => log && log.event === 'upload_complete');

      expect(completeLogs.length).toBe(1);
      expect(completeLogs[0].success).toBe(true);
      expect(completeLogs[0].s3Url).toBe('s3://test-bucket/test-key.sql');
      expect(completeLogs[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('metadata attachment', () => {
    it('should attach correct metadata to uploaded file', async () => {
      let uploadParams: any;

      const mockUploadDone = vi.fn().mockResolvedValue({
        Location: 's3://test-bucket/test-key.sql',
        Bucket: TEST_BUCKET,
        Key: TEST_KEY,
      });

      (Upload as any).mockImplementation(function(this: any, config: any) {
        uploadParams = config.params;
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
      });

      expect(uploadParams.Metadata).toBeDefined();
      expect(uploadParams.Metadata.databaseName).toBe(TEST_DATABASE);
      expect(uploadParams.Metadata.size).toBeDefined();
      expect(uploadParams.Metadata.timestamp).toBeDefined();
      expect(uploadParams.Metadata.uploadAttempt).toBe('1');
    });

    it('should include server-side encryption in upload params', async () => {
      let uploadParams: any;

      const mockUploadDone = vi.fn().mockResolvedValue({
        Location: 's3://test-bucket/test-key.sql',
        Bucket: TEST_BUCKET,
        Key: TEST_KEY,
      });

      (Upload as any).mockImplementation(function(this: any, config: any) {
        uploadParams = config.params;
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
      });

      expect(uploadParams.ServerSideEncryption).toBe('AES256');
    });

    it('should update upload attempt in metadata on retry', async () => {
      const uploadParamsHistory: any[] = [];

      const mockError = new Error('First attempt failed');
      const mockUploadDone = vi.fn()
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce({
          Location: 's3://test-bucket/test-key.sql',
          Bucket: TEST_BUCKET,
          Key: TEST_KEY,
        });

      (Upload as any).mockImplementation(function(this: any, config: any) {
        uploadParamsHistory.push(config.params);
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
        maxRetries: 2,
      });

      expect(uploadParamsHistory.length).toBe(2);
      expect(uploadParamsHistory[0].Metadata.uploadAttempt).toBe('1');
      expect(uploadParamsHistory[1].Metadata.uploadAttempt).toBe('2');
    });

    it('should include correct bucket, key, and body in upload params', async () => {
      let uploadParams: any;

      const mockUploadDone = vi.fn().mockResolvedValue({
        Location: 's3://test-bucket/test-key.sql',
        Bucket: TEST_BUCKET,
        Key: TEST_KEY,
      });

      (Upload as any).mockImplementation(function(this: any, config: any) {
        uploadParams = config.params;
        this.done = mockUploadDone;
        this.on = vi.fn();
        return this;
      });

      await uploadToS3({
        filePath: TEST_FILE_PATH,
        bucket: TEST_BUCKET,
        key: TEST_KEY,
        databaseName: TEST_DATABASE,
      });

      expect(uploadParams.Bucket).toBe(TEST_BUCKET);
      expect(uploadParams.Key).toBe(TEST_KEY);
      expect(uploadParams.Body).toBeDefined();
    });
  });
});
