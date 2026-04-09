import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export interface Subscription {
  id: string;
  userId: string;
  plan: string;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivateSubscriptionData {
  userId: string;
  plan: string;
  durationDays: number;
}

export interface WebhookSubscriptionData {
  userId: string;
  plan: string;
  paymentId: string;
  durationDays: number;
}

export interface ActivationResult {
  success: boolean;
  subscription?: Subscription;
  error?: string;
}

export class SubscriptionService {
  /**
   * Activate a subscription
   */
  async activateSubscription(data: ActivateSubscriptionData): Promise<Subscription> {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + data.durationDays);

      const subscription = await prisma.subscription.upsert({
        where: { userId: data.userId },
        update: {
          plan: data.plan,
          status: 'active',
          expiresAt,
          updatedAt: new Date(),
        },
        create: {
          userId: data.userId,
          plan: data.plan,
          status: 'active',
          expiresAt,
        },
      });

      logger.info({ userId: data.userId, plan: data.plan }, 'Subscription activated');
      return subscription as Subscription;
    } catch (error) {
      Sentry.captureException(error, { tags: { subscription_event: 'activation' } });
      logger.error({ error, userId: data.userId }, 'Subscription activation failed');
      throw error;
    }
  }

  /**
   * Activate a subscription from verified webhook data
   */
  async activateSubscriptionFromWebhook(data: WebhookSubscriptionData): Promise<ActivationResult> {
    try {
      // Validate subscription doesn't already exist
      const existingSubscription = await prisma.subscription.findUnique({
        where: { userId: data.userId },
      });

      if (existingSubscription && existingSubscription.status === 'active' && existingSubscription.plan === data.plan) {
        logger.warn({ userId: data.userId, plan: data.plan }, 'Active subscription with same plan already exists, preventing duplicate activation');
        return {
          success: true,
          subscription: existingSubscription as Subscription,
        };
      }

      // Check payment record exists
      const payment = await prisma.payment.findUnique({
        where: { id: data.paymentId },
      });

      if (!payment) {
        logger.error({ paymentId: data.paymentId }, 'Payment record not found');
        throw new Error('Payment record not found');
      }

      // Verify payment status is completed or pending
      const validStatuses = ['completed', 'pending'];
      if (!validStatuses.includes(payment.status)) {
        logger.error(
          { paymentId: data.paymentId, status: payment.status, userId: data.userId },
          'Payment verification failed: invalid payment status'
        );
        throw new Error(`Payment verification failed: status is '${payment.status}', expected 'completed' or 'pending'`);
      }

      // Log successful payment verification
      logger.info(
        { paymentId: data.paymentId, status: payment.status, userId: data.userId },
        'Payment verification successful'
      );

      // Set startDate and calculate endDate
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + data.durationDays);

      // Create/update subscription with status 'active'
      const subscription = await prisma.subscription.upsert({
        where: { userId: data.userId },
        update: {
          plan: data.plan,
          status: 'active',
          expiresAt: endDate,
          updatedAt: startDate,
        },
        create: {
          userId: data.userId,
          plan: data.plan,
          status: 'active',
          expiresAt: endDate,
          createdAt: startDate,
        },
      });

      logger.info(
        { userId: data.userId, plan: data.plan, paymentId: data.paymentId },
        'Subscription activated from webhook'
      );

      return {
        success: true,
        subscription: subscription as Subscription,
      };
    } catch (error) {
      Sentry.captureException(error, { tags: { subscription_event: 'webhook_activation' } });
      logger.error({ error, userId: data.userId }, 'Webhook subscription activation failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Expire a subscription
   */
  async expireSubscription(userId: string): Promise<Subscription> {
    try {
      const subscription = await prisma.subscription.update({
        where: { userId },
        data: {
          status: 'expired',
          updatedAt: new Date(),
        },
      });

      logger.info({ userId }, 'Subscription expired');
      return subscription as Subscription;
    } catch (error) {
      Sentry.captureException(error, { tags: { subscription_event: 'expiry' } });
      logger.error({ error, userId }, 'Subscription expiry failed');
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(userId: string, reason?: string): Promise<Subscription> {
    try {
      const subscription = await prisma.subscription.update({
        where: { userId },
        data: {
          status: 'cancelled',
          updatedAt: new Date(),
        },
      });

      logger.info({ userId, reason }, 'Subscription cancelled');
      return subscription as Subscription;
    } catch (error) {
      Sentry.captureException(error, { tags: { subscription_event: 'cancellation' } });
      logger.error({ error, userId }, 'Subscription cancellation failed');
      throw error;
    }
  }

  /**
   * Get user subscription
   */
  async getUserSubscription(userId: string): Promise<Subscription | null> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      return subscription as Subscription | null;
    } catch (error) {
      Sentry.captureException(error, { tags: { subscription_event: 'fetch' } });
      logger.error({ error, userId }, 'Failed to fetch subscription');
      throw error;
    }
  }

  /**
   * Check and expire subscriptions that have passed their expiry date
   */
  async checkAndExpireSubscriptions(): Promise<number> {
    try {
      const now = new Date();
      const result = await prisma.subscription.updateMany({
        where: {
          status: 'active',
          expiresAt: {
            lte: now,
          },
        },
        data: {
          status: 'expired',
          updatedAt: now,
        },
      });

      logger.info({ count: result.count }, 'Expired subscriptions');
      return result.count;
    } catch (error) {
      Sentry.captureException(error, { tags: { subscription_event: 'expiry' } });
      logger.error({ error }, 'Failed to expire subscriptions');
      throw error;
    }
  }
}

export default new SubscriptionService();
