# Deployment Checklist - v2.1.0

## Pre-Deployment

- [ ] **Backup database** - Create full backup of production database
- [ ] **Verify tests pass** - Ensure all unit, integration, and e2e tests pass
  ```bash
  pytest tests/ --cov --cov-report=term-missing
  ```
- [ ] **Review change log** - Confirm all v2.1.0 changes are documented
- [ ] **Notify stakeholders** - Alert team of upcoming deployment window

## Deployment

- [ ] **Deploy listener v2.1.0** - Deploy new version to production
  ```bash
  kubectl set image deployment/listener listener=listener:v2.1.0
  ```
- [ ] **Restart service** - Restart listener service to apply changes
  ```bash
  kubectl rollout restart deployment/listener
  ```
- [ ] **Verify deployment status** - Check pods are running
  ```bash
  kubectl get pods -l app=listener
  ```

## Post-Deployment Verification

### Metrics Validation
- [ ] **Check Prometheus metrics (tier distribution)** - Verify tier1/tier2/tier3 signal distribution is within expected ranges
  - Monitor `signal_tier_distribution` metric
  - Verify tier1 signals increased as expected

### Alert Monitoring
- [ ] **Monitor Sentry for D3 alerts (24h)** - Watch for D3-related errors over next 24 hours
  - Check Sentry dashboard for new error patterns
  - Verify no spike in `tier3_fallback_error` alerts

### Quality Checks
- [ ] **Verify confidence scores >0.8** - Ensure tier1 signals meet confidence threshold
  - Query: `avg(confidence_score) by (tier)`
  - Expected: tier1 avg >0.8, tier2 >0.6

- [ ] **Check no tier3 fallback increase** - Confirm tier3 fallback rate hasn't increased
  - Compare tier3 percentage before/after deployment
  - Alert if increase >5%

### Signal Validation
- [ ] **Validate sample signal matching** - Test known signals against new matcher
  - Run validation script on sample signal set
  - Verify correct tier assignment for test signals

### Documentation
- [ ] **Document deployment time** - Record deployment timestamp and duration
  - Deployment start: _____________
  - Deployment end: _____________
  - Total duration: _____________
  - Deployed by: _____________

## Rollback Plan

If issues are detected:
- [ ] **Revert to previous version**
  ```bash
  kubectl set image deployment/listener listener=listener:v2.0.x
  ```
- [ ] **Restore database** (if schema changes were made)
- [ ] **Post-mortem** - Document issues and lessons learned

## Sign-off

- [ ] All checks passed
- [ ] No critical errors in logs
- [ ] Metrics within acceptable ranges
- [ ] Stakeholders notified of completion

**Approved by:** _____________
**Date:** _____________
