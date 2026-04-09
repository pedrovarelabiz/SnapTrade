#!/usr/bin/env node
/**
 * Mock server for testing /api/admin/trigger-backup endpoint
 * Runs without database dependency
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { spawn } = require('child_process');
const { writeFileSync } = require('fs');
const { join } = require('path');
const { randomUUID } = require('crypto');

const app = express();
app.use(express.json());

const JWT_SECRET = 'test-jwt-secret-for-backup-health-testing';
const PORT = 3002;

// Auth middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Role guard middleware
const roleGuard = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
};

// Rate limiting for manual backup triggers (max 1 per hour)
let lastBackupTriggerTime = null;

// POST /api/admin/trigger-backup
app.post('/api/admin/trigger-backup', authMiddleware, roleGuard('admin'), async (req, res) => {
  try {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    // Check rate limiting
    if (lastBackupTriggerTime && (now - lastBackupTriggerTime) < ONE_HOUR) {
      const remainingMs = ONE_HOUR - (now - lastBackupTriggerTime);
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      return res.status(429).json({
        error: `Backup can only be triggered once per hour. Please wait ${remainingMinutes} minutes.`
      });
    }

    const jobId = randomUUID();
    const statusFilePath = join(process.cwd(), 'backup-status.json');

    // Write initial status
    const initialStatus = {
      jobId,
      status: 'pending',
      startedAt: new Date().toISOString(),
      triggeredBy: req.user?.userId || 'unknown'
    };

    writeFileSync(statusFilePath, JSON.stringify(initialStatus, null, 2));
    console.log(`[BACKUP] Created status file: ${statusFilePath}`);
    console.log(`[BACKUP] Job ID: ${jobId}`);

    // Spawn backup script as child process (mocked - using echo instead)
    const childProcess = spawn('echo', [`Backup job ${jobId} started`], {
      detached: true,
      stdio: 'ignore'
    });

    childProcess.unref();
    console.log(`[BACKUP] Background process spawned for job ${jobId}`);

    // Update rate limiter
    lastBackupTriggerTime = now;

    res.json({
      jobId,
      message: 'Backup triggered successfully',
      statusCheckUrl: '/api/admin/backup-status'
    });
  } catch (err) {
    console.error('[BACKUP] Error:', err);
    res.status(500).json({ error: 'Failed to trigger backup' });
  }
});

// GET /api/health/backup (mock)
app.get('/api/health/backup', (req, res) => {
  const statusFilePath = join(process.cwd(), 'backup-status.json');
  try {
    const fs = require('fs');
    if (fs.existsSync(statusFilePath)) {
      const status = JSON.parse(fs.readFileSync(statusFilePath, 'utf-8'));
      return res.json({
        healthy: true,
        message: 'Backup status available',
        lastBackup: status,
        nextScheduledBackup: new Date(Date.now() + 86400000).toISOString()
      });
    }
    res.status(503).json({
      healthy: false,
      message: 'No backup status available'
    });
  } catch (err) {
    res.status(503).json({
      healthy: false,
      error: 'Failed to check backup health'
    });
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Mock server running on http://localhost:${PORT}`);
  console.log(`✓ Endpoints available:`);
  console.log(`  - POST /api/admin/trigger-backup (requires admin auth)`);
  console.log(`  - GET /api/health/backup\n`);

  // Server ready for testing
  console.log('✓ Ready for testing\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
