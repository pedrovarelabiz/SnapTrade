# Sentry Alert Rules

This document describes the Sentry alert rules configured for monitoring critical issues in the SnapTrade application.

## Signal Attribution Race Condition (D3)

**Alert Name:** Signal Attribution Race Condition (D3)

**Description:** Detects when signal attribution race conditions occur, which can lead to incorrect signal matching or attribution errors.

**Trigger Condition:** Alert when the message 'Signal attribution race condition detected' appears in logs.

**Threshold:** 3+ occurrences in 1 hour

**Severity:** High

**Configuration:**
- **Message Filter:** `Signal attribution race condition detected`
- **Alert Frequency:** 1 hour window
- **Minimum Occurrences:** 3
- **Action:** Notify on-call engineer via PagerDuty

**Response:**
1. Check recent signal processing operations
2. Review database transaction logs for concurrent signal attributions
3. Investigate timing between signal creation and attribution
4. Monitor for data inconsistencies in signal attribution records
