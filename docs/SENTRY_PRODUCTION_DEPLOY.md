# Sentry Production Deployment Plan

This document outlines the step-by-step process for deploying Sentry monitoring to production.

## Overview

Follow these steps in order to ensure a safe and monitored rollout of Sentry integration to production environments.

## Deployment Steps

### 1. Deploy to Staging and Verify

**Objective:** Validate the Sentry integration in a staging environment before production deployment.

- [ ] Deploy the latest code with Sentry integration to staging environment
- [ ] Trigger test errors to verify Sentry captures them correctly
- [ ] Verify error details include:
  - Stack traces
  - User context
  - Environment information
  - Release version tags
- [ ] Check that error grouping works as expected
- [ ] Confirm performance monitoring data is being collected (if enabled)
- [ ] Verify source maps are uploaded correctly (for frontend applications)
- [ ] Test different error scenarios (handled exceptions, unhandled exceptions, promise rejections)
- [ ] Ensure no PII (Personally Identifiable Information) is being sent to Sentry
- [ ] Validate that staging alerts are firing correctly
- [ ] **Sign-off required:** QA and DevOps teams approve staging deployment

### 2. Create Production Sentry Projects

**Objective:** Set up Sentry projects for production services.

- [ ] Log into Sentry dashboard
- [ ] Create a new project for each production service:
  - Frontend application
  - Backend API
  - Background workers
  - Any microservices
- [ ] Configure project settings:
  - Set appropriate alert rules
  - Configure issue assignment rules
  - Set up integrations (Slack, PagerDuty, etc.)
  - Configure data scrubbing rules to prevent PII leakage
  - Set rate limits if necessary
  - Enable performance monitoring (if required)
- [ ] Copy the DSN (Data Source Name) for each project
- [ ] Document all project DSNs securely (use secrets manager)
- [ ] Configure release tracking settings
- [ ] Set up teams and permissions for production access

### 3. Update Production .env Files

**Objective:** Configure production environment variables with Sentry DSNs.

- [ ] Identify all services that need Sentry configuration
- [ ] For each service, update the production `.env` file or secrets manager with:
  ```
  SENTRY_DSN=<production-dsn>
  SENTRY_ENVIRONMENT=production
  SENTRY_RELEASE=<version-or-git-sha>
  SENTRY_SAMPLE_RATE=1.0
  SENTRY_TRACES_SAMPLE_RATE=0.1
  ```
- [ ] Ensure `.env` files are not committed to version control
- [ ] Store secrets in secure secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- [ ] Verify environment variable access permissions
- [ ] Update deployment scripts to include Sentry release creation
- [ ] Configure auto-discovery of git commit SHA for release tagging
- [ ] **Double-check:** All DSNs point to production Sentry projects, not staging

### 4. Rolling Restart Services

**Objective:** Deploy the configuration changes with minimal downtime.

- [ ] Schedule deployment during low-traffic window (if possible)
- [ ] Notify team members of deployment start time
- [ ] Begin rolling restart:
  - Restart one instance/container at a time
  - Wait for health checks to pass before proceeding to next instance
  - Monitor logs for any startup errors
  - Verify Sentry connection on startup
- [ ] Deployment order (recommended):
  1. Background workers (lowest risk)
  2. Backend APIs (medium risk)
  3. Frontend applications (user-facing)
- [ ] For each service:
  - [ ] Drain connections from instance
  - [ ] Stop instance gracefully
  - [ ] Start instance with new configuration
  - [ ] Verify health check passes
  - [ ] Verify Sentry initialization in logs
  - [ ] Wait 2-5 minutes before next instance
- [ ] Keep previous version ready for quick rollback if needed
- [ ] Document rollback procedure before starting deployment

### 5. Monitor Error Rates for 1 Hour

**Objective:** Ensure Sentry is working correctly and no unexpected issues arise.

**Timeline:** Start monitoring immediately after all services are restarted.

#### First 15 Minutes (Critical Window)
- [ ] Check Sentry dashboard for incoming events
- [ ] Verify events are tagged with correct environment (`production`)
- [ ] Verify events are tagged with correct release version
- [ ] Monitor application logs for Sentry connection errors
- [ ] Check application performance metrics (response times, throughput)
- [ ] Verify no spike in application errors
- [ ] Confirm CPU/memory usage is normal

#### 15-30 Minutes
- [ ] Review error patterns in Sentry
- [ ] Investigate any new or unusual errors
- [ ] Check error frequency compared to staging
- [ ] Verify breadcrumbs are being captured correctly
- [ ] Confirm user context is being attached (without PII)
- [ ] Monitor application health dashboards

#### 30-60 Minutes
- [ ] Compare error rates with historical baseline (from logs or other monitoring)
- [ ] Verify performance monitoring data (if enabled)
- [ ] Check that Sentry overhead is acceptable (< 1-2% performance impact)
- [ ] Review any issues that have been auto-assigned
- [ ] Confirm integrations are working (Slack notifications, etc.)
- [ ] Document any anomalies or unexpected behavior

#### Acceptance Criteria
- ✅ Sentry is receiving events from all production services
- ✅ Error rates are within expected range (similar to pre-Sentry baseline)
- ✅ No Sentry-related errors in application logs
- ✅ Application performance is stable
- ✅ All services are healthy

### 6. Verify Alerts Work

**Objective:** Confirm that alert rules are functioning and team will be notified of critical issues.

- [ ] Trigger a test error in production (controlled test)
  - Use a dedicated test endpoint or feature flag
  - Ensure test error is clearly labeled/tagged
  - Example: `Sentry.captureException(new Error('[TEST] Sentry alert verification'))`
- [ ] Verify alert appears in Sentry dashboard within 1-2 minutes
- [ ] Confirm alert notifications are sent:
  - [ ] Slack channel receives notification
  - [ ] PagerDuty alert is created (if configured)
  - [ ] Email notifications sent to appropriate team members
- [ ] Test different severity levels if configured
- [ ] Verify on-call engineer is notified correctly
- [ ] Test alert resolution workflow:
  - [ ] Mark issue as resolved in Sentry
  - [ ] Verify resolution notification is sent
- [ ] Clean up test errors from Sentry (mark as resolved/ignored)
- [ ] Document alert response procedures for team
- [ ] **Final sign-off:** Confirm all alerts are working as expected

## Post-Deployment

### Immediate Actions (Day 1)
- [ ] Send deployment summary to team
- [ ] Monitor Sentry dashboard throughout the day
- [ ] Review and triage any critical errors
- [ ] Update runbooks with Sentry procedures

### First Week
- [ ] Review error trends daily
- [ ] Adjust alert thresholds if needed
- [ ] Fine-tune data scrubbing rules
- [ ] Train team on Sentry workflow
- [ ] Set up saved searches for common issues

### Ongoing
- [ ] Weekly review of error trends
- [ ] Monthly review of alert effectiveness
- [ ] Quarterly review of Sentry costs and quotas
- [ ] Keep Sentry SDK versions up to date

## Rollback Procedure

If issues arise during deployment:

1. **Immediate rollback:** Revert environment variables to remove Sentry DSN
2. **Rolling restart:** Restart services without Sentry configuration
3. **Investigate:** Review logs and Sentry data to determine root cause
4. **Fix in staging:** Address issues in staging environment first
5. **Retry deployment:** Follow this plan again once issues are resolved

## Success Criteria

The deployment is considered successful when:

- ✅ All production services are sending events to Sentry
- ✅ Error rates are normal and stable
- ✅ Alerts are firing and being received by the team
- ✅ No performance degradation observed
- ✅ Team is able to triage and resolve issues using Sentry
- ✅ No PII is being sent to Sentry

## Contact Information

- **Deployment Lead:** [Name]
- **On-call Engineer:** [Name/Rotation]
- **Sentry Admin:** [Name]
- **Escalation:** [Manager/Team Lead]

## References

- Sentry Documentation: https://docs.sentry.io/
- Internal Sentry Setup Guide: `/docs/SENTRY_SETUP.md`
- Incident Response Playbook: [Link]
- Secrets Manager: [Link/Documentation]

---

**Document Version:** 1.0
**Last Updated:** 2026-03-23
**Owner:** DevOps Team
