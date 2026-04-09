import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import { cleanupOldBackups } from './cleanup-old-backups';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

const s3Mock = mockClient(S3Client);

describe('Backup Cleanup Script - Dry Run Mode', () => {
  beforeEach(() => {
    s3Mock.reset();
    // Mock successful bucket access
    s3Mock.on(HeadBucketCommand).resolves({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('dry-run mode identifies files older than 30 days without deleting', async () => {
    const now = new Date('2026-03-22T00:00:00Z');
    const oldDate1 = new Date('2026-02-01T00:00:00Z'); // 49 days old
    const oldDate2 = new Date('2026-01-15T00:00:00Z'); // 66 days old
    const recentDate1 = new Date('2026-03-20T00:00:00Z'); // 2 days old
    const recentDate2 = new Date('2026-03-15T00:00:00Z'); // 7 days old

    // Mock S3 list response with mix of old and recent backups
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: 'backup-2026-03-20.sql.gz', LastModified: recentDate1 },
        { Key: 'backup-2026-03-15.sql.gz', LastModified: recentDate2 },
        { Key: 'backup-2026-02-01.sql.gz', LastModified: oldDate1 },
        { Key: 'backup-2026-01-15.sql.gz', LastModified: oldDate2 },
      ],
    });

    const result = await cleanupOldBackups({
      bucket: 'test-bucket',
      retentionDays: 30,
      minRecentBackups: 2,
      dryRun: true,
    });

    // Verify no delete commands were sent
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);

    // Verify files were identified for deletion
    expect(result.skippedFiles).toHaveLength(2);
    expect(result.skippedFiles).toContain('backup-2026-02-01.sql.gz');
    expect(result.skippedFiles).toContain('backup-2026-01-15.sql.gz');

    // Verify no actual deletions occurred
    expect(result.deletedCount).toBe(0);
    expect(result.deletedFiles).toHaveLength(0);

    // Verify success
    expect(result.success).toBe(true);
  });

  test('safety check prevents deletion if fewer than 2 recent backups exist', async () => {
    const oldDate = new Date('2026-01-01T00:00:00Z'); // Very old

    // Mock S3 list response with only 1 backup
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: 'backup-2026-01-01.sql.gz', LastModified: oldDate },
      ],
    });

    const result = await cleanupOldBackups({
      bucket: 'test-bucket',
      retentionDays: 30,
      minRecentBackups: 2,
      dryRun: true,
    });

    // Verify no deletions were attempted (safety check triggered)
    expect(result.skippedFiles).toHaveLength(0);
    expect(result.deletedFiles).toHaveLength(0);
    expect(result.deletedCount).toBe(0);

    // Verify no delete commands were sent
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
  });

  test('always keeps minimum recent backups regardless of age', async () => {
    const veryOldDate1 = new Date('2025-01-01T00:00:00Z'); // 445 days old
    const veryOldDate2 = new Date('2025-02-01T00:00:00Z'); // 414 days old
    const oldDate = new Date('2026-01-01T00:00:00Z'); // 80 days old

    // Mock S3 list response with 3 very old backups
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: 'backup-2026-01-01.sql.gz', LastModified: oldDate },
        { Key: 'backup-2025-02-01.sql.gz', LastModified: veryOldDate2 },
        { Key: 'backup-2025-01-01.sql.gz', LastModified: veryOldDate1 },
      ],
    });

    const result = await cleanupOldBackups({
      bucket: 'test-bucket',
      retentionDays: 30,
      minRecentBackups: 2,
      dryRun: true,
    });

    // Verify only the oldest backup is marked for deletion
    // The 2 most recent backups should be kept regardless of age
    expect(result.skippedFiles).toHaveLength(1);
    expect(result.skippedFiles).toContain('backup-2025-01-01.sql.gz');

    // Verify no delete commands were sent (dry-run)
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
  });

  test('logs show which files would be deleted in dry-run mode', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const oldDate = new Date('2026-01-01T00:00:00Z');
    const recentDate1 = new Date('2026-03-20T00:00:00Z');
    const recentDate2 = new Date('2026-03-15T00:00:00Z');

    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: 'backup-2026-03-20.sql.gz', LastModified: recentDate1 },
        { Key: 'backup-2026-03-15.sql.gz', LastModified: recentDate2 },
        { Key: 'backup-2026-01-01.sql.gz', LastModified: oldDate },
      ],
    });

    await cleanupOldBackups({
      bucket: 'test-bucket',
      retentionDays: 30,
      minRecentBackups: 2,
      dryRun: true,
    });

    // Verify dry-run log messages
    const logs = consoleSpy.mock.calls.map(call => call.join(' '));
    expect(logs.some(log => log.includes('[DRY-RUN] Would delete: backup-2026-01-01.sql.gz'))).toBe(true);
    expect(logs.some(log => log.includes('Dry-run mode: ENABLED'))).toBe(true);
    expect(logs.some(log => log.includes('Would delete: 1'))).toBe(true);

    consoleSpy.mockRestore();
  });
});
