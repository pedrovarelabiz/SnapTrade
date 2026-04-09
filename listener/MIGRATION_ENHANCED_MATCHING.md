# Migration Guide: Enhanced Matching Algorithm

## Overview

This guide covers the migration to the enhanced 3-tier matching algorithm for signal correlation in the SnapTrade listener service.

## What Changed

The listener service now implements a **3-tier matching algorithm** for correlating webhook events to pending signals:

1. **Tier 1 (Exact Match)**: Direct lookup by `(user_id, brokerage_authorization_id, order_id)` when order_id is available
2. **Tier 2 (Brokerage-Scoped Match)**: Match by `(user_id, brokerage_authorization_id, universal_symbol_id, action, filled_quantity)` when order_id is missing but event is scoped to a specific brokerage
3. **Tier 3 (User-Scoped Match)**: Fallback to `(user_id, universal_symbol_id, action, filled_quantity)` across all brokerages when brokerage context is unavailable

### Key Changes
- Replaced single-strategy matching with hierarchical fallback approach
- Handles race conditions where webhooks arrive before order IDs are committed
- Introduced tracking for `matching_stats` and `ambiguous_matches`
- Preserved legacy matching function `find_matching_signal_legacy()` for rollback compatibility

## Why This Change Was Made

The enhanced matching algorithm addresses **race condition D3**: webhook events arriving before order IDs are committed to the database.

### The Problem
When a trade executes and triggers a webhook, the webhook may arrive at our listener before the order creation transaction completes and commits the order_id to the database. The legacy single-tier algorithm (`find_matching_signal_legacy`) only matched by order_id, causing:
- Failed matches when webhooks preceded database commits
- Lost tracking of order executions
- Missed signal correlations despite valid pending signals existing

### The Solution
The 3-tier approach ensures:
- **Tier 1**: Exact ID matches when order_id is available (most reliable)
- **Tier 2**: Brokerage-scoped matching on business attributes when order_id unavailable
- **Tier 3**: User-scoped fallback matching across brokerages as last resort

## Impact on Existing Deployments

This change is **backward compatible**:

- **No database schema changes required** - works with existing signal tables
- **No API contract changes** - signal processing endpoints remain unchanged
- **Legacy function preserved** - `find_matching_signal_legacy()` remains available
- **Default behavior** - automatically uses enhanced matching without configuration changes
- **Monitoring additions** - new stats available but not required for operation

### Expected Behavior Changes
- More accurate signal correlation in high-frequency trading scenarios
- Reduced false matches during rapid signal bursts
- Better handling of signals without transaction IDs

## How to Monitor

### Matching Statistics

The enhanced algorithm tracks detailed matching statistics accessible via:

```python
from listener.signal_processor import get_matching_stats

stats = get_matching_stats()
# Returns: {
#   'tier1_matches': <count>,
#   'tier2_matches': <count>,
#   'tier3_matches': <count>,
#   'no_match': <count>,
#   'total_attempts': <count>
# }
```

### Ambiguous Matches

Track signals that matched ambiguously (multiple candidates in Tier 3):

```python
from listener.signal_processor import get_ambiguous_matches

ambiguous = get_ambiguous_matches()
# Returns list of signals with multiple match candidates
```

### Logging

Enhanced matching logs include tier information:

```
INFO: Signal matched via tier1 (exact ID)
INFO: Signal matched via tier2 (deterministic)
WARN: Signal matched via tier3 (time-window) - 3 candidates
ERROR: No matching signal found
```

### Recommended Monitoring

1. **Track tier distribution** - monitor ratio of tier1/tier2/tier3 matches
2. **Alert on ambiguous matches** - investigate if tier3 ambiguous count increases
3. **Compare legacy vs enhanced** - run both algorithms in parallel initially (if desired)
4. **Monitor no-match rate** - should decrease or remain stable

## Rollback Procedure

If issues arise, you can rollback to legacy matching:

### Option 1: Code-Level Rollback

Replace the enhanced matching call:

```python
# Enhanced (current)
from listener.signal_processor import find_matching_signal
match = find_matching_signal(signal_data)

# Legacy (rollback)
from listener.signal_processor import find_matching_signal_legacy
match = find_matching_signal_legacy(signal_data)
```

### Option 2: Feature Flag (if implemented)

```python
# Set environment variable
USE_LEGACY_MATCHING=true

# Or update config
config.matching.use_legacy = true
```

### Option 3: Git Rollback

```bash
# Identify the commit before enhanced matching
git log --oneline | grep "enhanced matching"

# Rollback to previous version
git revert <commit-hash>

# Or checkout specific file
git checkout <previous-commit> -- listener/signal_processor.py
```

### Verification After Rollback

```bash
# Check that legacy function is in use
grep -n "find_matching_signal_legacy" listener/signal_processor.py

# Monitor logs for legacy behavior
tail -f logs/listener.log | grep "matching"

# Verify no tier-based logging appears
```

## Testing Recommendations

### Pre-Deployment Testing

1. **Unit Tests**: Verify all three tiers with test fixtures
2. **Integration Tests**: Test with realistic signal sequences
3. **Load Tests**: Validate performance under high signal volume
4. **Regression Tests**: Ensure no breaking changes in existing flows

### Post-Deployment Validation

1. **Canary Deployment**: Roll out to small percentage of traffic first
2. **Shadow Mode**: Run enhanced and legacy in parallel, compare results
3. **Monitor Key Metrics**: Match rates, latency, error rates
4. **Gradual Rollout**: Increase traffic percentage over 24-48 hours

## Known Limitations

The enhanced matching algorithm has the following constraints:

**Known Limitation 1**: Results without asset information rely on Tier 3 (time-only matching), which can still be ambiguous when multiple trades occur within the time window for the same symbol and action.

**Known Limitation 2**: Asset extraction from informal results is best-effort and regex-based. Parsing variations in broker confirmation formats may not always extract symbols accurately.

**Known Limitation 3**: Direction matching (buy/sell) is used as a bonus signal when available but is not required for correlation. Signals without direction data can still match but with lower confidence.

**Known Limitation 4**: The 35-minute time window is a general default and may need tuning per channel based on broker-specific latency patterns and confirmation delivery times.

## Support

For issues or questions:
- Check logs: `/var/log/snaptrade/listener.log`
- Review stats: call `get_matching_stats()` and `get_ambiguous_matches()`
- Rollback if needed: use `find_matching_signal_legacy()`
- Contact: Platform Engineering team

## Timeline

- **Development**: Completed
- **Testing**: In progress
- **Deployment**: Pending
- **Full Rollout**: TBD
- **Legacy Deprecation**: TBD (minimum 90 days post-deployment)
