// @ts-nocheck
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export interface WebhookEvent {
  id: string;
  eventId: string;
  eventType: string;
  payload: any;
  verified: boolean;
  source: string;
  processedAt: Date | null;
  createdAt: Date;
}

export interface StoreWebhookEventData {
  eventId: string;
  eventType: string;
  payload: any;
  verified: boolean;
  source: string;
}

export class WebhookEventService {
  /**
   * Store a new webhook event
   */
  async storeWebhookEvent(data: StoreWebhookEventData): Promise<WebhookEvent> {
    try {
      const webhookEvent = await prisma.$transaction(async (tx) => {
        // Check if event already exists to prevent duplicates
        const existing = await tx.webhookEvent.findUnique({
          where: { eventId: data.eventId },
        });

        if (existing) {
          logger.warn({ eventId: data.eventId }, 'Webhook event already exists');
          return existing as WebhookEvent;
        }

        // Create new webhook event
        const event = await tx.webhookEvent.create({
          data: {
            eventId: data.eventId,
            eventType: data.eventType,
            payload: data.payload,
            verified: data.verified,
            source: data.source,
          },
        });

        logger.info(
          { eventId: data.eventId, eventType: data.eventType, source: data.source },
          'Webhook event stored'
        );

        return event as WebhookEvent;
      });

      return webhookEvent;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { webhook_operation: 'store', source: data.source },
      });
      logger.error({ error, eventId: data.eventId }, 'Failed to store webhook event');
      throw error;
    }
  }

  /**
   * Check if a webhook event exists by eventId
   */
  async checkEventExists(eventId: string): Promise<boolean> {
    try {
      const event = await prisma.webhookEvent.findUnique({
        where: { eventId },
        select: { id: true },
      });

      return event !== null;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { webhook_operation: 'check_exists' },
      });
      logger.error({ error, eventId }, 'Failed to check webhook event existence');
      throw error;
    }
  }

  /**
   * Check if a webhook event has already been processed
   */
  async isEventProcessed(eventId: string): Promise<boolean> {
    try {
      const event = await prisma.webhookEvent.findUnique({
        where: { eventId },
        select: { verified: true, processedAt: true },
      });

      return event !== null && event.verified === true && event.processedAt !== null;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { webhook_operation: 'is_event_processed' },
      });
      logger.error({ error, eventId }, 'Failed to check if webhook event is processed');
      throw error;
    }
  }

  /**
   * Mark a webhook event as processed
   */
  async markEventProcessed(eventId: string): Promise<WebhookEvent> {
    try {
      const webhookEvent = await prisma.$transaction(async (tx) => {
        const event = await tx.webhookEvent.update({
          where: { eventId },
          data: {
            processedAt: new Date(),
          },
        });

        logger.info({ eventId }, 'Webhook event marked as processed');

        return event as WebhookEvent;
      });

      return webhookEvent;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { webhook_operation: 'mark_processed' },
      });
      logger.error({ error, eventId }, 'Failed to mark webhook event as processed');
      throw error;
    }
  }

  /**
   * Get webhook event by eventId
   */
  async getEventByEventId(eventId: string): Promise<WebhookEvent | null> {
    try {
      const event = await prisma.webhookEvent.findUnique({
        where: { eventId },
      });

      return event as WebhookEvent | null;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { webhook_operation: 'get_by_event_id' },
      });
      logger.error({ error, eventId }, 'Failed to get webhook event');
      throw error;
    }
  }

  /**
   * Get webhook event by internal ID
   */
  async getEventById(id: string): Promise<WebhookEvent | null> {
    try {
      const event = await prisma.webhookEvent.findUnique({
        where: { id },
      });

      return event as WebhookEvent | null;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { webhook_operation: 'get_by_id' },
      });
      logger.error({ error, id }, 'Failed to get webhook event by ID');
      throw error;
    }
  }
}

export default new WebhookEventService();
