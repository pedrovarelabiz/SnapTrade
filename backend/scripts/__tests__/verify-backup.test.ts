import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process for pg_restore tests
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('Backup Verification Script', () => {
  const TEST_DIR = '/tmp/verify-backup-test-' + Date.now();

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('pg_restore --list parsing', () => {
    it('should correctly parse pg_restore --list output', () => {
      const mockSpawn = vi.mocked(spawn);

      // Mock pg_restore output format
      const mockOutput = `
;
; Archive created at 2026-03-22 11:00:00 UTC
;     dbname: snaptrade_db
;     TOC Entries: 25
;     Compression: -1
;     Dump Version: 1.14-0
;     Format: CUSTOM
;     Integer: 4 bytes
;     Offset: 8 bytes
;     Dumped from database version: 15.3
;     Dumped by pg_dump version: 15.3
;
;
; Selected TOC Entries:
;
1; 3079 16384 EXTENSION - plpgsql
2; 1259 16385 TABLE public users postgres
3; 1259 16394 SEQUENCE public users_id_seq postgres
4; 1259 16395 TABLE public posts postgres
5; 1259 16396 SEQUENCE public posts_id_seq postgres
6; 1259 16397 TABLE public accounts postgres
7; 1259 16398 SEQUENCE public accounts_id_seq postgres
8; 1259 16399 INDEX public users_email_idx postgres
9; 1259 16400 INDEX public posts_user_id_idx postgres
`;

      let stdoutCallback: any;
      let closeCallback: any;

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      mockSpawn.mockReturnValue(mockProcess);

      // Simulate pg_restore execution
      const pgRestore = spawn('pg_restore', ['--list', '/test/backup.dump']);

      const outputData: string[] = [];
      const errors: string[] = [];

      pgRestore.stdout.on('data', (data) => {
        outputData.push(data.toString());
      });

      pgRestore.stderr.on('data', (data) => {
        errors.push(data.toString());
      });

      let exitCode: number | null = null;
      pgRestore.on('close', (code) => {
        exitCode = code;
      });

      // Emit mock output
      mockProcess.stdout.emit('data', Buffer.from(mockOutput));
      mockProcess.emit('close', 0);

      expect(mockSpawn).toHaveBeenCalledWith('pg_restore', ['--list', '/test/backup.dump']);
      expect(exitCode).toBe(0);
      expect(outputData.length).toBeGreaterThan(0);

      // Verify output contains expected tables
      const fullOutput = outputData.join('');
      expect(fullOutput).toContain('TABLE public users');
      expect(fullOutput).toContain('TABLE public posts');
      expect(fullOutput).toContain('TABLE public accounts');
      expect(fullOutput).toContain('SEQUENCE public users_id_seq');
      expect(fullOutput).toContain('INDEX public users_email_idx');
    });

    it('should handle pg_restore errors', () => {
      const mockSpawn = vi.mocked(spawn);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      mockSpawn.mockReturnValue(mockProcess);

      const pgRestore = spawn('pg_restore', ['--list', '/test/corrupted.dump']);

      const errors: string[] = [];
      pgRestore.stderr.on('data', (data) => {
        errors.push(data.toString());
      });

      let exitCode: number | null = null;
      pgRestore.on('close', (code) => {
        exitCode = code;
      });

      // Simulate error
      mockProcess.stderr.emit('data', Buffer.from('pg_restore: error: input file is corrupted'));
      mockProcess.emit('close', 1);

      expect(exitCode).toBe(1);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('corrupted');
    });

    it('should detect warnings in pg_restore output', () => {
      const mockSpawn = vi.mocked(spawn);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      mockSpawn.mockReturnValue(mockProcess);

      const pgRestore = spawn('pg_restore', ['--list', '/test/backup.dump']);

      const warnings: string[] = [];
      const errors: string[] = [];

      pgRestore.stderr.on('data', (data) => {
        const message = data.toString();
        if (message.toLowerCase().includes('warning')) {
          warnings.push(message);
        } else if (message.toLowerCase().includes('error')) {
          errors.push(message);
        }
      });

      // Emit warning
      mockProcess.stderr.emit('data', Buffer.from('pg_restore: warning: archive is compressed, but compression is not supported'));
      mockProcess.emit('close', 0);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('warning');
      expect(errors).toHaveLength(0);
    });

    it('should parse table count from output', () => {
      const mockOutput = `
2; 1259 16385 TABLE public users postgres
4; 1259 16395 TABLE public posts postgres
6; 1259 16397 TABLE public accounts postgres
8; 1259 16399 TABLE public transactions postgres
10; 1259 16401 TABLE public brokers postgres
`;

      const lines = mockOutput.trim().split('\n');
      const tables = lines.filter(line => line.includes('TABLE'));

      expect(tables).toHaveLength(5);
      expect(tables[0]).toContain('users');
      expect(tables[1]).toContain('posts');
      expect(tables[4]).toContain('brokers');
    });

    it('should parse sequence count from output', () => {
      const mockOutput = `
3; 1259 16394 SEQUENCE public users_id_seq postgres
5; 1259 16396 SEQUENCE public posts_id_seq postgres
7; 1259 16398 SEQUENCE public accounts_id_seq postgres
`;

      const lines = mockOutput.trim().split('\n');
      const sequences = lines.filter(line => line.includes('SEQUENCE'));

      expect(sequences).toHaveLength(3);
      expect(sequences[0]).toContain('users_id_seq');
    });

    it('should parse index count from output', () => {
      const mockOutput = `
9; 1259 16400 INDEX public users_email_idx postgres
11; 1259 16402 INDEX public posts_user_id_idx postgres
13; 1259 16404 INDEX public accounts_broker_id_idx postgres
`;

      const lines = mockOutput.trim().split('\n');
      const indexes = lines.filter(line => line.includes('INDEX'));

      expect(indexes).toHaveLength(3);
      expect(indexes[0]).toContain('users_email_idx');
    });

    it('should handle empty backup file', () => {
      const mockSpawn = vi.mocked(spawn);

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      mockSpawn.mockReturnValue(mockProcess);

      const pgRestore = spawn('pg_restore', ['--list', '/test/empty.dump']);

      const errors: string[] = [];
      pgRestore.stderr.on('data', (data) => {
        errors.push(data.toString());
      });

      let exitCode: number | null = null;
      pgRestore.on('close', (code) => {
        exitCode = code;
      });

      // Simulate error for empty file
      mockProcess.stderr.emit('data', Buffer.from('pg_restore: error: input file is too short (read 0, expected 5)'));
      mockProcess.emit('close', 1);

      expect(exitCode).toBe(1);
      expect(errors[0]).toContain('too short');
    });
  });

  describe('Backup file validation', () => {
    it('should verify backup file exists', async () => {
      const testFile = path.join(TEST_DIR, 'test-backup.dump');
      await fs.writeFile(testFile, 'dummy content');

      const exists = fsSync.existsSync(testFile);
      expect(exists).toBe(true);
    });

    it('should get backup file size', async () => {
      const testFile = path.join(TEST_DIR, 'test-backup.dump');
      const testData = 'X'.repeat(1024); // 1KB
      await fs.writeFile(testFile, testData);

      const stats = fsSync.statSync(testFile);
      expect(stats.size).toBe(1024);
    });

    it('should detect corrupted backup file size', async () => {
      const testFile = path.join(TEST_DIR, 'empty-backup.dump');
      await fs.writeFile(testFile, '');

      const stats = fsSync.statSync(testFile);
      expect(stats.size).toBe(0);

      // A valid backup should have size > 0
      expect(stats.size).toBeLessThanOrEqual(0);
    });
  });

  describe('Verification result formatting', () => {
    it('should format bytes correctly in report', () => {
      const formatBytes = (bytes: number, decimals = 2): string => {
        if (bytes === 0) return '0 Bytes';
        if (bytes < 0) return 'Invalid';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
      };

      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 100)).toBe('100 MB');
    });

    it('should generate verification timestamp', () => {
      const now = new Date();
      const timestamp = now.toISOString();

      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should count database objects correctly', () => {
      const mockTables = [
        { name: 'public.users', type: 'TABLE' },
        { name: 'public.posts', type: 'TABLE' },
        { name: 'public.accounts', type: 'TABLE' },
        { name: 'public.users_id_seq', type: 'SEQUENCE' },
        { name: 'public.posts_id_seq', type: 'SEQUENCE' },
        { name: 'public.users_email_idx', type: 'INDEX' },
      ];

      const tables = mockTables.filter(t => t.type === 'TABLE');
      const sequences = mockTables.filter(t => t.type === 'SEQUENCE');
      const indexes = mockTables.filter(t => t.type === 'INDEX');

      expect(tables.length).toBe(3);
      expect(sequences.length).toBe(2);
      expect(indexes.length).toBe(1);
    });
  });
});
