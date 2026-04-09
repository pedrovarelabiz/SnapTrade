/**
 * PayPal Webhook Verification Middleware
 *
 * SECURITY: This middleware prevents unauthorized webhook processing by verifying
 * that incoming webhook requests genuinely originate from PayPal. Without this
 * verification, attackers could forge webhook events to manipulate payment states,
 * grant unauthorized access, or trigger fraudulent transactions.
 *
 * @module verifyPayPalWebhook
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import * as Sentry from "@sentry/node";

/**
 * Extended Express Request interface for PayPal webhook requests
 * @interface PayPalWebhookRequest
 */
interface PayPalWebhookRequest extends Request {
  /** The verified webhook payload after successful authentication */
  verifiedPayload?: any;
  /** Database ID of the stored webhook event */
  webhookEventId?: string;
}

/**
 * PayPal webhook security headers required for signature verification
 * @interface PayPalHeaders
 */
interface PayPalHeaders {
  /** Unique ID for this webhook transmission */
  transmissionId: string;
  /** ISO 8601 timestamp when PayPal sent the webhook */
  transmissionTime: string;
  /** Base64-encoded signature of the webhook payload */
  transmissionSig: string;
  /** URL to PayPal's certificate for signature verification */
  certUrl: string;
  /** Algorithm used for signature (e.g., "SHA256withRSA") */
  authAlgo: string;
}

/** Maximum age of webhook timestamp to prevent replay attacks */
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Retrieves the configured PayPal webhook ID from environment variables
 * @returns {string} The webhook ID configured in PAYPAL_WEBHOOK_ID env var
 */
function getWebhookId(): string {
  return process.env.PAYPAL_WEBHOOK_ID || "";
}

/**
 * Extracts and validates required PayPal webhook headers from the request
 *
 * SECURITY: Ensures all required headers are present before proceeding with
 * signature verification. Missing headers indicate a potentially forged request.
 *
 * @param {Request} req - Express request object
 * @returns {PayPalHeaders | null} Extracted headers object or null if any required header is missing
 */
function extractPayPalHeaders(req: Request): PayPalHeaders | null {
  const transmissionId = req.headers["paypal-transmission-id"] as string;
  const transmissionTime = req.headers["paypal-transmission-time"] as string;
  const transmissionSig = req.headers["paypal-transmission-sig"] as string;
  const certUrl = req.headers["paypal-cert-url"] as string;
  const authAlgo = req.headers["paypal-auth-algo"] as string;

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return null;
  }

  return {
    transmissionId,
    transmissionTime,
    transmissionSig,
    certUrl,
    authAlgo,
  };
}

/**
 * Validates the webhook transmission timestamp to prevent replay attacks
 *
 * SECURITY: Rejects webhooks with timestamps that are too old (>5 minutes) or
 * in the future, preventing attackers from replaying captured webhook requests.
 *
 * @param {string} transmissionTime - ISO 8601 timestamp from PayPal headers
 * @returns {boolean} True if timestamp is valid and within acceptable age range
 */
function validateTimestamp(transmissionTime: string): boolean {
  const timestamp = new Date(transmissionTime).getTime();
  const now = Date.now();
  const age = now - timestamp;

  // Reject if timestamp is in the future or too old
  return age >= 0 && age <= MAX_TIMESTAMP_AGE_MS;
}

/**
 * Verifies the cryptographic signature of the webhook using PayPal's public key
 *
 * SECURITY: This is the core security mechanism that proves the webhook originated
 * from PayPal. The signature is created by PayPal using their private key and can
 * only be verified using their corresponding public key from the certificate.
 *
 * Verification steps:
 * 1. Constructs the signed message: transmissionId|transmissionTime|webhookId|sha256(body)
 * 2. Fetches PayPal's certificate from the provided certUrl
 * 3. Extracts the public key from the certificate
 * 4. Verifies the signature using SHA256 with RSA
 *
 * @param {PayPalHeaders} headers - PayPal webhook headers containing signature and cert URL
 * @param {string} webhookId - Configured webhook ID from environment
 * @param {any} body - Raw webhook payload body
 * @returns {Promise<boolean>} True if signature is valid, false otherwise
 * @throws {Error} If webhook ID is not configured or network errors occur
 */
async function verifySignature(
  headers: PayPalHeaders,
  webhookId: string,
  body: any,
): Promise<boolean> {
  // Check if webhook ID is configured - throw error for configuration issues
  if (!webhookId || webhookId === "") {
    throw new Error("PAYPAL_WEBHOOK_ID environment variable is not configured");
  }

  try {
    // Construct the message that PayPal signed
    const message = `${headers.transmissionId}|${headers.transmissionTime}|${webhookId}|${crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")}`;

    // Fetch the certificate from PayPal
    const certResponse = await fetch(headers.certUrl);
    if (!certResponse.ok) {
      return false;
    }
    const certText = await certResponse.text();

    // Extract the public key from the certificate
    const publicKey = crypto.createPublicKey(certText);

    // Decode the signature from base64
    const signature = Buffer.from(headers.transmissionSig, "base64");

    // Verify the signature
    const verifier = crypto.createVerify("SHA256");
    verifier.update(message);
    verifier.end();

    return verifier.verify(publicKey, signature);
  } catch (error) {
    console.error("PayPal signature verification error:", error);
    // Re-throw fetch errors and network errors
    if (error instanceof Error &&
        (error.message.includes("fetch") ||
         error.message.includes("network") ||
         error.message.includes("PayPal API"))) {
      throw error;
    }
    // Return false for signature verification failures
    return false;
  }
}

/**
 * Checks if a webhook event has already been processed (idempotency check)
 *
 * SECURITY: Prevents duplicate processing of webhook events. Attackers could
 * replay valid webhooks to trigger duplicate payments, refunds, or other actions.
 *
 * @param {string} eventId - Unique PayPal event ID
 * @returns {Promise<boolean>} True if event is unique (not yet processed), false if duplicate
 */
async function checkIdempotency(eventId: string): Promise<boolean> {
  const existing = await prisma.webhookEvent.findUnique({
    where: { eventId },
  });
  return existing === null;
}

/**
 * Stores a verified webhook event in the database for audit trail and idempotency
 *
 * @param {string} eventId - Unique PayPal event ID
 * @param {string} eventType - PayPal event type (e.g., "PAYMENT.CAPTURE.COMPLETED")
 * @param {any} payload - Full webhook payload
 * @returns {Promise<string>} Database ID of the created webhook event record
 */
async function storeWebhookEvent(
  eventId: string,
  eventType: string,
  payload: any,
): Promise<string> {
  const event = await prisma.webhookEvent.create({
    data: {
      eventId,
      eventType,
      payload,
      verified: true,
      source: "paypal",
    },
  });
  return event.id;
}

/**
 * Express middleware for verifying PayPal webhook authenticity and integrity
 *
 * SECURITY VULNERABILITY FIXED: Without this middleware, the application would accept
 * any POST request to the webhook endpoint, allowing attackers to:
 * - Forge payment completion events to grant unauthorized premium access
 * - Fake refund/chargeback events to manipulate financial records
 * - Replay legitimate webhooks to cause duplicate processing
 * - Inject malicious payloads to exploit downstream handlers
 *
 * VERIFICATION STEPS:
 * 1. Extract and validate required PayPal security headers
 * 2. Validate transmission timestamp (reject if >5min old or in future)
 * 3. Verify cryptographic signature using PayPal's public certificate
 * 4. Check idempotency to prevent duplicate event processing
 * 5. Store verified event in database for audit trail
 * 6. Attach verified payload to request for downstream handlers
 *
 * ERROR HANDLING:
 * - 401: Missing headers, invalid timestamp, or invalid signature
 * - 409: Duplicate event (already processed)
 * - 500: Server misconfiguration (missing PAYPAL_WEBHOOK_ID)
 * - 503: PayPal API unavailable (certificate fetch failed)
 *
 * All failures are logged to application logger and Sentry with full context
 * including event ID, IP address, timestamp, and failure reason.
 *
 * @param {PayPalWebhookRequest} req - Express request with PayPal webhook headers and body
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next middleware function
 * @returns {Promise<void>} Calls next() on success, sends error response on failure
 *
 * @example
 * // Usage in Express route
 * import { verifyPayPalWebhook } from './middleware/verifyPayPalWebhook';
 *
 * app.post('/webhooks/paypal',
 *   express.json({ verify: (req, res, buf) => { req.rawBody = buf } }),
 *   verifyPayPalWebhook,
 *   async (req: PayPalWebhookRequest, res) => {
 *     const payload = req.verifiedPayload;
 *     const webhookEventId = req.webhookEventId;
 *     // Process verified webhook safely
 *   }
 * );
 */
export async function verifyPayPalWebhook(
  req: PayPalWebhookRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventId = req.body.id || req.headers["paypal-transmission-id"] || "unknown";
    const ipAddress = (req.headers["x-forwarded-for"] as string) || req.ip || req.socket.remoteAddress || "unknown";

    // 1. Validate headers
    const headers = extractPayPalHeaders(req);
    if (!headers) {
      const context = {
        eventId,
        timestamp: new Date().toISOString(),
        ipAddress,
        reason: "Missing required PayPal webhook headers",
        eventType: req.body?.event_type || "unknown",
        receivedHeaders: {
          transmissionId: req.headers["paypal-transmission-id"],
          transmissionTime: req.headers["paypal-transmission-time"],
          transmissionSig: req.headers["paypal-transmission-sig"],
          certUrl: req.headers["paypal-cert-url"],
          authAlgo: req.headers["paypal-auth-algo"],
        }
      };
      logger.warn(context, "PayPal webhook verification failed: missing headers");
      Sentry.captureMessage("PayPal webhook verification failed: missing headers", { level: 'warning', extra: context });
      res.status(401).json({ error: "Missing required PayPal webhook headers" });
      return;
    }

    // 2. Validate timestamp
    if (!validateTimestamp(headers.transmissionTime)) {
      const context = {
        eventId,
        timestamp: new Date().toISOString(),
        ipAddress,
        reason: "Webhook timestamp is invalid or expired",
        transmissionTime: headers.transmissionTime,
        eventType: req.body?.event_type || "unknown",
        headers: {
          transmissionId: headers.transmissionId,
          certUrl: headers.certUrl,
          authAlgo: headers.authAlgo
        }
      };
      logger.warn(context, "PayPal webhook verification failed: invalid timestamp");
      Sentry.captureMessage("PayPal webhook verification failed: invalid timestamp", { level: 'warning', extra: context });
      res.status(401).json({ error: "Webhook timestamp is invalid or expired" });
      return;
    }

    // 3. Verify signature
    const isValidSignature = await verifySignature(headers, getWebhookId(), req.body);
    if (!isValidSignature) {
      const context = {
        eventId,
        timestamp: new Date().toISOString(),
        ipAddress,
        reason: "Invalid webhook signature",
        eventType: req.body?.event_type || "unknown",
        headers: {
          transmissionId: headers.transmissionId,
          transmissionTime: headers.transmissionTime,
          certUrl: headers.certUrl,
          authAlgo: headers.authAlgo
        }
      };
      logger.warn(context, "PayPal webhook verification failed: invalid signature");
      Sentry.captureMessage("PayPal webhook verification failed: invalid signature", { level: 'warning', extra: context });
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    // 4. Check idempotency
    const isUnique = await checkIdempotency(eventId);
    if (!isUnique) {
      const context = {
        eventId,
        timestamp: new Date().toISOString(),
        ipAddress,
        reason: "Event already processed",
        eventType: req.body?.event_type || "unknown",
        headers: {
          transmissionId: headers.transmissionId,
          transmissionTime: headers.transmissionTime
        }
      };
      logger.warn(context, "PayPal webhook verification failed: duplicate event");
      Sentry.captureMessage("PayPal webhook verification failed: duplicate event", { level: 'warning', extra: context });
      res.status(409).json({ message: "Event already processed" });
      return;
    }

    // 5. Store event
    const webhookEventId = await storeWebhookEvent(
      eventId,
      req.body.event_type || "unknown",
      req.body,
    );

    // 6. Attach verified payload to req object
    req.verifiedPayload = req.body;
    req.webhookEventId = webhookEventId;

    logger.info({
      eventId,
      timestamp: new Date().toISOString(),
      ipAddress,
      eventType: req.body.event_type || "unknown",
      webhookEventId
    }, "PayPal webhook verification successful");

    next();
  } catch (error) {
    const eventId = req.body?.id || req.headers["paypal-transmission-id"] || "unknown";
    const ipAddress = (req.headers["x-forwarded-for"] as string) || req.ip || req.socket.remoteAddress || "unknown";

    const context = {
      eventId,
      timestamp: new Date().toISOString(),
      ipAddress,
      reason: error instanceof Error ? error.message : "Webhook verification failed",
      eventType: req.body?.event_type || "unknown",
      headers: {
        transmissionId: req.headers["paypal-transmission-id"],
        transmissionTime: req.headers["paypal-transmission-time"],
        certUrl: req.headers["paypal-cert-url"],
        authAlgo: req.headers["paypal-auth-algo"]
      },
      error
    };

    // Determine appropriate status code based on error type
    let statusCode = 500;
    let errorMessage = "Internal server error";

    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();

      // Check for missing webhook ID configuration
      if (!getWebhookId() || getWebhookId() === "" || errorMsg.includes("paypal_webhook_id")) {
        statusCode = 500;
        errorMessage = "Server configuration error";
      }
      // Check for PayPal API unavailability
      else if (errorMsg.includes("paypal api") || errorMsg.includes("unavailable") || errorMsg.includes("fetch failed")) {
        statusCode = 503;
        errorMessage = "PayPal service temporarily unavailable";
      }
    }

    logger.warn(context, "PayPal webhook verification failed: exception");
    Sentry.captureMessage("PayPal webhook verification failed: exception", { level: 'warning', extra: context });
    res.status(statusCode).json({ error: errorMessage });
  }
}
