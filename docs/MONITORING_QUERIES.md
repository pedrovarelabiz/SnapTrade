# Monitoring Queries for Matching Stats

This document provides sample queries and dashboards for monitoring the performance and health of the asset matching system.

## 1. Query Health Endpoint for Matching Stats

### HTTP Request
```bash
curl http://localhost:8000/health | jq '.matching_stats'
```

### Expected Response Structure
```json
{
  "total_matches": 1250,
  "tier_distribution": {
    "tier1_symbol_id": 800,
    "tier2_symbol_cusip": 250,
    "tier3_fallback": 200
  },
  "ambiguous_matches": 45
}
```

### Prometheus Query
```promql
# Scrape matching_stats from health endpoint
up{job="snaptrade-unified", endpoint="/health"}
```

## 2. Calculate Tier Distribution Percentage

### Prometheus Query
```promql
# Tier 1 percentage (symbol + asset_id)
(matching_stats_tier1_symbol_id / matching_stats_total_matches) * 100

# Tier 2 percentage (symbol + cusip/isin)
(matching_stats_tier2_symbol_cusip / matching_stats_total_matches) * 100

# Tier 3 percentage (fallback)
(matching_stats_tier3_fallback / matching_stats_total_matches) * 100
```

### Grafana Dashboard Panel
```json
{
  "title": "Match Tier Distribution",
  "type": "piechart",
  "targets": [
    {
      "expr": "matching_stats_tier1_symbol_id",
      "legendFormat": "Tier 1 (Symbol + Asset ID)"
    },
    {
      "expr": "matching_stats_tier2_symbol_cusip",
      "legendFormat": "Tier 2 (Symbol + CUSIP/ISIN)"
    },
    {
      "expr": "matching_stats_tier3_fallback",
      "legendFormat": "Tier 3 (Fallback)"
    }
  ]
}
```

## 3. Track Ambiguous Matches Over Time

### Prometheus Query
```promql
# Ambiguous matches over time
matching_stats_ambiguous_matches

# Rate of ambiguous matches per minute
rate(matching_stats_ambiguous_matches[5m])

# Percentage of ambiguous matches
(matching_stats_ambiguous_matches / matching_stats_total_matches) * 100
```

### Grafana Dashboard Panel
```json
{
  "title": "Ambiguous Matches Over Time",
  "type": "graph",
  "targets": [
    {
      "expr": "matching_stats_ambiguous_matches",
      "legendFormat": "Ambiguous Matches"
    },
    {
      "expr": "(matching_stats_ambiguous_matches / matching_stats_total_matches) * 100",
      "legendFormat": "Ambiguous Match %"
    }
  ],
  "yAxes": [
    {
      "label": "Count / Percentage"
    }
  ]
}
```

## 4. Alert if Tier 3 Fallback > 20%

### Prometheus Alert Rule
```yaml
groups:
  - name: matching_stats_alerts
    interval: 1m
    rules:
      - alert: HighTier3FallbackRate
        expr: |
          (matching_stats_tier3_fallback / matching_stats_total_matches) * 100 > 20
        for: 5m
        labels:
          severity: warning
          component: asset_matching
        annotations:
          summary: "High Tier 3 fallback rate detected"
          description: |
            Tier 3 fallback matches are {{ $value | humanizePercentage }} of total matches.
            This indicates many results lack asset_id or CUSIP/ISIN information.
            Current tier3_fallback: {{ $labels.tier3_fallback }}
            Total matches: {{ $labels.total_matches }}
```

### Alert Query
```promql
# Alert condition
(matching_stats_tier3_fallback / matching_stats_total_matches) * 100 > 20
```

### Slack/PagerDuty Integration
```yaml
receivers:
  - name: 'team-alerts'
    slack_configs:
      - channel: '#trading-alerts'
        title: 'Asset Matching Quality Alert'
        text: |
          High tier 3 fallback rate: {{ .CommonAnnotations.description }}
          This may indicate:
          - Missing asset metadata from brokerage responses
          - Incomplete reference data in the database
          - Need for additional data enrichment
```

## Dashboard Overview

### Recommended Metrics to Track
1. **Total Matches**: Overall volume of asset matching operations
2. **Tier Distribution**: Breakdown of match quality (Tier 1 > Tier 2 > Tier 3)
3. **Ambiguous Matches**: Cases where multiple assets matched the criteria
4. **Tier 3 Rate**: Percentage of fallback matches (quality indicator)
5. **Match Success Rate**: `(tier1 + tier2 + tier3) / total_requests * 100`

### Key Performance Indicators (KPIs)
- **Target**: Tier 1 matches should be > 60% of total
- **Warning**: Tier 3 fallback > 20% indicates data quality issues
- **Critical**: Ambiguous matches > 10% may require matching logic refinement
