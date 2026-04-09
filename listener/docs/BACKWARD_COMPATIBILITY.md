# Backward Compatibility Strategy

## Overview

This document outlines the backward compatibility strategy for the `expiration_time` field in signal processing. The approach ensures gradual migration from proximity-based matching to expiration-based matching without breaking existing data.

## Problem Statement

Existing signals in the system may not have an `expiration_time` field. We need to handle these signals gracefully while transitioning to the new expiration-based approach.

## Strategy

### Null Handling

When processing signals, check if `expiration_time` is null:

- **If `expiration_time` is null**: Fall back to the legacy proximity matching logic
- **If `expiration_time` is present**: Use the new expiration-based matching logic

### Implementation Approach

```python
def should_process_signal(signal, current_price, current_time):
    """
    Determine if a signal should be processed based on expiration or proximity.

    Args:
        signal: Signal object with optional expiration_time
        current_price: Current market price
        current_time: Current timestamp

    Returns:
        bool: True if signal should be processed
    """
    # New expiration-based approach
    if signal.expiration_time is not None:
        return current_time <= signal.expiration_time

    # Legacy proximity-based fallback for existing signals
    else:
        return is_within_proximity_threshold(signal, current_price)
```

### Migration Path

1. **Phase 1 - Dual Support**: All new signals are created with `expiration_time`, while existing signals continue to work without it
2. **Phase 2 - Backfill (Optional)**: Gradually backfill `expiration_time` for existing active signals based on their proximity thresholds
3. **Phase 3 - Deprecation**: Once all active signals have `expiration_time`, the legacy proximity matching can be deprecated

## Benefits

- **Zero Downtime**: Existing signals continue to function without modification
- **Gradual Migration**: New signals use the improved expiration-based approach immediately
- **Data Integrity**: No risk of breaking existing signal processing logic
- **Flexibility**: Teams can migrate at their own pace without system-wide changes

## Testing Considerations

When testing the migration:

1. Test signals with `expiration_time = null` to ensure legacy behavior
2. Test signals with valid `expiration_time` values to ensure new behavior
3. Test mixed scenarios where both types of signals exist simultaneously
4. Verify that null expiration_time correctly triggers proximity matching fallback

## Monitoring

Monitor the following metrics during migration:

- Percentage of signals with vs without `expiration_time`
- Performance impact of dual logic paths
- Any unexpected null handling errors
