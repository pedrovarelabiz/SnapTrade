# Webhook Security Documentation

## Table of Contents

1. [Overview](#overview)
2. [PayPal Webhook Verification](#paypal-webhook-verification)
3. [Signature Verification Process](#signature-verification-process)
4. [Required Environment Variables](#required-environment-variables)
5. [Idempotency Handling](#idempotency-handling)
6. [Supported Event Types](#supported-event-types)
7. [Error Codes](#error-codes)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Security Best Practices](#security-best-practices)

---

## Overview

The SnapTrade backend implements robust webhook security for PayPal and NOWPayments integrations. This documentation covers the complete webhook verification flow, security mechanisms, error handling, and troubleshooting procedures.

### Security Architecture

The webhook system implements multiple security layers:

1. **Signature Verification** - Cryptographic validation of webhook authenticity
2. **Timestamp Validation** - Replay attack prevention via time-based checks
3. **Idempotency** - Duplicate event detection and prevention
4. **Rate Limiting** - Protection against webhook flooding attacks
5. **Event Type Validation** - Whitelist-based event filtering
6. **Payload Schema Validation** - Strict payload structure enforcement

---

## PayPal Webhook Verification

### How PayPal Webhook Verification Works

PayPal webhooks use a **signature-based verification** mechanism to ensure webhooks are authentic and haven't been tampered with. The verification process involves:

1. **PayPal sends webhook** with special headers containing signature information
2. **Backend receives webhook** and extracts signature headers
3. **Backend calls PayPal API** to verify the signature
4. **PayPal validates** the signature using their private key
5. **Backend processes event** only if verification succeeds

### Verification Flow Diagram

```
┌─────────┐                    ┌──────────────┐                    ┌─────────────┐
│ PayPal  │                    │   Backend    │                    │ PayPal API  │
└────┬────┘                    └──────┬───────┘                    └──────┬──────┘
     │                                │                                   │
     │  POST /webhooks/paypal         │                                   │
     │  Headers:                      │                                   │
     │  - paypal-transmission-id      │                                   │
     │  - paypal-transmission-time    │                                   │
     │  - paypal-transmission-sig     │                                   │
     │  - paypal-cert-url            │                                   │
     │  - paypal-auth-algo           │                                   │
     │ ─────────────────────────────> │                                   │
     │                                │                                   │
     │                                │  POST /v1/notifications/          │
     │                                │       verify-webhook-signature    │
     │                                │  Body:                            │
     │                                │  - auth_algo                      │
     │                                │  - cert_url                       │
     │                                │  - transmission_id                │
     │                                │  - transmission_sig               │
     │                                │  - transmission_time              │
     │                                │  - webhook_id                     │
     │                                │  - webhook_event                  │
     │                                │ ───────────────────────────────>  │
     │                                │                                   │
     │                                │  Response:                        │
     │                                │  {                                │
     │                                │    verification_status: "SUCCESS" │
     │                                │  }                                │
     │                                │ <─────────────────────────────────│
     │                                │                                   │
     │                                │  Process event                    │
     │                                │  (only if verified)               │
     │                                │                                   │
     │  200 OK                        │                                   │
     │ <───────────────────────────── │                                   │
```

### Implementation

The verification is implemented in `/backend/src/utils/webhook-verification.ts`:

```typescript
export async function verifyPayPalWebhookSignature(
  headers: WebhookHeaders,
  body: string | Record<string, unknown>,
  webhookId: string
): Promise<WebhookVerificationResult>
```

**Key Features:**
- Uses PayPal SDK for signature verification
- Supports both sandbox and live environments
- Validates all required headers before verification
- Returns detailed error information on failure
- Automatically switches between environments based on `PAYPAL_MODE`

---

## Signature Verification Process

### Step-by-Step Verification

#### 1. Header Validation

The system first validates that all required PayPal headers are present:

```typescript
Required Headers:
- paypal-transmission-id   // Unique ID for this transmission
- paypal-transmission-time // ISO 8601 timestamp
- paypal-transmission-sig  // HMAC signature
- paypal-cert-url          // URL to PayPal certificate
- paypal-auth-algo         // Algorithm used (e.g., SHA256withRSA)
```

**Implementation:** `validateWebhookHeaders()` in `webhook-verification.ts`

**Error Response if missing:**
```json
{
  "verified": false,
  "error": {
    "code": "MISSING_HEADER",
    "message": "Missing required header: paypal-transmission-id"
  }
}
```

#### 2. Timestamp Validation

Prevents replay attacks by validating webhook age:

```typescript
Default Tolerance: 5 minutes (300,000ms)
Clock Skew Allowance: 1 minute future timestamps allowed
```

**Implementation:** `validateWebhookTimestamp()` in `webhook-verification.ts`

**Validation Rules:**
- Timestamp must be valid ISO 8601 format
- Timestamp cannot be more than 1 minute in the future
- Timestamp cannot be older than 5 minutes
- Protects against replay attacks

**Error Response if too old:**
```json
{
  "isValid": false,
  "error": "Webhook timestamp is too old (age: 350s, max: 300s)"
}
```

#### 3. PayPal API Verification

The backend makes an API call to PayPal to verify the signature:

**Request to PayPal:**
```http
POST https://api-m.paypal.com/v1/notifications/verify-webhook-signature
Content-Type: application/json
Authorization: Bearer <access_token>

{
  "auth_algo": "SHA256withRSA",
  "cert_url": "https://api.paypal.com/v1/notifications/certs/...",
  "transmission_id": "8c7f0e90-...",
  "transmission_sig": "lmF3Ek...",
  "transmission_time": "2026-03-23T10:30:00Z",
  "webhook_id": "WH-2W...",
  "webhook_event": { ... }
}
```

**Success Response from PayPal:**
```json
{
  "verification_status": "SUCCESS"
}
```

**Failure Response from PayPal:**
```json
{
  "verification_status": "FAILURE",
  "message": "Invalid signature"
}
```

#### 4. Event Type Validation

Only whitelisted event types are processed:

**Implementation:** `validatePayPalEventType()` in `webhookValidator.ts`

**Error Response:**
```json
{
  "valid": false,
  "error": "Unexpected event type: UNKNOWN.EVENT. Expected one of: BILLING.SUBSCRIPTION.ACTIVATED, ..."
}
```

#### 5. Payload Schema Validation

Validates required fields are present:

**Implementation:** `validateWebhookPayload()` in `webhookValidator.ts`

**Required Fields:**
- `resource` - The resource object (subscription, payment, etc.)
- `event_type` - The event type string
- `id` - Unique event identifier

**Error Response:**
```json
{
  "valid": false,
  "error": "Missing required field: resource"
}
```

---

## Required Environment Variables

### PayPal Configuration

All PayPal webhook verification requires these environment variables:

```bash
# PayPal REST API Credentials
PAYPAL_CLIENT_ID=<your-paypal-client-id>
# Required for API authentication to verify webhooks
# Obtain from: PayPal Developer Dashboard > Apps & Credentials

PAYPAL_CLIENT_SECRET=<your-paypal-client-secret>
# Required for API authentication to verify webhooks
# Obtain from: PayPal Developer Dashboard > Apps & Credentials

PAYPAL_WEBHOOK_ID=<your-paypal-webhook-id>
# Required for signature verification
# Obtain from: PayPal Developer Dashboard > Webhooks > Webhook Details
# Format: WH-XXXXXXXXXXXXXXXXXXXXX

PAYPAL_MODE=sandbox
# Required to determine which PayPal environment to use
# Values: 'sandbox' | 'live'
# Use 'sandbox' for testing, 'live' for production
```

### Setup Instructions

#### 1. Create PayPal App

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)
2. Navigate to **Apps & Credentials**
3. Select **Sandbox** or **Live** environment
4. Click **Create App**
5. Copy the **Client ID** and **Client Secret**

#### 2. Create Webhook

1. In the same app, scroll to **Webhooks** section
2. Click **Add Webhook**
3. Enter webhook URL: `https://yourdomain.com/webhooks/paypal`
4. Select events to listen to (see [Supported Event Types](#supported-event-types))
5. Click **Save**
6. Copy the **Webhook ID** (format: `WH-...`)

#### 3. Configure Environment

Add to your `.env` file:

```bash
PAYPAL_CLIENT_ID=AYourClientID123...
PAYPAL_CLIENT_SECRET=EYourSecret456...
PAYPAL_WEBHOOK_ID=WH-2WR32451HC0233532-67976317FL4543714
PAYPAL_MODE=sandbox
```

**Security Warning:**
- Never commit `.env` to version control
- Rotate credentials if exposed
- Use different credentials for sandbox and live environments

---

## Idempotency Handling

### Why Idempotency Matters

Webhooks can be delivered multiple times due to:
- Network retries
- PayPal retry logic (up to 7 days)
- System failures mid-processing

**Without idempotency:** A single payment could activate a subscription multiple times, causing data inconsistency.

### Implementation

The system uses **database-level idempotency** to prevent duplicate processing:

#### 1. Event Storage

**Service:** `WebhookEventService` in `services/webhookEventService.ts`

**Database Table:** `webhookEvent`
```sql
CREATE TABLE webhook_event (
  id         UUID PRIMARY KEY,
  event_id   VARCHAR(255) UNIQUE NOT NULL,  -- PayPal event.id
  event_type VARCHAR(100) NOT NULL,
  payload    JSONB NOT NULL,
  verified   BOOLEAN DEFAULT false,
  source     VARCHAR(50) NOT NULL,          -- 'paypal' or 'crypto'
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Unique Constraint:** `event_id` has a unique index, preventing duplicate storage.

#### 2. Idempotency Flow

```typescript
// Step 1: Check if event already exists
const exists = await webhookEventService.checkEventExists(event.id);
if (exists) {
  logger.warn({ eventId: event.id }, 'Duplicate webhook event ignored');
  return res.status(200).json({ success: true, message: 'Already processed' });
}

// Step 2: Store event (fails if duplicate due to unique constraint)
await webhookEventService.storeWebhookEvent({
  eventId: event.id,
  eventType: event.event_type,
  payload: event,
  verified: true,
  source: 'paypal'
});

// Step 3: Process event
await handleEvent(event);

// Step 4: Mark as processed
await webhookEventService.markEventProcessed(event.id);
```

#### 3. Transaction Safety

All webhook handlers use database transactions:

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Validate payment record exists
  const payment = await tx.payment.findFirst({
    where: { externalId: subscriptionId, status: 'pending' }
  });

  // 2. Update subscription
  await tx.subscription.update({ ... });

  // 3. Update payment
  await tx.payment.update({ ... });

  // 4. Log webhook event
  await tx.webhookEvent.create({ ... });
});
// Automatic rollback on error - no partial updates
```

**Benefits:**
- Atomic operations (all-or-nothing)
- Automatic rollback on error
- No partial state updates
- Race condition protection

#### 4. Duplicate Detection Methods

**Method 1: Event ID Check (Primary)**
```typescript
const isProcessed = await webhookEventService.isEventProcessed(eventId);
```

**Method 2: Database Unique Constraint (Fallback)**
```typescript
try {
  await tx.webhookEvent.create({ data: { eventId, ... } });
} catch (error) {
  if (error.code === 'P2002') {
    // Unique constraint violation - duplicate event
    return 'already_processed';
  }
}
```

**Method 3: Payment Status Check**
```typescript
const payment = await tx.payment.findFirst({
  where: { externalId: subscriptionId, status: 'pending' }
});

if (!payment) {
  // Check if already processed
  const anyPayment = await tx.payment.findUnique({
    where: { externalId: subscriptionId }
  });

  if (anyPayment && anyPayment.status === 'confirmed') {
    throw new Error('Payment already confirmed');
  }
}
```

---

## Supported Event Types

### PayPal Events

The system supports these PayPal event types (whitelist):

| Event Type | Description | Handler Function | Database Impact |
|-----------|-------------|------------------|-----------------|
| `BILLING.SUBSCRIPTION.ACTIVATED` | Subscription successfully activated | `handleSubscriptionActivated` | Creates/updates Subscription, updates Payment to 'confirmed', updates User role |
| `BILLING.SUBSCRIPTION.CANCELLED` | Subscription cancelled by user or PayPal | `handleSubscriptionCancelled` | Updates Subscription status to 'cancelled', sets endDate, updates Payment to 'cancelled', creates audit log |
| `BILLING.SUBSCRIPTION.SUSPENDED` | Subscription suspended (e.g., payment failure) | *(Not yet implemented)* | N/A |
| `BILLING.SUBSCRIPTION.UPDATED` | Subscription details updated | *(Not yet implemented)* | N/A |
| `PAYMENT.SALE.COMPLETED` | One-time payment completed | `handlePaymentSaleCompleted` | Updates Payment to 'completed', creates audit log |
| `PAYMENT.SALE.REFUNDED` | Payment refunded to customer | *(Not yet implemented)* | N/A |
| `PAYMENT.SALE.REVERSED` | Payment reversed (e.g., chargeback) | *(Not yet implemented)* | N/A |

**Whitelist Implementation:** See `ALLOWED_PAYPAL_EVENT_TYPES` in `validators/webhookValidator.ts`

### Event Type Validation

Any event type not in the whitelist is rejected:

```typescript
export function validatePayPalEventType(eventType: string): WebhookValidationResult {
  if (!ALLOWED_PAYPAL_EVENT_TYPES.includes(eventType as PayPalEventType)) {
    return {
      valid: false,
      error: `Unexpected event type: ${eventType}`
    };
  }
  return { valid: true };
}
```

### Adding New Event Types

To support additional event types:

1. **Add to whitelist** in `validators/webhookValidator.ts`:
   ```typescript
   const ALLOWED_PAYPAL_EVENT_TYPES = [
     'BILLING.SUBSCRIPTION.ACTIVATED',
     'YOUR.NEW.EVENT',  // Add here
   ] as const;
   ```

2. **Create handler function** in `handlers/webhookHandlers.ts`:
   ```typescript
   export async function handleYourNewEvent(
     event: PayPalWebhookEvent
   ): Promise<void> {
     // Implementation
   }
   ```

3. **Add route handler** in `routes/webhooks.ts`:
   ```typescript
   if (event_type === "YOUR.NEW.EVENT") {
     await handleYourNewEvent(verifiedPayload);
   }
   ```

4. **Update documentation** (this file)

---

## Error Codes

### Verification Error Codes

| Code | Description | HTTP Status | Resolution |
|------|-------------|-------------|------------|
| `INVALID_PARAMETERS` | Missing headers or webhookId | 400 | Check request headers and environment variables |
| `MISSING_HEADER` | Specific required header missing | 400 | Ensure all PayPal headers are present |
| `VERIFICATION_FAILED` | Signature verification failed | 401 | Check PAYPAL_WEBHOOK_ID matches dashboard, verify payload wasn't modified |
| `UNEXPECTED_RESPONSE` | PayPal API returned non-200 status | 500 | Check PayPal API status, verify credentials |
| `PAYPAL_API_ERROR` | PayPal API request failed | 500 | Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET |
| `INVALID_JSON` | Webhook body is not valid JSON | 400 | Check webhook payload format |
| `VERIFICATION_ERROR` | Generic verification error | 500 | Check logs for details |

### Timestamp Validation Errors

| Error Message | Cause | Resolution |
|--------------|-------|------------|
| `Invalid timestamp format` | Malformed timestamp | Verify PAYPAL-TRANSMISSION-TIME header format |
| `Webhook timestamp is from the future` | Clock skew > 1 minute | Synchronize server time with NTP |
| `Webhook timestamp is too old` | Webhook older than 5 minutes | Check for network delays, processing bottlenecks |

### Payload Validation Errors

| Error Message | Cause | Resolution |
|--------------|-------|------------|
| `Webhook payload must be an object` | Invalid payload type | Verify webhook body is JSON object |
| `Missing required field: resource` | Missing resource field | Check PayPal event structure |
| `Missing required field: event_type` | Missing event_type field | Check PayPal event structure |
| `Missing required field: id` | Missing event ID | Check PayPal event structure |

### Handler-Specific Errors

| Error Pattern | Source | Resolution |
|--------------|--------|------------|
| `No pending payment record found for subscription ID: {id}` | handleSubscriptionActivated | Payment must be created before webhook arrives; check payment creation flow |
| `Payment record found but status is '{status}', expected 'pending'` | handleSubscriptionActivated | Duplicate webhook or payment already processed; check idempotency |
| `Payer email mismatch: expected {email}, got {email}` | handleSubscriptionActivated | PayPal payer email doesn't match user; verify payment flow |
| `Failed to process subscription activation` | handleSubscriptionActivated | Database transaction failed; check logs for details |
| `No payment record found for sale ID: {id}` | handlePaymentSaleCompleted | Payment record missing; verify payment creation |

### HTTP Status Codes

| Status | Meaning | Response Body |
|--------|---------|---------------|
| 200 | Success, event processed | `{ "success": true, "eventId": "...", "processed": true }` |
| 400 | Validation error (bad request) | `{ "error": "Validation error" }` |
| 401 | Verification failed (unauthorized) | `{ "error": "Verification failed" }` |
| 422 | Processing error (unprocessable entity) | `{ "error": "Processing error" }` |
| 429 | Rate limit exceeded | `{ "error": "Too many requests" }` |
| 500 | Internal server error | `{ "error": "Internal error" }` |

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue 1: Webhook Verification Fails

**Symptoms:**
- Error: `VERIFICATION_FAILED`
- Logs show: `Webhook signature verification failed`

**Causes:**
1. Wrong `PAYPAL_WEBHOOK_ID` in environment
2. Mismatched environment (sandbox vs live)
3. Modified webhook payload

**Resolution:**
```bash
# 1. Verify webhook ID matches PayPal dashboard
echo $PAYPAL_WEBHOOK_ID
# Should match: WH-XXXXXXXXXXXXXXXXXXXXX

# 2. Verify environment matches
echo $PAYPAL_MODE  # Should be 'sandbox' or 'live'

# 3. Check PayPal dashboard webhook configuration
# PayPal Dashboard > Apps & Credentials > Webhooks
# Verify webhook URL and ID

# 4. Test with PayPal webhook simulator
# Dashboard > Webhooks > Test webhook
```

#### Issue 2: Duplicate Processing

**Symptoms:**
- Same event processed multiple times
- Database constraint violations
- Multiple subscriptions created

**Causes:**
1. Idempotency check bypassed
2. Race condition in concurrent webhooks
3. Database transaction not used

**Resolution:**
```typescript
// Check webhook_event table for duplicates
SELECT event_id, COUNT(*)
FROM webhook_event
GROUP BY event_id
HAVING COUNT(*) > 1;

// Verify unique constraint exists
\d webhook_event
-- Should show: UNIQUE CONSTRAINT on event_id

// Check for processing before idempotency check
await webhookEventService.checkEventExists(eventId);
```

#### Issue 3: Missing Environment Variables

**Symptoms:**
- Error: `INVALID_PARAMETERS`
- Error: `Missing required header`
- Null reference errors

**Causes:**
1. `.env` file not loaded
2. Missing required variables
3. Typo in variable names

**Resolution:**
```bash
# 1. Verify .env file exists
ls -la .env

# 2. Check all required variables
grep PAYPAL .env
# Should output:
# PAYPAL_CLIENT_ID=...
# PAYPAL_CLIENT_SECRET=...
# PAYPAL_WEBHOOK_ID=...
# PAYPAL_MODE=...

# 3. Restart application to reload environment
npm run dev
```

#### Issue 4: Timestamp Validation Fails

**Symptoms:**
- Error: `Webhook timestamp is too old`
- Error: `Webhook timestamp is from the future`

**Causes:**
1. Server time not synchronized
2. Processing delays
3. Network latency

**Resolution:**
```bash
# 1. Check server time
date -u
# Should match UTC time

# 2. Synchronize with NTP
sudo ntpdate -s time.nist.gov

# 3. Check processing time in logs
# Look for delays between webhook receipt and processing

# 4. Increase tolerance if needed (in webhook-verification.ts)
# Default: 5 minutes (300000ms)
validateWebhookTimestamp(time, 600000); // 10 minutes
```

#### Issue 5: Rate Limiting Triggered

**Symptoms:**
- HTTP 429 Too Many Requests
- Error: `Too many requests`

**Causes:**
1. Webhook flooding attack
2. PayPal retry storm
3. Misconfigured rate limits

**Resolution:**
```typescript
// Check webhookRateLimiter configuration
// File: middleware/webhookRateLimiter.ts

// Adjust limits if needed
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increase if legitimate traffic exceeds
});

// Monitor rate limit hits
// Check logs for patterns
grep "Rate limit exceeded" logs/*.log
```

#### Issue 6: Handler Errors

**Symptoms:**
- Error: `No pending payment record found`
- Error: `Failed to process subscription activation`

**Causes:**
1. Payment record not created before webhook
2. Database transaction failed
3. Invalid payment state

**Resolution:**
```sql
-- 1. Check payment record exists
SELECT * FROM payment
WHERE external_id = 'subscription_id_here';

-- 2. Check payment status
SELECT id, status, external_id, created_at
FROM payment
WHERE user_id = 'user_id_here'
ORDER BY created_at DESC;

-- 3. Check subscription status
SELECT * FROM subscription
WHERE user_id = 'user_id_here';

-- 4. Check webhook event log
SELECT * FROM webhook_event
WHERE external_id = 'subscription_id_here'
ORDER BY created_at DESC;
```

### Debugging Checklist

When troubleshooting webhook issues, check:

- [ ] All required environment variables are set
- [ ] `PAYPAL_WEBHOOK_ID` matches PayPal dashboard
- [ ] `PAYPAL_MODE` matches environment (sandbox/live)
- [ ] Webhook URL is publicly accessible via HTTPS
- [ ] PayPal can reach webhook endpoint (check firewall)
- [ ] Database connection is active
- [ ] Unique constraint exists on `webhook_event.event_id`
- [ ] Server time is synchronized (NTP)
- [ ] Logs show no errors before webhook processing
- [ ] Rate limiter allows sufficient requests

### Logging and Monitoring

**Enable verbose logging:**
```bash
# Set log level to debug
LOG_LEVEL=debug npm run dev
```

**Check webhook logs:**
```bash
# Filter PayPal webhook logs
grep "PayPal webhook" logs/app.log

# Check verification failures
grep "verification failed" logs/app.log

# Monitor webhook processing time
grep "Webhook.*processed" logs/app.log
```

**Monitor in Sentry:**
- Check for `webhook_verification_failure` tags
- Review webhook handler errors
- Monitor processing latency

---

## Security Best Practices

### 1. Always Verify Signatures

**Never** process webhooks without verification:

```typescript
// ❌ WRONG - Do not trust raw payload
router.post("/paypal", async (req, res) => {
  await handleEvent(req.body); // Dangerous!
});

// ✅ CORRECT - Verify first
router.post("/paypal", verifyPayPalWebhook, async (req, res) => {
  const verifiedPayload = (req as any).verifiedPayload;
  await handleEvent(verifiedPayload);
});
```

### 2. Use Environment-Specific Credentials

Separate credentials for sandbox and production:

```bash
# .env.development
PAYPAL_CLIENT_ID=sandbox_client_id
PAYPAL_WEBHOOK_ID=WH-sandbox-id
PAYPAL_MODE=sandbox

# .env.production
PAYPAL_CLIENT_ID=live_client_id
PAYPAL_WEBHOOK_ID=WH-live-id
PAYPAL_MODE=live
```

### 3. Implement Rate Limiting

Protect against webhook flooding:

```typescript
import { webhookRateLimiter } from '../middleware/webhookRateLimiter';

router.post("/paypal", webhookRateLimiter, verifyPayPalWebhook, handler);
```

### 4. Use Database Transactions

Ensure atomic operations:

```typescript
await prisma.$transaction(async (tx) => {
  await tx.payment.update({ ... });
  await tx.subscription.create({ ... });
  await tx.webhookEvent.create({ ... });
});
// Automatic rollback on error
```

### 5. Log Security Events

Monitor for suspicious activity:

```typescript
Sentry.captureMessage("Webhook verification failure", {
  level: 'fatal',
  tags: { security_event: 'webhook_verification_failure' },
  contexts: { webhook: { ... } }
});
```

### 6. Rotate Credentials Regularly

- Rotate `PAYPAL_CLIENT_SECRET` every 90 days
- Update webhook URLs if domain changes
- Monitor for unauthorized access

### 7. Validate Event Types

Only process whitelisted events:

```typescript
const ALLOWED_EVENTS = ['BILLING.SUBSCRIPTION.ACTIVATED'];

if (!ALLOWED_EVENTS.includes(event_type)) {
  return res.status(400).json({ error: 'Unsupported event type' });
}
```

### 8. Handle Sensitive Data Carefully

- Never log full credit card numbers
- Redact sensitive fields in logs
- Use Sentry breadcrumbs for debugging without exposing PII

```typescript
logger.info({
  eventType: event.event_type,
  userId: event.resource.subscriber.payer_id, // OK
  email: event.resource.subscriber.email_address.replace(/(?<=.{2}).(?=.*@)/g, '*') // Redacted
});
```

---

## Additional Resources

### PayPal Documentation

- [Webhook Event Reference](https://developer.paypal.com/api/rest/webhooks/)
- [Signature Verification](https://developer.paypal.com/docs/api-basics/notifications/webhooks/notification-messages/#link-verifyyourwebhooksignature)
- [Developer Dashboard](https://developer.paypal.com/dashboard/)

### Internal Documentation

- `/backend/src/utils/webhook-verification.ts` - Signature verification implementation
- `/backend/src/validators/webhookValidator.ts` - Event validation
- `/backend/src/handlers/webhookHandlers.ts` - Event handlers
- `/backend/src/services/webhookEventService.ts` - Idempotency service
- `/backend/src/middleware/webhookRateLimiter.ts` - Rate limiting

### Testing

Test webhook verification:
```bash
# Using PayPal webhook simulator
# Dashboard > Webhooks > Webhook Details > Test

# Manual testing with curl
curl -X POST https://yourapp.com/webhooks/paypal \
  -H "Content-Type: application/json" \
  -H "PAYPAL-TRANSMISSION-ID: test-id" \
  -H "PAYPAL-TRANSMISSION-TIME: 2026-03-23T10:30:00Z" \
  -H "PAYPAL-TRANSMISSION-SIG: test-sig" \
  -H "PAYPAL-CERT-URL: https://api.paypal.com/..." \
  -H "PAYPAL-AUTH-ALGO: SHA256withRSA" \
  -d '{"event_type": "BILLING.SUBSCRIPTION.ACTIVATED", ...}'
```

---

## Summary

This webhook security system provides:

✅ **Cryptographic signature verification** via PayPal API
✅ **Timestamp validation** to prevent replay attacks
✅ **Idempotency** to prevent duplicate processing
✅ **Rate limiting** to prevent flooding attacks
✅ **Event type whitelisting** for controlled processing
✅ **Database transactions** for atomic operations
✅ **Comprehensive error handling** with detailed error codes
✅ **Security monitoring** via Sentry integration

For questions or issues, contact the backend team or refer to the troubleshooting guide above.
