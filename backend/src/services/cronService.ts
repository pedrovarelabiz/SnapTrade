import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { generateDailyReport } from "./reportService.js";

export function startCronJobs(): void {
  // 00:05 UTC — generate daily report for yesterday
  cron.schedule("5 0 * * *", async () => {
    try {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const dateStr = yesterday.toISOString().slice(0, 10);

      logger.info(`[cron] Generating daily report for ${dateStr}`);
      const report = await generateDailyReport(dateStr);
      if (report) {
        logger.info(
          `[cron] Report generated: ${report.totalSignals} signals, ${report.winRate}% WR`,
        );
      } else {
        logger.info(`[cron] No signals for ${dateStr}, skipping report`);
      }
    } catch (err) {
      logger.error(err, "[cron] Daily report error");
    }
  });

  // Hourly — check subscription expiry. Note: up-to-1-hour gap between real expiry and DB roles.
  // JWT-authenticated users bypass this until their token expires.
  cron.schedule("0 * * * *", async () => {
    try {
      const now = new Date();
      const gracePeriodDays = 3;
      const graceDate = new Date(now);
      graceDate.setUTCDate(graceDate.getUTCDate() - gracePeriodDays);

      // Active subs past expiry -> grace_period
      const toGrace = await prisma.subscription.updateMany({
        where: {
          status: "active",
          plan: { not: "free" },
          expiresAt: { lt: now },
        },
        data: { status: "grace_period" },
      });

      if (toGrace.count > 0) {
        logger.info(
          `[cron] ${toGrace.count} subscriptions moved to grace_period`,
        );
      }

      // Grace period subs past grace -> expired, downgrade to user
      const toExpire = await prisma.subscription.findMany({
        where: {
          status: "grace_period",
          expiresAt: { lt: graceDate },
        },
        select: { userId: true },
      });

      if (toExpire.length > 0) {
        const userIds = toExpire.map((s) => s.userId);

        await prisma.subscription.updateMany({
          where: { userId: { in: userIds } },
          data: { status: "expired", plan: "free" },
        });

        await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { role: "user" },
        });

        logger.info(
          `[cron] ${toExpire.length} subscriptions expired, users downgraded`,
        );
      }
    } catch (err) {
      logger.error(err, "[cron] Subscription check error");
    }
  });

  logger.info("[cron] Cron jobs started");
}
