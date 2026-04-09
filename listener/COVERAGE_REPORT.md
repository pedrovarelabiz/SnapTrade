# Test Coverage Report - listener.py

**Generated:** 2026-03-24
**Test Command:** `pytest tests/ --cov=listener --cov-report=term-missing --cov-report=html`

## Executive Summary

✅ **Target Achieved:** Both critical functions exceed 80% coverage threshold

## Critical Functions Coverage

### 1. calculate_expiration_time (lines 157-251)
- **Coverage: 80.0%** (20/25 statements) ✅
- **Status:** Meets 80% target
- **Missing Lines:** 223, 229, 231, 237, 242
- **Missing Coverage:** Type validation error branches
  - Line 223: TypeError for non-datetime entry_time
  - Line 229: ValueError for None martingale_level
  - Line 231: TypeError for non-integer martingale_level
  - Line 237: ValueError for None martingale_time value
  - Line 242: TypeError for non-numeric martingale_time

### 2. find_matching_signal (lines 397-800)
- **Coverage: 86.2%** (106/123 statements) ✅
- **Status:** Exceeds 80% target
- **Missing Lines:** 514-516, 597, 615-617, 636-638, 647, 653-654, 725, 784-785, 794
- **Missing Coverage:** Edge case error handling
  - Lines 514-516: Timezone conversion error handling
  - Line 597: Fallback when proximity matching returns None
  - Lines 615-617: Entry time parsing error handling
  - Lines 636-638: Martingale times parsing error handling
  - Line 647: Invalid martingale level handling
  - Lines 653-654: Expiration time calculation error
  - Line 725: Multiple proximity matches edge case
  - Lines 784-794: No match error logging branches

## Overall Coverage

- **listener.py Total:** 26.1% (397/1522 statements)
- **Test Suite:** 97 passed, 18 failed
- **HTML Report:** `htmlcov/index.html`

## Test Files Analyzed

```
tests/
├── integration/
│   ├── test_backend_communication.py
│   ├── test_clock_skew.py
│   └── test_signal_attribution_e2e.py
├── smoke/
│   └── test_production_signals.py
├── test_confidence_scoring.py
├── test_error_capture.py
├── test_exact_expiration_matching.py ✅ (21/21 passed)
├── test_expiration_calculation.py ✅ (9/9 passed)
├── test_martingale_matching.py ✅ (6/6 passed)
├── test_matching.py
├── test_parsers.py ✅ (16/16 passed)
├── test_signal_matching.py
└── test_timezone_handling.py ✅ (1/1 passed)
```

## Recommendations

### High Priority (for 100% coverage of critical functions)
1. Add test cases for `calculate_expiration_time` type validation errors
2. Add test cases for timezone conversion errors in `find_matching_signal`
3. Add test case for ambiguous proximity matches (line 725)

### Medium Priority
4. Fix 18 failing tests (mostly async/integration tests)
5. Increase overall listener.py coverage beyond 26%

## Verification Command

```bash
cd /opt/snaptrade-unified/listener && \
python3 -m pytest tests/ --cov=listener --cov-report=term-missing --cov-report=html
```

## HTML Report Location

Interactive coverage report available at: `htmlcov/index.html`
View with: `open htmlcov/index.html` or browse to file in web browser
