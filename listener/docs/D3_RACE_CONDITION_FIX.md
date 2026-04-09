# D3 Race Condition Fix - Production Runbook

**Document Version:** 1.0
**Last Updated:** 2026-03-24
**Issue ID:** D3
**Severity:** High
**Status:** ✅ RESOLVED - Deployed 2026-03-23

---

## Table of Contents
1. [Problem Statement](#problem-statement)
2. [Reproduction Steps](#reproduction-steps)
3. [Root Cause Analysis](#root-cause-analysis)
4. [Solution Overview](#solution-overview)
5. [Technical Implementation](#technical-implementation)
6. [Verification Steps](#verification-steps)
7. [Monitoring & Alerting](#monitoring--alerting)
8. [Troubleshooting](#troubleshooting)
9. [Rollback Procedure](#rollback-procedure)
10. [Related Documentation](#related-documentation)

---

## Problem Statement

### Symptoms
- **Ambiguous Result Attribution**: When 2+ signals existed for the same asset within a 30-minute window, result messages could be incorrectly attributed to the wrong signal
- **Race Condition**: Multiple signals with identical parameters (same asset, entry time, and martingale_times) caused matching conflicts
- **Asynchronous Processing**: Result messages arriving before their corresponding signal messages led to orphaned results
- **Incorrect P&L Attribution**: Trading results matched to wrong signals, causing inaccurate performance tracking

### Impact
- **Data Integrity**: Incorrect signal-to-result matching compromised trading performance analytics
- **Business Risk**: Potential for incorrect position management decisions based on misattributed results
- **Operational Overhead**: Manual reconciliation required to identify and correct mismatched results
- **Customer Impact**: Inaccurate trading signal performance reporting

### Affected Systems
- **Listener Service**: Primary signal matching logic (`listener/listener.py`)
- **Signal Processing Pipeline**: Result attribution and position tracking
- **Analytics Platform**: Trading performance metrics and reporting
- **Database**: `active_signals` table and result correlation

---

## Reproduction Steps

### Scenario 1: Two Identical Signals
**Preconditions:**
- Listener service running and processing messages
- Database connection active

**Steps to Reproduce:**
1. Create two signals with identical parameters:
   ```python
   signal_1 = {
       'id': 'test_signal_1',
       'asset': 'EURUSD',
       'entryTimeUtc': '2026-03-23T14:00:00+00:00',
       'martingaleTimes': ['05:00'],  # Expires at 14:05:00
   }

   signal_2 = {
       'id': 'test_signal_2',
       'asset': 'EURUSD',
       'entryTimeUtc': '2026-03-23T14:00:00+00:00',  # Same entry
       'martingaleTimes': ['05:00'],  # Same expiration
   }
   ```

2. Process both signals in the listener (add to `active_signals`)

3. Send a result message at 14:05:02 (within ±60s tolerance):
   ```python
   result_timestamp = datetime(2026, 3, 23, 14, 5, 2, tzinfo=timezone.utc)
   result_asset = 'EURUSD'
   result_iteration = 0
   ```

4. Observe matching behavior

**Expected Behavior (Pre-Fix):**
- Both signals match (ambiguous match)
- Algorithm selects first matching signal arbitrarily
- No race condition detection
- No alert triggered

**Expected Behavior (Post-Fix):**
- Both signals detected as exact matches
- Race condition detected and logged
- `signal_race_conditions_detected_total` metric incremented
- Sentry event captured with D3 tag
- Falls back to proximity matching
- Alert logged with both signal IDs

### Scenario 2: Result Arrives Before Signal
**Preconditions:**
- Listener service running
- Empty `active_signals` list

**Steps to Reproduce:**
1. Send result message at T+0 (result arrives first):
   ```python
   result_timestamp = datetime(2026, 3, 23, 10, 5, 30, tzinfo=timezone.utc)
   result_asset = 'EURUSD'
   ```

2. Wait 5 seconds

3. Send signal message at T+5 (signal arrives after result):
   ```python
   signal = {
       'id': 'delayed_signal',
       'asset': 'EURUSD',
       'entryTimeUtc': '2026-03-23T10:00:00+00:00',
       'martingaleTimes': ['05:00'],
   }
   ```

**Expected Behavior (Pre-Fix):**
- Result processed finds no matching signal (orphaned)
- Signal arrives but result already processed
- No retry mechanism

**Expected Behavior (Post-Fix):**
- Same behavior (requires retry mechanism - not yet implemented)
- Logged as "no match" event
- **Note:** This edge case remains unresolved, requires future enhancement

### Scenario 3: Three Concurrent Signals
**Test Reference:** `tests/test_race_condition_scenarios.py::test_race_condition_three_signals`

**Steps:**
1. Create 3 signals: same asset (GBPUSD), same entry (15:00:00), same martingale (['03:00'])
2. Send result at 15:03:45 (within 60s tolerance of 15:03:00 expiration)
3. Verify all 3 signals match exactly

**Expected Outcome:**
- Race condition detected (3 exact matches)
- Metric incremented
- Sentry event includes all 3 signal IDs
- Proximity fallback returns single best match

---

## Root Cause Analysis

### Original Algorithm Weakness
The legacy matching algorithm in `find_matching_signal_legacy()` used these criteria:
- **35-minute time window**: Results considered if 0-35 minutes after signal entry
- **Proximity scoring**: Selected signal closest to expected expiration time
- **No exact match priority**: Treated all matches within tolerance equally
- **Ambiguous match threshold**: Logged warnings when >1 tier1 candidates, but still selected arbitrary first match

### Technical Root Cause
```python
# BEFORE (Problematic Logic):
# If multiple signals matched within ±2 minute tolerance,
# algorithm selected MIN score without detecting ambiguity
tier1_candidates = [...]  # Could contain 2+ signals
best_match = min(tier1_candidates, key=lambda x: x['score'])
# No race condition detection!
```

**Critical Flaw:** When 2+ signals had identical:
- Asset (e.g., EURUSD)
- Entry time (e.g., 14:00:00)
- Martingale times (e.g., ['05:00'])
- Expected expiration (e.g., 14:05:00)

...the proximity scores were **identical**, causing the algorithm to arbitrarily select the first match in iteration order.

### Contributing Factors
1. **No Iteration Matching**: Original algorithm didn't validate `result_iteration` against signal's martingale sequence
2. **Weak Tie-Breaking**: Used Python's `min()` stable sort, which preserves order for equal elements (non-deterministic from business logic perspective)
3. **Insufficient Logging**: Ambiguous matches logged but not tracked with metrics
4. **No Sentry Integration**: Race conditions not captured as structured events for analysis

---

## Solution Overview

### 3-Tier Hierarchical Matching Strategy

The fix implements a **3-tier matching algorithm** with **race condition detection**:

#### Tier 1: Exact Match (Highest Priority)
**Criteria:**
- Asset matches (normalized: `EURUSD`, `EUR/USD`, `EUR USD` → `EURUSD`)
- Result timestamp within **±60 seconds** of expected expiration time
- Signal within 0-35 minute window from entry time
- **Iteration matches**: `result_iteration` matches signal's martingale sequence index

**Scoring:** `time_diff = abs(result_timestamp - expected_expiration) in seconds`

**Example:**
```python
Signal: EURUSD, entry=10:00, martingale=['05:00'], iteration=0
Expected expiration: 10:05:00
Result: timestamp=10:05:02, asset='EURUSD', iteration=0
Time diff: 2 seconds → ✅ EXACT MATCH (Tier 1)
```

#### Tier 2: Proximity Match with Asset (Medium Priority)
**Criteria:**
- Asset matches (normalized)
- Result timestamp **outside** ±60s exact tolerance (falls from Tier 1)
- Signal within 0-35 minute window
- Uses proximity scoring based on **typical broker delay**:
  - Format 1 (fmt1): 7.0 minutes typical delay
  - Format 2 (fmt2): 0.5 minutes typical delay

**Scoring:**
```python
typical_delay = 0.5 if signal_format == 'fmt2' else 7.0
time_diff_minutes = abs(result_timestamp - expected_expiration) / 60
proximity_score = abs(time_diff_minutes - typical_delay)

# Direction bonus (if direction metadata available)
if direction_matches:
    score -= 0.5  # Lower score = better match
```

**Example:**
```python
Signal: EURUSD PUT, entry=10:00, expiration=5min (fmt1)
Expected expiration: 10:05
Result: timestamp=10:15, asset='EURUSD', direction='PUT'
Time diff: 10 minutes
Proximity: abs(10 - 7.0) = 3.0
Direction bonus: 3.0 - 0.5 = 2.5 → ✅ TIER 2 MATCH (score: 2.5)
```

#### Tier 3: Temporal Fallback (Lowest Priority)
**Criteria:**
- **No asset validation** (backward compatibility)
- Signal within 0-35 minute window
- Proximity scoring without asset checks

**Use Case:** Legacy signals or results where asset extraction failed

**Warning:** Logs deprecation warning when used; should be phased out

---

## Technical Implementation

### Key Function: `find_matching_signal()`
**Location:** `listener/listener.py` (line ~672)

**Algorithm Pseudocode:**
```python
def find_matching_signal(asset, result_timestamp, result_iteration, signals):
    tier1_candidates = []  # Exact matches
    tier2_candidates = []  # Proximity + asset
    tier3_candidates = []  # Proximity only (fallback)

    EXACT_MATCH_TOLERANCE = 60  # seconds

    for signal in signals:
        if signal.status in ['resolved', 'expired']:
            continue

        # Calculate expected expiration time
        expected_exp_time = calculate_signal_expiration_time(signal, result_iteration)

        # Apply 35-minute window filter
        delta_minutes = (result_timestamp - signal.entryTimeUtc).total_seconds() / 60
        if not (0 <= delta_minutes <= 35):
            continue

        # Tier 1: Exact Match
        if asset_matches(signal.asset, asset):
            time_diff_seconds = abs(result_timestamp - expected_exp_time).total_seconds()

            if time_diff_seconds < EXACT_MATCH_TOLERANCE:
                tier1_candidates.append({
                    'signal': signal,
                    'score': time_diff_seconds
                })
            else:
                # Tier 2: Proximity + Asset
                tier2_score = calculate_proximity_score(signal, result_timestamp, expected_exp_time)
                tier2_candidates.append({
                    'signal': signal,
                    'score': tier2_score
                })
        else:
            # Tier 3: Fallback (no asset)
            tier3_score = calculate_proximity_score(signal, result_timestamp, expected_exp_time)
            tier3_candidates.append({
                'signal': signal,
                'score': tier3_score
            })

    # Race Condition Detection
    if len(tier1_candidates) > 1:
        # RACE CONDITION DETECTED!
        signal_race_conditions_detected_total.labels(asset=asset).inc()

        # Log to Sentry with D3 tag
        sentry_sdk.capture_event({
            'message': 'D3 Race Condition: Multiple exact matches',
            'level': 'error',
            'tags': {'issue': 'D3'},
            'extra': {
                'asset': asset,
                'result_timestamp': str(result_timestamp),
                'signal_ids': [c['signal']['id'] for c in tier1_candidates],
                'match_count': len(tier1_candidates)
            }
        })

        # Fall back to proximity matching
        logger.error(f"Ambiguous match detected: {len(tier1_candidates)} signals match exact criteria")
        return find_matching_signal_proximity_only(asset, result_timestamp, signals)

    # Select best match from available tiers
    if tier1_candidates:
        best_match = min(tier1_candidates, key=lambda x: x['score'])
        return best_match['signal']
    elif tier2_candidates:
        signal_matches_proximity_fallback_total.labels(asset=asset, reason='tier2').inc()
        best_match = min(tier2_candidates, key=lambda x: x['score'])
        return best_match['signal']
    elif tier3_candidates:
        signal_matches_proximity_fallback_total.labels(asset=asset, reason='no_exact_match').inc()
        logger.warning(f"Using Tier 3 fallback matching (no asset validation)")
        best_match = min(tier3_candidates, key=lambda x: x['score'])
        return best_match['signal']
    else:
        return None  # No match found
```

### Supporting Function: `calculate_signal_expiration_time()`
**Location:** `listener/listener.py` (line ~540)

**Purpose:** Calculate expected expiration time accounting for martingale sequences

```python
def calculate_signal_expiration_time(signal, iteration=0):
    expiration_minutes = signal.get('expirationMinutes', 5)
    entry_time = parse_iso(signal['entryTimeUtc'])

    martingale_times = signal.get('martingaleTimes', [])

    if martingale_times and iteration < len(martingale_times):
        # Use martingale time for this iteration
        martingale_time_str = martingale_times[iteration]  # e.g., "05:00"
        hour, minute = parse_time(martingale_time_str)

        # Create datetime on same date as entry_time
        martingale_datetime = entry_time.replace(hour=hour, minute=minute, second=0)

        # Handle day boundary crossing (12-hour threshold)
        time_diff = (martingale_datetime - entry_time).total_seconds()
        if time_diff > 12 * 3600:  # More than 12 hours forward
            martingale_datetime -= timedelta(days=1)
        elif time_diff < -12 * 3600:  # More than 12 hours backward
            martingale_datetime += timedelta(days=1)

        return martingale_datetime + timedelta(minutes=expiration_minutes)
    else:
        # No martingale or iteration out of range
        return entry_time + timedelta(minutes=expiration_minutes)
```

### Metrics Implemented

**Prometheus Metrics:**
```python
# Race condition detection counter
signal_race_conditions_detected_total = Counter(
    'signal_race_conditions_detected_total',
    'Total race conditions detected (multiple exact matches)',
    labelnames=['asset']
)

# Proximity fallback counter
signal_matches_proximity_fallback_total = Counter(
    'signal_matches_proximity_fallback_total',
    'Total signal matches using proximity fallback',
    labelnames=['asset', 'reason']
)
```

**Reasons for Proximity Fallback:**
- `no_exact_match`: No tier 1 matches found
- `tier2`: Fell to tier 2 (asset match but outside 60s tolerance)
- `race_condition`: Multiple exact matches detected (race condition)

---

## Verification Steps

### Pre-Deployment Validation
**Reference:** `D3_FIX_SIGNOFF.md`

- [X] **Unit Tests**: 100+ tests pass
  - `tests/test_signal_matching.py`: Core matching logic
  - `tests/test_race_condition_scenarios.py`: Race condition detection
  - `tests/test_exact_expiration_matching.py`: Exact expiration matching

- [X] **Integration Tests**: End-to-end signal processing
  - `test_integration.py`: Full pipeline validation

- [X] **Performance Benchmarks**: <5ms per match operation
  - Verified with `time_signal_matching_seconds` metric

- [X] **Backward Compatibility**: Legacy signals still match correctly
  - Tier 3 fallback maintains compatibility

- [X] **Documentation**: Complete
  - `docs/CURRENT_MATCHING_ALGORITHM.md`
  - `SIGNAL_MATCHING_DESIGN.md`
  - `MIGRATION_ENHANCED_MATCHING.md`

### Post-Deployment Verification

#### 1. Check Health Endpoint
```bash
curl http://localhost:8080/health
# Expected: {"status": "healthy", "version": "2.2.0"}
```

#### 2. Verify Metrics Endpoint
```bash
curl http://localhost:8080/metrics | grep signal_race_conditions
# Should show race condition counters (initially 0)
```

#### 3. Query Prometheus for Baseline Metrics
```promql
# Race conditions detected (should start at 0, increment only when detected)
signal_race_conditions_detected_total

# Proximity fallback usage
rate(signal_matches_proximity_fallback_total[5m])

# Match timing performance
histogram_quantile(0.95, rate(time_signal_matching_seconds_bucket[5m]))
```

#### 4. Test with Synthetic Signals
```bash
# Run test suite to generate race condition scenarios
cd /opt/snaptrade-unified/listener
pytest tests/test_race_condition_scenarios.py -v

# Verify metrics incremented
curl http://localhost:8080/metrics | grep signal_race_conditions_detected_total
```

#### 5. Check Sentry for D3 Events
- Navigate to Sentry dashboard
- Filter by tag: `issue=D3`
- Verify events include:
  - Signal IDs in `extra.signal_ids`
  - Asset in `extra.asset`
  - Match count in `extra.match_count`

#### 6. Review Application Logs
```bash
# Check for race condition detection logs
tail -f /opt/snaptrade-unified/listener/listener.log | grep "Ambiguous match"

# Expected format:
# [ERROR] Ambiguous match detected: 2 signals match exact criteria for EURUSD
```

#### 7. Validate Database State
```sql
-- Verify active signals are being processed
SELECT COUNT(*) FROM active_signals WHERE status = 'pending';

-- Check for any orphaned results (should decrease over time)
SELECT COUNT(*) FROM results WHERE signal_id IS NULL;
```

---

## Monitoring & Alerting

### Critical Metrics to Monitor

#### 1. Race Condition Rate
**Metric:** `signal_race_conditions_detected_total`

**Alert Threshold:** >5 events per hour

**PromQL Query:**
```promql
rate(signal_race_conditions_detected_total[1h]) > 5
```

**Alert Configuration:**
```yaml
- alert: HighRaceConditionRate
  expr: rate(signal_race_conditions_detected_total[1h]) > 5
  for: 5m
  labels:
    severity: warning
    component: listener
  annotations:
    summary: "High rate of signal matching race conditions"
    description: "{{ $value }} race conditions per hour detected. Investigate signal generation timing."
```

#### 2. Proximity Fallback Usage
**Metric:** `signal_matches_proximity_fallback_total`

**Alert Threshold:** >10% of total matches using fallback

**PromQL Query:**
```promql
(rate(signal_matches_proximity_fallback_total{reason="no_exact_match"}[5m])
 / rate(signal_matches_total[5m])) > 0.1
```

**Alert Configuration:**
```yaml
- alert: HighProximityFallbackRate
  expr: |
    (rate(signal_matches_proximity_fallback_total{reason="no_exact_match"}[5m])
     / rate(signal_matches_total[5m])) > 0.1
  for: 10m
  labels:
    severity: warning
    component: listener
  annotations:
    summary: "High proximity fallback usage (>10%)"
    description: "{{ $value | humanizePercentage }} of matches using proximity fallback. Check asset extraction."
```

#### 3. Match Performance
**Metric:** `time_signal_matching_seconds`

**Alert Threshold:** p95 latency >100ms

**PromQL Query:**
```promql
histogram_quantile(0.95, rate(time_signal_matching_seconds_bucket[5m])) > 0.1
```

**Alert Configuration:**
```yaml
- alert: SlowSignalMatching
  expr: histogram_quantile(0.95, rate(time_signal_matching_seconds_bucket[5m])) > 0.1
  for: 5m
  labels:
    severity: warning
    component: listener
  annotations:
    summary: "Signal matching latency degraded"
    description: "p95 latency: {{ $value }}s. Expected <100ms."
```

#### 4. Unmatched Results
**Metric:** `signal_matches_total` (no match outcome)

**Alert Threshold:** >5% of results unmatched

**PromQL Query:**
```promql
(rate(signal_no_match_total[5m]) / rate(result_messages_received_total[5m])) > 0.05
```

### Sentry Integration

**Event Tagging:**
- All race condition events tagged with `issue=D3`
- Includes structured `extra` data for investigation

**Sentry Query:**
```
is:unresolved issue=D3
```

**Alert Rules:**
- Alert when >10 D3 events per hour
- Slack notification to #trading-alerts channel

### Grafana Dashboard

**Dashboard Name:** Listener - Signal Matching

**Panels:**
1. **Race Conditions Detected (Total)**: `signal_race_conditions_detected_total`
2. **Race Condition Rate (Per Hour)**: `rate(signal_race_conditions_detected_total[1h])`
3. **Proximity Fallback by Reason**: `signal_matches_proximity_fallback_total` (grouped by `reason`)
4. **Match Latency (p50, p95, p99)**: `time_signal_matching_seconds` histogram
5. **Match Outcome Distribution**: Pie chart of tier1/tier2/tier3/no_match
6. **Unmatched Results**: `signal_no_match_total` count

**Access:** https://grafana.example.com/d/listener-matching

### Log-Based Monitoring

#### Tier Usage Detection

**Grep Commands for Log Analysis:**

```bash
# Find Tier 1 (exact match) usage in logs
grep -E "Tier 1.*exact match|EXACT match found" /opt/snaptrade-unified/listener/listener.log

# Find Tier 2 (proximity match after race condition) usage
grep -E "Tier 2.*proximity.*after race|Race condition detected.*falling back" /opt/snaptrade-unified/listener/listener.log

# Find Tier 3 (no exact match fallback) usage
grep -E "Tier 3.*no exact match|Using Tier 3 fallback" /opt/snaptrade-unified/listener/listener.log

# Count tier usage over last 1000 lines
grep -E "Tier [123]" /opt/snaptrade-unified/listener/listener.log | tail -1000 | sort | uniq -c
```

#### Ambiguous Match Detection

**Grep Commands for Race Conditions:**

```bash
# Detect ambiguous matches (multiple exact matches)
grep -E "ambiguous.*multiple.*exact|Race condition.*multiple signals match" /opt/snaptrade-unified/listener/listener.log

# Find specific signal IDs involved in race conditions
grep -E "Race condition detected" /opt/snaptrade-unified/listener/listener.log | grep -oE "signal_id=[^,]+" | sort | uniq -c

# View race condition details with context
grep -B 3 -A 3 "Race condition detected" /opt/snaptrade-unified/listener/listener.log | tail -50
```

#### Alert Thresholds & Health Checks

**Tier 3 Usage Threshold:**
- **Normal:** <5% of total matches use Tier 3 fallback
- **Warning:** 5-10% Tier 3 usage indicates asset extraction issues
- **Critical:** >10% Tier 3 usage indicates systematic problem requiring immediate investigation

**Detection Query:**
```bash
# Calculate Tier 3 percentage from recent logs
TIER3=$(grep -c "Tier 3" /opt/snaptrade-unified/listener/listener.log | tail -1000)
TOTAL=$(grep -c "Tier [123]" /opt/snaptrade-unified/listener/listener.log | tail -1000)
echo "scale=2; ($TIER3 / $TOTAL) * 100" | bc
```

**Prometheus Query for Alert:**
```promql
# Alert when Tier 3 usage exceeds 10%
(rate(signal_matches_proximity_fallback_total{reason="no_exact_match"}[10m])
 / rate(signal_matches_total[10m])) > 0.10
```

**Race Condition Threshold:**
- **Normal:** 0-2 race conditions per hour (rare edge cases)
- **Warning:** 3-5 per hour indicates timing issues in signal generation
- **Critical:** >5 per hour indicates signal deduplication failure

#### Dashboard Recommendations

**Real-Time Monitoring Panel:**
1. **Tier Usage Breakdown** (Stacked Bar Chart):
   - Tier 1 (Exact): Green - target 90%+
   - Tier 2 (Race Fallback): Yellow - should be <5%
   - Tier 3 (No Exact): Red - should be <5%

2. **Ambiguous Match Rate** (Line Graph):
   - Metric: `signal_race_conditions_detected_total`
   - Threshold line at 5/hour
   - Alert annotation when exceeded

3. **Match Quality Score** (Gauge):
   - Formula: `(Tier1_count + 0.8*Tier2_count + 0.5*Tier3_count) / Total_matches`
   - Green: >0.95, Yellow: 0.85-0.95, Red: <0.85

4. **Top Assets with Tier 3 Fallback** (Table):
   - Identifies which assets have extraction issues
   - Grouped by `asset` label from metrics

**Recommended Dashboard Queries:**
```promql
# Tier usage distribution
sum by (tier) (rate(signal_matches_total[5m]))

# Match quality score
(sum(rate(signal_matches_total{tier="1"}[5m])) +
 0.8 * sum(rate(signal_matches_total{tier="2"}[5m])) +
 0.5 * sum(rate(signal_matches_total{tier="3"}[5m]))) /
sum(rate(signal_matches_total[5m]))
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Tier 3 Fallback Overuse
**Symptom:** `signal_matches_proximity_fallback_total{reason="no_exact_match"}` metric >10% of total matches

**Root Cause:**
- Asset extraction failing from result messages
- Informal message format changes
- Missing or malformed asset field in Telegram messages

**Diagnosis:**
```bash
# Check logs for Tier 3 usage warnings
grep "Using Tier 3 fallback" /opt/snaptrade-unified/listener/listener.log | tail -20

# Query metric breakdown by asset
curl -s http://localhost:8080/metrics | grep signal_matches_proximity_fallback_total
```

**Resolution:**
1. Review asset extraction regex patterns in `_parse_result_informal()`
2. Check recent Telegram message format changes
3. Verify asset normalization logic (`EURUSD` vs `EUR/USD` vs `EUR USD`)
4. Add test cases for new message formats

**Prevention:**
- Monitor asset extraction success rate
- Alert when Tier 3 usage exceeds 5% threshold
- Document all Telegram message format variations

#### Issue 2: Missing Expiration Times
**Symptom:** Results not matching signals despite correct asset and timing

**Root Cause:**
- `martingaleTimes` array empty or missing
- `expirationMinutes` field not set (defaults to 5)
- Iteration index mismatch between result and signal

**Diagnosis:**
```sql
-- Check for signals with missing expiration data
SELECT id, asset, entryTimeUtc, martingaleTimes, expirationMinutes
FROM active_signals
WHERE martingaleTimes IS NULL OR martingaleTimes = '[]'
LIMIT 10;

-- Check for signals with iteration count mismatch
SELECT s.id, s.martingaleTimes, r.iteration
FROM active_signals s
JOIN results r ON r.asset = s.asset
WHERE r.signal_id IS NULL
  AND r.timestamp > s.entryTimeUtc
  AND r.timestamp < s.entryTimeUtc + INTERVAL '35 minutes';
```

**Resolution:**
1. Validate signal parsing logic for `martingaleTimes` field
2. Ensure default expiration time (5 minutes) is applied correctly
3. Check iteration calculation in `calculate_signal_expiration_time()`
4. Verify result message includes iteration field

**Prevention:**
- Add validation for required fields during signal ingestion
- Log warning when `martingaleTimes` is empty
- Add metric for signals missing critical fields

#### Issue 3: Ambiguous Matches (D3 Race Condition)
**Symptom:** Multiple race condition alerts for same asset/time combination

**Root Cause:**
- Duplicate signals generated by upstream system
- Two strategies sending identical signals within ±60s
- Signal generation logic creating race conditions

**Diagnosis:**
```bash
# Check Sentry for D3 events
# Filter: is:unresolved issue=D3
# Look for signal_ids in extra data

# Query Prometheus for race condition rate
curl -s 'http://prometheus:9090/api/v1/query?query=rate(signal_race_conditions_detected_total[1h])'

# Check logs for specific signal IDs
grep "Ambiguous match detected" /opt/snaptrade-unified/listener/listener.log | \
  grep -oP 'signal_ids=\[\K[^\]]+' | sort | uniq -c
```

**SQL Query to Find Duplicate Signals:**
```sql
-- Identify signals with identical matching parameters
SELECT asset, entryTimeUtc, martingaleTimes, COUNT(*) as duplicate_count
FROM active_signals
WHERE status = 'pending'
  AND entryTimeUtc > NOW() - INTERVAL '2 hours'
GROUP BY asset, entryTimeUtc, martingaleTimes
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

**Resolution:**
1. Investigate upstream signal generation service
2. Check if duplicate signals are intentional (different strategies)
3. Add unique constraint or deduplication logic in ingestion layer
4. Consider adding signal source/strategy identifier field

**Prevention:**
- Monitor race condition rate (alert if >5/hour)
- Add signal deduplication before processing
- Implement signal source tracking
- Review signal generation timing coordination

### Debugging Queries

#### Query 1: Find Unmatched Results
```sql
-- Results that couldn't be matched to any signal
SELECT
    r.id,
    r.asset,
    r.timestamp,
    r.iteration,
    r.outcome,
    (SELECT COUNT(*)
     FROM active_signals s
     WHERE s.asset = r.asset
       AND s.entryTimeUtc <= r.timestamp
       AND s.status = 'pending') as potential_signals
FROM results r
WHERE r.signal_id IS NULL
  AND r.timestamp > NOW() - INTERVAL '1 hour'
ORDER BY r.timestamp DESC
LIMIT 20;
```

#### Query 2: Signals with No Matched Results
```sql
-- Active signals that haven't received results within expected window
SELECT
    s.id,
    s.asset,
    s.entryTimeUtc,
    s.martingaleTimes,
    s.status,
    EXTRACT(EPOCH FROM (NOW() - s.entryTimeUtc))/60 as age_minutes
FROM active_signals s
WHERE s.status = 'pending'
  AND s.entryTimeUtc < NOW() - INTERVAL '10 minutes'
  AND NOT EXISTS (
      SELECT 1 FROM results r WHERE r.signal_id = s.id
  )
ORDER BY s.entryTimeUtc DESC
LIMIT 20;
```

#### Query 3: Signals Expiring Soon (Check for Race Conditions)
```sql
-- Find signals that might have race conditions based on proximity
SELECT
    s1.id as signal1_id,
    s2.id as signal2_id,
    s1.asset,
    s1.entryTimeUtc,
    s1.martingaleTimes,
    EXTRACT(EPOCH FROM (s2.entryTimeUtc - s1.entryTimeUtc)) as time_diff_seconds
FROM active_signals s1
JOIN active_signals s2
    ON s1.asset = s2.asset
    AND s1.martingaleTimes = s2.martingaleTimes
    AND s1.id < s2.id
WHERE s1.status = 'pending'
  AND s2.status = 'pending'
  AND ABS(EXTRACT(EPOCH FROM (s2.entryTimeUtc - s1.entryTimeUtc))) < 120
ORDER BY time_diff_seconds ASC;
```

### Log Analysis Tips

#### Identifying Race Conditions in Logs
```bash
# Pattern 1: Multiple exact matches
grep "Ambiguous match detected" listener.log | \
  awk '{print $1, $2, $NF}' | \
  sort | uniq -c

# Pattern 2: Race condition with signal IDs
grep -A 5 "D3 Race Condition" listener.log | \
  grep "signal_ids" | \
  jq -r '.extra.signal_ids[]'

# Pattern 3: Proximity fallback usage
grep "Using Tier 3 fallback" listener.log | wc -l

# Pattern 4: Time-based analysis of issues
grep -E "Ambiguous match|Tier 3 fallback|no match found" listener.log | \
  awk '{print $1" "$2}' | \
  cut -c1-13 | \
  sort | uniq -c
```

#### Correlation Analysis
```bash
# Find results processed around the same time as a known race condition
RACE_TIMESTAMP="2026-03-24T10:05:00"
grep -B 10 -A 10 "$RACE_TIMESTAMP" listener.log | \
  grep -E "Processing result|Matched signal|Race condition"

# Track a specific signal through the pipeline
SIGNAL_ID="signal_abc123"
grep "$SIGNAL_ID" listener.log | \
  grep -E "Signal received|Calculating expiration|Matched|Resolved"
```

#### Performance Analysis
```bash
# Find slow matching operations (>100ms)
grep "time_signal_matching_seconds" listener.log | \
  awk '$NF > 0.1 {print $0}' | \
  tail -20

# Check memory usage during processing
grep -E "Memory|GC|OutOfMemory" listener.log | tail -50
```

### How to Identify if D3 Is Recurring

#### Method 1: Sentry Event Tracking
1. Navigate to Sentry dashboard: https://sentry.io/organizations/snaptrade/projects/listener
2. Filter by tag: `issue=D3`
3. Check event frequency:
   - **Normal:** 0-2 events/hour (acceptable level)
   - **Warning:** 3-10 events/hour (investigate asset duplication)
   - **Critical:** >10 events/hour (D3 recurring, immediate action required)
4. Review `extra.signal_ids` for patterns:
   - Same signal IDs repeating → signal cleanup issue
   - Different signal IDs same asset → upstream generation issue
   - Multiple assets affected → systemic timing issue

#### Method 2: Prometheus Metrics
```bash
# Check race condition rate over last 24 hours
curl -s 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=increase(signal_race_conditions_detected_total[24h])' | \
  jq -r '.data.result[] | "\(.metric.asset): \(.value[1])"'

# Compare current hour vs previous hour
curl -s 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=rate(signal_race_conditions_detected_total[1h])' | \
  jq -r '.data.result[] | "\(.metric.asset): \(.value[1])"'

# Alert if rate increasing
# If current_hour_rate > 2 * previous_hour_rate → D3 recurring
```

#### Method 3: Database Pattern Analysis
```sql
-- Check for signals that repeatedly cause race conditions
SELECT
    asset,
    DATE_TRUNC('hour', entryTimeUtc) as hour,
    COUNT(*) as signal_count,
    COUNT(DISTINCT id) as unique_signals,
    COUNT(*) - COUNT(DISTINCT id) as potential_duplicates
FROM active_signals
WHERE entryTimeUtc > NOW() - INTERVAL '24 hours'
GROUP BY asset, DATE_TRUNC('hour', entryTimeUtc)
HAVING COUNT(*) > COUNT(DISTINCT id)
ORDER BY potential_duplicates DESC;
```

#### Method 4: Log Trend Analysis
```bash
# Count race conditions per hour for last 24 hours
grep "Ambiguous match detected" listener.log | \
  awk '{print $1" "$2}' | \
  cut -c1-13 | \
  sort | uniq -c | \
  tail -24

# If count increasing each hour → D3 recurring
# Example output indicating recurring issue:
# 2 2026-03-24 08  ← Normal
# 3 2026-03-24 09  ← Normal
# 8 2026-03-24 10  ← Warning
# 15 2026-03-24 11 ← CRITICAL - D3 recurring!
```

#### Decision Tree: Is D3 Recurring?
```
1. Check Sentry D3 events in last hour:
   ├─ 0-2 events → ✅ Normal, no action needed
   ├─ 3-10 events → ⚠️ Monitor next hour, review signal generation
   └─ >10 events → 🚨 D3 RECURRING, proceed to step 2

2. Check Prometheus race condition rate trend:
   ├─ Rate stable or decreasing → Temporary spike, continue monitoring
   └─ Rate increasing → 🚨 CONFIRMED D3 RECURRING, proceed to step 3

3. Immediate Actions:
   ├─ Create incident ticket (Priority: P1)
   ├─ Alert #trading-alerts Slack channel
   ├─ Run database query to identify duplicate signals
   ├─ Check upstream signal generation service logs
   ├─ Review recent code deployments to signal generator
   └─ Consider enabling signal deduplication (if available)

4. Investigation:
   ├─ Compare signal generation timestamps
   ├─ Check for configuration changes in last 24 hours
   ├─ Review Telegram API rate limiting logs
   └─ Verify signal source identification working correctly
```

#### Quick Health Check Script
```bash
#!/bin/bash
# File: check_d3_health.sh
# Quick check if D3 issue is recurring

echo "=== D3 Health Check ==="
echo

# Check 1: Recent race conditions
RECENT_RACES=$(grep "Ambiguous match detected" /opt/snaptrade-unified/listener/listener.log | \
  grep "$(date '+%Y-%m-%d')" | wc -l)
echo "Race conditions today: $RECENT_RACES"

# Check 2: Sentry events (requires sentry-cli)
# SENTRY_EVENTS=$(sentry-cli issues list --query "issue:D3" --status unresolved | wc -l)
# echo "Open D3 Sentry events: $SENTRY_EVENTS"

# Check 3: Prometheus metric
CURRENT_TOTAL=$(curl -s http://localhost:8080/metrics | \
  grep "^signal_race_conditions_detected_total" | \
  awk '{sum+=$2} END {print sum}')
echo "Total race conditions detected: $CURRENT_TOTAL"

# Check 4: Active duplicate signals
echo
echo "Checking for duplicate signals in database..."
# psql -d snaptrade -c "SELECT asset, COUNT(*) FROM active_signals WHERE status='pending' GROUP BY asset HAVING COUNT(*) > 1;"

echo
if [ "$RECENT_RACES" -gt 10 ]; then
    echo "🚨 STATUS: D3 IS RECURRING - Immediate action required!"
    exit 1
elif [ "$RECENT_RACES" -gt 5 ]; then
    echo "⚠️  STATUS: WARNING - Increased race conditions detected"
    exit 2
else
    echo "✅ STATUS: HEALTHY - Race conditions within normal range"
    exit 0
fi
```

---

## Rollback Procedure

### When to Rollback
Rollback if any of the following occur within 24 hours of deployment:
- **Critical:** >20% increase in unmatched results
- **Critical:** Service crashes or becomes unresponsive
- **Critical:** Data integrity issues (results matched to wrong signals verified by manual audit)
- **Warning:** >50 race condition alerts per hour (indicates logic error)
- **Warning:** p95 latency >500ms (5x degradation)

### Automated Rollback Script
**Location:** `/opt/snaptrade-unified/listener/scripts/rollback_matching_fix.sh`

**Execution:**
```bash
# Dry run (preview changes)
cd /opt/snaptrade-unified/listener/scripts
./rollback_matching_fix.sh --dry-run

# Execute rollback
./rollback_matching_fix.sh
```

**What the Script Does:**
1. **Aliases function**: Maps `find_matching_signal` → `find_matching_signal_legacy`
2. **Restarts service**: Uses systemctl or restart.sh script
3. **Verifies health**: Retries health endpoint up to 30 times (60 seconds total)
4. **Sends alerts**: Posts rollback status to Slack via webhook

### Manual Rollback Steps

#### Step 1: Backup Current State
```bash
cd /opt/snaptrade-unified/listener
cp listener.py listener.py.rollback_backup_$(date +%Y%m%d_%H%M%S)
```

#### Step 2: Revert Code Changes
```bash
# Option A: Use git to revert to previous commit
git log --oneline | head -5  # Find commit before D3 fix
git checkout <commit_hash> listener.py

# Option B: Restore from backup
cp backups/listener.py.20260323_pre_d3.bak listener.py
```

#### Step 3: Restart Service
```bash
# If using systemd
sudo systemctl restart listener

# If using standalone script
./restart.sh

# Verify service started
sudo systemctl status listener
# Or
ps aux | grep listener
```

#### Step 4: Verify Health
```bash
# Wait 10 seconds for service to initialize
sleep 10

# Check health endpoint
curl http://localhost:8080/health

# Expected output:
# {"status": "healthy", "version": "2.1.0"}  # Version should be pre-fix
```

#### Step 5: Verify Legacy Matching Active
```bash
# Check logs for legacy matching behavior
tail -n 100 listener.log | grep "matching"

# Should see legacy log patterns (no tier1/tier2/tier3 mentions)
```

#### Step 6: Monitor Post-Rollback Metrics
```bash
# Watch Prometheus metrics for 30 minutes
watch -n 60 'curl -s http://localhost:8080/metrics | grep signal_matches'

# Verify:
# - signal_race_conditions_detected_total stops incrementing
# - signal_matches_proximity_fallback_total stops incrementing
# - Legacy matching_stats patterns resume
```

#### Step 7: Notify Stakeholders
```bash
# Send Slack notification
SLACK_WEBHOOK="<webhook_url>"
curl -X POST -H 'Content-type: application/json' \
  --data '{
    "text": "⚠️ ROLLBACK EXECUTED: Listener reverted to legacy matching (pre-D3 fix). Service healthy. Incident ticket: INC-XXXX"
  }' \
  "$SLACK_WEBHOOK"
```

#### Step 8: Create Incident Ticket
- Document rollback reason
- Include metrics/logs showing issue
- Attach error screenshots from Sentry
- Assign to engineering lead for root cause analysis

### Rollback Validation Checklist
- [ ] Service health endpoint responding (HTTP 200)
- [ ] No error spikes in logs (check last 100 lines)
- [ ] Prometheus metrics stable (no crash loops)
- [ ] Sentry error rate returned to baseline (<5 errors/hour)
- [ ] Database connection pool healthy
- [ ] Active signals processing normally (query `active_signals` table)
- [ ] No new race condition alerts (D3 tag events stopped)
- [ ] Stakeholders notified via Slack
- [ ] Incident ticket created and assigned

### Post-Rollback Investigation
1. **Capture diagnostic data**:
   - Export Prometheus metrics for 24-hour period
   - Download Sentry events (filtered by `issue=D3`)
   - Collect application logs (`listener.log`)
   - Query database for signal/result correlation issues

2. **Analyze root cause**:
   - Review code diff between pre-fix and D3 fix
   - Identify specific edge case that triggered rollback
   - Reproduce issue in staging environment

3. **Plan remediation**:
   - Create fix for identified issue
   - Add regression tests to prevent recurrence
   - Schedule re-deployment with extended monitoring

---

## Related Documentation

### Primary References
- **`D3_FIX_SIGNOFF.md`**: Deployment approval and validation checklist
- **`docs/CURRENT_MATCHING_ALGORITHM.md`**: Detailed algorithm specification and pseudocode
- **`SIGNAL_MATCHING_DESIGN.md`**: Original design document and edge case analysis
- **`CHANGELOG.md`**: Version history and change log entries

### Implementation Files
- **`listener/listener.py`**: Main implementation (lines 672+)
- **`tests/test_race_condition_scenarios.py`**: Race condition test suite
- **`tests/test_exact_expiration_matching.py`**: Exact matching validation tests
- **`tests/test_signal_matching.py`**: Core matching logic tests

### Operational Guides
- **`POST_DEPLOYMENT_MONITORING.md`**: 24-hour monitoring checklist
- **`DEPLOYMENT_CHECKLIST.md`**: Pre-deployment validation steps
- **`CRASH_RECOVERY_RUNBOOK.md`**: Service recovery procedures
- **`TROUBLESHOOTING.md`**: Common issues and solutions

### Supporting Documentation
- **`docs/EDGE_CASES.md`**: Known edge cases and handling strategies
- **`docs/FALLBACK_STRATEGY.md`**: Tier 3 fallback matching details
- **`docs/LOGGING_STRATEGY.md`**: Log format and severity levels
- **`docs/METRICS_SPEC.md`**: Prometheus metrics specification
- **`MIGRATION_ENHANCED_MATCHING.md`**: Migration guide from legacy to 3-tier matching

### Scripts
- **`scripts/rollback_matching_fix.sh`**: Automated rollback script
- **`verify_production.sh`**: Production environment validation
- **`deploy.sh`**: Deployment automation script

---

## Appendix: Known Limitations

### Limitation 1: Result-Before-Signal Race Condition
**Status:** Unresolved (requires future enhancement)

**Description:** When result message arrives before signal message due to async Telegram processing, result becomes orphaned.

**Workaround:** None currently implemented. Requires retry mechanism with exponential backoff.

**Impact:** Low (<1% of signals based on monitoring data)

### Limitation 2: Identical Signals from Different Sources
**Status:** Mitigated by race condition detection

**Description:** Two different trading strategies generating identical signals (same asset, entry time, expiration) cause ambiguous matching.

**Workaround:** Race condition detected, falls back to proximity matching. Manual review recommended.

**Impact:** Medium (alerts allow manual investigation)

### Limitation 3: Asset Extraction Failures
**Status:** Mitigated by Tier 3 fallback

**Description:** Informal result message formats may fail asset extraction, falling back to temporal-only matching.

**Workaround:** Tier 3 fallback maintains backward compatibility. Improve regex patterns in `_parse_result_informal()`.

**Impact:** Low (Tier 3 usage monitored, <5% expected)

---

## Contact Information

**On-Call Engineer:** #oncall-trading-platform
**Slack Channel:** #trading-alerts
**Incident Management:** https://pagerduty.com/incidents
**Grafana Dashboard:** https://grafana.example.com/d/listener-matching
**Sentry Project:** https://sentry.io/organizations/snaptrade/projects/listener

---

**Document Owner:** Platform Engineering Team
**Review Cycle:** Quarterly
**Next Review:** 2026-06-24
