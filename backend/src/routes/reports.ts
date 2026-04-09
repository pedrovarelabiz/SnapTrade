import { Router, Response } from "express";
import { logger } from "../lib/logger.js";
import { authMiddleware } from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { AuthRequest } from "../types/index.js";
import { listReports, getReportByDate } from "../services/reportService.js";

const router = Router();

// GET /api/reports — list reports
router.get(
  "/",
  authMiddleware,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const limit = parseInt(
        (req.query.limit as string) || "30",
        10,
      );
      const reports = await listReports(Math.min(limit, 365));
      res.json(reports);
    } catch (err) {
      logger.error({ err }, "Reports list error");
      res.status(500).json({ error: "Failed to get reports" });
    }
  },
);

// GET /api/reports/:date
router.get(
  "/:date",
  authMiddleware,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const report = await getReportByDate(String(req.params.date));
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      res.json(report);
    } catch (err) {
      logger.error({ err }, "Report detail error");
      res.status(500).json({ error: "Failed to get report" });
    }
  },
);

// GET /api/reports/:date/pdf (stub)
router.get(
  "/:date/pdf",
  authMiddleware,
  async (_req: AuthRequest, res: Response) => {
    res.json({ message: "PDF generation not yet implemented" });
  },
);

export default router;
