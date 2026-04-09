# Signal Schema Documentation

## expirationTime Calculation

### Overview
The `expirationTime` field represents when a trading signal expires and is calculated based on the entry time and the first martingale interval.

### Calculation Contract
```
expirationTime = entryTimeUtc + martingale_times[0] (in minutes)
```

Where:
- `entryTimeUtc`: The signal entry timestamp in UTC
- `martingale_times[0]`: The first element of the martingaleTimes array, converted from MM:SS format to minutes

### martingaleTimes Array Format
The `martingaleTimes` field is an array of strings in the format:
```
["MM:SS", "MM:SS", ...]
```

**Example:**
```json
{
  "martingaleTimes": ["03:00", "06:00", "09:00"]
}
```

Each element represents a time interval in minutes and seconds:
- `"03:00"` = 3 minutes and 0 seconds = 3 minutes total
- `"06:00"` = 6 minutes and 0 seconds = 6 minutes total
- `"09:00"` = 9 minutes and 0 seconds = 9 minutes total

### Example Calculation

Given a signal with:
```json
{
  "entryTimeUtc": "2026-03-24T14:30:00Z",
  "martingaleTimes": ["05:00", "10:00", "15:00"]
}
```

**Calculation:**
1. Parse `martingale_times[0]` = `"05:00"` → 5 minutes
2. Add to entry time: `2026-03-24T14:30:00Z` + 5 minutes
3. **Result:** `expirationTime = "2026-03-24T14:35:00Z"`

## Signal Matching Tiers

### TIER 1 Matching (Strict)
TIER 1 matching is the primary matching strategy and **requires the `expirationTime` field** to be present and valid.

**Requirements:**
- `expirationTime` must be present in the signal
- `expirationTime` must be correctly calculated using the formula above
- Signals without `expirationTime` will fall through to lower tiers

**Benefits:**
- More precise matching
- Better performance
- Recommended for all new signals

### TIER 3 Matching (Backward Compatibility)
TIER 3 matching provides backward compatibility for legacy signals that do not include the `expirationTime` field.

**Use Cases:**
- Old signals generated before the expirationTime requirement
- Signals from external sources that haven't been updated
- Fallback when expirationTime calculation fails

**Limitations:**
- Slower matching performance
- Less precise matching logic
- Should be migrated to TIER 1 when possible

## Migration Guide

To ensure your signals use TIER 1 matching:

1. **Include `martingaleTimes` array** in your signal schema
2. **Calculate `expirationTime`** using the formula: `entryTimeUtc + martingale_times[0]` (in minutes)
3. **Include `expirationTime`** in your signal payload
4. **Validate** that expirationTime matches the calculation contract

### Code Example (Pseudocode)
```python
def calculate_expiration_time(entry_time_utc, martingale_times):
    """
    Calculate expiration time from entry time and first martingale interval.

    Args:
        entry_time_utc: datetime object in UTC
        martingale_times: list of strings in "MM:SS" format

    Returns:
        datetime object representing expiration time
    """
    # Parse first martingale time (MM:SS)
    first_interval = martingale_times[0]
    minutes, seconds = map(int, first_interval.split(':'))
    total_minutes = minutes + (seconds / 60)

    # Add to entry time
    expiration_time = entry_time_utc + timedelta(minutes=total_minutes)

    return expiration_time
```

## Summary

| Field | Format | Required For | Purpose |
|-------|--------|--------------|---------|
| `expirationTime` | ISO 8601 timestamp | TIER 1 | Signal expiration timestamp |
| `martingaleTimes` | `["MM:SS", ...]` | expirationTime calculation | Array of time intervals |
| `entryTimeUtc` | ISO 8601 timestamp | expirationTime calculation | Signal entry timestamp |

**Key Takeaway:** Always include `expirationTime` in new signals to ensure TIER 1 matching and optimal performance.
