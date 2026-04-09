import { prisma } from '../lib/prisma';
import {
  PayPalWebhookEvent,
  PayPalSubscription,
  PayPalCapture,
  isPayPalSubscription,
} from '../types/paypal';
import { SubscriptionStatus } from '@prisma/client';
import * as Sentry from '@sentry/node';

/**
 * Handles PayPal BILLING.SUBSCRIPTION.ACTIVATED webhook event
 *
 * @description Processes subscription activation by validating the subscription against
 * an existing pending payment record and activating the user's subscription.
 *
 * Database operations:
 * - Validates Payment record exists with 'pending' status
 * - Updates or creates Subscription record with 'active' status and expiration date
 * - Updates Payment status to 'confirmed' with confirmation timestamp
 * - Updates User role to 'premium' for premium/pro plans
 * - Creates WebhookEvent record for audit trail
 *
 * Security validations:
 * - Verifies resource type is PayPalSubscription
 * - Validates subscription ID is present
 * - Confirms Payment record exists with 'pending' status (prevents duplicate activation)
 * - Verifies payer email matches user email if provided
 * - All operations in atomic database transaction
 *
 * Error conditions:
 * - Invalid resource type for event
 * - Missing subscription ID in webhook payload
 * - No pending payment record found for subscription ID
 * - Payment exists but status is not 'pending' (e.g., already confirmed)
 * - Payer email mismatch between PayPal and database record
 * - Database transaction failures (automatically rolled back)
 *
 * @param event - PayPal webhook event containing subscription activation data
 * @throws {Error} When resource validation fails, payment record not found, or database operations fail
 */
export async function handleSubscriptionActivated(
  event: PayPalWebhookEvent
): Promise<void> {
  try {
    const { resource } = event;
    const eventId = event.id;
    const eventType = event.event_type;

    // Validate resource is a subscription
    if (!isPayPalSubscription(resource)) {
      throw new Error('Invalid resource type for BILLING.SUBSCRIPTION.ACTIVATED event');
    }

    const subscription = resource as PayPalSubscription;

    // Extract subscription_id and payer info
    const subscriptionId = subscription.id;
    const payerEmail = subscription.subscriber?.email_address;
    const payerId = subscription.subscriber?.payer_id;

    if (!subscriptionId) {
      throw new Error('Missing subscription ID in webhook event');
    }

    // Validate and update in database transaction
    try {
      await prisma.$transaction(async (tx) => {
        // Validate against existing Payment record with pending status
        const payment = await tx.payment.findFirst({
          where: {
            externalId: subscriptionId,
            status: 'pending',
          },
          include: {
            user: true,
          },
        });

        if (!payment) {
          // Check if payment exists but with wrong status
          const anyPayment = await tx.payment.findUnique({
            where: {
              externalId: subscriptionId,
            },
          });

          if (anyPayment) {
            throw new Error(
              `Payment record found for subscription ID ${subscriptionId} but status is '${anyPayment.status}', expected 'pending'`
            );
          }

          throw new Error(`No pending payment record found for subscription ID: ${subscriptionId}`);
        }

        // Verify payer information matches if available
        if (payerEmail && payment.user.email !== payerEmail) {
          throw new Error(
            `Payer email mismatch: expected ${payment.user.email}, got ${payerEmail}`
          );
        }

        // Update or create subscription record
        const existingSubscription = await tx.subscription.findUnique({
          where: { userId: payment.userId },
        });

        if (existingSubscription) {
          // Update existing subscription to active
          await tx.subscription.update({
            where: { userId: payment.userId },
            data: {
              status: SubscriptionStatus.active,
              plan: payment.plan,
              expiresAt: new Date(
                Date.now() + payment.durationDays * 24 * 60 * 60 * 1000
              ),
              updatedAt: new Date(),
            },
          });
        } else {
          // Create new subscription
          await tx.subscription.create({
            data: {
              userId: payment.userId,
              status: SubscriptionStatus.active,
              plan: payment.plan,
              expiresAt: new Date(
                Date.now() + payment.durationDays * 24 * 60 * 60 * 1000
              ),
            },
          });
        }

        // Update payment status to confirmed
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'confirmed',
            confirmedAt: new Date(),
          },
        });

        // Update user role if premium plan
        if (payment.plan === 'premium' || payment.plan === 'pro') {
          await tx.user.update({
            where: { id: payment.userId },
            data: {
              role: 'premium',
            },
          });
        }

        // Log webhook event
        await tx.webhookEvent.create({
          data: {
            eventId: `sub-${subscriptionId}-${Date.now()}`,
            eventType: 'BILLING.SUBSCRIPTION.ACTIVATED',
            payload: { subscriptionId },
            verified: true,
            source: 'paypal',
            processedAt: new Date(),
          },
        });
      });
    } catch (error) {
      // Transaction automatically rolls back on error
      throw new Error(
        `Failed to process subscription activation for ${subscriptionId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  } catch (error) {
    const subscriptionId = (event.resource as PayPalSubscription)?.id || 'unknown';
    const userId = (event.resource as PayPalSubscription)?.subscriber?.payer_id || 'unknown';

    // Log error with full context
    console.error('Webhook handler error:', {
      eventId: event.id,
      eventType: event.event_type,
      subscriptionId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Capture in Sentry with context
    Sentry.captureException(error, {
      tags: {
        webhookHandler: 'handleSubscriptionActivated',
        eventType: event.event_type,
      },
      extra: {
        eventId: event.id,
        subscriptionId,
        userId,
        resource: event.resource,
      },
    });

    // Re-throw with user-friendly message
    throw new Error(
      `Unable to process subscription activation. Please contact support with reference: ${event.id}`
    );
  }
}

/**
 * Handles PayPal PAYMENT.SALE.COMPLETED webhook event
 *
 * @description Processes one-time payment completion by updating payment status
 * and creating comprehensive audit trail of the transaction.
 *
 * Database operations:
 * - Finds Payment record by external sale ID
 * - Updates Payment status to 'completed' with confirmation timestamp
 * - Creates AuditLog entry with transaction details (amount, currency, state)
 * - Creates WebhookEvent record for processing history
 *
 * Security validations:
 * - Validates sale ID is present in webhook payload
 * - Confirms Payment record exists before updating
 * - All operations in atomic database transaction
 *
 * Error conditions:
 * - Missing sale ID in webhook payload
 * - No payment record found for sale ID
 * - Database transaction failures (automatically rolled back)
 * - Payment record lookup failures during error handling
 *
 * @param event - PayPal webhook event containing payment sale completion data
 * @throws {Error} When sale ID is missing, payment record not found, or database operations fail
 */
export async function handlePaymentSaleCompleted(
  event: PayPalWebhookEvent
): Promise<void> {
  try {
    const { resource, event_type, create_time } = event;
    const eventId = event.id;

    // Type assertion for capture resource
    const capture = resource as PayPalCapture;

    // Extract transaction details from resource
    const saleId = capture.id;
    const amount = capture.amount?.value;
    const currency = capture.amount?.currency_code;
    const state = capture.status;

    if (!saleId) {
      throw new Error('Missing sale ID in webhook event');
    }

    // Find payment and update in transaction
    try {
      await prisma.$transaction(async (tx) => {
        // Find the payment record by external sale ID
        const payment = await tx.payment.findUnique({
          where: {
            externalId: saleId,
          },
        });

        if (!payment) {
          throw new Error(`No payment record found for sale ID: ${saleId}`);
        }

        // Update payment status to completed
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'completed',
            confirmedAt: new Date(create_time || Date.now()),
          },
        });

        // Create audit log entry
        await tx.auditLog.create({
          data: {
            userId: payment.userId,
            action: 'PAYMENT_COMPLETED',
            entity: 'Payment',
            entityId: payment.id,
            metadata: {
              saleId,
              amount,
              currency,
              state,
              eventType: event_type,
              completedAt: create_time,
            },
          },
        });

        // Log webhook event
        await tx.webhookEvent.create({
          data: {
            eventId: `sale-${saleId}-${Date.now()}`,
            eventType: event_type,
            payload: { saleId },
            verified: true,
            source: 'paypal',
            processedAt: new Date(),
          },
        });
      });
    } catch (error) {
      // Transaction automatically rolls back on error
      throw new Error(
        `Failed to process payment sale completion for ${saleId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  } catch (error) {
    const saleId = (event.resource as PayPalCapture)?.id || 'unknown';
    let userId = 'unknown';

    // Try to fetch userId from payment if available
    try {
      const payment = await prisma.payment.findUnique({
        where: { externalId: saleId },
        select: { userId: true },
      });
      if (payment) userId = payment.userId;
    } catch {
      // Ignore error when fetching userId
    }

    // Log error with full context
    console.error('Webhook handler error:', {
      eventId: event.id,
      eventType: event.event_type,
      saleId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Capture in Sentry with context
    Sentry.captureException(error, {
      tags: {
        webhookHandler: 'handlePaymentSaleCompleted',
        eventType: event.event_type,
      },
      extra: {
        eventId: event.id,
        saleId,
        userId,
        resource: event.resource,
      },
    });

    // Re-throw with user-friendly message
    throw new Error(
      `Unable to process payment completion. Please contact support with reference: ${event.id}`
    );
  }
}

/**
 * Handles PayPal BILLING.SUBSCRIPTION.CANCELLED webhook event
 *
 * @description Processes subscription cancellation by deactivating the user's subscription,
 * updating payment status, and recording cancellation details for audit purposes.
 *
 * Database operations:
 * - Finds Payment record by external subscription ID
 * - Updates Subscription status to 'cancelled' with endDate and timestamp
 * - Updates Payment status to 'cancelled'
 * - Creates AuditLog entry with cancellation reason and timestamp
 * - Creates WebhookEvent record for processing history
 *
 * Security validations:
 * - Verifies resource type is PayPalSubscription
 * - Validates subscription ID is present
 * - Confirms Payment record exists before processing
 * - All operations in atomic database transaction
 *
 * Error conditions:
 * - Invalid resource type for event
 * - Missing subscription ID in webhook payload
 * - No payment record found for subscription ID
 * - Database transaction failures (automatically rolled back)
 * - Payment record lookup failures during error handling
 *
 * @param event - PayPal webhook event containing subscription cancellation data
 * @throws {Error} When resource validation fails, subscription ID missing, payment not found, or database operations fail
 */
export async function handleSubscriptionCancelled(
  event: PayPalWebhookEvent
): Promise<void> {
  try {
    const { resource } = event;
    const eventId = event.id;
    const eventType = event.event_type;

    // Validate resource is a subscription
    if (!isPayPalSubscription(resource)) {
      throw new Error('Invalid resource type for BILLING.SUBSCRIPTION.CANCELLED event');
    }

    const subscription = resource as PayPalSubscription;

    // Extract subscription_id and cancellation details
    const subscriptionId = subscription.id;
    const cancellationReason = subscription.status_update_time;

    if (!subscriptionId) {
      throw new Error('Missing subscription ID in webhook event');
    }

    // Find payment and update in transaction
    try {
      await prisma.$transaction(async (tx) => {
        // Find the payment record associated with this subscription
        const payment = await tx.payment.findUnique({
          where: {
            externalId: subscriptionId,
          },
          include: {
            user: true,
          },
        });

        if (!payment) {
          throw new Error(`No payment record found for subscription ID: ${subscriptionId}`);
        }

        // Find and update subscription to cancelled status
        const existingSubscription = await tx.subscription.findUnique({
          where: { userId: payment.userId },
        });

        if (existingSubscription) {
          // Update subscription to cancelled with expiresAt
          await tx.subscription.update({
            where: { userId: payment.userId },
            data: {
              status: SubscriptionStatus.cancelled,
              expiresAt: new Date(),
            },
          });
        }

        // Update payment status to cancelled
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'cancelled',
          },
        });

        // Create audit log entry with cancellation reason
        await tx.auditLog.create({
          data: {
            userId: payment.userId,
            action: 'SUBSCRIPTION_CANCELLED',
            entity: 'Subscription',
            entityId: existingSubscription?.id || payment.id,
            metadata: {
              subscriptionId,
              cancellationReason,
              cancelledAt: new Date(),
              eventType: event.event_type,
            },
          },
        });

        // Log webhook event
        await tx.webhookEvent.create({
          data: {
            eventId: `cancel-${subscriptionId}-${Date.now()}`,
            eventType: 'BILLING.SUBSCRIPTION.CANCELLED',
            payload: { subscriptionId },
            verified: true,
            source: 'paypal',
            processedAt: new Date(),
          },
        });
      });
    } catch (error) {
      // Transaction automatically rolls back on error
      throw new Error(
        `Failed to process subscription cancellation for ${subscriptionId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  } catch (error) {
    const subscriptionId = (event.resource as PayPalSubscription)?.id || 'unknown';
    let userId = 'unknown';

    // Try to fetch userId from payment if available
    try {
      const payment = await prisma.payment.findUnique({
        where: { externalId: subscriptionId },
        select: { userId: true },
      });
      if (payment) userId = payment.userId;
    } catch {
      // Ignore error when fetching userId
    }

    // Log error with full context
    console.error('Webhook handler error:', {
      eventId: event.id,
      eventType: event.event_type,
      subscriptionId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Capture in Sentry with context
    Sentry.captureException(error, {
      tags: {
        webhookHandler: 'handleSubscriptionCancelled',
        eventType: event.event_type,
      },
      extra: {
        eventId: event.id,
        subscriptionId,
        userId,
        resource: event.resource,
      },
    });

    // Re-throw with user-friendly message
    throw new Error(
      `Unable to process subscription cancellation. Please contact support with reference: ${event.id}`
    );
  }
}
