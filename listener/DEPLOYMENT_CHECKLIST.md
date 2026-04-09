# Enhanced Matching Deployment Checklist

## Pre-Deployment Verification

- [ ] Run all tests
  ```bash
  pytest tests/
  ```

- [ ] Enable SIGNAL_MATCHING_DEBUG in staging
  ```bash
  # Set environment variable in staging deployment
  SIGNAL_MATCHING_DEBUG=true
  ```

- [ ] Monitor matching_stats for 24 hours
  - Check dashboard/logs for matching statistics
  - Verify matching performance metrics
  - Document any anomalies

- [ ] Check ambiguous_matches count
  - Review ambiguous match frequency
  - Validate handling of edge cases
  - Ensure count is within acceptable thresholds

- [ ] Compare with legacy using test_matching_comparison.py
  ```bash
  python test_matching_comparison.py
  ```
  - Analyze differences between legacy and enhanced matching
  - Document any discrepancies

- [ ] Verify D3 metrics exposure in staging
  - Confirm `matching_stats` counter is exposed and incrementing
  - Verify `ambiguous_matches` counter is tracked
  - Test metrics endpoint/dashboard accessibility
  - Validate race condition handling metrics

- [ ] Test race condition scenarios
  - Simulate concurrent D1/D3 signal processing
  - Verify no duplicate matches with overlapping timestamps
  - Test high-volume signal bursts
  - Confirm thread-safe matching logic

## Deployment

### VPS Production Deployment (root@213.199.51.26)

- [ ] SSH to VPS production server
  ```bash
  ssh root@213.199.51.26
  ```

- [ ] Navigate to deployment directory
  ```bash
  cd /opt/snaptrade/telegram
  ```

- [ ] Pull latest changes (or rsync files)
  ```bash
  git pull
  # OR use rsync for manual file transfer
  ```

- [ ] Run smoke tests
  - Verify application starts correctly
  - Test basic functionality
  - Validate configuration

- [ ] Restart listener service
  ```bash
  # Restart the listener service
  systemctl restart snaptrade-listener  # or appropriate service command
  ```

- [ ] Monitor logs for 15 minutes
  ```bash
  # Watch logs for errors or warnings
  tail -f /var/log/snaptrade-listener.log  # adjust path as needed
  ```
  - Watch for startup errors
  - Verify matching logic is working
  - Check for any immediate issues

- [ ] Check Sentry for errors
  - Monitor Sentry dashboard for new production errors
  - Verify error rates are normal
  - Ensure rollback plan is ready if issues detected

## Post-Deployment Monitoring

- [ ] Monitor Sentry for matching errors
  - Watch for new error patterns
  - Set up alerts for matching-related issues
  - Review error rates for first 48 hours

---

**Notes:**
- Complete each step in order
- Do not proceed if critical issues are found
- Keep stakeholders informed of progress
