# Deployment Webhook Security Checklist

## Pre-Deployment Checklist

Before deploying webhook functionality to production, complete all verification steps below:

### 1. Environment Variables Verification
- [ ] **Step 1.1**: Verify `PAYPAL_CLIENT_ID` is set in production environment
- [ ] **Step 1.2**: Verify `PAYPAL_CLIENT_SECRET` is set in production environment
- [ ] **Step 1.3**: Verify `PAYPAL_WEBHOOK_ID` is set in production environment
- [ ] **Step 1.4**: Verify `PAYPAL_MODE` is set to `live` (not `sandbox`)
- [ ] **Step 1.5**: Confirm all PayPal env vars are properly encrypted/secured

### 2. Database Migration Verification
- [ ] **Step 2.1**: Run migration scripts in staging environment first
- [ ] **Step 2.2**: Verify migration creates required webhook tables/schemas
- [ ] **Step 2.3**: Run migration in production environment
- [ ] **Step 2.4**: Verify migration completed without errors
- [ ] **Step 2.5**: Confirm database indexes are created for webhook queries

### 3. PayPal Dashboard Verification
- [ ] **Step 3.1**: Log into PayPal Developer Dashboard (production mode)
- [ ] **Step 3.2**: Navigate to Webhooks section for your app
- [ ] **Step 3.3**: Verify webhook ID matches `PAYPAL_WEBHOOK_ID` env var
- [ ] **Step 3.4**: Confirm webhook endpoint URL is correct (production URL)
- [ ] **Step 3.5**: Verify all required event types are subscribed

### 4. PayPal Sandbox Testing
- [ ] **Step 4.1**: Configure sandbox environment with test credentials
- [ ] **Step 4.2**: Test webhook signature verification with sandbox events
- [ ] **Step 4.3**: Test each subscribed event type (payment.capture.completed, etc.)
- [ ] **Step 4.4**: Verify error handling for invalid signatures
- [ ] **Step 4.5**: Confirm idempotency handling works correctly
- [ ] **Step 4.6**: Validate all webhook payloads are logged properly

### 5. Rate Limiting Verification
- [ ] **Step 5.1**: Verify rate limit middleware is configured for webhook endpoints
- [ ] **Step 5.2**: Confirm rate limit thresholds match expected webhook volume
- [ ] **Step 5.3**: Test rate limiting behavior under load
- [ ] **Step 5.4**: Verify rate limit bypass for PayPal IPs (if applicable)
- [ ] **Step 5.5**: Confirm rate limit error responses are appropriate (429 status)

### 6. Monitoring & Alerting Verification
- [ ] **Step 6.1**: Confirm monitoring is active for webhook endpoint health
- [ ] **Step 6.2**: Verify alerts are configured for webhook failures
- [ ] **Step 6.3**: Confirm signature verification failures trigger alerts
- [ ] **Step 6.4**: Verify webhook processing time metrics are collected
- [ ] **Step 6.5**: Test alert delivery to on-call team
- [ ] **Step 6.6**: Confirm logging includes webhook event IDs for traceability

## Post-Deployment Verification

After deployment, verify the following:

- [ ] Monitor webhook endpoint for first 24 hours
- [ ] Check error rates remain below 1%
- [ ] Verify legitimate PayPal webhooks are processed successfully
- [ ] Confirm no security alerts or anomalies detected
- [ ] Review logs for any unexpected behavior

## Rollback Plan

If issues are detected post-deployment:

1. Disable webhook endpoint via feature flag or config
2. Investigate logs and error messages
3. Revert deployment if critical security issue found
4. Fix issues in staging environment
5. Re-run full checklist before redeploying

## Security Notes

- Never commit PayPal credentials to version control
- Rotate webhook secrets if compromised
- Monitor for unusual webhook patterns (potential attacks)
- Keep PayPal SDK and dependencies updated
- Regular security audits of webhook handling code
