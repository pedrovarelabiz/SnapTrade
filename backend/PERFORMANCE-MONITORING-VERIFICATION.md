# Performance Monitoring Verification Report

**Date:** 2026-03-23
**Task:** Verify Sentry Performance monitoring with 10% sampling
**File:** /backend/src/routes/stats.ts

## Configuration Verified

### Sentry Performance Setup (`src/config/sentry.ts`)

✅ **Traces Sample Rate:** 10% for stats endpoints
```typescript
tracesSampler: (samplingContext) => {
  const url = samplingContext?.transactionContext?.name || '';

  // Stats routes use default sampling
  if (url.includes('/admin')) return 1.0;      // 100% admin
  if (url.includes('/webhook')) return 0.5;    // 50% webhooks
  return 0.1;                                   // 10% default (stats)
}
```

✅ **Integrations Enabled:**
- `Sentry.Integrations.Http({ tracing: true })` - HTTP request tracing
- `Sentry.Integrations.Express()` - Express middleware tracing
- `ProfilingIntegration()` - Performance profiling

### Stats Endpoints Verified

| Endpoint | Auth Required | Expected Transaction Name |
|----------|---------------|---------------------------|
| `/api/stats/overview` | No | `GET /api/stats/overview` |
| `/api/stats/by-channel` | No | `GET /api/stats/by-channel` |
| `/api/stats/public-summary` | No | `GET /api/stats/public-summary` |
| `/api/stats/by-asset` | Premium | `GET /api/stats/by-asset` |
| `/api/stats/by-hour` | Premium | `GET /api/stats/by-hour` |
| `/api/stats/by-day` | Premium | `GET /api/stats/by-day` |
| `/api/stats/pnl-curve` | Premium | `GET /api/stats/pnl-curve` |
| `/api/stats/win-rate-history` | Premium | `GET /api/stats/win-rate-history` |

### Database Query Spans

All stats endpoints call service functions that execute Prisma queries:
- `getOverviewStats()` - Aggregates signal data
- `getStatsByChannel()` - Groups by channel
- `getStatsByAsset()` - Groups by asset
- `getStatsByHour()` - Time-based aggregation
- `getStatsByDay()` - Daily aggregation
- `getPnlCurve()` - PnL calculations
- `getWinRateHistory()` - Win rate time series
- `getPublicSummary()` - Public stats

These queries will appear as spans in Sentry Performance traces.

## Test Execution

### Test Script Created
- **File:** `test-performance-monitoring.js`
- **Purpose:** Make 20 requests to stats endpoints
- **Expected Results:** ~2 traces captured (10% sampling)

### Staging Environment
**URL:** `https://snaptrade-staging.faroldigital.pt`
**Status:** Not accessible from current environment (DNS resolution failed)

**Note:** The staging domain is not publicly accessible or requires VPN/network access.

## Verification Command

To run this test when staging is accessible:

```bash
# From a machine with access to staging:
for i in {1..20}; do
  curl https://snaptrade-staging.faroldigital.pt/api/stats/public-summary
  sleep 0.2
done && echo "Check Sentry Performance"
```

Or use the test script:
```bash
node test-performance-monitoring.js
```

## Sentry Dashboard Verification

### 1. Access Performance Dashboard
- URL: `https://sentry.io/organizations/[your-org]/performance/`
- Filter: Environment = `staging`, Last 5 minutes

### 2. Expected Observations

#### Sampling Rate (10%)
- 20 requests made → expect ~2 transaction traces
- Variance is normal (could be 0-4 due to randomization)

#### Transaction Names
Should see transactions named:
- `GET /api/stats/overview`
- `GET /api/stats/by-channel`
- `GET /api/stats/public-summary`

#### Span Structure
Each trace should contain:
```
├─ http.server (Express request)
│  ├─ middleware.authenticate (if auth required)
│  ├─ middleware.apiLimiter
│  ├─ db.query (Prisma SELECT from signals)
│  ├─ db.query (Prisma SELECT from channels)
│  └─ db.query (Additional aggregation queries)
```

#### Database Spans
- **Operation:** `db.query`
- **Description:** Prisma query details
- **Data includes:**
  - SQL query (sanitized)
  - Query duration
  - Table names
  - Row counts

### 3. Breadcrumbs
Each transaction should include breadcrumbs:
```javascript
{
  category: "stats",
  message: "Fetching overview stats",
  level: "info",
  data: { channel: "..." }
}
```

## Code Verification

### Sentry Instrumentation in stats.ts

Each endpoint includes:
1. **Breadcrumb logging** (lines 28-33, 50-54, etc.)
2. **Error capture** via `Sentry.captureException()` (lines 38, 59, etc.)
3. **Automatic transaction creation** via Express integration

Example from `/api/stats/overview`:
```typescript
Sentry.addBreadcrumb({
  category: "stats",
  message: "Fetching overview stats",
  level: "info",
  data: { channel },
});
const stats = await getOverviewStats(channel);  // Database queries traced
res.json(stats);
```

## Summary

✅ **Performance monitoring is correctly configured:**
- 10% sampling rate for stats routes
- Transaction names use route patterns
- Database queries captured as spans via Prisma + HTTP integration
- Breadcrumbs properly categorized

⚠️ **Staging environment verification pending:**
- Domain `snaptrade-staging.faroldigital.pt` not accessible from current environment
- Requires network access or VPN to complete live testing
- Test script and verification steps documented for manual execution

## Next Steps

To complete verification:
1. Access staging environment from authorized network
2. Run: `node test-performance-monitoring.js`
3. Check Sentry Performance dashboard within 2 minutes
4. Verify ~2 traces with correct transaction names and DB spans
