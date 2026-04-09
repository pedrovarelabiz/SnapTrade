# Backup Monitoring Checklist

Operational checklist for regular backup monitoring and verification.

---

## Daily Checks

### 1. Verify Backup Health Endpoint

**Frequency:** Every business day

**Command:**
```bash
curl -s https://api.snaptrade.com/api/health/backup | jq '.'
```

**Expected Output:**
```json
{
  "status": "healthy",
  "last_backup": "2026-03-22T06:00:00Z",
  "backup_age_hours": 2,
  "next_scheduled": "2026-03-23T06:00:00Z"
}
```

**Action Items:**
- ✅ Status should be "healthy"
- ✅ Last backup should be within last 24 hours
- ✅ Backup age should be < 26 hours
- ⚠️ If any check fails, escalate to on-call engineer immediately

---

## Weekly Checks

### 1. Verify Backup Sizes Are Consistent

**Frequency:** Every Monday morning

**Command:**
```bash
aws s3 ls s3://snaptrade-backups/postgres/ --recursive --human-readable --summarize | tail -20
```

**Expected Output:**
```
Total Objects: 21
Total Size: 45.2 GB
```

**Action Items:**
- ✅ Compare current week's backup size to previous week (±20% tolerance)
- ✅ Check for unexpected growth patterns
- ⚠️ If size differs by >50%, investigate data changes or backup issues
- 📝 Document any significant size changes in weekly ops log

**Alternative Command (last 7 days):**
```bash
aws s3api list-objects-v2 --bucket snaptrade-backups --prefix postgres/ \
  --query "reverse(sort_by(Contents[?LastModified>='$(date -d '7 days ago' -Iseconds)'], &LastModified))[*].[Key,Size,LastModified]" \
  --output table
```

---

## Monthly Checks

### 1. Test Restore on Test Instance

**Frequency:** First Monday of each month

**Command:**
```bash
# Step 1: Identify latest backup
aws s3 ls s3://snaptrade-backups/postgres/ --recursive | sort | tail -1

# Step 2: Download backup
aws s3 cp s3://snaptrade-backups/postgres/backup-YYYY-MM-DD.sql.gz /tmp/

# Step 3: Restore to test database
gunzip -c /tmp/backup-YYYY-MM-DD.sql.gz | psql -h test-db.internal -U postgres -d snaptrade_test

# Step 4: Verify critical tables
psql -h test-db.internal -U postgres -d snaptrade_test -c "SELECT COUNT(*) FROM users;"
psql -h test-db.internal -U postgres -d snaptrade_test -c "SELECT COUNT(*) FROM accounts;"
psql -h test-db.internal -U postgres -d snaptrade_test -c "SELECT COUNT(*) FROM trades;"
```

**Expected Output:**
```
Restore should complete without errors
Table counts should match production (within 24hr delta)
```

**Action Items:**
- ✅ Restore completes successfully without errors
- ✅ Critical tables are accessible and contain expected row counts
- ✅ Test queries execute successfully
- 📝 Document restore time and any issues encountered
- ⚠️ If restore fails, investigate backup integrity immediately

---

## Quarterly Checks

### 1. Review S3 Storage Costs

**Frequency:** First week of Jan, Apr, Jul, Oct

**Command:**
```bash
# Get S3 storage metrics
aws s3api list-objects-v2 --bucket snaptrade-backups --output json \
  | jq '[.Contents[].Size] | add / 1024 / 1024 / 1024' # Size in GB

# Get cost estimate (assuming $0.023/GB for S3 Standard)
aws s3api list-objects-v2 --bucket snaptrade-backups --output json \
  | jq '[.Contents[].Size] | add / 1024 / 1024 / 1024 * 0.023' # Monthly cost
```

**Expected Output:**
```
Storage: ~180 GB
Estimated monthly cost: ~$4.14
```

**Action Items:**
- ✅ Review total storage size and growth trend
- ✅ Verify costs align with budget expectations
- ✅ Consider lifecycle policies if storage >500GB
- 📝 Document storage metrics in quarterly ops review
- 💰 Recommend archiving backups >90 days to Glacier if cost >$50/month

### 2. Update Credentials (If Rotating)

**Frequency:** Quarterly or per security policy

**Command:**
```bash
# Step 1: Generate new AWS access keys in IAM console
# Step 2: Update credentials in environment/secrets manager
kubectl set env deployment/backup-service AWS_ACCESS_KEY_ID=<new-key> -n production
kubectl set env deployment/backup-service AWS_SECRET_ACCESS_KEY=<new-secret> -n production

# Step 3: Verify new credentials work
kubectl exec -it deployment/backup-service -n production -- aws s3 ls s3://snaptrade-backups/

# Step 4: Remove old credentials from IAM
# Step 5: Update documentation
```

**Action Items:**
- ✅ New credentials successfully authenticated
- ✅ Backup service can access S3 bucket
- ✅ Old credentials deactivated/deleted
- ✅ Update credential rotation log
- 📝 Document rotation date and next scheduled rotation

### 3. Comprehensive Backup Restore Test

**Frequency:** First week of Jan, Apr, Jul, Oct (Automated via cron)

**Purpose:** Validate full backup restore capability in isolated test instance with comprehensive data integrity checks.

**Automated Script:**
```bash
/opt/snaptrade-unified/backend/scripts/quarterly-restore-test.sh
```

**Manual Execution (if needed):**
```bash
# The automated script performs the following:
# 1. Identifies and downloads latest backup from S3
# 2. Spins up temporary PostgreSQL instance on port 5433
# 3. Restores backup to temporary database
# 4. Runs comprehensive verification queries:
#    - Validates all critical tables exist (users, accounts, trades, portfolios, transactions)
#    - Checks row counts for each critical table
#    - Verifies data integrity (no NULL IDs, no orphaned records)
#    - Tests sample queries to ensure data accessibility
# 5. Generates detailed test report with timing metrics
# 6. Automatically cleans up test instance and temporary files
# 7. Sends notification to ops team

# View last test report:
ls -lt /tmp/quarterly_restore_test_report_*.txt | head -1 | xargs cat
```

**Expected Output:**
```
[SUCCESS] Temporary PostgreSQL instance started
[SUCCESS] Restore completed in XXs
[SUCCESS] Table 'users': XXXXX rows
[SUCCESS] Table 'accounts': XXXXX rows
[SUCCESS] Table 'trades': XXXXX rows
[SUCCESS] Data integrity: No NULL user IDs
[SUCCESS] Data integrity: No orphaned accounts
[SUCCESS] Quarterly backup restore test completed successfully!
```

**Action Items:**
- ✅ Automated test completes successfully without errors
- ✅ All critical tables restored with expected row counts
- ✅ Data integrity checks pass (no NULL IDs, no orphaned records)
- ✅ Restore time is within acceptable limits (<10 minutes for typical backup)
- ✅ Test instance successfully spins up and cleans up automatically
- 📝 Review test report and document any anomalies
- 📝 Update quarterly ops review with restore metrics
- ⚠️ If test fails, investigate backup integrity and restore process immediately
- 💡 Consider adjusting retention policies based on restore performance

**Cron Schedule:**
```bash
# Runs at 2 AM on the first Monday of Jan, Apr, Jul, Oct
0 2 * 1,4,7,10 1 [ "$(date +\%d)" -le 7 ] && /opt/snaptrade-unified/backend/scripts/quarterly-restore-test.sh >> /var/log/quarterly-restore-test.log 2>&1
```

---

## Emergency Procedures

### Backup Failure Response

If daily health check fails:

1. Check backup service logs:
   ```bash
   kubectl logs deployment/backup-service -n production --tail=100
   ```

2. Check S3 connectivity:
   ```bash
   aws s3 ls s3://snaptrade-backups/
   ```

3. Manually trigger backup:
   ```bash
   kubectl exec -it deployment/backup-service -n production -- /app/scripts/manual-backup.sh
   ```

4. Escalate to database team if issue persists >2 hours

---

## Checklist Summary

| Frequency | Task | Owner | Last Completed |
|-----------|------|-------|----------------|
| Daily | Health endpoint check | On-call | YYYY-MM-DD |
| Weekly | Backup size verification | DevOps | YYYY-MM-DD |
| Monthly | Restore test | Database Team | YYYY-MM-DD |
| Quarterly | Storage cost review | FinOps | YYYY-MM-DD |
| Quarterly | Credential rotation | Security | YYYY-MM-DD |
| Quarterly | Comprehensive restore test (automated) | Platform Engineering | YYYY-MM-DD |

---

**Last Updated:** 2026-03-22
**Document Owner:** Platform Engineering Team
