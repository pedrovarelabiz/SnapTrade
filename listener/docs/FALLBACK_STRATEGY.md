# Fallback Strategy for Option Trade Matching

## Overview

When exact matching of option trades fails, the system employs a multi-tiered fallback strategy to maximize attribution accuracy while maintaining observability of matching quality.

## Fallback Tiers

### Tier 1: Exact Expiration Match with Timestamp Tolerance

When a perfect match is not immediately found, the system attempts an exact expiration match within a **±5 seconds** timestamp window. This accounts for:

- Clock skew between systems
- Network latency variations
- Microsecond-level timing differences in order execution

**Criteria:**
- Exact expiration date match
- Symbol match
- Strike price match
- Option type (call/put) match
- Execution timestamp within ±5 seconds

### Tier 2: Proximity Matching with Narrowed Window

If Tier 1 fails, the system falls back to proximity matching with a **15 min** window. This narrower window (compared to typical broader matching windows) balances:

- Tolerance for delayed trade reports
- Risk of false-positive matches
- Operational reality of option execution timing

**Criteria:**
- Same criteria as Tier 1
- Expanded timestamp window to 15 minutes before/after

### Attribution Uncertainty Logging

When fallback matching is employed, the system logs detailed attribution uncertainty information:

```
{
  "match_tier": "tier_1_timestamp_tolerance" | "tier_2_proximity",
  "confidence": "medium" | "low",
  "timestamp_delta": <seconds>,
  "expiration_match": true | false,
  "matching_candidates": <count>,
  "selected_match_reason": <string>
}
```

This ensures full traceability and enables post-hoc analysis of matching quality.

## Metrics for Fallback Usage

### Key Metrics

Track the following metrics to monitor fallback strategy effectiveness:

1. **Fallback Usage Rate**
   - `fallback.tier1.usage_rate`: Percentage of trades matched via Tier 1
   - `fallback.tier2.usage_rate`: Percentage of trades matched via Tier 2
   - `fallback.total_fallback_rate`: Overall percentage requiring fallback

2. **Matching Quality**
   - `fallback.timestamp_delta.p50/p95/p99`: Distribution of timestamp deltas
   - `fallback.confidence_distribution`: Breakdown by confidence level

3. **Failure Metrics**
   - `fallback.unmatched_trades`: Count of trades failing all tiers
   - `fallback.multi_candidate_matches`: Cases with multiple potential matches

4. **Performance Impact**
   - `fallback.latency.tier1`: Time to execute Tier 1 matching
   - `fallback.latency.tier2`: Time to execute Tier 2 matching

### Alerting Thresholds

- Alert if `fallback.total_fallback_rate` > 20% over 1-hour window
- Alert if `fallback.unmatched_trades` > 5 in any 5-minute period
- Alert if `fallback.tier2.usage_rate` > 10% (indicates systemic timing issues)

## Implementation Considerations

- Fallback tiers execute sequentially; Tier 2 only runs if Tier 1 fails
- All fallback decisions are logged for audit purposes
- Metrics are emitted in real-time for monitoring dashboards
- Consider A/B testing window parameters if false-positive rate exceeds thresholds
