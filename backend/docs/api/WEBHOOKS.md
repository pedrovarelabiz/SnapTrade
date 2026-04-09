# Webhook API Documentation

## PayPal Webhook Endpoint

### POST /api/webhooks/paypal

Receives webhook events from PayPal for payment processing notifications.

#### Endpoint Specification

- **URL**: `/api/webhooks/paypal`
- **Method**: `POST`
- **Content-Type**: `application/json`

#### Required Headers

| Header | Value | Description |
|--------|-------|-------------|
| `Content-Type` | `application/json` | Payload format |
| `PAYPAL-TRANSMISSION-ID` | string | Unique ID for the webhook event |
| `PAYPAL-TRANSMISSION-TIME` | timestamp | Timestamp when PayPal sent the event |
| `PAYPAL-TRANSMISSION-SIG` | string | Signature for webhook verification |
| `PAYPAL-CERT-URL` | URL | PayPal certificate URL for signature validation |
| `PAYPAL-AUTH-ALGO` | string | Authentication algorithm (e.g., `SHA256withRSA`) |

#### Authentication Method

PayPal webhooks use **signature-based verification**:

1. The server validates the webhook signature using the headers provided
2. Signature is verified against PayPal's certificate (retrieved from `PAYPAL-CERT-URL`)
3. Uses the `PAYPAL-AUTH-ALGO` algorithm to validate the `PAYPAL-TRANSMISSION-SIG`
4. Ensures `PAYPAL-TRANSMISSION-ID` is not a duplicate (replay attack prevention)

#### Payload Format

```json
{
  "id": "WH-8DV57168MG528924P-3NY55238UE3636738",
  "event_version": "1.0",
  "create_time": "2026-03-23T10:15:30Z",
  "resource_type": "sale",
  "event_type": "PAYMENT.SALE.COMPLETED",
  "summary": "Payment completed for $50.00 USD",
  "resource": {
    "id": "7DY409201T7922549",
    "state": "completed",
    "amount": {
      "total": "50.00",
      "currency": "USD"
    },
    "payment_mode": "INSTANT_TRANSFER",
    "create_time": "2026-03-23T10:15:25Z",
    "update_time": "2026-03-23T10:15:30Z",
    "protection_eligibility": "ELIGIBLE",
    "transaction_fee": {
      "value": "1.75",
      "currency": "USD"
    }
  },
  "links": [
    {
      "href": "https://api.paypal.com/v1/notifications/webhooks-events/WH-8DV57168MG528924P-3NY55238UE3636738",
      "rel": "self",
      "method": "GET"
    }
  ]
}
```

#### Response Codes

##### Success Response

**Code**: `200 OK`

**Content**:
```json
{
  "status": "success",
  "message": "Webhook processed successfully",
  "event_id": "WH-8DV57168MG528924P-3NY55238UE3636738"
}
```

##### Error Responses

**Code**: `401 Unauthorized`

**Content**:
```json
{
  "status": "error",
  "message": "Invalid webhook signature",
  "error_code": "INVALID_SIGNATURE"
}
```

**Code**: `400 Bad Request`

**Content**:
```json
{
  "status": "error",
  "message": "Invalid payload format",
  "error_code": "INVALID_PAYLOAD"
}
```

**Code**: `409 Conflict`

**Content**:
```json
{
  "status": "error",
  "message": "Duplicate event ID",
  "error_code": "DUPLICATE_EVENT"
}
```

**Code**: `429 Too Many Requests`

**Content**:
```json
{
  "status": "error",
  "message": "Rate limit exceeded",
  "error_code": "RATE_LIMIT_EXCEEDED",
  "retry_after": 60
}
```

**Code**: `500 Internal Server Error`

**Content**:
```json
{
  "status": "error",
  "message": "Internal server error processing webhook",
  "error_code": "INTERNAL_ERROR"
}
```

#### Rate Limits

- **Maximum requests**: 100 requests per minute per IP address
- **Burst allowance**: 20 requests per second
- **Retry policy**: PayPal will retry failed webhooks up to 15 times over 4 days
- **Timeout**: Server must respond within 30 seconds

When rate limit is exceeded:
- Server returns `429 Too Many Requests`
- Response includes `Retry-After` header with seconds to wait
- PayPal will automatically retry based on their retry policy

#### curl Example

##### Basic webhook simulation:

```bash
curl -X POST https://api.example.com/api/webhooks/paypal \
  -H "Content-Type: application/json" \
  -H "PAYPAL-TRANSMISSION-ID: 69cd13f0-d67a-11e5-baa3-a0369f3b9e44" \
  -H "PAYPAL-TRANSMISSION-TIME: 2026-03-23T10:15:30Z" \
  -H "PAYPAL-TRANSMISSION-SIG: lmI95Jx3Y9nhR5SJWlHVIWpg4AgFk7n9bCHSRxbrd8A9zrhdu2rMyFrmz+Zjh3s3boXB07VXCXUZy/UFzUlnGJn0wDugt7FlSvdKeIJenLRemUxYCPVoEZzg9VFNqOa48gMkvF+XTpxBeUx/kWy6B5cp7GkT2+pOowfRK7OaynuxUoKW3JcMWw271+z4xSwXe5vRg7AjjlpqCQ2h0nWnTQ8mCLzCfzP9bZ0p8K9J9W7CmY8QH1L+7nTM0S9OQP8JTGB0jcJL2l2yBXq2pPGwJzVzFqZmXcWsNZL8aXr6F2aL7Y8Kk6wT0PkE6TvD0W9A2vF8zG9N3pM8C5qR4J==" \
  -H "PAYPAL-CERT-URL: https://api.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-5eaa26db" \
  -H "PAYPAL-AUTH-ALGO: SHA256withRSA" \
  -d '{
    "id": "WH-8DV57168MG528924P-3NY55238UE3636738",
    "event_version": "1.0",
    "create_time": "2026-03-23T10:15:30Z",
    "resource_type": "sale",
    "event_type": "PAYMENT.SALE.COMPLETED",
    "summary": "Payment completed for $50.00 USD",
    "resource": {
      "id": "7DY409201T7922549",
      "state": "completed",
      "amount": {
        "total": "50.00",
        "currency": "USD"
      },
      "payment_mode": "INSTANT_TRANSFER",
      "create_time": "2026-03-23T10:15:25Z",
      "update_time": "2026-03-23T10:15:30Z"
    }
  }'
```

##### Testing with verbose output:

```bash
curl -X POST https://api.example.com/api/webhooks/paypal \
  -H "Content-Type: application/json" \
  -H "PAYPAL-TRANSMISSION-ID: 69cd13f0-d67a-11e5-baa3-a0369f3b9e44" \
  -H "PAYPAL-TRANSMISSION-TIME: 2026-03-23T10:15:30Z" \
  -H "PAYPAL-TRANSMISSION-SIG: lmI95Jx3Y9nhR5SJWlHVIWpg4AgFk7n9bCHSRxbrd8A9zrhdu2rMyFrmz+Zjh3s3boXB07VXCXUZy/UFzUlnGJn0wDugt7FlSvdKeIJenLRemUxYCPVoEZzg9VFNqOa48gMkvF+XTpxBeUx/kWy6B5cp7GkT2+pOowfRK7OaynuxUoKW3JcMWw271+z4xSwXe5vRg7AjjlpqCQ2h0nWnTQ8mCLzCfzP9bZ0p8K9J9W7CmY8QH1L+7nTM0S9OQP8JTGB0jcJL2l2yBXq2pPGwJzVzFqZmXcWsNZL8aXr6F2aL7Y8Kk6wT0PkE6TvD0W9A2vF8zG9N3pM8C5qR4J==" \
  -H "PAYPAL-CERT-URL: https://api.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-5eaa26db" \
  -H "PAYPAL-AUTH-ALGO: SHA256withRSA" \
  -d @webhook_payload.json \
  -v
```

#### Supported Event Types

The PayPal webhook endpoint handles the following event types:

- `PAYMENT.SALE.COMPLETED` - Payment successfully completed
- `PAYMENT.SALE.PENDING` - Payment is pending
- `PAYMENT.SALE.REFUNDED` - Payment has been refunded
- `PAYMENT.SALE.REVERSED` - Payment has been reversed
- `PAYMENT.CAPTURE.COMPLETED` - Payment capture completed
- `PAYMENT.CAPTURE.PENDING` - Payment capture pending
- `PAYMENT.CAPTURE.REFUNDED` - Payment capture refunded
- `PAYMENT.CAPTURE.REVERSED` - Payment capture reversed
- `BILLING.SUBSCRIPTION.CREATED` - Subscription created
- `BILLING.SUBSCRIPTION.ACTIVATED` - Subscription activated
- `BILLING.SUBSCRIPTION.CANCELLED` - Subscription cancelled

#### Security Considerations

1. **Always verify the webhook signature** before processing the payload
2. **Validate the certificate URL** matches PayPal's domain
3. **Check for replay attacks** by tracking processed `PAYPAL-TRANSMISSION-ID` values
4. **Use HTTPS only** in production environments
5. **Implement idempotency** to handle duplicate webhook deliveries
6. **Log all webhook events** for audit and debugging purposes

#### Testing

For local testing, use PayPal's webhook simulator available in the PayPal Developer Dashboard or use the provided curl examples with a local tunnel service (e.g., ngrok) to expose your local server.
