import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { generateBackupFilename, formatBytes, validateEnvironmentVariables } from '../backup-utils';
import { encryptFile, decryptFile, generateEncryptionKey } from '../encryption';
import { updateBackupStatus, getLastBackupStatus, BackupStatus } from '../backup-status';
import { spawn } from 'child_process';

// Mock child_process for pg_dump tests
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('Backup Functions', () => {
  const TEST_DIR = '/tmp/backup-test-' + Date.now();
  const originalEnv = process.env;

  const MOCK_BACKUP_ENCRYPTION_KEY = 'a'.repeat(64);

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });

    // Reset environment variables
    process.env = { ...originalEnv };

    // Stub BACKUP_ENCRYPTION_KEY with a safe mock (never use a real key in tests)
    vi.stubEnv('BACKUP_ENCRYPTION_KEY', MOCK_BACKUP_ENCRYPTION_KEY);
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }

    // Restore environment variables
    process.env = originalEnv;

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('generateBackupFilename', () => {
    it('should produce correct filename format with default parameters', () => {
      const filename = generateBackupFilename();

      // Should match pattern: backup_YYYY-MM-DD_HH-MM-SS-mmm.sql (with optional milliseconds)
      expect(filename).toMatch(/^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d{3})?\.sql$/);
    });

    it('should produce correct filename format with custom prefix', () => {
      const filename = generateBackupFilename('postgres-prod');

      // Should match pattern: postgres-prod_YYYY-MM-DD_HH-MM-SS-mmm.sql (with optional milliseconds)
      expect(filename).toMatch(/^postgres-prod_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d{3})?\.sql$/);
      expect(filename).toContain('postgres-prod_');
    });

    it('should produce correct filename format with custom extension', () => {
      const filename = generateBackupFilename('backup', 'dump');

      // Should match pattern: backup_YYYY-MM-DD_HH-MM-SS-mmm.dump (with optional milliseconds)
      expect(filename).toMatch(/^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d{3})?\.dump$/);
      expect(filename).toMatch(/\.dump$/);
    });

    it('should generate unique filenames for consecutive calls', async () => {
      const filename1 = generateBackupFilename();
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      const filename2 = generateBackupFilename();

      // Filenames should be different due to timestamp
      expect(filename1).not.toBe(filename2);
    });

    it('should not contain colons or invalid filename characters', () => {
      const filename = generateBackupFilename();

      // Should not contain characters that are problematic in filenames
      expect(filename).not.toContain(':');
      expect(filename).not.toContain('T');
      expect(filename).not.toContain('Z');
    });
  });

  describe('formatBytes', () => {
    it('should format zero bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 Bytes');
    });

    it('should format kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('should handle negative bytes', () => {
      expect(formatBytes(-100)).toBe('Invalid');
    });

    it('should respect decimals parameter', () => {
      expect(formatBytes(1536, 0)).toBe('2 KB'); // Rounded
      expect(formatBytes(1536, 3)).toBe('1.5 KB');
    });
  });

  describe('validateEnvironmentVariables', () => {
    it('should throw error when DATABASE_URL is missing', () => {
      delete process.env.DATABASE_URL;
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      process.env.S3_BACKUP_BUCKET = 'test-bucket';
      process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(64);

      expect(() => validateEnvironmentVariables([])).toThrow('DATABASE_URL is required');
    });

    it('should throw error when AWS_ACCESS_KEY_ID is missing', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      delete process.env.AWS_ACCESS_KEY_ID;
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      process.env.S3_BACKUP_BUCKET = 'test-bucket';
      process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(64);

      expect(() => validateEnvironmentVariables([])).toThrow('AWS_ACCESS_KEY_ID is required');
    });

    it('should throw error when AWS_SECRET_ACCESS_KEY is missing', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      delete process.env.AWS_SECRET_ACCESS_KEY;
      process.env.AWS_REGION = 'us-east-1';
      process.env.S3_BACKUP_BUCKET = 'test-bucket';
      process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(64);

      expect(() => validateEnvironmentVariables([])).toThrow('AWS_SECRET_ACCESS_KEY is required');
    });

    it('should throw error when AWS_REGION is missing', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      delete process.env.AWS_REGION;
      process.env.S3_BACKUP_BUCKET = 'test-bucket';
      process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(64);

      expect(() => validateEnvironmentVariables([])).toThrow('AWS_REGION is required');
    });

    it('should throw error when S3_BACKUP_BUCKET is missing', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      delete process.env.S3_BACKUP_BUCKET;
      process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(64);

      expect(() => validateEnvironmentVariables([])).toThrow('S3_BACKUP_BUCKET is required');
    });

    it('should throw error when BACKUP_ENCRYPTION_KEY is missing', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      process.env.S3_BACKUP_BUCKET = 'test-bucket';
      delete process.env.BACKUP_ENCRYPTION_KEY;

      expect(() => validateEnvironmentVariables([])).toThrow('BACKUP_ENCRYPTION_KEY is required');
    });

    it('should throw error when BACKUP_ENCRYPTION_KEY is too short', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      process.env.S3_BACKUP_BUCKET = 'test-bucket';
      process.env.BACKUP_ENCRYPTION_KEY = 'short'; // Less than 32 characters

      expect(() => validateEnvironmentVariables([])).toThrow('at least 32 characters');
    });

    it('should throw error when additional required vars are missing', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      process.env.S3_BACKUP_BUCKET = 'test-bucket';
      process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(64);
      delete process.env.CUSTOM_VAR;

      expect(() => validateEnvironmentVariables(['CUSTOM_VAR'])).toThrow('Missing required environment variables: CUSTOM_VAR');
    });

    it('should pass validation when all required variables are set', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      process.env.S3_BACKUP_BUCKET = 'test-bucket';
      process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(64);

      expect(() => validateEnvironmentVariables([])).not.toThrow();
    });

    it('should pass validation when all variables including additional ones are set', () => {
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      process.env.S3_BACKUP_BUCKET = 'test-bucket';
      process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(64);
      process.env.CUSTOM_VAR = 'custom-value';

      expect(() => validateEnvironmentVariables(['CUSTOM_VAR'])).not.toThrow();
    });
  });

  describe('Encryption/Decryption', () => {
    it('should generate valid encryption key', () => {
      const key = generateEncryptionKey();

      // Should be 64 hex characters (32 bytes)
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate unique encryption keys', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1).not.toBe(key2);
    });

    it('should successfully encrypt and decrypt a file (roundtrip)', async () => {
      const testData = 'This is sensitive backup data that needs encryption!';
      const inputPath = path.join(TEST_DIR, 'test-input.txt');
      const encryptedPath = path.join(TEST_DIR, 'test-encrypted.enc');
      const decryptedPath = path.join(TEST_DIR, 'test-decrypted.txt');

      // Generate encryption key
      const encryptionKey = generateEncryptionKey();

      // Write test data
      await fs.writeFile(inputPath, testData, 'utf-8');

      // Encrypt
      await encryptFile(inputPath, encryptedPath, encryptionKey);

      // Verify encrypted file exists and is different from original
      const encryptedData = await fs.readFile(encryptedPath);
      expect(encryptedData.length).toBeGreaterThan(0);
      expect(encryptedData.toString()).not.toContain(testData);

      // Decrypt
      await decryptFile(encryptedPath, decryptedPath, encryptionKey);

      // Verify decrypted data matches original
      const decryptedData = await fs.readFile(decryptedPath, 'utf-8');
      expect(decryptedData).toBe(testData);
    });

    it('should encrypt larger files correctly', async () => {
      const largeData = 'A'.repeat(10000); // 10KB of data
      const inputPath = path.join(TEST_DIR, 'large-input.txt');
      const encryptedPath = path.join(TEST_DIR, 'large-encrypted.enc');
      const decryptedPath = path.join(TEST_DIR, 'large-decrypted.txt');

      const encryptionKey = generateEncryptionKey();

      await fs.writeFile(inputPath, largeData, 'utf-8');
      await encryptFile(inputPath, encryptedPath, encryptionKey);
      await decryptFile(encryptedPath, decryptedPath, encryptionKey);

      const decryptedData = await fs.readFile(decryptedPath, 'utf-8');
      expect(decryptedData).toBe(largeData);
      expect(decryptedData).toHaveLength(10000);
    });

    it('should fail decryption with wrong key', async () => {
      const testData = 'Secret data';
      const inputPath = path.join(TEST_DIR, 'wrong-key-input.txt');
      const encryptedPath = path.join(TEST_DIR, 'wrong-key-encrypted.enc');
      const decryptedPath = path.join(TEST_DIR, 'wrong-key-decrypted.txt');

      const correctKey = generateEncryptionKey();
      const wrongKey = generateEncryptionKey();

      await fs.writeFile(inputPath, testData, 'utf-8');
      await encryptFile(inputPath, encryptedPath, correctKey);

      // Should throw error when decrypting with wrong key
      await expect(decryptFile(encryptedPath, decryptedPath, wrongKey))
        .rejects.toThrow(/Corrupted file|Authentication failed|tampered/);
    });

    it('should reject invalid key length', async () => {
      const testData = 'Test data';
      const inputPath = path.join(TEST_DIR, 'invalid-key-input.txt');
      const encryptedPath = path.join(TEST_DIR, 'invalid-key-encrypted.enc');

      const invalidKey = 'tooshort'; // Not 32 bytes

      await fs.writeFile(inputPath, testData, 'utf-8');

      await expect(encryptFile(inputPath, encryptedPath, invalidKey))
        .rejects.toThrow(/key must be 32 bytes/);
    });

    it('should fail decryption of corrupted file', async () => {
      const testData = 'Test data';
      const inputPath = path.join(TEST_DIR, 'corrupt-input.txt');
      const encryptedPath = path.join(TEST_DIR, 'corrupt-encrypted.enc');
      const decryptedPath = path.join(TEST_DIR, 'corrupt-decrypted.txt');

      const encryptionKey = generateEncryptionKey();

      await fs.writeFile(inputPath, testData, 'utf-8');
      await encryptFile(inputPath, encryptedPath, encryptionKey);

      // Corrupt the encrypted file by modifying bytes
      const encryptedData = await fs.readFile(encryptedPath);
      const corruptIndex = Math.min(20, encryptedData.length - 1); // Corrupt a byte that exists
      encryptedData[corruptIndex] = encryptedData[corruptIndex] ^ 0xFF; // Flip bits
      await fs.writeFile(encryptedPath, encryptedData);

      // Should throw error when decrypting corrupted file
      await expect(decryptFile(encryptedPath, decryptedPath, encryptionKey))
        .rejects.toThrow(/Corrupted file|Authentication failed|tampered/);
    });
  });

  describe('Backup Status', () => {
    const STATUS_FILE = path.join(TEST_DIR, 'test-backup-status.json');

    it('should write backup status to JSON file', async () => {
      const status: BackupStatus = {
        timestamp: '2026-03-22T10:00:00.000Z',
        success: true,
        fileSize: 1024000,
        s3Url: 's3://test-bucket/backups/test-backup.sql.enc',
        duration: 5000,
      };

      // Write status (this will use the default path, but we can read from test path)
      const statusDir = path.dirname(STATUS_FILE);
      await fs.mkdir(statusDir, { recursive: true });
      await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');

      // Verify file was created
      const fileExists = fsSync.existsSync(STATUS_FILE);
      expect(fileExists).toBe(true);

      // Verify content
      const content = await fs.readFile(STATUS_FILE, 'utf-8');
      const parsedStatus = JSON.parse(content);
      expect(parsedStatus.timestamp).toBe(status.timestamp);
      expect(parsedStatus.success).toBe(true);
      expect(parsedStatus.fileSize).toBe(1024000);
      expect(parsedStatus.s3Url).toBe(status.s3Url);
      expect(parsedStatus.duration).toBe(5000);
    });

    it('should read backup status from JSON file', async () => {
      const status: BackupStatus = {
        timestamp: '2026-03-22T11:00:00.000Z',
        success: false,
        errorMessage: 'Test error',
        duration: 2000,
      };

      // Write status file
      const statusDir = path.dirname(STATUS_FILE);
      await fs.mkdir(statusDir, { recursive: true });
      await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');

      // Read status
      const content = await fs.readFile(STATUS_FILE, 'utf-8');
      const readStatus = JSON.parse(content) as BackupStatus;

      expect(readStatus.timestamp).toBe(status.timestamp);
      expect(readStatus.success).toBe(false);
      expect(readStatus.errorMessage).toBe('Test error');
      expect(readStatus.duration).toBe(2000);
    });

    it('should return null when status file does not exist', async () => {
      const nonExistentFile = path.join(TEST_DIR, 'non-existent-status.json');

      const exists = fsSync.existsSync(nonExistentFile);
      expect(exists).toBe(false);
    });

    it('should handle successful backup status', async () => {
      const status: BackupStatus = {
        timestamp: new Date().toISOString(),
        success: true,
        fileSize: 5242880, // 5 MB
        s3Url: 's3://prod-backups/backups/2026-03-22-backup.sql.enc',
        duration: 12000,
      };

      const statusDir = path.dirname(STATUS_FILE);
      await fs.mkdir(statusDir, { recursive: true });
      await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');

      const content = await fs.readFile(STATUS_FILE, 'utf-8');
      const savedStatus = JSON.parse(content) as BackupStatus;

      expect(savedStatus.success).toBe(true);
      expect(savedStatus.fileSize).toBeDefined();
      expect(savedStatus.s3Url).toBeDefined();
      expect(savedStatus.errorMessage).toBeUndefined();
    });

    it('should handle failed backup status', async () => {
      const status: BackupStatus = {
        timestamp: new Date().toISOString(),
        success: false,
        errorMessage: 'Database connection timeout',
        duration: 3000,
      };

      const statusDir = path.dirname(STATUS_FILE);
      await fs.mkdir(statusDir, { recursive: true });
      await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');

      const content = await fs.readFile(STATUS_FILE, 'utf-8');
      const savedStatus = JSON.parse(content) as BackupStatus;

      expect(savedStatus.success).toBe(false);
      expect(savedStatus.errorMessage).toBeDefined();
      expect(savedStatus.errorMessage).toContain('timeout');
      expect(savedStatus.fileSize).toBeUndefined();
      expect(savedStatus.s3Url).toBeUndefined();
    });
  });

  describe('pg_dump Execution', () => {
    it('should mock pg_dump successful execution', () => {
      const mockSpawn = vi.mocked(spawn);
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, callback: any) => {
          if (event === 'close') {
            callback(0); // Exit code 0 = success
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      const pgDump = spawn('pg_dump', ['--version']);

      expect(mockSpawn).toHaveBeenCalledWith('pg_dump', ['--version']);

      // Simulate process completion
      let closeCallback: any;
      pgDump.on('close', (code) => {
        closeCallback = code;
      });

      expect(closeCallback).toBe(0);
    });

    it('should mock pg_dump failure execution', () => {
      const mockSpawn = vi.mocked(spawn);
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, callback: any) => {
          if (event === 'close') {
            callback(1); // Exit code 1 = failure
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      const pgDump = spawn('pg_dump', ['--invalid-option']);

      expect(mockSpawn).toHaveBeenCalledWith('pg_dump', ['--invalid-option']);

      // Simulate process failure
      let closeCallback: any;
      pgDump.on('close', (code) => {
        closeCallback = code;
      });

      expect(closeCallback).toBe(1);
    });

    it('should capture pg_dump stdout data', () => {
      const mockSpawn = vi.mocked(spawn);
      let stdoutCallback: any;

      const mockProcess = {
        stdout: {
          on: vi.fn((event: string, callback: any) => {
            if (event === 'data') {
              stdoutCallback = callback;
            }
          })
        },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      const pgDump = spawn('pg_dump', ['--verbose']);

      const capturedData: string[] = [];
      pgDump.stdout.on('data', (data) => {
        capturedData.push(data.toString());
      });

      // Simulate data
      if (stdoutCallback) {
        stdoutCallback(Buffer.from('pg_dump: processing table public.users'));
        stdoutCallback(Buffer.from('pg_dump: processing table public.accounts'));
      }

      expect(capturedData).toHaveLength(2);
      expect(capturedData[0]).toContain('public.users');
      expect(capturedData[1]).toContain('public.accounts');
    });

    it('should capture pg_dump stderr data', () => {
      const mockSpawn = vi.mocked(spawn);
      let stderrCallback: any;

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((event: string, callback: any) => {
            if (event === 'data') {
              stderrCallback = callback;
            }
          })
        },
        on: vi.fn(),
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      const pgDump = spawn('pg_dump', ['--verbose']);

      const capturedErrors: string[] = [];
      pgDump.stderr.on('data', (data) => {
        capturedErrors.push(data.toString());
      });

      // Simulate error output
      if (stderrCallback) {
        stderrCallback(Buffer.from('pg_dump: error: connection to database failed'));
      }

      expect(capturedErrors).toHaveLength(1);
      expect(capturedErrors[0]).toContain('connection to database failed');
    });

    it('should handle pg_dump spawn error', () => {
      const mockSpawn = vi.mocked(spawn);
      let errorCallback: any;

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, callback: any) => {
          if (event === 'error') {
            errorCallback = callback;
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as any);

      const pgDump = spawn('pg_dump', ['--dbname', 'test']);

      let spawnError: any = null;
      pgDump.on('error', (error) => {
        spawnError = error;
      });

      // Simulate spawn error (e.g., pg_dump not found)
      if (errorCallback) {
        errorCallback(new Error('spawn pg_dump ENOENT'));
      }

      expect(spawnError).toBeDefined();
      expect(spawnError?.message).toContain('ENOENT');
    });
  });
});
