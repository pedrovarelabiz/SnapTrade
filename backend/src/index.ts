import dotenv from "dotenv";
dotenv.config(); // Must load env vars before any module reads process.env

import { initSentry } from "./config/sentry.js";

// Initialize Sentry first to capture all errors
initSentry();

import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { startHeartbeat, startCleanup, stopCleanup } from "./lib/sse.js";
import { initRelay, shutdownRelay } from "./lib/relay.js";
import { startCronJobs } from "./services/cronService.js";

import authRoutes from "./routes/auth.js";
import signalRoutes from "./routes/signals.js";
import statsRoutes from "./routes/stats.js";
import reportRoutes from "./routes/reports.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import extensionRoutes from "./routes/extension.js";
import adminRoutes from "./routes/admin.js";
import internalRoutes from "./routes/internal.js";
import webhookRoutes from "./routes/webhooks.js";
import healthRoutes from "./routes/health.js";
import metricsRoutes from "./routes/metrics.js";
import testErrorRoutes from "./routes/test-error.js";
import relayRoutes from "./routes/relay.js";
import subscriptionTierRoutes from "./routes/subscription.js";

const app = express();
const server = createServer(app);

// Sentry request handler must be the first middleware
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

app.use(express.static("public")); // Serve crawler strategies
// Global middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);
app.use(morgan("combined", { stream: { write: (msg: string) => logger.info(msg.trim()) } }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Request logging (structured JSON for errors)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (res.statusCode >= 400) {
      logger.info({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - start,
        });
    }
  });
  next();
});

// Health check with DB ping
app.get("/api/health", async (_req, res) => {
  let dbStatus = "ok";
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 2000),
      ),
    ]);
  } catch {
    dbStatus = "degraded";
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  let signalsToday = 0;
  let pendingSignals = 0;
  try {
    [signalsToday, pendingSignals] = await Promise.all([
      prisma.signal.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.signal.count({
        where: { status: { in: ["pending", "active"] } },
      }),
    ]);
  } catch {
    /* skip */
  }

  res.json({
    status: dbStatus === "ok" ? "ok" : "degraded",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    db: dbStatus,
    signalsToday,
    pendingSignals,
  });
});

// Metrics endpoint with optional Prometheus bearer token authentication
app.use("/metrics", (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (config.prometheusScraperToken && config.prometheusScraperToken !== "") {
    if (!authHeader || authHeader !== `Bearer ${config.prometheusScraperToken}`) {
      logger.warn(`Unauthorized metrics request from ${req.ip}`);
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  next();
}, metricsRoutes);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/signals", signalRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/extension", extensionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/internal", internalRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/test", testErrorRoutes);
app.use("/api/relay", relayRoutes);
app.use("/api/subscription", subscriptionTierRoutes);
// Sentry error handler must be before other error middleware
app.use(Sentry.Handlers.errorHandler());

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Start
async function main() {
  try {
    try {
      await prisma.$connect();
      logger.info("[db] Connected to PostgreSQL");
    } catch (dbErr) {
      logger.warn(dbErr, "[db] Database connection failed - continuing in limited mode");
    }

    startHeartbeat();
    startCleanup();
    startCronJobs();

    // Restore latest lab snapshot from DB so dashboard survives backend restarts
    try {
      const latest = await prisma.labSnapshot.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        (global as any).__latestLabStats = latest.payload;
        logger.info({ snapshotId: latest.id, createdAt: latest.createdAt }, "[lab] Restored latest lab snapshot from DB");
      }
    } catch (snapErr) {
      logger.warn(snapErr, "[lab] Could not restore lab snapshot (table may not exist yet)");
    }

    // Initialize WebSocket relay on the same HTTP server
    initRelay(server);

    server.listen(config.port, () => {
      logger.info(
        `[server] SnapTrade API running on port ${config.port} (${config.nodeEnv})`,
      );
    });
  } catch (err) {
    logger.error(err, "[server] Failed to start");
    process.exit(1);
  }
}

main();

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("[server] SIGTERM received, shutting down...");
  shutdownRelay();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("[server] SIGINT received, shutting down...");
  shutdownRelay();
  await prisma.$disconnect();
  process.exit(0);
});
