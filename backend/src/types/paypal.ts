/**
 * PayPal Webhook Types
 * Comprehensive TypeScript definitions for PayPal webhook events
 */

/**
 * PayPal Webhook Event Types
 */
export enum PayPalWebhookEventType {
  // Payment events
  PAYMENT_AUTHORIZATION_CREATED = 'PAYMENT.AUTHORIZATION.CREATED',
  PAYMENT_AUTHORIZATION_VOIDED = 'PAYMENT.AUTHORIZATION.VOIDED',
  PAYMENT_CAPTURE_COMPLETED = 'PAYMENT.CAPTURE.COMPLETED',
  PAYMENT_CAPTURE_DENIED = 'PAYMENT.CAPTURE.DENIED',
  PAYMENT_CAPTURE_PENDING = 'PAYMENT.CAPTURE.PENDING',
  PAYMENT_CAPTURE_REFUNDED = 'PAYMENT.CAPTURE.REFUNDED',
  PAYMENT_CAPTURE_REVERSED = 'PAYMENT.CAPTURE.REVERSED',

  // Checkout events
  CHECKOUT_ORDER_APPROVED = 'CHECKOUT.ORDER.APPROVED',
  CHECKOUT_ORDER_COMPLETED = 'CHECKOUT.ORDER.COMPLETED',
  CHECKOUT_ORDER_PROCESSED = 'CHECKOUT.ORDER.PROCESSED',
  CHECKOUT_ORDER_SAVED = 'CHECKOUT.ORDER.SAVED',

  // Billing subscription events
  BILLING_SUBSCRIPTION_CREATED = 'BILLING.SUBSCRIPTION.CREATED',
  BILLING_SUBSCRIPTION_ACTIVATED = 'BILLING.SUBSCRIPTION.ACTIVATED',
  BILLING_SUBSCRIPTION_UPDATED = 'BILLING.SUBSCRIPTION.UPDATED',
  BILLING_SUBSCRIPTION_EXPIRED = 'BILLING.SUBSCRIPTION.EXPIRED',
  BILLING_SUBSCRIPTION_CANCELLED = 'BILLING.SUBSCRIPTION.CANCELLED',
  BILLING_SUBSCRIPTION_SUSPENDED = 'BILLING.SUBSCRIPTION.SUSPENDED',
  BILLING_SUBSCRIPTION_PAYMENT_FAILED = 'BILLING.SUBSCRIPTION.PAYMENT.FAILED',

  // Customer dispute events
  CUSTOMER_DISPUTE_CREATED = 'CUSTOMER.DISPUTE.CREATED',
  CUSTOMER_DISPUTE_RESOLVED = 'CUSTOMER.DISPUTE.RESOLVED',
  CUSTOMER_DISPUTE_UPDATED = 'CUSTOMER.DISPUTE.UPDATED',

  // Merchant onboarding events
  MERCHANT_ONBOARDING_COMPLETED = 'MERCHANT.ONBOARDING.COMPLETED',
  MERCHANT_PARTNER_CONSENT_REVOKED = 'MERCHANT.PARTNER-CONSENT.REVOKED',

  // Invoice events
  INVOICING_INVOICE_PAID = 'INVOICING.INVOICE.PAID',
  INVOICING_INVOICE_CANCELLED = 'INVOICING.INVOICE.CANCELLED',
  INVOICING_INVOICE_REFUNDED = 'INVOICING.INVOICE.REFUNDED',
}

/**
 * PayPal Money Object
 */
export interface PayPalMoney {
  currency_code: string;
  value: string;
}

/**
 * PayPal Link Object
 */
export interface PayPalLink {
  href: string;
  rel: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
}

/**
 * PayPal Name Object
 */
export interface PayPalName {
  given_name?: string;
  surname?: string;
  full_name?: string;
}

/**
 * PayPal Address Object
 */
export interface PayPalAddress {
  address_line_1?: string;
  address_line_2?: string;
  admin_area_1?: string;
  admin_area_2?: string;
  postal_code?: string;
  country_code: string;
}

/**
 * PayPal Payer Object
 */
export interface PayPalPayer {
  email_address?: string;
  payer_id?: string;
  name?: PayPalName;
  address?: PayPalAddress;
}

/**
 * PayPal Amount Breakdown
 */
export interface PayPalAmountBreakdown {
  item_total?: PayPalMoney;
  shipping?: PayPalMoney;
  handling?: PayPalMoney;
  tax_total?: PayPalMoney;
  insurance?: PayPalMoney;
  shipping_discount?: PayPalMoney;
  discount?: PayPalMoney;
}

/**
 * PayPal Amount Object
 */
export interface PayPalAmount {
  currency_code: string;
  value: string;
  breakdown?: PayPalAmountBreakdown;
}

/**
 * PayPal Purchase Unit
 */
export interface PayPalPurchaseUnit {
  reference_id?: string;
  amount: PayPalAmount;
  payee?: {
    email_address?: string;
    merchant_id?: string;
  };
  description?: string;
  custom_id?: string;
  invoice_id?: string;
  soft_descriptor?: string;
  payments?: {
    captures?: PayPalCapture[];
    refunds?: PayPalRefund[];
    authorizations?: PayPalAuthorization[];
  };
}

/**
 * PayPal Capture Object
 */
export interface PayPalCapture {
  id: string;
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED';
  amount: PayPalMoney;
  final_capture?: boolean;
  seller_protection?: {
    status: string;
    dispute_categories?: string[];
  };
  seller_receivable_breakdown?: {
    gross_amount: PayPalMoney;
    paypal_fee: PayPalMoney;
    net_amount: PayPalMoney;
  };
  invoice_id?: string;
  custom_id?: string;
  create_time: string;
  update_time: string;
  links?: PayPalLink[];
}

/**
 * PayPal Authorization Object
 */
export interface PayPalAuthorization {
  id: string;
  status: 'CREATED' | 'CAPTURED' | 'DENIED' | 'EXPIRED' | 'PARTIALLY_CAPTURED' | 'VOIDED' | 'PENDING';
  amount: PayPalMoney;
  invoice_id?: string;
  custom_id?: string;
  seller_protection?: {
    status: string;
    dispute_categories?: string[];
  };
  expiration_time?: string;
  create_time: string;
  update_time: string;
  links?: PayPalLink[];
}

/**
 * PayPal Refund Object
 */
export interface PayPalRefund {
  id: string;
  status: 'COMPLETED' | 'CANCELLED' | 'PENDING';
  amount: PayPalMoney;
  invoice_id?: string;
  custom_id?: string;
  seller_payable_breakdown?: {
    gross_amount: PayPalMoney;
    paypal_fee: PayPalMoney;
    net_amount: PayPalMoney;
    total_refunded_amount: PayPalMoney;
  };
  create_time: string;
  update_time: string;
  links?: PayPalLink[];
}

/**
 * PayPal Order Resource
 */
export interface PayPalOrder {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  intent: 'CAPTURE' | 'AUTHORIZE';
  payer?: PayPalPayer;
  purchase_units: PayPalPurchaseUnit[];
  create_time: string;
  update_time: string;
  links?: PayPalLink[];
}

/**
 * PayPal Subscription Resource
 */
export interface PayPalSubscription {
  id: string;
  plan_id: string;
  status: 'APPROVAL_PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
  status_update_time?: string;
  start_time?: string;
  quantity?: string;
  shipping_amount?: PayPalMoney;
  subscriber?: {
    name?: PayPalName;
    email_address?: string;
    payer_id?: string;
    shipping_address?: PayPalAddress;
  };
  billing_info?: {
    outstanding_balance?: PayPalMoney;
    cycle_executions?: Array<{
      tenure_type: string;
      sequence: number;
      cycles_completed: number;
      cycles_remaining?: number;
      total_cycles?: number;
    }>;
    last_payment?: {
      amount: PayPalMoney;
      time: string;
    };
    next_billing_time?: string;
    failed_payments_count?: number;
  };
  create_time: string;
  update_time: string;
  links?: PayPalLink[];
}

/**
 * PayPal Dispute Resource
 */
export interface PayPalDispute {
  dispute_id: string;
  reason: string;
  status: 'OPEN' | 'WAITING_FOR_BUYER_RESPONSE' | 'WAITING_FOR_SELLER_RESPONSE' | 'UNDER_REVIEW' | 'RESOLVED' | 'OTHER';
  dispute_amount: PayPalMoney;
  dispute_outcome?: {
    outcome_code: string;
    amount_refunded?: PayPalMoney;
  };
  dispute_life_cycle_stage: string;
  dispute_channel: string;
  create_time: string;
  update_time: string;
  links?: PayPalLink[];
}

/**
 * PayPal Resource Union Type
 */
export type PayPalResource =
  | PayPalOrder
  | PayPalCapture
  | PayPalAuthorization
  | PayPalRefund
  | PayPalSubscription
  | PayPalDispute;

/**
 * PayPal Webhook Event Structure
 */
export interface PayPalWebhookEvent {
  id: string;
  event_version: string;
  create_time: string;
  resource_type: string;
  resource_version?: string;
  event_type: PayPalWebhookEventType | string;
  summary: string;
  resource: PayPalResource;
  links?: PayPalLink[];
}

/**
 * PayPal Webhook Verification Headers
 */
export interface PayPalWebhookHeaders {
  'paypal-transmission-id': string;
  'paypal-transmission-time': string;
  'paypal-transmission-sig': string;
  'paypal-cert-url': string;
  'paypal-auth-algo': string;
}

/**
 * PayPal Webhook Verification Request
 */
export interface PayPalWebhookVerificationRequest {
  transmission_id: string;
  transmission_time: string;
  cert_url: string;
  auth_algo: string;
  transmission_sig: string;
  webhook_id: string;
  webhook_event: PayPalWebhookEvent;
}

/**
 * PayPal Webhook Verification Result
 */
export interface PayPalWebhookVerificationResult {
  verification_status: 'SUCCESS' | 'FAILURE';
}

/**
 * PayPal Webhook Verification Response (Extended)
 */
export interface PayPalWebhookVerificationResponse {
  verified: boolean;
  status?: 'SUCCESS' | 'FAILURE';
  error?: string;
}

/**
 * Type guard to check if resource is a PayPal Order
 */
export function isPayPalOrder(resource: PayPalResource): resource is PayPalOrder {
  return 'purchase_units' in resource && 'intent' in resource;
}

/**
 * Type guard to check if resource is a PayPal Subscription
 */
export function isPayPalSubscription(resource: PayPalResource): resource is PayPalSubscription {
  return 'plan_id' in resource && 'billing_info' in resource;
}

/**
 * Type guard to check if resource is a PayPal Capture
 */
export function isPayPalCapture(resource: PayPalResource): resource is PayPalCapture {
  return 'seller_receivable_breakdown' in resource;
}

/**
 * Type guard to check if resource is a PayPal Dispute
 */
export function isPayPalDispute(resource: PayPalResource): resource is PayPalDispute {
  return 'dispute_id' in resource;
}
