# Test Scenarios for Signal-Result Matching

## Core Matching Scenarios

- Single signal exact match: Verify a signal and result with matching asset, direction, and expiration_time are correctly paired
- Two signals same asset 5 minutes apart: Ensure signals for the same asset with expiration times 5 minutes apart match their respective results correctly
- Two signals same asset same expiration: Test that multiple signals for the same asset with identical expiration times are handled appropriately
- Result before signal: Verify that results arriving before their corresponding signal are handled correctly (buffering/queuing)

## Edge Cases

- Missing expiration_time: Test behavior when signal or result lacks expiration_time field
- Clock skew scenarios: Validate matching works correctly when client and server clocks are slightly out of sync

## Martingale Testing

- All martingale levels (M1, M2, M3): Verify correct matching and handling for M1, M2, and M3 martingale level signals and results
