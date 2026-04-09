# Migration Guide: V2.1 - Enhanced Signal Matching with Expiration Time

## Overview

Version 2.1 introduces enhanced signal matching using `expirationTime` for more accurate and performant order-to-signal matching. This guide explains backward compatibility, migration steps, and performance improvements.

## Backward Compatibility

**Old signals without `expirationTime` continue to work** via TIER 3 fallback matching. No immediate action is required, and existing systems will operate without interruption.

### Matching Tiers

The matching logic operates in three tiers:

1. **TIER 1**: Match by `expirationTime` (exact timestamp match) - **Fastest**
2. **TIER 2**: Match by `expirationTime` range (±5 seconds) - **Fast**
3. **TIER 3**: Fallback to legacy matching without `expirationTime` - **Slower**

TIER 3 ensures backward compatibility by matching signals that lack `expirationTime` using traditional criteria (symbol, quantity, action, etc.).

## Migration Steps

### For New Signals

**All new signals should include `expirationTime`** for accurate matching and optimal performance:

```json
{
  "symbol": "AAPL",
  "quantity": 100,
  "action": "BUY",
  "expirationTime": "2026-03-24T15:30:00Z",
  ...
}
```

### For Existing Signals

**Database migration is NOT required** but is **recommended** to backfill `expirationTime` for active signals:

1. **Identify active signals** without `expirationTime`:
   ```sql
   SELECT * FROM signals WHERE expirationTime IS NULL AND status = 'PENDING';
   ```

2. **Backfill `expirationTime`** from order data or signal creation time:
   ```sql
   UPDATE signals
   SET expirationTime = COALESCE(order_expiration, created_at + INTERVAL '30 days')
   WHERE expirationTime IS NULL AND status = 'PENDING';
   ```

3. **Verify backfill**:
   ```sql
   SELECT COUNT(*) FROM signals WHERE expirationTime IS NULL AND status = 'PENDING';
   ```

## Performance Improvements

### TIER 1/2 vs TIER 3

- **TIER 1/2 (with `expirationTime`)**:
  - Uses indexed timestamp lookup
  - Filters candidates to narrow time window
  - ~10-100x faster for high-volume systems
  - Reduces false matches

- **TIER 3 (without `expirationTime`)**:
  - Scans all pending signals
  - No time-based filtering
  - Slower as signal count grows
  - Higher memory usage

### Recommended Timeline

- **Immediate**: Start including `expirationTime` in all new signals
- **Week 1**: Backfill active signals (optional but recommended)
- **Week 2-4**: Monitor performance metrics and TIER usage
- **Month 2+**: Consider deprecating TIER 3 for stricter enforcement

## Monitoring

Track matching tier usage to understand migration progress:

```javascript
// Log matching tier in your signal processor
logger.info('Signal matched', {
  signalId,
  matchingTier: 'TIER_1' // or TIER_2, TIER_3
});
```

## FAQ

**Q: Do I need to update my database schema?**
A: No, if the `expirationTime` column exists, the feature works automatically.

**Q: What happens if I don't backfill `expirationTime`?**
A: Signals without `expirationTime` will continue to work via TIER 3 fallback, but with reduced performance.

**Q: Can I disable TIER 3 fallback?**
A: Not currently, but this may be configurable in future versions once migration is complete.

**Q: How do I know which tier matched my signal?**
A: Check application logs for matching tier indicators, or add custom instrumentation.

## Support

For questions or issues during migration, contact the platform team or file an issue in the repository.
