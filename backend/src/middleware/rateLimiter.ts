import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Too many auth attempts, try again in 1 minute" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many requests, try again in 1 minute" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const internalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: "Rate limit exceeded" },
  standardHeaders: true,
  legacyHeaders: false,
});
