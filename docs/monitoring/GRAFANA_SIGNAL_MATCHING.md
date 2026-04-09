# Grafana Dashboard Queries for Signal Matching

This document contains Prometheus/PromQL queries for monitoring signal matching performance and behavior.

## Key Metrics

### 1. Exact Match Rate

The exact match rate measures the proportion of signals that are matched exactly versus those requiring fallback matching.

**Formula:** `exact_match_rate = exact_matches / (exact_matches + fallbacks)`

**PromQL Query:**
```promql
sum(rate(signal_exact_matches_total[5m])) /
(sum(rate(signal_exact_matches_total[5m])) + sum(rate(signal_fallback_matches_total[5m])))
```

**Dashboard Panel Configuration:**
- **Type:** Gauge or Graph
- **Unit:** Percent (0-1)
- **Thresholds:**
  - Red: < 0.70
  - Yellow: 0.70 - 0.90
  - Green: > 0.90

---

### 2. Average Expiration Delta

The average expiration delta measures the mean time difference between signal expiration timestamps.

**PromQL Query:**
```promql
avg(signal_expiration_delta_seconds)
```

**Alternative (with rate for counter metrics):**
```promql
rate(signal_expiration_delta_seconds_sum[5m]) /
rate(signal_expiration_delta_seconds_count[5m])
```

**Dashboard Panel Configuration:**
- **Type:** Graph
- **Unit:** Seconds (s)
- **Legend:** Show min, max, avg

---

### 3. Ambiguous Attribution Count

The count of signals with ambiguous attribution that require special handling.

**PromQL Query:**
```promql
sum(rate(signal_ambiguous_attribution_total[5m]))
```

**For absolute count over time window:**
```promql
increase(signal_ambiguous_attribution_total[1h])
```

**Dashboard Panel Configuration:**
- **Type:** Graph or Stat
- **Unit:** Count
- **Alert Threshold:** > 100 per hour (adjust based on volume)

---

## Combined Dashboard Queries

### Match Type Distribution
```promql
sum by (match_type) (rate(signal_matches_total[5m]))
```

### P95 Expiration Delta
```promql
histogram_quantile(0.95,
  rate(signal_expiration_delta_seconds_bucket[5m])
)
```

### Fallback Rate by Reason
```promql
sum by (fallback_reason) (rate(signal_fallback_matches_total[5m]))
```

---

## Alert Rules

### Low Exact Match Rate
```promql
(
  sum(rate(signal_exact_matches_total[10m])) /
  (sum(rate(signal_exact_matches_total[10m])) + sum(rate(signal_fallback_matches_total[10m])))
) < 0.80
```

### High Ambiguous Attribution Rate
```promql
sum(rate(signal_ambiguous_attribution_total[5m])) > 10
```

---

## Notes

- All rate queries use a 5-minute window by default; adjust based on your traffic volume
- Counter metrics should use `rate()` or `increase()` functions
- Gauge metrics can be queried directly with aggregations like `avg()`, `max()`, `min()`
- Add labels (e.g., `{environment="production"}`) to filter by environment
