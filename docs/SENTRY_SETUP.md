# Sentry Project Setup Guide

This guide walks through setting up Sentry error tracking for the SnapTrade platform across three projects: backend, listener, and extension.

## Prerequisites

- Access to your organization's Sentry account
- Admin or Manager permissions to create projects
- Access to the codebase and .env files for each service

## Step 1: Create Sentry Projects

### 1.1 Create snaptrade-backend Project

1. Log in to [Sentry.io](https://sentry.io)
2. Navigate to your organization
3. Click **"Create Project"** in the top right
4. Select your platform/framework (e.g., **Node.js**, **Python**, **Django**, etc.)
5. Name the project: `snaptrade-backend`
6. Assign it to a team (or create a new team if needed)
7. Click **"Create Project"**
8. Copy the **DSN** (Data Source Name) - you'll need this in Step 2

### 1.2 Create snaptrade-listener Project

1. Click **"Create Project"** again
2. Select the appropriate platform for your listener service
3. Name the project: `snaptrade-listener`
4. Assign it to the same team as the backend
5. Click **"Create Project"**
6. Copy the **DSN** for this project

### 1.3 Create snaptrade-extension Project

1. Click **"Create Project"** again
2. Select **Browser** or **JavaScript** as the platform
3. Name the project: `snaptrade-extension`
4. Assign it to the same team
5. Click **"Create Project"**
6. Copy the **DSN** for this project

## Step 2: Configure DSNs in Environment Files

### 2.1 Backend Configuration

1. Navigate to the backend service directory
2. Open or create the `.env` file
3. Add the Sentry DSN:
   ```bash
   SENTRY_DSN=https://[your-key]@[your-org].ingest.sentry.io/[project-id]
   ```
4. Save the file

### 2.2 Listener Configuration

1. Navigate to the listener service directory
2. Open or create the `.env` file
3. Add the Sentry DSN:
   ```bash
   SENTRY_DSN=https://[your-key]@[your-org].ingest.sentry.io/[project-id]
   ```
4. Save the file

### 2.3 Extension Configuration

1. Navigate to the extension directory
2. Open or create the `.env` file
3. Add the Sentry DSN:
   ```bash
   SENTRY_DSN=https://[your-key]@[your-org].ingest.sentry.io/[project-id]
   ```
4. Save the file

## Step 3: Configure Environment Names

For each project, configure the environment to distinguish between production, staging, and development deployments.

### 3.1 Set Environment in Code

Add the environment configuration to your Sentry initialization code:

**Backend & Listener (Node.js example):**
```javascript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development', // production, staging, development
  // ... other options
});
```

**Backend & Listener (Python example):**
```python
import sentry_sdk

sentry_sdk.init(
    dsn=os.getenv('SENTRY_DSN'),
    environment=os.getenv('ENVIRONMENT', 'development'),  # production, staging, development
    # ... other options
)
```

**Extension (JavaScript):**
```javascript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.ENVIRONMENT || 'development',
  // ... other options
});
```

### 3.2 Update Environment Files

Add the environment variable to each `.env` file:

**Production:**
```bash
ENVIRONMENT=production
# or
NODE_ENV=production
```

**Staging:**
```bash
ENVIRONMENT=staging
# or
NODE_ENV=staging
```

**Development:**
```bash
ENVIRONMENT=development
# or
NODE_ENV=development
```

## Step 4: Configure Team Access and Permissions

### 4.1 Set Up Team Access

1. In Sentry, navigate to **Settings** → **Teams**
2. Select your team or create a new one (e.g., "SnapTrade Engineering")
3. Click **"Add Members"** to invite team members
4. Set appropriate roles:
   - **Admin**: Full access, can manage projects and settings
   - **Manager**: Can manage project settings and members
   - **Member**: Can view and resolve issues
   - **Billing**: Can manage billing information

### 4.2 Configure Project Permissions

For each project (backend, listener, extension):

1. Navigate to **Project Settings** → **General Settings**
2. Scroll to **Team Access**
3. Ensure your team has the appropriate access level
4. Configure alert rules under **Alerts** → **Alert Rules**

### 4.3 Configure Automatic Issue Assignment

Sentry supports automatic issue assignment using ownership rules. These rules automatically route errors to the appropriate team based on file paths, error types, and other criteria.

**Assignment Rules Summary:**
- **Backend errors** → Assigned to `backend-team`
- **Listener/parser errors** → Assigned to `data-team`
- **Extension errors** → Assigned to `frontend-team`
- **Payment errors** → Assigned to `finance-team`

These rules ensure that issues are automatically routed to the right team members for faster triage and resolution.

#### Ownership Rules Syntax

Navigate to **Project Settings** → **Ownership Rules** and configure the following for each project:

**Backend Project (`snaptrade-backend`):**
```
# Backend errors assigned to backend team
path:src/api/* #backend-team
path:src/services/* #backend-team
path:src/controllers/* #backend-team
path:src/models/* #backend-team

# Payment errors assigned to finance team
path:src/payment/* #finance-team
path:src/billing/* #finance-team
tags.transaction_type:payment #finance-team
module:payment* #finance-team
```

**Listener Project (`snaptrade-listener`):**
```
# Listener errors assigned to data team
path:src/listener/* #data-team
path:src/parser/* #data-team
module:listener* #data-team
module:parser* #data-team

# Parser-specific errors to data team
tags.error_type:parse_error #data-team
tags.error_type:data_validation #data-team
```

**Extension Project (`snaptrade-extension`):**
```
# Extension errors assigned to frontend team
path:src/* #frontend-team
path:components/* #frontend-team
path:popup/* #frontend-team
path:content/* #frontend-team
module:extension* #frontend-team
```

#### Ownership Rules Reference

Sentry ownership rules support multiple matchers:

- `path:pattern` - Match file paths (supports wildcards `*`)
- `module:pattern` - Match module/package names
- `tags.key:value` - Match Sentry tags
- `url:pattern` - Match URLs (for frontend errors)

Teams are referenced with `#team-name` syntax. You can also assign to individual users using their email: `user@example.com`

#### Setting Up Teams for Auto-Assignment

Before using ownership rules, ensure these teams exist in Sentry:

1. Navigate to **Settings** → **Teams**
2. Create the following teams if they don't exist:
   - `backend-team` - Handles backend service errors
   - `data-team` - Handles listener and parser errors
   - `frontend-team` - Handles extension and UI errors
   - `finance-team` - Handles payment and billing errors
3. Add appropriate team members to each team
4. Ensure teams have access to their respective projects

#### Testing Ownership Rules

After configuring ownership rules:

1. Trigger test errors from different parts of the codebase
2. Navigate to the issue in Sentry
3. Verify the issue is automatically assigned to the correct team
4. Check that team members receive appropriate notifications

## Step 5: Set Up Integrations

### 5.1 Slack Integration

1. Navigate to **Settings** → **Integrations**
2. Find **Slack** in the list and click **"Add to Slack"**
3. Authorize the Sentry app in your Slack workspace
4. Choose the Slack channel(s) for notifications (e.g., `#engineering-alerts`, `#sentry-errors`)
5. Configure per-project alerts:
   - Go to each project's **Settings** → **Alerts**
   - Click **"New Alert Rule"**
   - Select **"Issues"** or **"Metric Alert"**
   - Configure conditions (e.g., "A new issue is created", "Issue is seen more than 100 times")
   - Under **"Then perform these actions"**, select **"Send a Slack notification"**
   - Choose your Slack channel
   - Save the alert rule

### 5.2 Email Notifications

1. Navigate to **User Settings** → **Notifications**
2. Configure email preferences:
   - **Issue Alerts**: Get notified when issues match alert rules
   - **Workflow Notifications**: Get notified about issue assignments, comments, etc.
   - **Deploy Notifications**: Get notified about new releases
3. For each project, go to **Project Settings** → **Alerts**
4. Create email alert rules:
   - Click **"New Alert Rule"**
   - Configure conditions
   - Under **"Then perform these actions"**, select **"Send a notification to"** and choose team members
   - Save the alert rule

### 5.3 Recommended Alert Rules

Set up the following alert rules for each project:

1. **New Issue Alert**
   - Condition: A new issue is created
   - Action: Send Slack notification + Email to on-call engineer

2. **High Frequency Alert**
   - Condition: Issue is seen more than 100 times in 1 hour
   - Action: Send Slack notification to #engineering-alerts

3. **Critical Error Alert**
   - Condition: Issue priority is high or issue level is error/fatal
   - Action: Send Slack notification + Email to team leads

4. **User Impact Alert**
   - Condition: Issue affects more than 50 users in 1 hour
   - Action: Send Slack notification + Email to product team

### 5.4 Alert Rules - Critical

The following critical alert rules ensure immediate response to severe system issues:

1. **Fatal Error Alert**
   - Condition: Any error with `level='fatal'`
   - Action: Trigger immediate PagerDuty incident + SMS to on-call engineer
   - Severity: Critical
   - Response Time: Immediate

2. **Payment Webhook Failure Alert**
   - Condition: Payment webhook failures detected
   - Action: Send PagerDuty alert + Slack notification to #payments-critical
   - Severity: High
   - Response Time: Alert within 5 minutes

3. **Backup Failure Alert**
   - Condition: Backup process failures detected
   - Action: Send email + Slack notification to #infrastructure-alerts
   - Severity: High
   - Response Time: Alert within 15 minutes

4. **Database Connection Failure Alert**
   - Condition: Database connection errors detected
   - Action: Trigger immediate PagerDuty incident + Slack notification to #infrastructure-critical
   - Severity: Critical
   - Response Time: Immediate

### 5.5 Alert Rules - Warning

The following warning alert rules help identify potential issues before they become critical:

1. **Listener Disconnection Alert**
   - Condition: Listener disconnection > 5 minutes
   - Action: Send Slack notification
   - Severity: Warning
   - Response Time: Alert within 5 minutes

2. **Trade Timeout Rate Alert**
   - Condition: Trade timeout rate > 10% in 1 hour
   - Action: Send email notification to team
   - Severity: Warning
   - Response Time: Alert within 1 hour

3. **Parse Failure Rate Alert**
   - Condition: Parse failure rate > 20%
   - Action: Alert team
   - Severity: Warning
   - Response Time: Immediate alert

4. **API Response Time Alert**
   - Condition: API response time > 2s for 10 consecutive requests
   - Action: Alert performance team
   - Severity: Warning
   - Response Time: Alert when threshold reached

### 5.6 Alert Rules - Info

The following informational alert rules provide non-urgent monitoring and insights for team retrospectives:

1. **Daily Digest of All Errors**
   - Condition: Aggregate all errors from the past 24 hours
   - Action: Send daily email digest at 9:00 AM
   - Severity: Info
   - Purpose: Keep team informed of all error activity

2. **Weekly Performance Report**
   - Condition: Aggregate transaction timings and performance metrics for the past week
   - Action: Send weekly email report every Monday at 10:00 AM
   - Severity: Info
   - Purpose: Monitor performance trends and identify optimization opportunities

3. **Monthly Error Trends**
   - Condition: Aggregate error trends, top issues, and resolution metrics for the past month
   - Action: Send monthly email report on the 1st of each month
   - Severity: Info
   - Purpose: Support retrospectives and track improvement over time

## Step 6: Verify Setup

### 6.1 Test Error Reporting

For each service, trigger a test error to verify Sentry is working:

**Backend/Listener:**
```javascript
// Add a test endpoint or run this in your console
Sentry.captureException(new Error('Test error from backend'));
```

**Extension:**
```javascript
// Trigger from browser console
Sentry.captureException(new Error('Test error from extension'));
```

### 6.2 Verify in Sentry Dashboard

1. Navigate to each project in Sentry
2. Check the **Issues** tab
3. Verify your test errors appear
4. Check that they show the correct environment (production/staging/development)
5. Verify Slack/email notifications were received

### 6.3 Monitor Source Maps (for JavaScript projects)

If using JavaScript/TypeScript:

1. Ensure source maps are uploaded during build/deploy
2. Verify stack traces show original source code, not minified code
3. Configure source map upload in your CI/CD pipeline

## Step 7: Using the Sentry Dashboard

Once your Sentry projects are set up and verified, you'll use the Sentry dashboard daily to monitor errors, track performance, and manage releases. This section explains the key features of the dashboard.

### 7.1 Issues View

The **Issues** view is your primary interface for error tracking and management. Access it by clicking **Issues** in the left sidebar of any project.

**Key Features:**
- **Error Grouping**: Sentry automatically groups similar errors together, reducing noise and helping you focus on unique problems
- **Issue Details**: Click any issue to see stack traces, breadcrumbs, user context, and device information
- **Status Management**: Mark issues as Resolved, Ignored, or assign them to team members
- **Search & Filters**: Filter by error level, environment, release version, or custom tags
- **Trends**: View error frequency graphs to identify spikes or regressions

**Common Workflows:**
1. **Triage new issues**: Review unresolved issues daily, assign owners, and set priorities
2. **Investigate errors**: Use stack traces and breadcrumbs to understand the error context
3. **Track resolution**: Mark issues as resolved after deploying fixes, Sentry will reopen them if they recur

📚 [Learn more about Issues](https://docs.sentry.io/product/issues/)

### 7.2 Performance Monitoring

The **Performance** view provides transaction monitoring and helps identify bottlenecks. Access it by clicking **Performance** in the left sidebar.

**Key Features:**
- **Transaction Overview**: See response times, throughput, and error rates for all transactions
- **Slow Queries**: Identify database queries and API calls that exceed performance thresholds
- **Transaction Details**: Drill down into individual transactions to see waterfall charts of all operations
- **Trends**: Track performance over time to catch regressions early
- **LCP, FID, CLS Metrics**: For frontend projects, monitor Core Web Vitals

**Performance Thresholds**: Refer to Step 7.2 for the configured thresholds (Backend API: >1s, Database: >500ms, etc.)

**Common Workflows:**
1. **Identify slow endpoints**: Sort transactions by p95 duration to find the slowest operations
2. **Analyze bottlenecks**: Click slow transactions to see waterfall charts and identify expensive operations
3. **Monitor trends**: Set up performance alerts to catch regressions when new code is deployed

📚 [Learn more about Performance Monitoring](https://docs.sentry.io/product/performance/)

### 7.3 Releases

The **Releases** view tracks your deployments and links errors to specific versions. Access it by clicking **Releases** in the left sidebar.

**Key Features:**
- **Deploy Tracking**: See when each version was deployed and to which environments
- **Error Attribution**: Link errors to the release that introduced them
- **Regression Detection**: Automatically flag issues that reappear in new releases
- **Release Health**: Monitor crash rates, user adoption, and session data per release
- **Commit Integration**: View commits included in each release when integrated with GitHub/GitLab

**Common Workflows:**
1. **Monitor new deployments**: After deploying, check the release view to see if new errors appear
2. **Compare releases**: Compare error rates between releases to validate stability improvements
3. **Track regressions**: Identify which release introduced a regression and review the commits

📚 [Learn more about Releases](https://docs.sentry.io/product/releases/)

### 7.4 Alerts

The **Alerts** view manages notification rules and alert history. Access it via **Alerts** in the left sidebar or through **Project Settings** → **Alerts**.

**Key Features:**
- **Alert Rules**: Create and manage issue alerts and metric alerts
- **Alert History**: View triggered alerts and their resolution status
- **Multiple Channels**: Send alerts to Slack, email, PagerDuty, or webhooks
- **Customizable Conditions**: Trigger alerts based on error frequency, user impact, or custom metrics

**Configured Alert Rules**: See Steps 5.3-5.6 for the alert rules already configured for your projects:
- Critical alerts (Fatal errors, Payment failures, Database failures)
- Warning alerts (Listener disconnections, API timeouts)
- Info alerts (Daily digests, Weekly reports)

**Common Workflows:**
1. **Review triggered alerts**: Check alert history to see what fired recently
2. **Fine-tune rules**: Adjust thresholds if you're getting too many or too few notifications
3. **Create new rules**: Set up alerts for new error patterns or performance issues

📚 [Learn more about Alerts](https://docs.sentry.io/product/alerts/)

### 7.5 Dashboard Navigation Tips

**Quick Tips:**
- Use **Discover** for custom queries across all your error and performance data
- Check **Stats** for organization-wide metrics and usage information
- Use **Saved Searches** to bookmark frequently used issue filters
- Enable **Dark Mode** in User Settings for easier viewing
- Keyboard shortcuts: `?` shows all available shortcuts

**Mobile App**: Download the Sentry mobile app for iOS/Android to monitor issues and receive alerts on the go.

## Step 8: Additional Configuration (Optional)

### 7.1 Release Tracking

Configure release tracking to link errors to specific deployments:

```javascript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.ENVIRONMENT,
  release: process.env.RELEASE_VERSION, // e.g., "1.0.0" or git commit SHA
});
```

### 7.2 Performance Monitoring

Enable performance monitoring to track transaction times:

```javascript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.ENVIRONMENT,
  tracesSampleRate: 0.1, // Sample 10% of transactions
});
```

#### Performance Thresholds

Configure performance thresholds to automatically flag slow operations. The following thresholds should be set in Sentry's Performance settings to identify performance bottlenecks:

| Operation Type | Threshold | Action |
|----------------|-----------|--------|
| Backend API endpoints | > 1s | Flagged as slow |
| Database queries | > 500ms | Flagged as slow |
| WebSocket operations | > 200ms | Flagged as slow |
| Signal processing | > 3s | Flagged as slow |

**Setting Performance Thresholds in Sentry:**

1. Navigate to **Project Settings** → **Performance**
2. Scroll to **Transaction Threshold Settings**
3. Click **"Add Threshold"** for each operation type
4. Configure the thresholds:

   **Backend API Endpoints:**
   ```
   Transaction Pattern: /api/*
   Threshold: 1000ms (1s)
   Alert when exceeded
   ```

   **Database Queries:**
   ```
   Transaction Pattern: db.query.*
   Threshold: 500ms
   Alert when exceeded
   ```

   **WebSocket Operations:**
   ```
   Transaction Pattern: websocket.*
   Threshold: 200ms
   Alert when exceeded
   ```

   **Signal Processing:**
   ```
   Transaction Pattern: signal.process.*
   Threshold: 3000ms (3s)
   Alert when exceeded
   ```

5. Save the threshold configurations
6. Optionally, create Performance Alerts to get notified when thresholds are exceeded:
   - Go to **Alerts** → **Create Alert Rule** → **Performance Alert**
   - Set condition: "Transaction duration is above threshold"
   - Configure action: Send Slack/email notification
   - Save the alert rule

### 7.3 Session Replay (for Extension)

Enable session replay for debugging frontend issues:

```javascript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.ENVIRONMENT,
  replaysSessionSampleRate: 0.1, // Sample 10% of sessions
  replaysOnErrorSampleRate: 1.0, // Capture 100% of sessions with errors
});
```

## Troubleshooting

### DSN Not Working
- Verify the DSN is correctly copied (no extra spaces or characters)
- Check that the project is not disabled in Sentry
- Ensure the SDK is properly initialized before the error occurs

### Errors Not Appearing
- Check your environment variables are loaded correctly
- Verify network connectivity to Sentry servers
- Check browser console for SDK initialization errors
- Review any firewall or ad-blocker rules

### Environment Not Showing Correctly
- Verify the environment variable is set correctly in your `.env` file
- Ensure the environment is passed to `Sentry.init()`
- Check that the environment is deployed to your servers

### Notifications Not Received
- Verify alert rules are configured and active
- Check Slack integration is authorized and channels are correct
- Verify email addresses in team member profiles
- Check notification settings in User Settings

## Support

For additional help:
- [Sentry Documentation](https://docs.sentry.io/)
- [Sentry Community Forum](https://forum.sentry.io/)
- Internal team Slack channel: #sentry-support

---

**Last Updated:** 2026-03-23
