# PayPal Webhook Event Types

This document describes all supported PayPal webhook event types, their sample payloads, and expected system behavior.

## Table of Contents

- [Subscription Events](#subscription-events)
- [Payment Events](#payment-events)
- [Dispute Events](#dispute-events)
- [General Event Structure](#general-event-structure)

---

## Subscription Events

### BILLING.SUBSCRIPTION.ACTIVATED

Triggered when a billing subscription is activated.

**Sample Payload:**
```json
{
  "id": "WH-12345678901234567-12345678901234567",
  "event_version": "1.0",
  "create_time": "2026-03-23T10:00:00Z",
  "resource_type": "subscription",
  "resource_version": "2.0",
  "event_type": "BILLING.SUBSCRIPTION.ACTIVATED",
  "summary": "Subscription activated",
  "resource": {
    "id": "I-BW452GLLEP1G",
    "plan_id": "P-5ML4271244454362WXNWU5NQ",
    "status": "ACTIVE",
    "status_update_time": "2026-03-23T10:00:00Z",
    "subscriber": {
      "email_address": "customer@example.com",
      "name": {
        "given_name": "John",
        "surname": "Doe"
      }
    },
    "billing_info": {
      "next_billing_time": "2026-04-23T10:00:00Z",
      "last_payment": {
        "amount": {
          "currency_code": "USD",
          "value": "9.99"
        },
        "time": "2026-03-23T10:00:00Z"
      }
    }
  }
}
```

**Expected System Behavior:**
- Update subscription status to "ACTIVE" in database
- Grant user access to premium features
- Send confirmation email to customer
- Log activation timestamp
- Update billing cycle information

---

### BILLING.SUBSCRIPTION.CANCELLED

Triggered when a billing subscription is cancelled.

**Sample Payload:**
```json
{
  "id": "WH-98765432109876543-98765432109876543",
  "event_version": "1.0",
  "create_time": "2026-03-23T15:30:00Z",
  "resource_type": "subscription",
  "resource_version": "2.0",
  "event_type": "BILLING.SUBSCRIPTION.CANCELLED",
  "summary": "Subscription cancelled",
  "resource": {
    "id": "I-BW452GLLEP1G",
    "plan_id": "P-5ML4271244454362WXNWU5NQ",
    "status": "CANCELLED",
    "status_update_time": "2026-03-23T15:30:00Z",
    "subscriber": {
      "email_address": "customer@example.com",
      "name": {
        "given_name": "John",
        "surname": "Doe"
      }
    }
  }
}
```

**Expected System Behavior:**
- Update subscription status to "CANCELLED" in database
- Revoke premium access at end of current billing period
- Send cancellation confirmation email
- Log cancellation reason and timestamp
- Archive subscription data for retention

---

### BILLING.SUBSCRIPTION.SUSPENDED

Triggered when a billing subscription is suspended (usually due to payment failure).

**Sample Payload:**
```json
{
  "id": "WH-45678901234567890-45678901234567890",
  "event_version": "1.0",
  "create_time": "2026-03-23T12:00:00Z",
  "resource_type": "subscription",
  "resource_version": "2.0",
  "event_type": "BILLING.SUBSCRIPTION.SUSPENDED",
  "summary": "Subscription suspended",
  "resource": {
    "id": "I-BW452GLLEP1G",
    "plan_id": "P-5ML4271244454362WXNWU5NQ",
    "status": "SUSPENDED",
    "status_update_time": "2026-03-23T12:00:00Z"
  }
}
```

**Expected System Behavior:**
- Update subscription status to "SUSPENDED"
- Send payment failure notification to customer
- Restrict access to premium features
- Schedule retry attempts for payment
- Log suspension reason

---

### BILLING.SUBSCRIPTION.UPDATED

Triggered when subscription details are updated.

**Sample Payload:**
```json
{
  "id": "WH-11223344556677889-11223344556677889",
  "event_version": "1.0",
  "create_time": "2026-03-23T14:00:00Z",
  "resource_type": "subscription",
  "resource_version": "2.0",
  "event_type": "BILLING.SUBSCRIPTION.UPDATED",
  "summary": "Subscription updated",
  "resource": {
    "id": "I-BW452GLLEP1G",
    "plan_id": "P-5ML4271244454362WXNWU5NQ",
    "status": "ACTIVE"
  }
}
```

**Expected System Behavior:**
- Sync subscription details with database
- Update user account settings if plan changed
- Send update confirmation email
- Log update details

---

### BILLING.SUBSCRIPTION.EXPIRED

Triggered when a subscription expires.

**Sample Payload:**
```json
{
  "id": "WH-66778899001122334-66778899001122334",
  "event_version": "1.0",
  "create_time": "2026-03-23T23:59:59Z",
  "resource_type": "subscription",
  "resource_version": "2.0",
  "event_type": "BILLING.SUBSCRIPTION.EXPIRED",
  "summary": "Subscription expired",
  "resource": {
    "id": "I-BW452GLLEP1G",
    "plan_id": "P-5ML4271244454362WXNWU5NQ",
    "status": "EXPIRED",
    "status_update_time": "2026-03-23T23:59:59Z"
  }
}
```

**Expected System Behavior:**
- Update subscription status to "EXPIRED"
- Revoke all premium access immediately
- Send expiration notification
- Prompt user to renew subscription
- Archive subscription record

---

## Payment Events

### PAYMENT.SALE.COMPLETED

Triggered when a payment sale is completed successfully.

**Sample Payload:**
```json
{
  "id": "WH-55443322110099887-55443322110099887",
  "event_version": "1.0",
  "create_time": "2026-03-23T10:05:00Z",
  "resource_type": "sale",
  "resource_version": "2.0",
  "event_type": "PAYMENT.SALE.COMPLETED",
  "summary": "Payment completed",
  "resource": {
    "id": "2MT12345678901234",
    "state": "completed",
    "amount": {
      "total": "9.99",
      "currency": "USD"
    },
    "payment_mode": "INSTANT_TRANSFER",
    "create_time": "2026-03-23T10:05:00Z",
    "update_time": "2026-03-23T10:05:00Z",
    "billing_agreement_id": "I-BW452GLLEP1G"
  }
}
```

**Expected System Behavior:**
- Record payment transaction in database
- Update user account balance/credits
- Generate invoice/receipt
- Send payment confirmation email
- Trigger fulfillment process
- Update subscription next billing date

---

### PAYMENT.SALE.DENIED

Triggered when a payment sale is denied.

**Sample Payload:**
```json
{
  "id": "WH-77665544332211009-77665544332211009",
  "event_version": "1.0",
  "create_time": "2026-03-23T11:00:00Z",
  "resource_type": "sale",
  "resource_version": "2.0",
  "event_type": "PAYMENT.SALE.DENIED",
  "summary": "Payment denied",
  "resource": {
    "id": "2MT98765432109876",
    "state": "denied",
    "amount": {
      "total": "9.99",
      "currency": "USD"
    },
    "reason_code": "RISK_DENIED",
    "create_time": "2026-03-23T11:00:00Z"
  }
}
```

**Expected System Behavior:**
- Log failed payment attempt
- Send payment failure notification to customer
- Suspend or restrict account access
- Trigger retry logic or request alternative payment method
- Flag transaction for fraud review if applicable

---

### PAYMENT.SALE.REFUNDED

Triggered when a payment sale is refunded.

**Sample Payload:**
```json
{
  "id": "WH-99887766554433221-99887766554433221",
  "event_version": "1.0",
  "create_time": "2026-03-23T16:00:00Z",
  "resource_type": "refund",
  "resource_version": "2.0",
  "event_type": "PAYMENT.SALE.REFUNDED",
  "summary": "Payment refunded",
  "resource": {
    "id": "3RF12345678901234",
    "sale_id": "2MT12345678901234",
    "state": "completed",
    "amount": {
      "total": "9.99",
      "currency": "USD"
    },
    "create_time": "2026-03-23T16:00:00Z",
    "refund_reason_code": "REQUESTED_BY_CUSTOMER"
  }
}
```

**Expected System Behavior:**
- Record refund transaction in database
- Reverse account credits/balance
- Update subscription status if applicable
- Send refund confirmation email
- Log refund reason
- Adjust revenue reports

---

### PAYMENT.SALE.REVERSED

Triggered when a payment sale is reversed (chargeback or dispute).

**Sample Payload:**
```json
{
  "id": "WH-22334455667788990-22334455667788990",
  "event_version": "1.0",
  "create_time": "2026-03-23T17:00:00Z",
  "resource_type": "sale",
  "resource_version": "2.0",
  "event_type": "PAYMENT.SALE.REVERSED",
  "summary": "Payment reversed",
  "resource": {
    "id": "2MT12345678901234",
    "state": "reversed",
    "amount": {
      "total": "9.99",
      "currency": "USD"
    }
  }
}
```

**Expected System Behavior:**
- Record reversal in database
- Deduct funds from account balance
- Suspend user access if applicable
- Alert finance team
- Initiate dispute resolution process
- Update transaction records

---

## Dispute Events

### CUSTOMER.DISPUTE.CREATED

Triggered when a customer creates a dispute.

**Sample Payload:**
```json
{
  "id": "WH-13579246801357924-13579246801357924",
  "event_version": "1.0",
  "create_time": "2026-03-23T18:00:00Z",
  "resource_type": "dispute",
  "resource_version": "2.0",
  "event_type": "CUSTOMER.DISPUTE.CREATED",
  "summary": "Dispute created",
  "resource": {
    "dispute_id": "PP-D-12345678",
    "dispute_amount": {
      "currency_code": "USD",
      "value": "9.99"
    },
    "reason": "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    "status": "OPEN",
    "dispute_transactions": [
      {
        "transaction_id": "2MT12345678901234"
      }
    ]
  }
}
```

**Expected System Behavior:**
- Create dispute record in database
- Alert customer support team
- Suspend related transactions
- Gather evidence for dispute response
- Send notification to merchant
- Track dispute timeline

---

### CUSTOMER.DISPUTE.RESOLVED

Triggered when a dispute is resolved.

**Sample Payload:**
```json
{
  "id": "WH-24680135792468013-24680135792468013",
  "event_version": "1.0",
  "create_time": "2026-03-23T20:00:00Z",
  "resource_type": "dispute",
  "resource_version": "2.0",
  "event_type": "CUSTOMER.DISPUTE.RESOLVED",
  "summary": "Dispute resolved",
  "resource": {
    "dispute_id": "PP-D-12345678",
    "dispute_amount": {
      "currency_code": "USD",
      "value": "9.99"
    },
    "status": "RESOLVED",
    "dispute_outcome": {
      "outcome_code": "RESOLVED_BUYER_FAVOUR"
    }
  }
}
```

**Expected System Behavior:**
- Update dispute status to "RESOLVED"
- Process outcome (refund if buyer favor, restore funds if seller favor)
- Send resolution notification
- Update financial records
- Close dispute case
- Archive dispute documentation

---

## General Event Structure

All webhook events follow this structure:

```json
{
  "id": "WH-XXXXX",                    // Unique webhook event ID
  "event_version": "1.0",              // Event schema version
  "create_time": "ISO-8601-timestamp", // Event creation time
  "resource_type": "string",           // Type of resource (subscription, sale, etc.)
  "resource_version": "2.0",           // Resource schema version
  "event_type": "EVENT.TYPE.NAME",     // Event type identifier
  "summary": "Human readable summary", // Brief description
  "resource": { ... }                  // Event-specific payload data
}
```

### Webhook Signature Verification

All incoming webhooks must be verified using PayPal's webhook signature:

1. Extract headers: `PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-TIME`, `PAYPAL-TRANSMISSION-SIG`, `PAYPAL-CERT-URL`
2. Construct verification string
3. Verify signature using PayPal SDK
4. Only process webhook if verification succeeds

### Event Processing Best Practices

- **Idempotency**: Use webhook event ID to prevent duplicate processing
- **Async Processing**: Queue events for asynchronous processing
- **Error Handling**: Retry failed webhook processing with exponential backoff
- **Logging**: Log all webhook events for audit trail
- **Monitoring**: Track webhook delivery success rates and processing times
- **Security**: Always verify webhook signatures before processing
