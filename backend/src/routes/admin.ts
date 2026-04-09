import { Router, Response } from "express";
import { logger } from "../lib/logger.js";
import { authMiddleware } from "../middleware/auth.js";
import { roleGuard } from "../middleware/roleGuard.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { AuthRequest } from "../types/index.js";
import { prisma } from "../lib/prisma.js";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { spawn } from "child_process";
import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import * as Sentry from "@sentry/node";

const router = Router();
router.use(authMiddleware);
router.use(roleGuard("admin"));
router.use(apiLimiter);

const LAST_MANUAL_BACKUP_CONFIG_KEY = "last_manual_backup_at";

async function getLastManualBackupTime(): Promise<number | null> {
  const record = await prisma.platformConfig.findUnique({
    where: { key: LAST_MANUAL_BACKUP_CONFIG_KEY },
  });
  if (!record) return null;
  const ts = parseInt(record.value, 10);
  return isNaN(ts) ? null : ts;
}

async function setLastManualBackupTime(timestamp: number): Promise<void> {
  await prisma.platformConfig.upsert({
    where: { key: LAST_MANUAL_BACKUP_CONFIG_KEY },
    create: { key: LAST_MANUAL_BACKUP_CONFIG_KEY, value: String(timestamp), description: "Unix ms timestamp of last manually-triggered backup (rate limiter)" },
    update: { value: String(timestamp) },
  });
}

// GET /api/admin/users
router.get("/users", async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
    );

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          emailVerified: true,
          createdAt: true,
          subscription: { select: { plan: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count(),
    ]);

    res.json({ users, total, page, limit });
  } catch (err) {
    Sentry.setTag('admin_operation', 'list_users');
    Sentry.setUser({ id: req.user?.userId });
    Sentry.captureException(err);
    logger.error({ err }, "Admin users error");
    res.status(500).json({ error: "Failed to get users" });
  }
});

// PATCH /api/admin/users/:id/role
router.patch(
  "/users/:id/role",
  async (req: AuthRequest, res: Response) => {
    try {
      const { role } = req.body;
      if (!["user", "premium", "admin"].includes(role)) {
        res.status(400).json({ error: "Invalid role" });
        return;
      }

      const user = await prisma.user.update({
        where: { id: req.params.id as string },
        data: { role },
        select: { id: true, email: true, role: true },
      });

      res.json(user);
    } catch (err) {
      Sentry.setTag('admin_operation', 'update_user_role');
      Sentry.setUser({ id: req.user?.userId });
      Sentry.captureException(err);
      logger.error({ err }, "Admin role update error");
      res.status(500).json({ error: "Failed to update role" });
    }
  },
);

// DELETE /api/admin/users/:id
router.delete("/users/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (req.params.id as string === req.user!.userId) {
      res.status(400).json({ error: "Cannot delete yourself" });
      return;
    }
    await prisma.user.delete({ where: { id: req.params.id as string } });
    res.json({ message: "User deleted" });
  } catch (err) {
    Sentry.setTag('admin_operation', 'delete_user');
    Sentry.setUser({ id: req.user?.userId });
    Sentry.captureException(err, {level: 'fatal'});
    logger.error({ err }, "Admin user delete error");
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// GET /api/admin/config
router.get("/config", async (_req: AuthRequest, res: Response) => {
  try {
    const configs = await prisma.platformConfig.findMany();
    res.json(configs);
  } catch (err) {
    Sentry.setTag('admin_operation', 'get_config');
    Sentry.setUser({ id: _req.user?.userId });
    Sentry.captureException(err);
    logger.error({ err }, "Admin config error");
    res.status(500).json({ error: "Failed to get config" });
  }
});

// PUT /api/admin/config/:key
router.put("/config/:key", async (req: AuthRequest, res: Response) => {
  try {
    const cfg = await prisma.platformConfig.upsert({
      where: { key: req.params.key as string },
      create: {
        key: req.params.key as string,
        value: req.body.value,
        description: req.body.description,
      },
      update: {
        value: req.body.value,
        description: req.body.description,
      },
    });
    res.json(cfg);
  } catch (err) {
    Sentry.setTag('admin_operation', 'update_config');
    Sentry.setUser({ id: req.user?.userId });
    Sentry.captureException(err, {level: 'fatal'});
    logger.error({ err }, "Admin config update error");
    res.status(500).json({ error: "Failed to update config" });
  }
});

// GET /api/admin/revenue
router.get("/revenue", async (_req: AuthRequest, res: Response) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { status: "confirmed" },
    });

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const byMonth = new Map<string, number>();

    for (const p of payments) {
      const month = p.createdAt.toISOString().slice(0, 7);
      byMonth.set(month, (byMonth.get(month) || 0) + p.amount);
    }

    res.json({
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalPayments: payments.length,
      byMonth: Object.fromEntries(
        Array.from(byMonth.entries()).sort(),
      ),
    });
  } catch (err) {
    Sentry.setTag('admin_operation', 'get_revenue');
    Sentry.setUser({ id: _req.user?.userId });
    Sentry.captureException(err);
    logger.error({ err }, "Admin revenue error");
    res.status(500).json({ error: "Failed to get revenue" });
  }
});

// GET /api/admin/signals — with more details
router.get("/signals", async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
    );

    const [signals, total] = await Promise.all([
      prisma.signal.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.signal.count(),
    ]);

    res.json({ signals, total, page, limit });
  } catch (err) {
    Sentry.setTag('admin_operation', 'list_signals');
    Sentry.setUser({ id: req.user?.userId });
    Sentry.captureException(err);
    logger.error({ err }, "Admin signals error");
    res.status(500).json({ error: "Failed to get signals" });
  }
});

// DELETE /api/admin/signals/:id
router.delete("/signals/:id", async (req: AuthRequest, res: Response) => {
  try {
    await prisma.signal.delete({ where: { id: req.params.id as string } });
    res.json({ message: "Signal deleted" });
  } catch (err) {
    Sentry.setTag('admin_operation', 'delete_signal');
    Sentry.setUser({ id: req.user?.userId });
    Sentry.captureException(err);
    logger.error({ err }, "Admin signal delete error");
    res.status(500).json({ error: "Failed to delete signal" });
  }
});

// GET /api/admin/backup-status
router.get("/backup-status", async (_req: AuthRequest, res: Response) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [last10Backups, totalBackups, recentBackups, oldestBackup, newestBackup] = await Promise.all([
      prisma.backup.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          fileName: true,
          sizeBytes: true,
          createdAt: true,
          completedAt: true,
          errorMessage: true,
        },
      }),
      prisma.backup.count(),
      prisma.backup.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { status: true },
      }),
      prisma.backup.findFirst({
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.backup.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    const totalStorage = await prisma.backup.aggregate({
      _sum: { sizeBytes: true },
    });

    const successfulBackups = recentBackups.filter(b => b.status === "success").length;
    const successRate = recentBackups.length > 0
      ? Math.round((successfulBackups / recentBackups.length) * 100 * 100) / 100
      : 0;

    res.json({
      lastTenBackups: last10Backups,
      totalBackups,
      totalStorageBytes: totalStorage._sum.sizeBytes || 0,
      oldestBackupDate: oldestBackup?.createdAt || null,
      newestBackupDate: newestBackup?.createdAt || null,
      successRateLast30Days: successRate,
    });
  } catch (err) {
    Sentry.setTag('admin_operation', 'get_backup_status');
    Sentry.setUser({ id: _req.user?.userId });
    Sentry.captureException(err);
    logger.error({ err }, "Admin backup status error");
    res.status(500).json({ error: "Failed to get backup status" });
  }
});

// GET /api/admin/backups
router.get("/backups", async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(
      50,
      Math.max(1, parseInt((req.query.limit as string) || "50", 10)),
    );
    const continuationToken = (req.query.continuationToken as string) || undefined;

    const s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
    });

    const bucketName = process.env.BACKUP_S3_BUCKET || "snaptrade-unified-backups";

    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: limit,
      ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(command);

    const backups = (response.Contents || []).map((obj) => ({
      filename: obj.Key?.split("/").pop() || obj.Key || "",
      s3Key: obj.Key || "",
      timestamp: obj.LastModified?.toISOString() || null,
      size: obj.Size || 0,
    }));

    res.json({
      backups,
      count: backups.length,
      nextContinuationToken: response.NextContinuationToken || null,
      isTruncated: response.IsTruncated || false,
    });
  } catch (err) {
    Sentry.setTag('admin_operation', 'list_backups');
    Sentry.setUser({ id: req.user?.userId });
    Sentry.captureException(err);
    logger.error({ err }, "Admin backups list error");
    res.status(500).json({ error: "Failed to list backups from S3" });
  }
});


/** @internal — used only in tests to clear persistent rate-limit state */
export const _resetLastBackupTriggerTime = async (): Promise<void> => {
  await prisma.platformConfig.delete({ where: { key: LAST_MANUAL_BACKUP_CONFIG_KEY } }).catch(() => {
    // Ignore "record not found" on first run or after manual cleanup
  });
};

// POST /api/admin/trigger-backup
router.post("/trigger-backup", async (req: AuthRequest, res: Response) => {
  try {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    // Check rate limiting (DB-persisted so it survives restarts)
    let last: number | null;
    try {
      last = await getLastManualBackupTime();
    } catch (dbErr) {
      logger.error({ dbErr }, "Failed to read backup rate-limit state from DB");
      Sentry.captureException(dbErr, { tags: { operation: "backup_rate_limit_read" } });
      res.status(503).json({ error: "Unable to verify rate-limit state. Please try again." });
      return;
    }
    if (last !== null && (now - last) < ONE_HOUR) {
      const remainingMinutes = Math.ceil((ONE_HOUR - (now - last)) / 60000);
      res.status(429).json({
        error: `Backup can only be triggered once per hour. Please wait ${remainingMinutes} minutes.`
      });
      return;
    }

    const jobId = randomUUID();
    const statusFilePath = join(process.cwd(), "backup-status.json");

    // Write initial status
    const initialStatus = {
      jobId,
      status: "pending",
      startedAt: new Date().toISOString(),
      triggeredBy: req.user?.userId || "unknown"
    };

    writeFileSync(statusFilePath, JSON.stringify(initialStatus, null, 2));

    // Determine the runner and script path for reliability
    const isProduction = process.env.NODE_ENV === "production";
    const tsxPath = join(process.cwd(), "node_modules", ".bin", "tsx");
    
    // In production, we run the compiled JS with node
    // In dev, we use the full path to tsx binary to avoid PATH resolution issues
    const runner = isProduction ? "node" : (existsSync(tsxPath) ? tsxPath : "tsx");
    const backupScriptPath = isProduction 
      ? join(process.cwd(), "dist", "scripts", "db-backup.js")
      : join(process.cwd(), "scripts", "db-backup.ts");
    
    if (!existsSync(backupScriptPath)) {
      logger.error({ backupScriptPath }, "Backup script not found");
      return res.status(500).json({ error: "Backup script not found" });
    }

    const childProcess = spawn(runner, [backupScriptPath, jobId], {
      detached: true,
      stdio: "ignore"
    });

    childProcess.on("error", (error) => {
      logger.error({ error, jobId }, "Failed to spawn backup child process");
      Sentry.captureException(error, {
        tags: { operation: "backup_spawn", jobId }
      });
      try {
        writeFileSync(
          statusFilePath,
          JSON.stringify({
            jobId,
            status: "failed",
            errorMessage: error.message,
            failedAt: new Date().toISOString(),
          }, null, 2),
        );
      } catch (fsErr) {
        logger.error({ fsErr, jobId }, "Failed to write backup failure status to file");
      }
    });

    childProcess.on("spawn", () => {
      logger.info({ jobId }, "Backup child process spawned successfully");
    });

    childProcess.unref();

    // Update rate limiter (DB-persisted for cluster/restart safety).
    // Failure here is non-fatal — the backup is already running. Log and
    // alert but do NOT return 500, which would cause the client to retry
    // and spawn a second concurrent backup.
    try {
      await setLastManualBackupTime(now);
    } catch (rlErr) {
      logger.error({ rlErr, jobId }, "Failed to persist backup rate-limit timestamp; backup is running but rate-limit state is stale");
      Sentry.captureException(rlErr, { tags: { operation: "backup_rate_limit_write", jobId } });
    }

    logger.info({ jobId, userId: req.user?.userId }, "Manual backup triggered");

    res.json({
      jobId,
      message: "Backup triggered successfully",
      statusCheckUrl: "/api/admin/backup-status"
    });
  } catch (err) {
    Sentry.setTag('admin_operation', 'trigger_backup');
    Sentry.setUser({ id: req.user?.userId });
    Sentry.captureException(err, {level: 'fatal'});
    logger.error({ err }, "Admin trigger backup error");
    res.status(500).json({ error: "Failed to trigger backup" });
  }
});

export default router;
