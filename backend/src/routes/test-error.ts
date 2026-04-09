import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { AuthRequest } from "../types/index.js";
import * as Sentry from "@sentry/node";
import { prisma } from "../lib/prisma.js";
import https from "https";

const router = Router();

// Test endpoint that triggers an error with authenticated user
router.get("/trigger-error", authMiddleware, async (req: AuthRequest, res: Response) => {
  // This error should be captured by Sentry with user context
  const testError = new Error("Test error for user context tracking");
  Sentry.captureException(testError);

  res.status(500).json({
    error: "Test error triggered",
    message: "Check Sentry for user context"
  });
});

// Test endpoint for breadcrumb capture with multi-step operations
router.get("/breadcrumb-test", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Step 1: Auth check (logged as breadcrumb via middleware)
    Sentry.addBreadcrumb({
      category: "auth",
      message: "Authentication verified for user",
      level: "info",
      data: {
        userId: req.user?.userId,
        email: req.user?.email,
      },
    });

    // Step 2: Database query
    Sentry.addBreadcrumb({
      category: "db",
      message: "Fetching user data from database",
      level: "info",
    });

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, createdAt: true },
    });

    Sentry.addBreadcrumb({
      category: "db",
      message: "User data retrieved successfully",
      level: "info",
      data: {
        recordFound: !!user,
      },
    });

    // Step 3: External API call simulation
    Sentry.addBreadcrumb({
      category: "http",
      message: "Making external API call to httpbin.org",
      level: "info",
    });

    await new Promise<void>((resolve, reject) => {
      const apiReq = https.request(
        {
          hostname: "httpbin.org",
          path: "/delay/1",
          method: "GET",
          timeout: 5000,
        },
        (apiRes) => {
          let data = "";
          apiRes.on("data", (chunk) => {
            data += chunk;
          });
          apiRes.on("end", () => {
            Sentry.addBreadcrumb({
              category: "http",
              message: "External API call completed",
              level: "info",
              data: {
                statusCode: apiRes.statusCode,
                endpoint: "httpbin.org/delay/1",
              },
            });
            resolve();
          });
        }
      );

      apiReq.on("error", (err) => {
        Sentry.addBreadcrumb({
          category: "http",
          message: "External API call failed",
          level: "error",
          data: {
            error: err.message,
          },
        });
        reject(err);
      });

      apiReq.end();
    });

    // Step 4: Trigger error after all operations
    Sentry.addBreadcrumb({
      category: "error",
      message: "About to trigger test error",
      level: "warning",
    });

    throw new Error("Multi-step operation breadcrumb test error");
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      error: "Breadcrumb test error triggered",
      message: "Check Sentry event for breadcrumbs showing: auth → db → external API → error",
    });
  }
});

export default router;
