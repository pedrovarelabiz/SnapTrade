# Test Suite Results - 2026-03-24

## Summary
- **Total Tests:** 115
- **Passed:** 97 (84.3%)
- **Failed:** 18 (15.7%)
- **Warnings:** 17

## Pass Rate: 84.3% (Target: >90%)

---

## Known Issues (18 Failures)

### 1. Async Test Infrastructure (7 failures)
**Root Cause:** Missing `pytest-asyncio` plugin
- `test_post_signal_with_expiration_time`
- `test_post_signal_expiration_time_field_presence`
- `test_complete_signal_attribution_e2e`
- `test_multiple_signals_exact_expiration_matching_e2e`
- `test_failed_backend_post_e2e`
- `test_result_outside_tolerance_e2e`
- `test_timezone_handling_e2e`

**Resolution:** Install pytest-asyncio: `pip install pytest-asyncio`

### 2. Signal Matching Confidence/Tier Issues (4 failures)
**Root Cause:** Functions returning None instead of expected tier values (1, 2, 3)
- `test_tier3_proximity_fallback` - Expected tier=3, got None
- `test_tier3_ambiguity_warning` - Expected tier=3, got None
- `test_no_match_found` - Expected (None, None, None), got (None, None, 0.0)
- `test_match_confidence_scores` - Expected tier=3, got None

**Impact:** Tier 3 proximity matching logic not returning correct match_tier value

### 3. Error Capture Tests (3 failures)
**Root Cause:** Sentry error capture assertion failures
- `test_ocr_parser_tesseract_error_with_metadata`
- `test_regex_parser_error_with_tags`
- `test_parser_error_capture_with_context`

**Impact:** Error logging/Sentry integration needs verification

### 4. Production Signals Test (1 failure)
**Root Cause:** Missing PRODUCTION_SIGNALS environment variable
- `test_production_signals`

**Resolution:** Set PRODUCTION_SIGNALS env var or skip test in non-production

### 5. Other Failures (3 tests)
- `test_find_matching_signal_uses_exact_first` - Signal matching priority
- `test_proximity_fallback_integration` - Proximity metric verification
- `test_init_sentry_with_dsn` - Sentry client initialization

---

## Successful Test Categories (97 passed)
✅ Clock skew handling (6/6)
✅ Confidence scoring (11/11)
✅ Exact expiration matching (21/21)
✅ Expiration calculation (8/8)
✅ Martingale matching (6/6)
✅ Parser functionality (12/12)
✅ Race condition scenarios (4/4)
✅ Timezone handling (1/1)
✅ Integration tests (2/2)
✅ Sentry filtering (7/9)
✅ Signal matching core (8/14)

---

## Critical Fixes Applied
1. ✅ martingale_level field name (was martingale_iteration)
2. ✅ Confidence formula constants
3. ✅ Error logging statements

---

## Recommendations
1. Install pytest-asyncio to fix 7 async test failures
2. Debug tier 3 proximity matching return value (should return tier=3, not None)
3. Review Sentry error capture test assertions
4. Configure PRODUCTION_SIGNALS environment variable for smoke tests
