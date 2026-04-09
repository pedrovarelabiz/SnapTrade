# Sentry Monitoring Dashboard

This document describes the custom Sentry dashboard configuration for monitoring application health, performance, and errors across services.

## Dashboard Overview

The custom dashboard provides real-time visibility into:
- **Error rate by service** - Track error frequency across all services
- **P95 response times** - Monitor 95th percentile latency metrics
- **Top 10 errors** - Identify the most frequently occurring errors
- **Alert status** - View active alert states
- **Deploy markers** - Correlate errors with deployments

## Dashboard Configuration

### JSON Import Configuration

Use the following JSON configuration to import this dashboard into Sentry:

```json
{
  "title": "Application Monitoring Dashboard",
  "widgets": [
    {
      "id": "error-rate-by-service",
      "title": "Error Rate by Service",
      "displayType": "line",
      "interval": "5m",
      "queries": [
        {
          "name": "Error Rate",
          "fields": [
            "count()"
          ],
          "aggregates": [
            "count()"
          ],
          "columns": [
            "project"
          ],
          "conditions": "event.type:error",
          "orderby": "-count()"
        }
      ],
      "widgetType": "discover",
      "layout": {
        "x": 0,
        "y": 0,
        "w": 2,
        "h": 2,
        "minH": 2
      }
    },
    {
      "id": "p95-response-times",
      "title": "P95 Response Times",
      "displayType": "line",
      "interval": "5m",
      "queries": [
        {
          "name": "P95 Latency",
          "fields": [
            "p95(transaction.duration)"
          ],
          "aggregates": [
            "p95(transaction.duration)"
          ],
          "columns": [
            "project"
          ],
          "conditions": "event.type:transaction",
          "orderby": ""
        }
      ],
      "widgetType": "discover",
      "layout": {
        "x": 2,
        "y": 0,
        "w": 2,
        "h": 2,
        "minH": 2
      }
    },
    {
      "id": "top-10-errors",
      "title": "Top 10 Errors",
      "displayType": "table",
      "interval": "5m",
      "queries": [
        {
          "name": "Most Frequent Errors",
          "fields": [
            "issue",
            "title",
            "count()",
            "count_unique(user)"
          ],
          "aggregates": [
            "count()",
            "count_unique(user)"
          ],
          "columns": [
            "issue",
            "title"
          ],
          "conditions": "event.type:error",
          "orderby": "-count()",
          "limit": 10
        }
      ],
      "widgetType": "discover",
      "layout": {
        "x": 0,
        "y": 2,
        "w": 4,
        "h": 3,
        "minH": 2
      }
    },
    {
      "id": "alert-status",
      "title": "Alert Status",
      "displayType": "big_number",
      "queries": [
        {
          "name": "Active Alerts",
          "fields": [
            "count()"
          ],
          "aggregates": [
            "count()"
          ],
          "columns": [],
          "conditions": "event.type:error level:error",
          "orderby": ""
        }
      ],
      "widgetType": "discover",
      "layout": {
        "x": 4,
        "y": 0,
        "w": 1,
        "h": 2,
        "minH": 2
      }
    },
    {
      "id": "error-count-by-release",
      "title": "Errors by Release (Deploy Markers)",
      "displayType": "line",
      "interval": "1h",
      "queries": [
        {
          "name": "Errors per Release",
          "fields": [
            "count()"
          ],
          "aggregates": [
            "count()"
          ],
          "columns": [
            "release"
          ],
          "conditions": "event.type:error",
          "orderby": "-count()"
        }
      ],
      "widgetType": "discover",
      "layout": {
        "x": 0,
        "y": 5,
        "w": 3,
        "h": 2,
        "minH": 2
      }
    },
    {
      "id": "deployment-timeline",
      "title": "Deploy Markers Timeline",
      "displayType": "area",
      "interval": "1h",
      "queries": [
        {
          "name": "Deployments",
          "fields": [
            "count()"
          ],
          "aggregates": [
            "count()"
          ],
          "columns": [],
          "conditions": "release:*",
          "orderby": ""
        }
      ],
      "widgetType": "releases",
      "layout": {
        "x": 3,
        "y": 5,
        "w": 2,
        "h": 2,
        "minH": 2
      }
    }
  ],
  "projects": [],
  "environment": [],
  "period": "24h",
  "start": null,
  "end": null,
  "utc": false,
  "filters": {}
}
```

## Widget Details

### 1. Error Rate by Service

**Purpose**: Monitor error frequency across all services to identify problematic deployments or services.

**Configuration**:
- Type: Line chart
- Interval: 5 minutes
- Metric: `count()` of error events
- Grouping: By project/service
- Time range: Last 24 hours (default)

**Use Cases**:
- Identify sudden spikes in errors
- Compare error rates across services
- Detect degradation patterns

### 2. P95 Response Times

**Purpose**: Track 95th percentile response times to ensure performance SLAs are met.

**Configuration**:
- Type: Line chart
- Interval: 5 minutes
- Metric: `p95(transaction.duration)`
- Grouping: By project/service
- Time range: Last 24 hours (default)

**Use Cases**:
- Monitor performance degradation
- Validate optimization efforts
- Identify slow services

### 3. Top 10 Errors

**Purpose**: Quickly identify the most impactful errors requiring immediate attention.

**Configuration**:
- Type: Table
- Interval: 5 minutes
- Metrics:
  - Error count
  - Unique users affected
- Sorting: By error count (descending)
- Limit: 10 errors

**Use Cases**:
- Prioritize bug fixes
- Understand user impact
- Track error trends

### 4. Alert Status

**Purpose**: Display current alert state at a glance.

**Configuration**:
- Type: Big number
- Metric: Count of error-level events
- Conditions: `level:error`

**Use Cases**:
- Quick health check
- Incident response awareness
- Dashboard status indicator

### 5. Deploy Markers

**Purpose**: Correlate errors and performance changes with deployments.

**Configuration**:
- Type: Line chart and Area chart
- Interval: 1 hour
- Grouping: By release version
- Overlay: Deployment events

**Use Cases**:
- Identify problematic releases
- Correlate errors with deployments
- Track rollback effectiveness

## Import Instructions

### Via Sentry UI

1. Navigate to **Dashboards** in your Sentry organization
2. Click **Create Dashboard**
3. Click the **⋮** (options) menu
4. Select **Import Dashboard**
5. Paste the JSON configuration above
6. Click **Import**
7. Customize filters (projects, environments) as needed

### Via Sentry API

```bash
curl -X POST \
  https://sentry.io/api/0/organizations/{org_slug}/dashboards/ \
  -H 'Authorization: Bearer {token}' \
  -H 'Content-Type: application/json' \
  -d @dashboard-config.json
```

Replace:
- `{org_slug}` with your organization slug
- `{token}` with your Sentry API token
- Save the JSON config to `dashboard-config.json`

## Customization Options

### Adjusting Time Ranges

Modify the `period` field in the root configuration:
- `"1h"` - Last hour
- `"24h"` - Last 24 hours (default)
- `"7d"` - Last 7 days
- `"30d"` - Last 30 days

### Filtering by Environment

Add environment filters:
```json
"environment": ["production", "staging"]
```

### Filtering by Project

Add project filters:
```json
"projects": [123456, 789012]
```

### Widget Refresh Intervals

Modify the `interval` field for each widget:
- `"1m"` - 1 minute
- `"5m"` - 5 minutes (recommended for most)
- `"15m"` - 15 minutes
- `"1h"` - 1 hour

## Alert Integration

Configure alerts to appear on the dashboard:

1. **Create Alert Rules** for critical metrics:
   - Error rate threshold (e.g., >100 errors/min)
   - P95 latency threshold (e.g., >2000ms)
   - Availability threshold (e.g., <99.9%)

2. **Link Alerts to Dashboard**:
   - Alert rules automatically populate the Alert Status widget
   - Configure notification channels (Slack, PagerDuty, email)

3. **Deploy Markers Setup**:
   - Configure release tracking in your CI/CD pipeline
   - Use Sentry CLI or API to create releases
   - Associate commits with releases for better context

## Best Practices

1. **Regular Review**: Review the dashboard daily during standups
2. **Threshold Tuning**: Adjust alert thresholds based on baseline metrics
3. **Widget Placement**: Keep critical metrics (error rate, p95 response times) at the top
4. **Time Range**: Use 24-hour default, but investigate with longer ranges for trends
5. **Team Access**: Share dashboard with all team members
6. **Custom Tags**: Use custom tags to filter by feature, team, or customer segment

## Troubleshooting

### No Data Showing

- Verify projects are selected in dashboard filters
- Check that events are being sent to Sentry
- Confirm time range includes recent data
- Validate query conditions

### Performance Issues

- Reduce widget refresh intervals
- Limit time range for complex queries
- Consider using sample rates for high-volume projects

### Missing Deploy Markers

- Ensure releases are created in Sentry
- Verify release version format matches
- Check that commits are associated with releases

## Additional Resources

- [Sentry Dashboard Documentation](https://docs.sentry.io/product/dashboards/)
- [Query Builder Guide](https://docs.sentry.io/product/discover-queries/)
- [Release Tracking](https://docs.sentry.io/product/releases/)
- [Alert Configuration](https://docs.sentry.io/product/alerts/)
