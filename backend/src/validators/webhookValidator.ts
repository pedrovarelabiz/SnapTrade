const ALLOWED_PAYPAL_EVENT_TYPES = [
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.UPDATED',
  'PAYMENT.SALE.COMPLETED',
  'PAYMENT.SALE.REFUNDED',
  'PAYMENT.SALE.REVERSED',
] as const;

export type PayPalEventType = typeof ALLOWED_PAYPAL_EVENT_TYPES[number];

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that a webhook event_type is in the whitelist of expected PayPal event types
 * @param eventType - The event_type from the webhook payload
 * @returns Validation result object with valid flag and optional error message
 */
export function validatePayPalEventType(eventType: string): WebhookValidationResult {
  if (!eventType) {
    return {
      valid: false,
      error: 'Event type is required',
    };
  }

  if (!ALLOWED_PAYPAL_EVENT_TYPES.includes(eventType as PayPalEventType)) {
    return {
      valid: false,
      error: `Unexpected event type: ${eventType}. Expected one of: ${ALLOWED_PAYPAL_EVENT_TYPES.join(', ')}`,
    };
  }

  return {
    valid: true,
  };
}

/**
 * Validates that a webhook payload has the required PayPal schema fields
 * @param payload - The webhook payload object
 * @returns Validation result object with valid flag and optional error message
 */
export function validateWebhookPayload(payload: unknown): WebhookValidationResult {
  if (!payload || typeof payload !== 'object') {
    return {
      valid: false,
      error: 'Webhook payload must be an object',
    };
  }

  const payloadObj = payload as Record<string, unknown>;

  if (!payloadObj.resource) {
    return {
      valid: false,
      error: 'Missing required field: resource',
    };
  }

  if (!payloadObj.event_type) {
    return {
      valid: false,
      error: 'Missing required field: event_type',
    };
  }

  if (!payloadObj.id) {
    return {
      valid: false,
      error: 'Missing required field: id',
    };
  }

  return {
    valid: true,
  };
}
