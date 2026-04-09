# Backup Operations Runbook

**Version:** 1.0
**Last Updated:** 2026-03-22
**Audience:** Support Team
**Purpose:** Day-to-day operational procedures for managing and responding to backup issues

---

## Table of Contents

1. [Checking Backup Status](#1-checking-backup-status)
2. [Triggering Manual Backup](#2-triggering-manual-backup)
3. [Responding to Backup Failure Alerts](#3-responding-to-backup-failure-alerts)
4. [Escalation Procedures](#4-escalation-procedures)
5. [Common Fixes](#5-common-fixes)
6. [Decision Matrix: DevOps vs Restore](#6-decision-matrix-devops-vs-restore)

---

## 1. Checking Backup Status

### 1.1 Quick Health Check

```bash
# Check backup service status
sudo systemctl status backup-manager

# View recent backup jobs
python manage.py backup_status --last 24h

# Check S3 backup presence
aws s3 ls s3://snaptrade-backups/daily/ --recursive | tail -20
```

### 1.2 Detailed Status Check

```bash
# View full backup history
python manage.py backup_history --format table

# Check for failed backups in the last 7 days
python manage.py backup_status --failed --days 7

# Verify backup integrity
python manage.py verify_backup --latest
```

### 1.3 Monitoring Dashboard

- **Grafana Dashboard:** https://monitoring.snaptrade.com/d/backups
- **CloudWatch Metrics:** Look for `BackupSuccess` and `BackupDuration` metrics
- **Slack Channel:** #backup-alerts for real-time notifications

### 1.4 What to Look For

✅ **Healthy Status:**
- Last backup completed within expected schedule (daily: <24h, hourly: <1h)
- Backup size is consistent with previous backups (±20%)
- No error logs in the last 24 hours
- S3 bucket shows recent backup files

⚠️ **Warning Signs:**
- Backup duration increasing over time
- Backup size growing unexpectedly
- Warnings in logs (but backup completes)

🚨 **Critical Issues:**
- No backups in the last 24 hours (daily) or 2 hours (hourly)
- Backup failure alert in Slack
- S3 bucket shows no recent files
- Error logs showing authentication or permission issues

---

## 2. Triggering Manual Backup

### 2.1 When to Trigger Manual Backup

- Before planned maintenance or deployments
- After significant data changes or migrations
- To test backup functionality
- When automated backup failed and needs retry
- Per customer request for compliance reasons

### 2.2 Standard Manual Backup

```bash
# Full database backup
python manage.py backup_create --type full --priority high

# Incremental backup
python manage.py backup_create --type incremental

# Specific database backup
python manage.py backup_create --database production --type full
```

### 2.3 Emergency Backup (High Priority)

```bash
# Emergency full backup (bypasses queue)
python manage.py backup_create --type full --emergency --notify-on-complete

# Verify backup was created
python manage.py verify_backup --latest --detailed
```

### 2.4 Post-Backup Verification

After triggering a manual backup:

1. **Wait** for completion (typically 15-45 minutes for full backup)
2. **Verify** backup appears in S3:
   ```bash
   aws s3 ls s3://snaptrade-backups/manual/$(date +%Y-%m-%d)/ --human-readable
   ```
3. **Check** backup integrity:
   ```bash
   python manage.py verify_backup --latest
   ```
4. **Document** the manual backup in the incident ticket

---

## 3. Responding to Backup Failure Alerts

### 3.1 Alert Types and Severity

| Alert | Severity | Response Time | Action |
|-------|----------|---------------|--------|
| Backup Failed - Retry Scheduled | Low | 30 min | Monitor retry |
| Backup Failed - 2nd Attempt | Medium | 15 min | Investigate and fix |
| Backup Failed - 3rd Attempt | High | 5 min | Immediate action + escalate |
| No Backup in 24 Hours | Critical | Immediate | Emergency procedure |
| S3 Access Denied | Critical | Immediate | Check credentials |

### 3.2 Immediate Response Checklist

When you receive a backup failure alert:

- [ ] **Acknowledge** the alert in PagerDuty/Slack
- [ ] **Check** the error message in logs:
  ```bash
  sudo journalctl -u backup-manager -n 100 --no-pager
  ```
- [ ] **Identify** the failure type (see section 3.3)
- [ ] **Attempt** appropriate common fix (see section 5)
- [ ] **Document** actions taken in incident ticket
- [ ] **Escalate** if not resolved within 30 minutes

### 3.3 Common Failure Types

**Database Connection Error:**
```
Error: could not connect to database
```
→ Check database status, verify credentials, check network

**S3 Upload Error:**
```
Error: Access Denied (403) or Unable to upload to S3
```
→ Check IAM credentials, verify bucket permissions, check disk space

**Timeout Error:**
```
Error: Backup operation timed out after 3600 seconds
```
→ Check database load, verify network speed, check for long-running queries

**Disk Space Error:**
```
Error: No space left on device
```
→ Check disk usage, clean up old temp files, verify retention policy

---

## 4. Escalation Procedures

### 4.1 Escalation Levels

**Level 1: Support Team (You)**
- Initial triage and common fixes
- Response time: Immediate to 30 minutes
- Authority: Restart services, trigger manual backups, clear disk space

**Level 2: DevOps On-Call**
- Complex infrastructure issues
- Response time: 15 minutes (business hours), 30 minutes (after hours)
- Authority: Modify configurations, IAM permissions, infrastructure changes
- Contact: devops-oncall@snaptrade.com or page via PagerDuty

**Level 3: Database Team**
- Database-specific issues, corruption, performance
- Response time: 30 minutes (business hours), 1 hour (after hours)
- Contact: dba-team@snaptrade.com

**Level 4: Engineering Leadership**
- Critical data loss scenarios, architectural decisions
- Response time: 1 hour
- Contact: eng-leads@snaptrade.com

### 4.2 When to Escalate

**Escalate to DevOps immediately if:**
- Multiple backup failures (3+ consecutive failures)
- S3 access or permission errors that you cannot resolve
- Infrastructure issues (EC2, networking, IAM)
- Backup service won't start after restart
- No backups for 24+ hours
- Disk space cannot be freed up

**Escalate to Database Team if:**
- Database corruption suspected
- Database won't accept connections
- Backup fails due to database locks or deadlocks
- Query timeout issues during backup
- Need to verify database integrity

**Escalate to Engineering Leadership if:**
- Potential data loss scenario
- Multiple systems affected
- Customer data at risk
- Compliance violation imminent (no backups for 48+ hours)

### 4.3 Escalation Template

When escalating, provide:

```
Subject: [URGENT] Backup Failure - [Brief Description]

Summary: [One sentence describing the issue]

Timeline:
- [HH:MM] First alert received
- [HH:MM] Actions taken [list what you tried]
- [HH:MM] Current status

Error Details:
[Paste relevant error logs]

Impact:
- Last successful backup: [timestamp]
- Affected systems: [list]
- Customer impact: [Yes/No - explain]

Actions Taken:
1. [What you tried]
2. [Results of each action]

Next Steps Needed:
[What you need from DevOps/DBA]

Ticket: [Link to incident ticket]
```

---

## 5. Common Fixes

### 5.1 Restart Backup Service

**When to use:** Service appears hung, unresponsive, or showing stale status

```bash
# Check service status first
sudo systemctl status backup-manager

# Restart the service
sudo systemctl restart backup-manager

# Verify it started successfully
sudo systemctl status backup-manager

# Check logs for errors
sudo journalctl -u backup-manager -n 50 --no-pager

# Trigger a test backup
python manage.py backup_create --type incremental --test
```

**Wait 5 minutes**, then verify backup starts successfully.

### 5.2 Check Disk Space

**When to use:** "No space left on device" error or backup fails during creation

```bash
# Check disk usage on backup volume
df -h /var/backups

# Check for large temporary files
du -sh /var/backups/tmp/* | sort -h

# Clean up old temporary files (older than 24 hours)
find /var/backups/tmp -type f -mtime +1 -delete

# Check backup retention policy is working
python manage.py backup_cleanup --dry-run

# If needed, manually clean old backups (keeps last 7 days)
python manage.py backup_cleanup --keep-days 7 --confirm
```

**Target:** Keep at least 30% free space on backup volume.

### 5.3 Verify AWS Credentials

**When to use:** S3 upload errors, Access Denied (403), authentication failures

```bash
# Test AWS credentials
aws sts get-caller-identity

# Expected output should show correct IAM role
# If error, credentials are invalid or expired

# Check IAM role permissions
aws s3 ls s3://snaptrade-backups/ --region us-east-1

# Verify backup service is using correct credentials
sudo cat /etc/backup-manager/config.yml | grep aws_

# If credentials are invalid, restart service to refresh
sudo systemctl restart backup-manager
```

**If credentials are still invalid:** Escalate to DevOps immediately - they need to rotate keys.

### 5.4 Check Database Connectivity

**When to use:** "Could not connect to database" or connection timeout errors

```bash
# Test database connection
psql -h production-db.internal -U backup_user -d snaptrade -c "SELECT 1;"

# Check for connection limits
psql -h production-db.internal -U backup_user -d snaptrade -c \
  "SELECT count(*) FROM pg_stat_activity;"

# Verify backup user has correct permissions
psql -h production-db.internal -U backup_user -d snaptrade -c \
  "SELECT has_database_privilege('backup_user', 'snaptrade', 'CONNECT');"

# Check database load
psql -h production-db.internal -U backup_user -d snaptrade -c \
  "SELECT * FROM pg_stat_activity WHERE state = 'active';"
```

**If database is unreachable:** Escalate to Database Team.

### 5.5 Clear Stuck Backup Jobs

**When to use:** Backup shows as "in progress" for hours, or queue appears stuck

```bash
# List running backup jobs
python manage.py backup_jobs --status running

# Cancel stuck job (use job ID from above)
python manage.py backup_cancel --job-id <JOB_ID>

# Clear failed jobs from queue
python manage.py backup_queue --clear-failed

# Reset backup service state
sudo systemctl restart backup-manager

# Verify queue is clear
python manage.py backup_jobs --status all
```

### 5.6 Verify Network Connectivity to S3

**When to use:** S3 upload timeouts, slow uploads, intermittent failures

```bash
# Test S3 endpoint connectivity
curl -I https://s3.us-east-1.amazonaws.com

# Check network speed to S3
aws s3 cp /dev/null s3://snaptrade-backups/test-$(date +%s).txt --region us-east-1

# Check for network issues in logs
sudo journalctl -u backup-manager | grep -i "network\|timeout\|connection"

# Test with a small backup
python manage.py backup_create --type incremental --test --size-limit 100MB
```

---

## 6. Decision Matrix: DevOps vs Restore

### 6.1 When to Contact DevOps

Contact DevOps when the **system** needs fixing:

- ✅ Backup service is failing repeatedly
- ✅ Infrastructure issues (S3, IAM, EC2, networking)
- ✅ Need to modify backup configuration or schedule
- ✅ Need to add new backup jobs or databases
- ✅ Credential or permission issues
- ✅ Backup retention policy needs adjustment
- ✅ Performance issues with backup process
- ✅ Need to upgrade or patch backup software

**DevOps fixes the backup pipeline so future backups succeed.**

### 6.2 When to Initiate Restore

Initiate restore when **data** needs recovering:

- ✅ Data loss reported by customer or user
- ✅ Database corruption detected
- ✅ Accidental deletion of data
- ✅ Need to recover to a point in time
- ✅ Disaster recovery scenario
- ✅ Testing restore procedures (planned)
- ✅ Migration or environment refresh

**Restore recovers data from existing backups.**

### 6.3 Can You Do Both?

**Yes!** In some scenarios, you need both:

**Scenario:** Backup service has been failing for 48 hours, AND customer needs data from 3 days ago.

**Action:**
1. **First:** Initiate restore from last good backup (3 days ago) - this is time-sensitive
2. **Simultaneously:** Contact DevOps to fix the backup service - prevents future issues

**Priority:** Customer data recovery takes precedence, but don't delay fixing the backup system.

### 6.4 Quick Decision Tree

```
Is there a customer/user data issue?
├─ YES → Initiate Restore (see DISASTER_RECOVERY_RUNBOOK.md)
│         Also: Contact DevOps if backup system is broken
│
└─ NO → Is the backup system failing?
        ├─ YES → Contact DevOps (after attempting common fixes)
        └─ NO → Monitor and document
```

---

## 7. Quick Reference

### Emergency Contacts

- **DevOps On-Call:** devops-oncall@snaptrade.com | PagerDuty
- **Database Team:** dba-team@snaptrade.com | PagerDuty
- **Engineering Leadership:** eng-leads@snaptrade.com
- **Security Team:** security@snaptrade.com (for credential issues)

### Key Commands

```bash
# Check status
python manage.py backup_status --last 24h

# Trigger manual backup
python manage.py backup_create --type full --priority high

# Check logs
sudo journalctl -u backup-manager -n 100 --no-pager

# Restart service
sudo systemctl restart backup-manager

# Verify backup
python manage.py verify_backup --latest
```

### Key Metrics

- **RTO (Recovery Time Objective):** 4 hours
- **RPO (Recovery Point Objective):** 24 hours (daily), 1 hour (critical systems)
- **Backup Retention:** 30 days (daily), 7 days (hourly), 1 year (monthly)
- **Expected Backup Duration:** 15-45 minutes (full), 5-15 minutes (incremental)

### Documentation Links

- [Backup Strategy](BACKUP_STRATEGY.md)
- [Disaster Recovery Runbook](DISASTER_RECOVERY_RUNBOOK.md)
- [Backup Troubleshooting Guide](BACKUP_TROUBLESHOOTING.md)
- [Backup Security Documentation](BACKUP_SECURITY.md)

---

## 8. Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-22 | Initial runbook creation | Support Team |

---

**Remember:** When in doubt, escalate early. It's better to loop in DevOps and not need them than to delay and cause extended downtime.
