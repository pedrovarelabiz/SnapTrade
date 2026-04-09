import { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import { timingSafeEqual } from "crypto";

export function apiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const headerValue = req.headers["x-internal-key"];
  const key = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!key || !config.internalApiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const keyBuffer = Buffer.from(key);
  const expectedBuffer = Buffer.from(config.internalApiKey);

  if (
    keyBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(keyBuffer, expectedBuffer)
  ) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
