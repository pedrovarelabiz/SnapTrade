# SnapTrade Unified Backend

Backend service for the SnapTrade Unified platform.

## Security

This application implements comprehensive webhook security measures to protect against malicious requests and ensure data integrity. Our webhook security implementation includes multiple defense layers:

- **Signature Verification**: Cryptographic validation of webhook payloads using HMAC-SHA256
- **IP Whitelist**: Restricts webhook processing to trusted source IPs
- **Rate Limiting**: Prevents abuse through request throttling
- **Idempotency**: Duplicate event detection and handling
- **Event Logging**: Comprehensive audit trail for security monitoring

For detailed information about our webhook security implementation, including code examples and best practices, see [docs/WEBHOOK_SECURITY.md](docs/WEBHOOK_SECURITY.md).

## Getting Started

### Prerequisites

- Node.js 16+
- PostgreSQL

### Installation

```bash
npm install
```

### Running the Application

```bash
npm run dev
```

### PayPal Webhook Configuration

To enable PayPal webhook processing, you'll need to configure the following environment variables:

1. **Obtain Webhook ID from PayPal Developer Dashboard:**
   - Log in to the [PayPal Developer Dashboard](https://developer.paypal.com/)
   - Navigate to your application
   - Go to "Webhooks" section
   - Create a new webhook or select an existing one
   - Copy the **Webhook ID** - this is your `PAYPAL_WEBHOOK_ID`

2. **Set up Webhook URL in PayPal:**
   - In the webhook configuration, set your webhook URL to: `https://yourdomain.com/api/webhooks/paypal`
   - Select the event types you want to receive (e.g., `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`)
   - Save the webhook configuration

3. **Configure Environment Variables:**
   Add the following to your `.env` file:
   ```
   PAYPAL_WEBHOOK_ID=your_webhook_id_from_step_1
   PAYPAL_CLIENT_ID=your_paypal_client_id
   PAYPAL_CLIENT_SECRET=your_paypal_client_secret
   ```

For detailed information about webhook security and verification, see [docs/WEBHOOK_SECURITY.md](docs/WEBHOOK_SECURITY.md).

## Database Backup & Recovery

The backend implements automated database backup and disaster recovery procedures to ensure data protection and business continuity.

**Detailed Documentation:**
- [Backup Strategy](docs/BACKUP_STRATEGY.md) - Comprehensive backup configuration and policies
- [Disaster Recovery Runbook](docs/DISASTER_RECOVERY_RUNBOOK.md) - Step-by-step recovery procedures

**Quick Commands:**
```bash
# Run manual backup
npm run backup:run

# Restore from backup
npm run backup:restore
```

**Troubleshooting:** See the [Backup Troubleshooting Guide](docs/BACKUP_STRATEGY.md#troubleshooting) for common issues and solutions.
