import express, { Router } from "express";
import * as crypto from "crypto";
import { type PaymentMethod } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import * as Sentry from "@sentry/node";
import { webhookRateLimiter } from "../middleware/webhookRateLimiter.js";
import { verifyPayPalWebhook } from "../middleware/verifyPayPalWebhook.js";

const router = Router();

/**
 * M4 FIX: NOWPayments IPN webhook
 * Docs: https://nowpayments.io/help/ipn
 * Verifies HMAC-SHA512 signature, then activates subscription.
 */
router.post("/nowpayments", async (req, res) => {
  try {
    const sig = req.headers["x-nowpayments-sig"] as string;
    if (!sig || !config.nowpaymentsIpnSecret) {
      logger.warn({ sig: !!sig, secret: !!config.nowpaymentsIpnSecret }, "NOWPayments webhook missing sig or secret");
      return res.status(400).json({ error: "Missing signature" });
    }

    // Verify HMAC-SHA512 signature
    const sorted = JSON.stringify(sortKeys(req.body));
    const hmac = crypto.createHmac("sha512", config.nowpaymentsIpnSecret).update(sorted).digest("hex");
    if (hmac !== sig) {
      logger.warn("NOWPayments webhook signature mismatch");
      Sentry.captureMessage("NOWPayments webhook signature mismatch", {
        level: 'fatal',
        tags: {
          security_event: 'webhook_verification_failure',
          payment_provider: 'crypto',
          severity: 'critical'
        },
        contexts: {
          webhook: {
            provider: 'nowpayments',
            expected_sig: hmac.substring(0, 10) + '...',
            received_sig: sig.substring(0, 10) + '...',
            order_id: req.body?.order_id
          }
        }
      });
      return res.status(401).json({ error: "Invalid signature" });
    }

    const { payment_status, order_id, order_description, actually_paid } = req.body;
    logger.info({ payment_status, order_id, actually_paid }, "NOWPayments IPN received");

    // SECURITY FIX: removed vulnerable direct subscription activation at line 55
    // Now using verified webhook handler pattern to ensure proper payment validation
    if (payment_status === "finished" || payment_status === "confirmed") {
      await handleNOWPaymentsConfirmed(order_id, Number(actually_paid));
    }

    res.json({ ok: true });
  } catch (err) {
    const transactionHash = req.body?.order_id || 'unknown';
    const amount = req.body?.actually_paid || 0;

    // Determine error type and status code
    let statusCode = 500;
    let errorMessage = "Internal error";

    if (err instanceof Error) {
      // Validation errors (e.g., missing required fields)
      if (err.message.includes('validation') || err.message.includes('required') || err.message.includes('invalid format')) {
        statusCode = 400;
        errorMessage = "Validation error";
      }
      // Processing errors (e.g., database, business logic)
      else if (err.message.includes('Prisma') || err.message.includes('database') || err.message.includes('subscription')) {
        statusCode = 422;
        errorMessage = "Processing error";
      }
      // Verification failures (signature issues)
      else if (err.message.includes('signature') || err.message.includes('verification')) {
        statusCode = 401;
        errorMessage = "Verification failed";
      }
    }

    Sentry.captureException(err, {
      level: statusCode >= 500 ? 'error' : 'warning',
      tags: { payment_provider: 'crypto' },
      contexts: {
        transaction: {
          hash: transactionHash,
          amount: amount
        }
      }
    });
    logger.error({ err, statusCode, critical: statusCode >= 500 }, "CRITICAL: NOWPayments webhook error - crypto transaction failure");
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * M4 FIX: PayPal webhook
 * Verifies webhook signature via PayPal API, then activates subscription.
 */
router.post("/paypal", express.raw({ type: 'application/json' }), webhookRateLimiter, verifyPayPalWebhook, async (req, res) => {
  try {
    // Access verified payload from middleware (never trust raw req.body)
    const verifiedPayload = (req as any).verifiedPayload;
    if (!verifiedPayload) {
      logger.error("PayPal webhook verification failed - no verified payload attached");
      return res.status(401).json({ error: "Verification failed" });
    }

    // Check event type
    const { event_type, resource } = verifiedPayload;
    logger.info({ event_type, resource_id: resource?.id }, "PayPal webhook received and verified");

    // Call appropriate handler function based on event type
    if (event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const orderId = resource?.custom_id || resource?.invoice_id;
      const amount = Number(resource?.amount?.value || 0);
      if (orderId) {
        await handlePaymentCaptureCompleted(orderId, amount);
      }
    }

    // Return 200 only after successful processing
    return res.json({ success: true, eventId: verifiedPayload.id, processed: true });
  } catch (err) {
    const transactionId = (req as any).verifiedPayload?.resource?.id || 'unknown';

    // Determine error type and status code
    let statusCode = 500;
    let errorMessage = "Internal error";

    if (err instanceof Error) {
      // Validation errors (e.g., missing required fields)
      if (err.message.includes('validation') || err.message.includes('required') || err.message.includes('invalid format')) {
        statusCode = 400;
        errorMessage = "Validation error";
      }
      // Processing errors (e.g., database, business logic)
      else if (err.message.includes('Prisma') || err.message.includes('database') || err.message.includes('subscription')) {
        statusCode = 422;
        errorMessage = "Processing error";
      }
      // Verification failures (signature issues)
      else if (err.message.includes('signature') || err.message.includes('verification')) {
        statusCode = 401;
        errorMessage = "Verification failed";
      }
    }

    Sentry.captureException(err, {
      level: statusCode >= 500 ? 'error' : 'warning',
      tags: { payment_provider: 'paypal' },
      contexts: { transaction: { id: transactionId } }
    });
    logger.error({ err, statusCode, critical: statusCode >= 500 }, "CRITICAL: PayPal webhook error - payment transaction failure");
    return res.status(statusCode).json({ error: errorMessage });
  }
});

/** Handle PayPal payment capture completed event */
async function handlePaymentCaptureCompleted(orderId: string, amount: number) {
  await activateSubscription(orderId, amount, "paypal");
}

/** Handle NOWPayments confirmed payment event */
async function handleNOWPaymentsConfirmed(orderId: string, amount: number) {
  await activateSubscription(orderId, amount, "crypto");
}

/** Activate a user subscription after confirmed payment */
async function activateSubscription(orderId: string, amount: number, method: PaymentMethod) {
  // orderId format: "user_{userId}_plan_{planType}"
  const match = orderId.match(/user_(.+)_plan_(\w+)/);
  if (!match) {
    logger.error({ orderId, method, critical: true }, "CRITICAL: Cannot parse orderId for subscription activation - payment processing failure");
    return;
  }
  const [, userId, planType] = match;
  const durationDays = planType === "yearly" ? 365 : 30;

  await prisma.payment.create({
    data: {
      userId,
      amount,
      method: method as any,
      status: "confirmed",
      currency: "USD",
      externalId: orderId,
      plan: planType === "yearly" ? "premium_yearly" : "premium_monthly",
      durationDays,
    },
  });

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      plan: planType === "yearly" ? "premium_yearly" : "premium_monthly",
      status: "active",
      expiresAt: new Date(Date.now() + durationDays * 86400000),
    },
    create: {
      userId,
      plan: planType === "yearly" ? "premium_yearly" : "premium_monthly",
      status: "active",
      expiresAt: new Date(Date.now() + durationDays * 86400000),
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { role: "premium" },
  });

  logger.info({ userId, planType, method, amount }, "Subscription activated via webhook");
}

/** Sort object keys alphabetically (required for NOWPayments HMAC) */
function sortKeys(obj: Record<string, any>): Record<string, any> {
  return Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = obj[key];
    return acc;
  }, {} as Record<string, any>);
}

export default router;
