import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { Payment as PrismaPayment, PaymentStatus } from '@prisma/client';

export type Payment = PrismaPayment;

export interface UpdatePaymentFromWebhookData {
  paymentId: string;
  status: PaymentStatus;
  transactionId: string;
  webhookEventId: string;
}

export class PaymentService {
  /**
   * Update payment record from webhook event data
   */
  async updatePaymentFromWebhook(data: UpdatePaymentFromWebhookData): Promise<Payment> {
    try {
      const payment = await prisma.$transaction(async (tx) => {
        // Verify payment exists
        const existingPayment = await tx.payment.findUnique({
          where: { id: data.paymentId },
        });

        if (!existingPayment) {
          logger.error({ paymentId: data.paymentId }, 'Payment not found');
          throw new Error('Payment not found');
        }

        // Update payment record with webhook data
        const updatedPayment = await tx.payment.update({
          where: { id: data.paymentId },
          data: {
            status: data.status,
            externalId: data.transactionId,
            webhookEventId: data.webhookEventId,
            confirmedAt: data.status === PaymentStatus.confirmed ? new Date() : null,
          },
        });

        logger.info(
          {
            paymentId: data.paymentId,
            status: data.status,
            transactionId: data.transactionId,
            webhookEventId: data.webhookEventId,
          },
          'Payment updated from webhook'
        );

        return updatedPayment;
      });

      return payment;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { payment_operation: 'webhook_update' },
      });
      logger.error({ error, paymentId: data.paymentId }, 'Failed to update payment from webhook');
      throw error;
    }
  }
}

export default new PaymentService();
