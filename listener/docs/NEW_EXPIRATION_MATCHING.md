# Exact Expiration Matching Algorithm

## Overview
This document specifies the algorithm for matching options contracts based on exact expiration time calculated from signal metadata, with fallback logic for proximity matching.

## Core Calculation

### Exact Expiration Time
```
exact_expiration_time = signal_timestamp + martingale_time
```

Where:
- `signal_timestamp`: The timestamp when the trading signal was generated (UTC)
- `martingale_time`: The time duration until expiration (e.g., 60 seconds, 5 minutes)
- `exact_expiration_time`: The precise target expiration timestamp (UTC)

## Matching Logic

### Phase 1: Exact Match
1. Calculate `exact_expiration_time` from signal metadata
2. Query available options contracts
3. **First Priority**: Find contract where `contract.expiration == exact_expiration_time`
4. If exact match found, return immediately

### Phase 2: Proximity Fallback
If no exact match exists:

1. Find all contracts with `contract.expiration >= exact_expiration_time`
2. Sort by `abs(contract.expiration - exact_expiration_time)` ascending
3. Select the closest contract
4. **Constraint**: Only match if `contract.expiration - exact_expiration_time <= max_acceptable_delta`
   - Default `max_acceptable_delta`: 300 seconds (5 minutes)
   - Configurable per strategy

### Phase 3: No Match Handling
If no contract within acceptable delta:
- Log warning with signal details
- Return `None` or raise `NoMatchingContractError`
- Do NOT execute trade

## Edge Cases

### Edge Case 1: Multiple Exact Matches
**Scenario**: Multiple contracts with identical expiration time
**Handling**:
- Select contract with highest liquidity (open_interest)
- If liquidity tied, select lowest strike price
- Log selection criteria used

### Edge Case 2: Past Expiration Time
**Scenario**: `exact_expiration_time` is in the past (signal delayed)
**Handling**:
- Reject immediately
- Log error: "Signal expired - calculated expiration in the past"
- Return `None`

### Edge Case 3: Expiration Too Far Future
**Scenario**: No contracts available before `exact_expiration_time + max_acceptable_delta`
**Handling**:
- Use closest available contract within delta
- If none within delta, reject trade
- Log warning with available expiration times

### Edge Case 4: Market Closed
**Scenario**: Signal received when market is closed, expiration would occur during closed hours
**Handling**:
- Calculate next market open time
- Adjust search to earliest available contract after market reopens
- Log adjustment with original vs adjusted expiration

### Edge Case 5: Zero or Negative Martingale Time
**Scenario**: `martingale_time <= 0`
**Handling**:
- Reject signal as invalid
- Log error: "Invalid martingale_time"
- Require `martingale_time >= minimum_duration` (default: 30 seconds)

### Edge Case 6: Timestamp Timezone Mismatch
**Scenario**: `signal_timestamp` in different timezone than contract expirations
**Handling**:
- **All timestamps must be normalized to UTC**
- Convert signal_timestamp to UTC if not already
- Convert contract expirations to UTC if not already
- Perform all calculations in UTC
- Log warning if timezone conversion required

### Edge Case 7: Fractional Seconds
**Scenario**: Calculated expiration has fractional seconds, contracts use whole seconds
**Handling**:
- Round `exact_expiration_time` to nearest second
- Use standard rounding (0.5+ rounds up)
- Document rounding behavior in logs

### Edge Case 8: Network Delay / Stale Data
**Scenario**: Contract data is stale, selected contract expired before order execution
**Handling**:
- Check `current_time < contract.expiration` immediately before order
- If expired, retry matching with fresh data
- Maximum 2 retry attempts
- Log each retry

### Edge Case 9: Insufficient Liquidity on Match
**Scenario**: Matched contract has zero volume or extremely wide bid-ask
**Handling**:
- Define minimum liquidity threshold (e.g., min_open_interest = 10)
- If exact match fails liquidity check, proceed to proximity fallback
- Include liquidity filter in proximity search
- Reject if no liquid contracts available

### Edge Case 10: Missing Signal Metadata
**Scenario**: `signal_timestamp` or `martingale_time` missing from signal
**Handling**:
- Reject signal as malformed
- Log error with signal ID and missing fields
- Do NOT attempt to infer or use defaults
- Return `None`

## Algorithm Pseudocode

```python
def find_matching_contract(signal, available_contracts, config):
    # Validate signal
    if not signal.signal_timestamp or not signal.martingale_time:
        log_error("Missing required signal fields")
        return None

    if signal.martingale_time <= config.minimum_duration:
        log_error(f"Invalid martingale_time: {signal.martingale_time}")
        return None

    # Calculate exact expiration
    exact_expiration_time = signal.signal_timestamp + signal.martingale_time
    exact_expiration_time = round_to_seconds(exact_expiration_time)

    # Check if expiration is in the past
    if exact_expiration_time <= current_utc_time():
        log_error("Signal expired - calculated expiration in the past")
        return None

    # Phase 1: Exact match
    exact_matches = [c for c in available_contracts
                     if c.expiration == exact_expiration_time
                     and c.open_interest >= config.min_liquidity]

    if exact_matches:
        # Handle multiple exact matches
        best_match = max(exact_matches, key=lambda c: (c.open_interest, -c.strike))
        log_info(f"Exact match found: {best_match}")
        return best_match

    # Phase 2: Proximity fallback
    future_contracts = [c for c in available_contracts
                       if c.expiration >= exact_expiration_time
                       and c.open_interest >= config.min_liquidity]

    if not future_contracts:
        log_warning("No future contracts available")
        return None

    # Sort by proximity
    future_contracts.sort(key=lambda c: abs(c.expiration - exact_expiration_time))
    closest = future_contracts[0]

    delta = closest.expiration - exact_expiration_time
    if delta > config.max_acceptable_delta:
        log_warning(f"Closest contract exceeds max delta: {delta}s > {config.max_acceptable_delta}s")
        return None

    log_info(f"Proximity match found: {closest} (delta: {delta}s)")
    return closest
```

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_acceptable_delta` | 300s | Maximum time difference for proximity matching |
| `minimum_duration` | 30s | Minimum valid martingale_time |
| `min_liquidity` | 10 | Minimum open_interest for contract selection |
| `max_retry_attempts` | 2 | Maximum retries on stale data |
| `timezone` | UTC | Standard timezone for all timestamps |

## Logging Requirements

All matching operations must log:
- Input: signal_timestamp, martingale_time, exact_expiration_time
- Available contracts considered
- Match type (exact/proximity/none)
- Selected contract details (if matched)
- Delta from exact expiration (if proximity match)
- Rejection reason (if no match)

## Testing Scenarios

1. **Happy Path**: Exact match exists and is liquid
2. **Proximity Success**: No exact match, closest within delta
3. **Proximity Rejection**: Closest exceeds max_acceptable_delta
4. **Expired Signal**: exact_expiration_time in the past
5. **Multiple Exact**: Choose highest liquidity
6. **Illiquid Exact**: Skip illiquid exact, find liquid proximity
7. **Missing Metadata**: Reject malformed signal
8. **Timezone Conversion**: Mixed timezone inputs handled correctly
9. **Stale Data Recovery**: Retry succeeds on second attempt
10. **Market Closed**: Adjust to next available contract

## Migration Notes

- Existing systems using simple "nearest expiration" logic must be updated
- Signals must include both `signal_timestamp` and `martingale_time` fields
- Historical backtesting must account for exact expiration calculation
- Monitor rejection rates during rollout to tune `max_acceptable_delta`
