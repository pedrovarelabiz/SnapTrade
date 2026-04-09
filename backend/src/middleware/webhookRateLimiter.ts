import rateLimit from "express-rate-limit";

/**
 * Strict rate limiter for webhook endpoints to prevent abuse
 * Allows 100 requests per 15 minutes per IP address
 * Returns 429 status code when limit is exceeded
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window per IP
  message: {
    error: "Too many webhook requests from this IP, please try again later",
    retryAfter: "15 minutes"
  },
  statusCode: 429,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,  // Disable `X-RateLimit-*` headers
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});
