# Signal Matching Design Document

## Overview
This document describes the enhanced signal matching algorithm for options position matching in the SnapTrade unified listener system.

## Problem Statement

### Race Condition Issue
The current implementation suffers from a critical race condition when matching signals to options positions:

1. **Timing Problem**: When a signal arrives, the listener queries for matching positions. However, if multiple positions are opened in quick succession (common in automated trading), the first signal may arrive before all related positions are fully reflected in the database.

2. **Symptom**: A signal intended for position B might match position A if position B hasn't been persisted yet, leading to incorrect position associations and potential trading errors.

3. **Impact**: This can cause:
   - Signals applied to wrong positions
   - Orphaned positions without proper signal tracking
   - Incorrect P&L attribution
   - Failed position closures or adjustments

### Current Implementation Flaws

#### No Asset Matching
The current matcher does not verify that the option's underlying asset matches the signal's asset. This means:
- A signal for SPY options could incorrectly match QQQ options
- Cross-contamination between different trading strategies
- No validation that the signal is relevant to the position

#### No Direction Matching
The current implementation ignores option direction (calls vs puts):
- A signal for a call option could match a put option
- Bull vs bear strategy confusion
- Incorrect position management decisions

#### Weak Expiration Matching
Current proximity-based matching is too permissive:
- No preference for exact expiration matches
- May match positions with significantly different risk profiles
- Lacks tier-based fallback strategy

## Matching Algorithm Tiers

The signal matching algorithm employs a 3-tier strategy to match incoming signals to options positions:

### Tier 1: Exact Match
- **Exact expiration time** + **asset match**
- Highest priority matching for positions with precise expiration dates and underlying asset symbols
- Provides strongest confidence in correct position identification

### Tier 2: Proximity Match
- **Proximity** (±7 days) + **asset match**
- Medium priority for positions with near-expiration dates while maintaining asset integrity
- Handles minor date discrepancies while ensuring asset correctness

### Tier 3: Fallback Match
- **Proximity only** (±7 days)
- Lowest priority for backward compatibility with results that lack asset information
- Maintains legacy support but should be phased out over time

## Proposed Solution: 3-Tier Matching Strategy

### Tier 1: Exact Expiration with Asset and Direction
**Priority**: Highest
**Criteria**:
- Exact expiration date match
- Exact underlying asset match (symbol)
- Exact option direction match (call vs put)

**Rationale**: This provides the strongest confidence that we've found the intended position. Exact matches eliminate ambiguity.

**Example**:
```
Signal: { asset: "SPY", expiration: "2026-04-17", direction: "call" }
Match:  Position with SPY call expiring 2026-04-17
```

### Tier 2: Proximity with Asset and Direction
**Priority**: Medium
**Criteria**:
- Expiration within ±7 days of signal expiration
- Exact underlying asset match (symbol)
- Exact option direction match (call vs put)

**Rationale**: Handles minor discrepancies in expiration dates while maintaining asset and direction integrity. Useful when:
- Signal data has slight date variations
- Weekly options need matching flexibility
- Account for T+1 settlement differences

**Example**:
```
Signal: { asset: "SPY", expiration: "2026-04-17", direction: "put" }
Match:  Position with SPY put expiring 2026-04-15 (within 7 days)
```

### Tier 3: Proximity Fallback (Legacy Compatibility)
**Priority**: Lowest
**Criteria**:
- Expiration within ±7 days of signal expiration
- No asset or direction validation

**Rationale**: Maintains backward compatibility with existing signals that may lack asset/direction metadata. Should be phased out over time.

**Warning**: This tier is provided for transition only and should log warnings when used.

## Matching Algorithm

### Process Flow
```
1. Parse signal metadata (asset, expiration, direction)
2. Query for unmatched positions

3. Tier 1 Check:
   - Filter by exact expiration
   - Filter by asset (if provided)
   - Filter by direction (if provided)
   - If match found → RETURN

4. Tier 2 Check:
   - Filter by expiration proximity (±7 days)
   - Filter by asset (if provided)
   - Filter by direction (if provided)
   - If match found → RETURN

5. Tier 3 Check (Fallback):
   - Filter by expiration proximity (±7 days)
   - No asset/direction filtering
   - If match found → LOG WARNING and RETURN

6. No match found → RETURN null
```

### Disambiguation Strategy
When multiple positions match at the same tier:
1. **Prefer most recent position** (highest position_id or latest created_at)
2. **Log ambiguity warning** for manual review
3. **Consider manual intervention** for critical trades

## Edge Cases

### 1. Multiple Positions Same Symbol/Expiration
**Scenario**: User holds 2 SPY call positions both expiring 2026-04-17

**Solution**:
- Match to most recently opened position
- Log warning: "Multiple candidates found, matched to position_id=X"
- Consider future enhancement: strike price matching

### 2. Signal Arrives Before Position Persisted
**Scenario**: Race condition where signal arrives before database write completes

**Solution**:
- Implement retry logic with exponential backoff (3 attempts)
- Wait intervals: 500ms, 1s, 2s
- If still no match after retries, queue signal for delayed processing
- Emit metric for monitoring race condition frequency

### 3. Missing Asset or Direction Metadata
**Scenario**: Legacy signals lack asset/direction fields

**Solution**:
- Fall through to Tier 3 (proximity only)
- Log deprecation warning
- Return match but flag for review
- Track usage to prioritize signal source updates

### 4. Position Closed Before Signal Arrives
**Scenario**: Position is closed, but closing signal still arrives

**Solution**:
- Include closed positions in matching (with flag)
- Apply signal to closed position for historical accuracy
- Update P&L calculations retroactively
- Log reconciliation event

### 5. Split Positions (Partial Fills)
**Scenario**: Order filled in multiple legs creating separate positions

**Solution**:
- Match signal to first filled position
- Create child signals for remaining positions
- Link signals as related group
- Future: aggregate matching for position groups

### 6. Expired Options (Auto-Expiry)
**Scenario**: Options expired but signal references expired date

**Solution**:
- Match to expired positions (extend search to closed positions)
- Mark signal as post-expiry
- Use for P&L validation only
- Don't trigger trading actions

### 7. Symbol Remapping (Corporate Actions)
**Scenario**: Stock symbol changes due to merger/acquisition

**Solution**:
- Maintain symbol alias table
- Check both old and new symbols
- Update signal metadata with canonical symbol
- Log symbol translation event

### 8. Weekend/Holiday Date Differences
**Scenario**: Signal references Friday expiration but system shows Saturday

**Solution**:
- Normalize all dates to market calendar
- Adjust expirations to last trading day
- Apply before matching logic
- Use exchange calendar library (pandas_market_calendars)

## Edge Cases for Martingale Testing

### Edge Case 1: Two Signals Same Asset Within 5 Minutes
**Scenario**: Receive two signals for the same asset within a 5-minute window

**Test Considerations**:
- First signal should match available position
- Second signal should match different position or trigger martingale logic
- Validate proper position isolation between signals
- Ensure timestamps are properly compared

### Edge Case 2: Two Signals Different Assets Same Time
**Scenario**: Receive signals for different assets at the exact same timestamp

**Test Considerations**:
- Each signal should match its respective asset position independently
- No cross-contamination between asset matching
- Verify asset filtering works correctly in concurrent scenarios
- Confirm proper position allocation per asset

### Edge Case 3: Signal With martingale_times vs. Without
**Scenario**: Compare signal matching behavior when martingale_times is present vs. absent

**Test Considerations**:
- Signals without martingale_times should match normally
- Signals with martingale_times should trigger gale window logic
- Verify different code paths execute correctly
- Test backward compatibility for signals lacking martingale metadata

### Edge Case 4: Result Arrives During Gale Window
**Scenario**: Option result arrives while system is in an active martingale window

**Test Considerations**:
- Result should be matched to original position
- Gale window state should update appropriately
- Pending gale signals should be evaluated based on result
- Verify proper window closure or extension logic

### Edge Case 5: Result for Expired Signal
**Scenario**: Result arrives for a signal that has already expired or timed out

**Test Considerations**:
- Match result to expired signal using historical lookup
- Apply for P&L reconciliation only
- Do not trigger new trading actions
- Log late result arrival for monitoring

## Implementation Considerations

### Performance
- Index positions table on: (asset, expiration, direction, created_at)
- Use database-level filtering before application logic
- Cache recent position lookups (5-minute TTL)
- Monitor query performance with timing metrics

### Monitoring & Alerting
- **Metric**: `signal_match_tier` (gauge showing which tier matched)
- **Metric**: `signal_match_retries` (count of retry attempts)
- **Metric**: `signal_match_failures` (count of unmatched signals)
- **Alert**: Fire if >5% of signals use Tier 3 matching
- **Alert**: Fire if retry rate >10%

### Logging
- Log all matching attempts with tier used
- Include position_id, signal metadata, and match confidence
- Separate log level for ambiguous matches (WARN)
- Structured logging for easy querying

### Testing Strategy
1. **Unit tests**: Each tier in isolation
2. **Integration tests**: Full matching flow with database
3. **Race condition tests**: Concurrent signal/position creation
4. **Edge case tests**: Each scenario documented above
5. **Performance tests**: Matching latency <100ms p99

## Migration Plan

### Phase 1: Implementation (Week 1-2)
- Implement 3-tier matching logic
- Add asset/direction to signal parser
- Deploy with extensive logging (no breaking changes)

### Phase 2: Validation (Week 3-4)
- Run in shadow mode alongside current matcher
- Compare results and log discrepancies
- Tune proximity windows and tier priorities

### Phase 3: Rollout (Week 5-6)
- Enable new matcher in production
- Monitor metrics and alerts
- Keep fallback to old matcher for 1 week

### Phase 4: Cleanup (Week 7-8)
- Remove old matching code
- Deprecate Tier 3 matching
- Update signal sources to include asset/direction

## Future Enhancements

1. **Strike Price Matching**: Add strike price to matching criteria for ultimate precision
2. **Quantity Validation**: Verify signal quantity matches position size
3. **ML-Based Matching**: Use machine learning to predict best match from multiple candidates
4. **Position Aggregation**: Match signals to position groups (spreads, straddles)
5. **Real-Time Position Cache**: Reduce race conditions with in-memory position tracking
6. **Signal Replay**: Reprocess historical signals with new matching logic

## Rollback Plan

If critical issues arise:
1. Feature flag toggle to revert to old matcher
2. Database rollback scripts (no schema changes required)
3. Signal queue replay for reprocessing
4. Communication plan for affected trades

## Success Metrics

- **Match Accuracy**: >99% of signals match intended positions
- **Race Condition Rate**: <1% of signals require retries
- **Tier 1 Usage**: >90% of matches use Tier 1 (exact match)
- **Tier 3 Usage**: <5% of matches fall back to Tier 3
- **Matching Latency**: <50ms p95, <100ms p99
- **False Match Rate**: <0.1% (manual review validation)

## Conclusion

The enhanced 3-tier matching strategy addresses critical race conditions and improves matching accuracy by incorporating asset and direction validation. The tiered approach balances precision with flexibility while maintaining backward compatibility during migration.
