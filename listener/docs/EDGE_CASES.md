# Edge Cases to Handle

This document outlines critical edge cases that must be handled in the listener system for proper signal processing and result matching.

## 1. No Exact Expiration Match

**Scenario**: A result arrives with an expiration timestamp that doesn't exactly match any logged signal's expiration.

**Causes**:
- Clock skew between signal source and result source
- Rounding differences in timestamp precision
- Signal modification after logging but before result arrival

**Handling Strategy**:
- Implement fuzzy matching with configurable tolerance window (e.g., ±5 seconds)
- Log warnings when using fuzzy match instead of exact match
- Escalate to manual review if tolerance window is exceeded
- Consider maintaining a "pending results" queue for unmatched items

**Risk**: Matching wrong signal/result pair could lead to incorrect P&L calculations or martingale progression.

## 2. Multiple Signals with Same Expiration

**Scenario**: Two or more signals have identical expiration timestamps for the same asset.

**Causes**:
- Rapid-fire signal generation during volatile market conditions
- Multiple strategies targeting same asset with same timeframe
- Martingale sequences initiated simultaneously

**Handling Strategy**:
- Use composite key: expiration + asset + signal_id (or timestamp of signal creation)
- Maintain FIFO queue for signals with identical expirations
- Match results to oldest unmatched signal first
- Log all matches with full signal metadata for audit trail

**Risk**: Mismatched results could corrupt martingale progression tracking and position management.

## 3. Result Arrives Before Signal Logged

**Scenario**: A result message is processed before the corresponding signal has been logged to the database.

**Causes**:
- Race condition in distributed systems
- Network latency variance between signal and result paths
- Database write delays or transaction commit lag
- Out-of-order message processing in queue systems

**Handling Strategy**:
- Implement "orphaned results" temporary storage
- Retry matching with exponential backoff (e.g., 1s, 2s, 5s, 10s)
- Set maximum retry window (e.g., 60 seconds) before escalation
- Emit metrics for monitoring race condition frequency
- Consider deduplication to handle retry scenarios

**Risk**: Dropped results or delayed position tracking.

## 4. Martingale_times Array is Empty

**Scenario**: Processing a martingale signal where the `martingale_times` array is empty or null.

**Causes**:
- Initial signal (M0) before any martingale progression
- Data corruption or incomplete signal payload
- Schema changes or migration issues
- Legacy signals without martingale support

**Handling Strategy**:
- Treat empty array as M0 (initial position)
- Validate array structure before processing
- Default to conservative assumptions (single position, no progression)
- Log schema validation warnings
- Gracefully degrade to non-martingale processing if necessary

**Risk**: Incorrect position sizing or martingale level calculation.

## 5. Clock Skew Between Systems

**Scenario**: Timestamp discrepancies between signal generation system, result system, and listener due to clock drift.

**Causes**:
- Unsynchronized system clocks
- Different time zones or DST handling
- NTP sync failures
- Containerized environments with host clock drift

**Handling Strategy**:
- Use UTC timestamps exclusively across all systems
- Implement NTP monitoring and alerting
- Apply configurable tolerance windows for timestamp matching
- Store both original timestamps and normalized timestamps
- Log clock skew metrics for monitoring
- Consider using logical clocks or sequence numbers as secondary matching criteria

**Risk**: Failure to match signals with results, or matching wrong pairs.

## 6. Multiple Martingale Levels on Same Asset

**Scenario**: Multiple active martingale sequences running concurrently on the same asset with overlapping expirations.

**Causes**:
- Multiple strategies targeting same asset
- Recovery from previous losses triggering multiple sequences
- Manual intervention creating parallel positions
- Different signal sources (human + automated)

**Handling Strategy**:
- Maintain separate tracking per martingale sequence (use sequence_id or strategy_id)
- Implement position aggregation with sequence isolation
- Validate that results are attributed to correct sequence
- Use composite keys: asset + expiration + sequence_id + level
- Set position limits to prevent excessive exposure
- Dashboard visibility for all active sequences per asset

**Risk**: Cross-contamination between sequences leading to incorrect progression tracking, over-leveraging, or miscalculated risk exposure.

---

## General Recommendations

1. **Idempotency**: Ensure all operations are idempotent to safely handle retries
2. **Logging**: Comprehensive logging with correlation IDs for debugging edge cases
3. **Metrics**: Track frequency of each edge case to identify systemic issues
4. **Alerts**: Configure alerts for edge case frequency thresholds
5. **Manual Review Queue**: Maintain queue for cases requiring human intervention
6. **Testing**: Include edge case scenarios in integration and load tests
7. **Documentation**: Keep this document updated as new edge cases are discovered
