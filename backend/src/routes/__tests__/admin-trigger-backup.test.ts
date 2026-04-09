import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import adminRouter, { _resetLastBackupTriggerTime } from '../admin.js';
import { prisma } from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...actual,
    spawn: vi.fn().mockReturnValue({
      on: vi.fn(),
      unref: vi.fn(),
    }),
  };
});


vi.mock('../../lib/prisma.js', () => {
  const userStore: Record<string, any> = {};
  const platformConfigStore: Record<string, any> = {};
  let idCounter = 0;
  return {
    prisma: {
      user: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const id = data.id || `mock-user-id-${++idCounter}`;
          const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
          userStore[id] = record;
          return record;
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          if (where.id) return userStore[where.id] || null;
          return null;
        }),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      platformConfig: {
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          const val = platformConfigStore[where.key];
          return val !== undefined ? { key: where.key, value: val } : null;
        }),
        upsert: vi.fn().mockImplementation(async ({ where, create, update }: any) => {
          const newVal = platformConfigStore[where.key] !== undefined ? update.value : create.value;
          platformConfigStore[where.key] = newVal;
          return { key: where.key, value: newVal };
        }),
        delete: vi.fn().mockImplementation(async ({ where }: any) => {
          if (platformConfigStore[where.key] === undefined) {
            throw Object.assign(new Error("Record not found"), { code: "P2025" });
          }
          delete platformConfigStore[where.key];
          return { key: where.key };
        }),
      },
    },
  };
});

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('POST /api/admin/trigger-backup', () => {
  let adminToken: string;
  let adminUserId: string;
  let userToken: string;

  beforeAll(async () => {
    // Create an admin user for testing
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin-backup-test@test.com',
        name: 'Admin Backup Test',
        role: 'admin',
        emailVerified: true,
        passwordHash: 'test-hash-admin',
      },
    });
    adminUserId = adminUser.id;

    // Generate admin token
    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: 'admin' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create a regular user for permission testing
    const regularUser = await prisma.user.create({
      data: {
        email: 'user-backup-test@test.com',
        name: 'User Backup Test',
        role: 'user',
        emailVerified: true,
        passwordHash: 'test-hash-user',
      },
    });

    // Generate user token
    userToken = jwt.sign(
      { userId: regularUser.id, email: regularUser.email, role: 'user' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  beforeEach(async () => {
    await _resetLastBackupTriggerTime();
  });

  afterAll(async () => {
    // Cleanup test users
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['admin-backup-test@test.com', 'user-backup-test@test.com'],
        },
      },
    });

    // Cleanup backup status file
    const statusFile = path.join(process.cwd(), 'backup-status.json');
    if (fs.existsSync(statusFile)) {
      fs.unlinkSync(statusFile);
    }
  });

  it('should reject requests without authentication', async () => {
    const response = await request(app)
      .post('/api/admin/trigger-backup')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should reject requests from non-admin users', async () => {
    const response = await request(app)
      .post('/api/admin/trigger-backup')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);

    expect(response.body).toHaveProperty('error');
  });

  it('should successfully trigger backup with admin authentication', async () => {
    const response = await request(app)
      .post('/api/admin/trigger-backup')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Verify response includes jobId
    expect(response.body).toHaveProperty('jobId');
    expect(response.body.jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // Verify response includes message
    expect(response.body).toHaveProperty('message', 'Backup triggered successfully');

    // Verify response includes statusCheckUrl
    expect(response.body).toHaveProperty('statusCheckUrl', '/api/admin/backup-status');

    // Verify backup status file was created
    const statusFile = path.join(process.cwd(), 'backup-status.json');
    expect(fs.existsSync(statusFile)).toBe(true);

    // Verify status file contains correct data
    const statusContent = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    expect(statusContent).toHaveProperty('jobId', response.body.jobId);
    expect(statusContent).toHaveProperty('status', 'pending');
    expect(statusContent).toHaveProperty('triggeredBy', adminUserId);
    expect(statusContent).toHaveProperty('startedAt');
  });

  it('should enforce rate limiting (max 1 per hour)', async () => {
    // First request should succeed
    const firstResponse = await request(app)
      .post('/api/admin/trigger-backup')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(firstResponse.body).toHaveProperty('jobId');

    // Second request within an hour should fail
    const secondResponse = await request(app)
      .post('/api/admin/trigger-backup')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(429);

    expect(secondResponse.body).toHaveProperty('error');
    expect(secondResponse.body.error).toContain('once per hour');
    expect(secondResponse.body.error).toMatch(/wait \d+ minutes/);
  });

  it('should read rate-limit state from the database (durable across restarts)', async () => {
    const { prisma: mockPrisma } = await import('../../lib/prisma.js');
    // Seed the DB mock with a timestamp from 30 minutes ago (within the 1-hour window)
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    (vi.mocked(mockPrisma.platformConfig.upsert) as any).mockImplementationOnce(async () => ({
      key: 'last_manual_backup_at',
      value: String(thirtyMinutesAgo),
    }));
    vi.mocked(mockPrisma.platformConfig.findUnique).mockResolvedValueOnce({
      key: 'last_manual_backup_at',
      value: String(thirtyMinutesAgo),
    } as any);

    const response = await request(app)
      .post('/api/admin/trigger-backup')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(429);

    expect(response.body.error).toContain('once per hour');
    expect(vi.mocked(mockPrisma.platformConfig.findUnique)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'last_manual_backup_at' } })
    );
  });

  it('should return 503 when the database is unavailable during rate-limit check', async () => {
    const { prisma: mockPrisma } = await import('../../lib/prisma.js');
    vi.mocked(mockPrisma.platformConfig.findUnique).mockRejectedValueOnce(
      new Error('Connection refused')
    );

    const response = await request(app)
      .post('/api/admin/trigger-backup')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(503);

    expect(response.body.error).toContain('Unable to verify rate-limit state');
  });

  it('should update backup-status.json to failed when spawn emits an error event', async () => {
    const childProcessModule = await import('child_process');
    let capturedErrorHandler: ((err: Error) => void) | null = null;

    vi.mocked(childProcessModule.spawn).mockReturnValueOnce({
      on: vi.fn().mockImplementation((event: string, cb: any) => {
        if (event === 'error') capturedErrorHandler = cb;
      }),
      unref: vi.fn(),
    } as any);

    const response = await request(app)
      .post('/api/admin/trigger-backup')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(capturedErrorHandler).not.toBeNull();

    // Simulate the OS emitting ENOENT (tsx binary not found)
    capturedErrorHandler!(Object.assign(new Error('spawn tsx ENOENT'), { code: 'ENOENT' }));

    const statusFile = path.join(process.cwd(), 'backup-status.json');
    expect(fs.existsSync(statusFile)).toBe(true);
    const content = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    expect(content.jobId).toBe(response.body.jobId);
    expect(content.status).toBe('failed');
    expect(content.errorMessage).toContain('ENOENT');
    expect(content).toHaveProperty('failedAt');
  });

  it('should return 200 with a valid jobId even when the rate-limit DB write fails after spawn', async () => {
    const { prisma: mockPrisma } = await import('../../lib/prisma.js');
    // Allow the pre-flight rate-limit read to succeed (no record → allowed)
    vi.mocked(mockPrisma.platformConfig.findUnique).mockResolvedValueOnce(null);
    // Make the post-spawn DB write fail
    vi.mocked(mockPrisma.platformConfig.upsert).mockRejectedValueOnce(
      new Error('DB connection lost')
    );

    const response = await request(app)
      .post('/api/admin/trigger-backup')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('jobId');
    expect(response.body.jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(response.body).toHaveProperty('message', 'Backup triggered successfully');
    expect(response.body).toHaveProperty('statusCheckUrl', '/api/admin/backup-status');
  });

  it('should spawn backup process in background', async () => {
    // Mock spawn to verify it was called (ESM-compatible: spy on the module namespace)
    const childProcessModule = await import('child_process');
    const spawnSpy = vi.spyOn(childProcessModule, 'spawn');

    const response = await request(app)
      .post('/api/admin/trigger-backup')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('jobId');

    // Verify spawn was called with correct parameters
    expect(spawnSpy).toHaveBeenCalled();
    const spawnCall = spawnSpy.mock.calls[spawnSpy.mock.calls.length - 1];
    expect(spawnCall[0]).toMatch(/tsx$|node$/);
    expect(spawnCall[1][0]).toMatch(/db-backup\.(ts|js)$/);
    expect(spawnCall[1][1]).toBe(response.body.jobId);
    expect(spawnCall[2]).toMatchObject({
      detached: true,
      stdio: 'ignore',
    });

    spawnSpy.mockRestore();
  });
});
