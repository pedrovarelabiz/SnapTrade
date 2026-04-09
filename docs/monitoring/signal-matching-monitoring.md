# Signal Matching Monitoring

## Exact Expiration Matching Metrics

This section documents the Prometheus metrics for exact expiration matching functionality in the signal matching system.

### Metrics

#### signal_matches_exact_expiration_total
Counter tracking the total number of signals matched using exact expiration date matching.

**Labels:**
- `symbol`: The symbol being matched
- `strategy`: The matching strategy used

**Example PromQL Queries:**
```promql
# Total exact expiration matches
sum(signal_matches_exact_expiration_total)

# Exact expiration matches by symbol
sum by (symbol) (signal_matches_exact_expiration_total)

# Rate of exact expiration matches over the last 5 minutes
rate(signal_matches_exact_expiration_total[5m])
```

#### signal_matches_proximity_fallback_total
Counter tracking the total number of signals that fell back to proximity matching when exact expiration matching failed.

**Labels:**
- `symbol`: The symbol being matched
- `strategy`: The matching strategy used

**Example PromQL Queries:**
```promql
# Total proximity fallback matches
sum(signal_matches_proximity_fallback_total)

# Proximity fallback rate as percentage of total matches
sum(signal_matches_proximity_fallback_total) / (sum(signal_matches_exact_expiration_total) + sum(signal_matches_proximity_fallback_total)) * 100

# Symbols with high fallback rates
topk(10, sum by (symbol) (rate(signal_matches_proximity_fallback_total[5m])))
```

#### signal_race_conditions_detected_total
Counter tracking the total number of race conditions detected during signal matching operations.

**Labels:**
- `symbol`: The symbol where the race condition occurred
- `type`: The type of race condition detected

**Example PromQL Queries:**
```promql
# Total race conditions detected
sum(signal_race_conditions_detected_total)

# Race conditions by symbol
sum by (symbol) (signal_race_conditions_detected_total)

# Alert on race condition spike
rate(signal_race_conditions_detected_total[5m]) > 0.1
```

### Alerts

Consider setting up alerts based on these metrics:

```yaml
- alert: HighProximityFallbackRate
  expr: |
    sum(rate(signal_matches_proximity_fallback_total[5m])) /
    (sum(rate(signal_matches_exact_expiration_total[5m])) +
     sum(rate(signal_matches_proximity_fallback_total[5m]))) > 0.5
  for: 10m
  annotations:
    summary: "High proximity fallback rate detected"
    description: "More than 50% of matches are falling back to proximity matching"

- alert: RaceConditionsDetected
  expr: rate(signal_race_conditions_detected_total[5m]) > 0
  for: 5m
  annotations:
    summary: "Race conditions detected in signal matching"
    description: "Race conditions are being detected, investigate potential concurrency issues"

- alert: HighRaceConditionRate
  expr: sum(rate(signal_race_conditions_detected_total[1h])) > 5
  for: 10m
  annotations:
    summary: "High rate of race conditions detected"
    description: "More than 5 race conditions per hour detected in signal matching. Immediate investigation required."
    notification_channels: "Slack, PagerDuty"
```

### Grafana Dashboard

Add the following panel to your Grafana dashboard to monitor exact expiration match rates:

**Panel: Exact Expiration Match Rate**
```promql
rate(signal_matches_exact_expiration_total[5m])
```

This panel shows the rate of successful exact expiration matches per second, allowing you to monitor the effectiveness of the exact matching strategy in real-time.

**Panel: Proximity Fallback Rate by Reason**
```promql
sum(rate(signal_matches_proximity_fallback_total[5m])) by (reason)
```

This panel tracks why proximity fallback is used. High 'ambiguous_exact_match' rate indicates race conditions.
