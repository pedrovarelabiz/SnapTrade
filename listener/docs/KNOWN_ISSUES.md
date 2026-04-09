# Known Issues

This document tracks known test failures and issues in the listener component.

**Last Updated:** 2026-03-24

## Test Failures

### 1. test_rate_limiting.py::test_rate_limiting

**Failure Reason:** Missing pytest-asyncio plugin. Async test functions are not natively supported by pytest without an async framework plugin.

**Error Message:**
```
async def functions are not natively supported.
You need to install a suitable plugin for your async framework
```

**Impact Assessment:** MEDIUM
- Test cannot verify rate limiting functionality for async operations
- Rate limiting code may still work in production but lacks automated verification
- Manual testing or production monitoring required to validate behavior

**Workaround:**
- Install pytest-asyncio: `pip install pytest-asyncio`
- Add to requirements.txt for persistent fix

**Planned Fix Date:** 2026-03-31

---

### 2. test_alert_delivery.py::test_telegram_alerter_initialization

**Failure Reason:** Missing pytest-asyncio plugin. Async test functions are not natively supported by pytest without an async framework plugin.

**Error Message:**
```
async def functions are not natively supported.
You need to install a suitable plugin for your async framework
PytestUnknownMarkWarning: Unknown pytest.mark.asyncio
```

**Impact Assessment:** MEDIUM
- Cannot verify Telegram alerter initialization in test environment
- Alerter initialization may fail silently in production if configuration is incorrect
- Requires manual testing of alert delivery system

**Workaround:**
- Install pytest-asyncio: `pip install pytest-asyncio`
- Add to requirements.txt for persistent fix

**Planned Fix Date:** 2026-03-31

---

### 3. test_alert_delivery.py::test_telegram_alerter_sends_alert_with_correct_payload

**Failure Reason:** Missing pytest-asyncio plugin. Async test functions are not natively supported by pytest without an async framework plugin.

**Error Message:**
```
async def functions are not natively supported.
You need to install a suitable plugin for your async framework
PytestUnknownMarkWarning: Unknown pytest.mark.asyncio
```

**Impact Assessment:** HIGH
- Cannot verify alert payload structure and correctness
- Risk of sending malformed alerts to Telegram
- Alert delivery failures may go undetected until production deployment
- Critical for monitoring and incident response reliability

**Workaround:**
- Install pytest-asyncio: `pip install pytest-asyncio`
- Add to requirements.txt for persistent fix
- Manually verify alert payload format before production deployment

**Planned Fix Date:** 2026-03-31

---

### 4. test_alert_delivery.py::test_telegram_alerter_different_severity_levels

**Failure Reason:** Missing pytest-asyncio plugin. Async test functions are not natively supported by pytest without an async framework plugin.

**Error Message:**
```
async def functions are not natively supported.
You need to install a suitable plugin for your async framework
PytestUnknownMarkWarning: Unknown pytest.mark.asyncio
```

**Impact Assessment:** MEDIUM
- Cannot verify alert severity level handling
- Different severity alerts (INFO, WARNING, ERROR, CRITICAL) may not be properly differentiated
- Risk of alert fatigue or missing critical alerts

**Workaround:**
- Install pytest-asyncio: `pip install pytest-asyncio`
- Add to requirements.txt for persistent fix
- Manually test different severity levels before production deployment

**Planned Fix Date:** 2026-03-31

---

## Summary

**Total Test Failures:** 4 out of 7 tests (57% failure rate)
**Passing Tests:** 3 (all in test_reconnection.py)

**Root Cause:** All failures stem from missing pytest-asyncio dependency

**Recommended Action:** Add `pytest-asyncio` to requirements.txt and rerun tests to verify all async test functionality.

**Production Readiness:**
- ✅ Reconnection logic is verified and passing
- ⚠️ Rate limiting functionality requires manual verification
- ⚠️ Alert delivery system requires manual verification before production use
- ❌ Missing test coverage for critical async components

**Next Steps:**
1. Add pytest-asyncio to requirements.txt (Priority: HIGH)
2. Rerun test suite to verify all tests pass
3. If tests still fail after dependency fix, investigate test implementation
4. Update this document if additional issues are discovered
