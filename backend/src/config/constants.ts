/**
 * Application-wide constants and configuration values
 */

/**
 * PayPal Webhook Event Types
 * @see https://developer.paypal.com/api/rest/webhooks/event-names/
 */
export const PAYPAL_WEBHOOK_EVENTS = {
  // Payment events
  PAYMENT_CAPTURE_COMPLETED: 'PAYMENT.CAPTURE.COMPLETED',
  PAYMENT_CAPTURE_DENIED: 'PAYMENT.CAPTURE.DENIED',
  PAYMENT_CAPTURE_PENDING: 'PAYMENT.CAPTURE.PENDING',
  PAYMENT_CAPTURE_REFUNDED: 'PAYMENT.CAPTURE.REFUNDED',
  PAYMENT_CAPTURE_REVERSED: 'PAYMENT.CAPTURE.REVERSED',

  // Checkout events
  CHECKOUT_ORDER_APPROVED: 'CHECKOUT.ORDER.APPROVED',
  CHECKOUT_ORDER_COMPLETED: 'CHECKOUT.ORDER.COMPLETED',

  // Billing subscription events
  BILLING_SUBSCRIPTION_CREATED: 'BILLING.SUBSCRIPTION.CREATED',
  BILLING_SUBSCRIPTION_ACTIVATED: 'BILLING.SUBSCRIPTION.ACTIVATED',
  BILLING_SUBSCRIPTION_UPDATED: 'BILLING.SUBSCRIPTION.UPDATED',
  BILLING_SUBSCRIPTION_CANCELLED: 'BILLING.SUBSCRIPTION.CANCELLED',
  BILLING_SUBSCRIPTION_SUSPENDED: 'BILLING.SUBSCRIPTION.SUSPENDED',
  BILLING_SUBSCRIPTION_PAYMENT_FAILED: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
} as const;

/**
 * Payment provider identifiers
 */
export const PAYMENT_PROVIDERS = {
  PAYPAL: 'paypal',
  NOWPAYMENTS: 'crypto',
} as const;

/**
 * Subscription plan types
 */
export const PLAN_TYPES = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

/**
 * Subscription plan names
 */
export const PLAN_NAMES = {
  PREMIUM_MONTHLY: 'premium_monthly',
  PREMIUM_YEARLY: 'premium_yearly',
} as const;

/**
 * Payment statuses
 */
export const PAYMENT_STATUSES = {
  CONFIRMED: 'confirmed',
  PENDING: 'pending',
  FAILED: 'failed',
} as const;

/**
 * NOWPayments statuses
 */
export const NOWPAYMENTS_STATUSES = {
  FINISHED: 'finished',
  CONFIRMED: 'confirmed',
  PENDING: 'pending',
  FAILED: 'failed',
} as const;
