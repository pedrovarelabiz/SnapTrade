# Current Signal Matching Algorithm

## Overview

The `find_matching_signal` algorithm solves the **D3 race condition** where result messages may arrive before their corresponding signal messages due to asynchronous Telegram message processing. It implements a **3-tier hierarchical matching strategy** that prioritizes specificity over generality to accurately correlate result messages with pending signals.

**Location**: `listener/listener.py` (line 672)

## Algorithm Purpose

When a result message arrives, the algorithm searches through `active_signals` to find the best matching signal based on:
- Temporal proximity (time-based window)
- Asset matching (when available)
- Direction matching (when available)
- Expected expiration time calculation

The algorithm returns the single best matching signal or `None` if no suitable match exists.

## Time Window Logic

### 35-Minute Window (Line 723)
```python
delta_min = (result_date - entry).total_seconds() / 60
if not (0 <= delta_min <= 35):
    continue
```

**Rationale**: Signals are only considered if the result message arrives between 0 and 35 minutes after the signal's entry time. This window accounts for:
- Signal entry time
- Position expiration duration (typically 5 minutes)
- Martingale sequences (up to 3 levels, each with 5-minute expiration)
- Broker confirmation delays (typically 0.5-7 minutes depending on format)
- Message processing delays
- Network latency and async processing overhead

### Expected Expiration Time Calculation

The algorithm calculates `expected_exp_time` using `calculate_signal_expiration_time()`:

```python
# If signal has martingale positions:
if martingaleTimes:
    base_time = last_martingale_time  # e.g., "10:10"
else:
    base_time = entryTimeUtc  # e.g., "2024-01-01T10:00:00Z"

expected_exp_time = base_time + expirationMinutes
```

This ensures matching accounts for averaged-down positions where the relevant expiration is based on the **last martingale entry**, not the original signal entry.

## 3-Tier Matching Strategy

### Tier 1: Exact Match (Highest Priority)
**Criteria**:
- Asset matches (normalized)
- Result date within ±2 minutes of expected expiration time
- Signal within 0-35 minute window

**Scoring**: `time_diff = abs(result_date - expected_exp_time) in minutes`

**Use Case**: Normal operations where result arrives close to expected expiration.

**Example**:
```python
Signal: EURUSD CALL, entry 10:00, expiration 5min, martingale ["10:05"]
Expected expiration: 10:10 (10:05 + 5min)
Result: arrives at 10:11:30, asset="EURUSD"
Time diff: 1.5 minutes
Match: ✅ Tier 1 (1.5 < 2.0 minutes tolerance)
```

### Tier 2: Asset-Only Match (Medium Priority)
**Criteria**:
- Asset matches (normalized)
- Result date NOT within ±2 minutes of expected expiration (falls outside Tier 1)
- Signal within 0-35 minute window
- Optional direction bonus (subtracts 0.5 from score if direction also matches)

**Scoring**:
```python
signal_format = sig.get("format", "fmt1")
typical_delay = 0.5 if signal_format == "fmt2" else 7.0
time_diff = abs(result_date - expected_exp_time) in minutes
proximity_score = abs(time_diff - typical_delay)

# Direction bonus
if direction matches:
    score = proximity_score - 0.5  # Lower is better
else:
    score = proximity_score
```

**Use Case**: Results that arrive with significant delay but asset metadata is available.

**Example**:
```python
Signal: EURUSD PUT, entry 10:00, expiration 5min (fmt1)
Expected expiration: 10:05
Result: arrives at 10:15, asset="EURUSD", direction="PUT"
Time diff: 10 minutes
Proximity: abs(10 - 7.0) = 3.0
Direction match bonus: 3.0 - 0.5 = 2.5
Match: ✅ Tier 2 (score: 2.5)
```

### Tier 3: Temporal-Only Match (Lowest Priority)
**Criteria**:
- No asset provided (backward compatibility mode)
- Signal within 0-35 minute window
- Uses proximity scoring without asset validation

**Scoring**:
```python
typical_delay = 0.5 if signal_format == "fmt2" else 7.0
time_diff = abs(result_date - expected_exp_time) in minutes
proximity_score = abs(time_diff - typical_delay)
tier3_score = (proximity_score, time_diff)  # Tuple for tie-breaking
```

**Use Case**: Legacy signals or results without extracted asset metadata.

**Example**:
```python
Signal: GBPUSD CALL, entry 10:00, expiration 5min (fmt2)
Expected expiration: 10:05
Result: arrives at 10:06, asset=None
Time diff: 1 minute
Proximity: abs(1 - 0.5) = 0.5
Match: ✅ Tier 3 (score: (0.5, 1))
```

## Pseudocode

```
FUNCTION find_matching_signal(result_date, asset=None, direction=None):
    // Initialize tier candidate lists
    tier1_candidates = []
    tier2_candidates = []
    tier3_candidates = []

    // Constants
    EXACT_MATCH_TOLERANCE_MINUTES = 2.0
    typical_delay_fmt1 = 7.0
    typical_delay_fmt2 = 0.5

    // Iterate through all active signals
    FOR EACH signal IN active_signals:
        // Skip resolved or expired signals
        IF signal.status IN ["resolved", "expired"]:
            CONTINUE

        // Parse entry time and ensure timezone
        entry_time = parse_iso(signal.entryTimeUtc)
        IF entry_time has no timezone:
            entry_time = add_utc_timezone(entry_time)

        // Apply 35-minute time window filter
        delta_minutes = (result_date - entry_time).total_seconds / 60
        IF NOT (0 <= delta_minutes <= 35):
            CONTINUE  // Outside time window

        // Calculate expected expiration time
        expected_exp_time = calculate_signal_expiration_time(signal)

        // Tier 1: Exact Match (asset + time proximity)
        IF asset IS PROVIDED:
            normalized_signal_asset = normalize_asset(signal.asset)
            normalized_provided_asset = normalize_asset(asset)

            IF normalized_signal_asset == normalized_provided_asset:
                time_diff = abs(result_date - expected_exp_time) in minutes

                // Check Tier 1 tolerance
                IF time_diff < EXACT_MATCH_TOLERANCE_MINUTES:
                    ADD {signal, score: time_diff} TO tier1_candidates

                // Check Tier 2 (asset match but outside exact time tolerance)
                ELSE:
                    signal_format = signal.get("format", "fmt1")
                    typical_delay = typical_delay_fmt2 IF signal_format == "fmt2" ELSE typical_delay_fmt1
                    proximity_score = abs(time_diff - typical_delay)

                    score = proximity_score

                    // Direction bonus
                    IF direction IS PROVIDED:
                        normalized_signal_direction = signal.direction.upper()
                        normalized_provided_direction = direction.upper()
                        IF normalized_signal_direction == normalized_provided_direction:
                            score -= 0.5  // Bonus (lower is better)

                    ADD {signal, score} TO tier2_candidates

        // Tier 3: Backward compatibility (no asset)
        ELSE:
            signal_format = signal.get("format", "fmt1")
            typical_delay = typical_delay_fmt2 IF signal_format == "fmt2" ELSE typical_delay_fmt1
            time_diff = abs(result_date - expected_exp_time) in minutes
            proximity_score = abs(time_diff - typical_delay)

            tier3_score = (proximity_score, time_diff)  // Tuple for tie-breaking
            ADD {signal, score: tier3_score} TO tier3_candidates

    // Select best match using tier hierarchy
    best_match = None
    tier_used = None

    IF tier1_candidates IS NOT EMPTY:
        best_match = candidate with MIN score FROM tier1_candidates
        tier_used = "tier1"
        INCREMENT matching_stats["tier1"]
    ELSE IF tier2_candidates IS NOT EMPTY:
        best_match = candidate with MIN score FROM tier2_candidates
        tier_used = "tier2"
        INCREMENT matching_stats["tier2"]
    ELSE IF tier3_candidates IS NOT EMPTY:
        best_match = candidate with MIN score FROM tier3_candidates
        tier_used = "tier3"
        INCREMENT matching_stats["tier3"]

    // Detect ambiguous matches
    IF best_match AND (tier1_candidates.length > 1 OR tier2_candidates.length > 3):
        INCREMENT ambiguous_matches
        LOG WARNING "Ambiguous signal match"

        IF ambiguous_matches % 10 == 0:
            SEND Sentry alert "High ambiguous match rate"

    // Return result
    IF best_match:
        LOG "Matched signal {signal.id} (asset={signal.asset}, tier={tier_used}, score={score})"
        RETURN best_match.signal
    ELSE:
        INCREMENT matching_stats["no_match"]
        LOG "No matching signal for result at {result_date}"
        RETURN None
END FUNCTION


FUNCTION calculate_signal_expiration_time(signal):
    expiration_minutes = signal.get("expirationMinutes", 5)
    entry_time = parse_iso(signal.entryTimeUtc)

    IF signal.martingaleTimes IS NOT EMPTY:
        // Use last martingale time as base
        last_martingale = signal.martingaleTimes[-1]  // e.g., "10:10"
        hour, minute = parse_time(last_martingale)

        // Create datetime with same date as entry_time
        martingale_datetime = entry_time.replace(hour=hour, minute=minute, second=0)

        // Handle day boundary crossing
        time_diff = (martingale_datetime - entry_time).total_seconds
        IF time_diff > 12 * 3600:  // More than 12 hours forward
            martingale_datetime -= 1 day  // Martingale was previous day
        ELSE IF time_diff < -12 * 3600:  // More than 12 hours backward
            martingale_datetime += 1 day  // Martingale is next day

        RETURN martingale_datetime + expiration_minutes
    ELSE:
        RETURN entry_time + expiration_minutes
END FUNCTION


FUNCTION normalize_asset(asset):
    IF asset IS EMPTY:
        RETURN ""

    normalized = asset.strip().upper()

    // Normalize OTC variants
    normalized = normalized.replace("_OTC", "OTC")
    normalized = normalized.replace("-OTC", "OTC")

    // Remove spaces and slashes
    normalized = normalized.replace(" ", "")
    normalized = normalized.replace("/", "")

    RETURN normalized
END FUNCTION
```

## Edge Cases and Race Conditions

### 1. D3 Race Condition (Primary Problem)
**Description**: Result message arrives before signal message due to async processing.

**Scenario**:
```
Timeline:
10:00:00 - Trade signal generated
10:05:00 - Position expires
10:05:30 - Result message arrives at listener
10:05:35 - Signal message arrives at listener (5-second delay)
```

**Current Behavior**:
- Result processed at 10:05:30 finds NO matching signal (not yet in `active_signals`)
- Signal arrives at 10:05:35 but result already processed
- Result becomes orphaned

**Mitigation**: The 35-minute lookback window partially helps, but this edge case still occurs when signal hasn't arrived yet. **Requires retry logic** (not implemented in current algorithm).

### 2. Multiple Signals Same Asset Same Time
**Description**: Ambiguous matching when multiple signals for the same asset exist within the time window.

**Scenario**:
```
Signal A: EURUSD CALL, entry 10:00, expiration 10:05
Signal B: EURUSD CALL, entry 10:02, expiration 10:07
Result: arrives at 10:06, asset="EURUSD"
```

**Current Behavior**:
- Both signals in tier1_candidates (both within ±2 min tolerance)
- Algorithm selects MIN score (closest to expected expiration)
- Logs ambiguous match warning
- **Risk**: May select wrong signal if expiration times are very close

**Mitigation**: Direction matching helps differentiate, but still ambiguous if both have same direction.

### 3. Asset Extraction Failures
**Description**: Result messages with informal formats may fail to extract asset metadata.

**Scenario**:
```
Result message: "✅ Win +$45.20"  // No asset information
Active signals: EURUSD (10:05), GBPUSD (10:06), USDJPY (10:07)
```

**Current Behavior**:
- Falls back to Tier 3 (temporal-only matching)
- Uses proximity scoring without asset validation
- **Risk**: May match wrong asset if multiple signals close together

**Mitigation**: None in current algorithm. Depends on improved parsing in `_parse_result_informal()`.

### 4. Day Boundary Martingale Crossing
**Description**: Martingale times that cross midnight can cause incorrect expiration calculations.

**Scenario**:
```
Signal entry: 23:55 (11:55 PM)
Martingale time: "00:05" (next day)
Expected: 00:10 (next day)
```

**Current Behavior**:
- `calculate_signal_expiration_time()` handles this with 12-hour threshold logic (lines 576-579)
- If `martingale_time - entry_time > 12 hours`, assumes previous day
- If `martingale_time - entry_time < -12 hours`, assumes next day

**Risk**: Edge case at exactly 12:00 UTC might be mishandled.

### 5. Format-Specific Delay Assumptions
**Description**: Hardcoded delay assumptions may not match actual broker behavior.

**Constants**:
```python
typical_delay_fmt1 = 7.0  # minutes
typical_delay_fmt2 = 0.5  # minutes
```

**Scenario**:
- Format 1 broker has unusual 15-minute delay
- Result arrives at 10:20 (expected 10:05 + 15min)
- Proximity score: abs(15 - 7.0) = 8.0 (high score = low priority)

**Current Behavior**:
- May be outscored by other signals with better proximity
- **Risk**: Matches wrong signal or fails to match

**Mitigation**: Requires per-channel or per-broker delay configuration (not implemented).

### 6. Expired Signal Accumulation
**Description**: Signals marked "expired" remain in `active_signals` and consume memory/processing.

**Current Behavior**:
- Line 711 skips signals with status "resolved" or "expired"
- But signals are never removed from `active_signals` list
- **Risk**: Performance degradation over time as list grows

**Mitigation**: Requires periodic cleanup mechanism (not implemented in matching algorithm).

### 7. Tie-Breaking in Tier 3
**Description**: Multiple signals with identical proximity scores.

**Scenario**:
```
Signal A: fmt1, proximity score = 0.5
Signal B: fmt1, proximity score = 0.5
```

**Current Behavior**:
- Uses tuple scoring: `(proximity_score, time_diff)`
- Breaks ties by selecting signal with shorter `time_diff` (closer to expected expiration)
- Uses Python's `min()` which is stable (preserves order for equal elements)

**Risk**: First matching signal in iteration order selected if completely equal.

### 8. Missing Direction Metadata
**Description**: Direction parameter is optional; missing direction reduces matching confidence.

**Scenario**:
```
Signal A: EURUSD CALL
Signal B: EURUSD PUT
Result: asset="EURUSD", direction=None
```

**Current Behavior**:
- Both signals compete in Tier 1 or Tier 2
- No direction bonus applied
- Selects based purely on time proximity
- **Risk**: May match opposite direction (CALL vs PUT)

**Mitigation**: None in current algorithm. Depends on improved parsing.

### 9. Timezone Edge Cases
**Description**: Incorrect timezone handling can cause off-by-hours matching errors.

**Current Behavior**:
- Lines 718-719 ensure all timestamps have UTC timezone
- Handles "Z" suffix and ISO format with timezone
- Falls back to adding UTC timezone if missing

**Risk**: If signal entry times are logged in local time without timezone info, they'll be incorrectly treated as UTC.

### 10. EXACT_MATCH_TOLERANCE_MINUTES Boundary
**Description**: Results arriving exactly at 2.00 minutes may exhibit boundary behavior.

**Scenario**:
```
Time diff = 2.000000 minutes
EXACT_MATCH_TOLERANCE_MINUTES = 2.0
Condition: time_diff < 2.0 → False
```

**Current Behavior**:
- Exact boundary excluded from Tier 1 (uses `<` not `<=`)
- Falls to Tier 2 instead

**Risk**: Minor inconsistency; 1.99 minutes matches Tier 1, 2.00 minutes matches Tier 2.

## Statistics and Monitoring

The algorithm tracks:
- `matching_stats["tier1"]` - Count of Tier 1 matches
- `matching_stats["tier2"]` - Count of Tier 2 matches
- `matching_stats["tier3"]` - Count of Tier 3 matches
- `matching_stats["no_match"]` - Count of failed matches
- `ambiguous_matches` - Count of ambiguous matches (multiple candidates)

**Sentry Integration**:
- Ambiguous match alerts every 10 occurrences (line 792-793)
- Breadcrumbs for each match with tier and candidate counts (line 811)

**Debug Logging** (enabled via `SIGNAL_MATCHING_DEBUG`):
- Candidate counts per tier
- Detailed signal IDs, assets, and scores
- Final match selection

## Known Limitations

1. **No retry mechanism** for D3 race condition (result before signal)
2. **Asset extraction is best-effort** and regex-based
3. **Hardcoded delay assumptions** per format (not broker-specific)
4. **35-minute window is a general default** (not tuned per channel)
5. **No cleanup of expired signals** from `active_signals` list
6. **Direction matching is optional** and may be unavailable
7. **Ambiguous matches logged but not prevented** (first match wins)

## Related Functions

- `calculate_signal_expiration_time(signal)` - Computes expected expiration with martingale support
- `normalize_asset_for_matching(asset)` - Normalizes asset symbols for comparison
- `find_matching_signal_legacy(result_date)` - Legacy implementation for rollback testing

## References

- Algorithm implementation: `listener/listener.py` (line 672)
- Migration guide: `MIGRATION_ENHANCED_MATCHING.md`
- Architecture overview: `ARCHITECTURE.md` (Signal Result Matching section)
- Test suite: `test_signal_matching.py`
