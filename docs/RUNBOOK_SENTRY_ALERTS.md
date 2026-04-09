# Sentry Alerts Runbook

## Overview
This runbook provides procedures for responding to Sentry alerts, including investigation steps, remediation actions, and escalation paths.

---

## Alert Types and Procedures

### 1. High Error Rate Alert

#### What This Alert Means
The error rate has exceeded the configured threshold (e.g., >5% of requests failing or >100 errors/minute).

#### Investigation Steps
1. **Check Sentry Dashboard**
   - Navigate to Issues > sort by frequency
   - Identify the top 3-5 error types contributing to the spike
   - Check the timeline: Is this a gradual increase or sudden spike?

2. **Review Event Details**
   - Click on the most frequent issue
   - Examine stack traces for root cause
   - Check breadcrumbs to understand user actions leading to the error
   - Review tags: environment, release version, browser/device

3. **Assess User Impact**
   - Check "Users Affected" metric
   - Determine if errors are isolated to specific user segments
   - Review geographic distribution of errors

4. **Correlate with Deployments**
   - Check if errors started after a recent deployment
   - Compare error rate between releases

#### Remediation Steps
1. **Immediate Actions**
   - If errors correlate with recent deployment: rollback to previous stable version
   - If specific endpoint is failing: consider circuit breaker or feature flag disable
   - Verify infrastructure health (CPU, memory, database connections)

2. **Short-term Fixes**
   - Apply hotfix for identified bug
   - Add defensive error handling if missing
   - Increase resource limits if capacity-related

3. **Long-term Solutions**
   - Create bug ticket with full context from Sentry
   - Add monitoring for early detection
   - Implement retry logic or graceful degradation

#### Escalation Path
- **0-15 min**: On-call engineer investigates
- **15-30 min**: Escalate to team lead if unresolved
- **30-60 min**: Engage platform team if infrastructure-related
- **>60 min**: Escalate to engineering manager and incident commander

---

### 2. JavaScript Error Alert

#### What This Alert Means
Frontend JavaScript errors are occurring, potentially breaking user experience.

#### Investigation Steps
1. **Check Error Details**
   - Review error message and stack trace
   - Identify affected file and line number
   - Check if error is minified (map to source if available)

2. **Review Breadcrumbs**
   - User interactions before error (clicks, navigation)
   - Network requests (successful/failed)
   - Console logs and previous errors

3. **Analyze User Impact**
   - Browser/OS distribution
   - Specific browser versions affected
   - Mobile vs desktop breakdown
   - Percentage of sessions impacted

4. **Check Recent Changes**
   - Review recent frontend deployments
   - Check for third-party script changes
   - Verify CDN/asset delivery

#### Remediation Steps
1. **Immediate Response**
   - If widespread: rollback frontend deployment
   - If browser-specific: add browser compatibility fix
   - If third-party script: remove or replace

2. **Containment**
   - Wrap problematic code in try-catch with fallback
   - Add feature detection before running failing code
   - Implement graceful degradation for affected feature

3. **Resolution**
   - Fix underlying bug in source code
   - Add unit tests to prevent regression
   - Update browser support matrix if needed

#### Escalation Path
- **0-10 min**: Frontend on-call investigates
- **10-30 min**: Engage frontend team lead
- **30+ min**: Escalate to product owner if user-facing feature is broken
- **Critical (payment/auth)**: Immediate escalation to incident commander

---

### 3. Performance Degradation Alert

#### What This Alert Means
Application performance metrics have degraded (e.g., p95 response time >2s, transaction duration spike).

#### Investigation Steps
1. **Check Sentry Performance Dashboard**
   - Identify slow transactions
   - Review transaction timeline for patterns
   - Check for span duration outliers

2. **Analyze Transaction Details**
   - Review span waterfall to find bottlenecks
   - Check database query performance
   - Identify slow external API calls
   - Review breadcrumbs for context

3. **Assess User Impact**
   - Number of affected users
   - Geographic patterns (latency-related?)
   - Device/connection type correlation

4. **Cross-reference Metrics**
   - Check APM for CPU/memory usage
   - Review database slow query logs
   - Verify external service status pages

#### Remediation Steps
1. **Immediate Actions**
   - Scale up resources if capacity issue
   - Enable caching for expensive operations
   - Rate limit if load-related

2. **Optimization**
   - Add database indexes for slow queries
   - Implement query result caching
   - Optimize N+1 queries
   - Add CDN caching for static assets

3. **Long-term Improvements**
   - Refactor inefficient code paths
   - Implement async processing for heavy operations
   - Add performance budgets and monitoring

#### Escalation Path
- **0-20 min**: Backend on-call investigates
- **20-45 min**: Escalate to database team if query-related
- **45+ min**: Engage infrastructure team for scaling decisions
- **Severe degradation**: Immediate incident declaration

---

### 4. Crash/Unhandled Exception Alert

#### What This Alert Means
Application crashes or unhandled exceptions are occurring, causing service disruption.

#### Investigation Steps
1. **Review Crash Report**
   - Exception type and message
   - Full stack trace
   - Thread information (if available)

2. **Check Event Context**
   - Request parameters and body
   - User context (authenticated, permissions)
   - Environment variables
   - Breadcrumbs leading to crash

3. **Determine Scope**
   - Frequency of crashes
   - Specific code paths affected
   - Environmental factors (region, load)

4. **Identify Root Cause**
   - Null pointer/undefined access
   - Resource exhaustion
   - Third-party library failure
   - Configuration error

#### Remediation Steps
1. **Stop the Bleeding**
   - Rollback if deployment-related
   - Add null checks and validation
   - Implement circuit breakers for external dependencies
   - Restart affected services if memory leak

2. **Fix the Issue**
   - Add proper error handling
   - Fix logic errors in code
   - Update dependencies if library bug
   - Add input validation

3. **Prevent Recurrence**
   - Add comprehensive tests
   - Implement health checks
   - Add alerting for early warning signs
   - Document known failure modes

#### Escalation Path
- **0-5 min**: Immediate response from on-call
- **5-15 min**: Escalate to senior engineer if unclear
- **15-30 min**: Engage technical lead and prepare incident response
- **Production down**: Immediate all-hands incident response

---

### 5. API/Backend Error (500/503)

#### What This Alert Means
Server-side errors indicating service unavailability or internal server errors.

#### Investigation Steps
1. **Check Sentry Event Details**
   - Review error type and HTTP status code
   - Examine request parameters and headers
   - Check database query logs if available

2. **Review Breadcrumbs**
   - Trace API request path
   - Check upstream service calls
   - Verify authentication and authorization flow

3. **Assess User Impact**
   - Identify which API endpoints are affected
   - Check if issue affects all users or specific segments
   - Determine if workaround exists

#### Remediation Steps
1. **503 Service Unavailable**
   - Check service health and auto-scaling status
   - Increase capacity if resource exhaustion detected
   - Restart unhealthy service instances

2. **500 Internal Server Error**
   - Review application logs for stack traces
   - Check database connection pool status
   - Verify environment configuration

3. **Long-term Fixes**
   - Apply immediate hotfix or roll back if recent deployment
   - Add retry logic with exponential backoff
   - Implement circuit breakers for dependent services

#### Escalation Path
- **0-15 min**: Backend on-call engineer investigates
- **15-30 min**: Escalate to SRE team for infrastructure issues
- **30+ min**: Involve database admin if data-layer issue suspected

---

### 6. Database Connection Error

#### What This Alert Means
Application cannot establish or maintain database connections.

#### Investigation Steps
1. **Check Sentry Event Details**
   - Review connection error messages
   - Check connection pool metrics
   - Verify database credentials validity

2. **Review Breadcrumbs**
   - Identify query patterns before failure
   - Check for connection leaks
   - Verify transaction management

3. **Assess User Impact**
   - Determine if all database operations are failing
   - Check if issue is isolated to specific database replicas
   - Verify read vs write operation impact

#### Remediation Steps
1. **Immediate Actions**
   - Increase connection pool size if exhaustion detected
   - Restart application instances to reset connections
   - Failover to backup database if primary is unresponsive

2. **Credential Issues**
   - Check and rotate credentials if authentication fails
   - Verify database user permissions
   - Update connection strings if needed

3. **Long-term Solutions**
   - Implement connection pool monitoring
   - Add connection leak detection
   - Configure proper timeout values

#### Escalation Path
- **0-10 min**: Backend engineer checks application-level issues
- **10-25 min**: Escalate to SRE for connection pool tuning
- **25+ min**: Escalate to DBA for database-level investigation

---

### 7. Rate Limit/Quota Exceeded Alert

#### What This Alert Means
Third-party service rate limits or quota limits have been reached.

#### Investigation Steps
1. **Identify Service**
   - Which external API is failing
   - Current usage vs quota
   - Rate limit window and reset time

2. **Review Usage Patterns**
   - Check for unusual traffic spike
   - Identify potential retry storms
   - Look for inefficient API usage

3. **Assess Impact**
   - Which features are affected
   - User impact and error messages
   - Fallback behavior (if any)

#### Remediation Steps
1. **Immediate Actions**
   - Implement request queuing/throttling
   - Enable caching to reduce API calls
   - Use fallback data source if available
   - Contact vendor for temporary limit increase

2. **Optimize Usage**
   - Batch API requests where possible
   - Implement exponential backoff
   - Add request deduplication
   - Cache responses appropriately

3. **Long-term Solutions**
   - Upgrade service tier if needed
   - Distribute load across multiple accounts
   - Implement rate limiting on client side
   - Add monitoring for quota consumption

#### Escalation Path
- **0-15 min**: On-call implements immediate throttling
- **15-30 min**: Escalate to team lead for vendor contact
- **30+ min**: Engage product/business for quota upgrade decision
- **Financial impact**: Escalate to engineering manager

---

## Common Error Examples

### Example 1: Database Connection Pool Exhausted
```
Error: "Timeout acquiring connection from pool"
Investigation: Check active connections, long-running queries, connection leaks
Remediation: Increase pool size, fix connection leaks, optimize queries, add timeouts
Escalation: Database team if persistent
```

### Example 2: Null Pointer Exception
```
Error: "Cannot read property 'id' of undefined"
Investigation: Check data flow, API response structure, state management
Remediation: Add null checks, validate API contracts, set defaults, use optional chaining
Escalation: Team lead if architectural change needed
```

### Example 3: Memory Leak
```
Error: "Out of memory" or gradual performance degradation
Investigation: Heap dumps, memory profiling, check for event listener leaks, large object retention
Remediation: Restart service, fix memory leak, add memory limits, implement cleanup
Escalation: Senior engineer for memory analysis
```

### Example 4: CORS Error
```
Error: "Access-Control-Allow-Origin header missing"
Investigation: Check origin configuration, proxy settings, API gateway config
Remediation: Update CORS configuration, verify domain whitelist, check preflight handling
Escalation: DevOps/Infrastructure team for policy changes
```

### Example 5: Authentication Failure
```
Error: "JWT token expired" or "Invalid credentials"
Investigation: Check token expiration, session management, auth service health, time sync
Remediation: Fix token refresh logic, verify auth service, check time sync, rotate secrets
Escalation: Security team if potential breach suspected
```

### Example 6: Third-Party API Timeout
```
Error: "Request timeout after 30s"
Investigation: Check API status, network latency, payload size, endpoint health
Remediation: Increase timeout, implement retry with backoff, use circuit breaker, add caching
Escalation: Infrastructure team if network-related, vendor if API issue
```

---

## General Investigation Checklist

- [ ] Check Sentry issue frequency and trend
- [ ] Review full stack trace
- [ ] Examine breadcrumbs for user journey
- [ ] Check tags (environment, release, browser, etc.)
- [ ] Identify affected user count and percentage
- [ ] Correlate with recent deployments
- [ ] Review error grouping for similar issues
- [ ] Check external service status pages
- [ ] Verify infrastructure metrics (CPU, memory, disk)
- [ ] Search for related errors in logs
- [ ] Check if error is reproducible
- [ ] Review recent code changes

## General Remediation Checklist

- [ ] Assess severity and user impact
- [ ] Implement immediate fix or rollback
- [ ] Verify fix resolves the issue
- [ ] Monitor error rate post-remediation
- [ ] Create bug ticket with detailed context
- [ ] Add tests to prevent regression
- [ ] Update documentation if needed
- [ ] Conduct post-mortem if major incident
- [ ] Implement preventive monitoring
- [ ] Communicate resolution to stakeholders

## Escalation Guidelines

### Severity Levels

**P0 - Critical**
- Production completely down
- Data loss or corruption
- Security breach
- Payment processing failure
- Immediate escalation to incident commander

**P1 - High**
- Major feature broken
- Significant user impact (>10%)
- Performance severely degraded
- Auth/login issues
- Escalate within 15 minutes

**P2 - Medium**
- Minor feature broken
- Limited user impact (<10%)
- Intermittent errors
- Performance moderately degraded
- Escalate within 30 minutes

**P3 - Low**
- Edge cases
- Minimal user impact (<1%)
- Cosmetic issues
- Non-blocking errors
- Handle during business hours

### Contact Information
- On-call rotation: Check PagerDuty schedule
- Team leads: See team wiki
- Infrastructure team: #infrastructure-alerts Slack channel
- Security team: security@company.com
- Incident commander: #incident-response Slack channel
- Database team: #database-oncall Slack channel

---

## Post-Incident Actions

1. **Document the incident** in incident tracker
2. **Schedule post-mortem** within 48 hours for P0/P1
3. **Create action items** to prevent recurrence
4. **Update runbook** with lessons learned
5. **Share findings** with broader team
6. **Update monitoring/alerting** based on gaps identified
7. **Review and improve** response time metrics
8. **Update SLOs/error budgets** if necessary

---

## Communication Guidelines

### During Investigation
- Post initial acknowledgment in incident channel within 5 minutes
- Provide updates every 15 minutes for P0/P1
- Tag relevant team members and stakeholders
- Include current status, investigation findings, and next steps

### After Remediation
- Confirm error rate has normalized
- Post resolution summary with timeline
- Document root cause and fix applied
- Schedule post-mortem if severity warrants

---

## Additional Resources

- Sentry Documentation: https://docs.sentry.io
- Sentry Setup Guide: /docs/SENTRY_SETUP.md
- Error Budget Policy: /docs/ERROR_BUDGET.md
- Incident Response Playbook: [Internal Wiki]
- Service Dependencies Map: [Confluence]
- API Rate Limits Reference: [API Docs]
- On-Call Schedule: [PagerDuty Link]
- Post-Mortem Template: [Internal Wiki]

---

**Last Updated:** 2026-03-23
**Maintained By:** Engineering Operations Team
