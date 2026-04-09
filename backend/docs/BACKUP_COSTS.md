# SnapTrade Backup Cost Analysis & Optimization

## Overview

This document provides detailed cost estimations for the SnapTrade backup system and actionable optimization strategies to minimize AWS expenses while maintaining data protection and compliance requirements.

**Last Updated:** 2026-03-22
**Document Version:** 1.0
**Owner:** Platform Infrastructure Team

---

## Table of Contents

1. [Cost Summary](#cost-summary)
2. [S3 Storage Costs](#s3-storage-costs)
3. [Glacier Storage Costs](#glacier-storage-costs)
4. [Data Transfer Costs](#data-transfer-costs)
5. [Cross-Region Replication Costs](#cross-region-replication-costs)
6. [Total Monthly Cost Estimation](#total-monthly-cost-estimation)
7. [Cost Optimization Strategies](#cost-optimization-strategies)
8. [Cost Monitoring](#cost-monitoring)

---

## Cost Summary

Based on the current backup configuration with a **30-day retention policy** and **lifecycle transition to Glacier after 7 days**, here's the estimated monthly cost breakdown:

| Cost Component | Monthly Estimate | Notes |
|----------------|------------------|-------|
| S3 Standard Storage (Days 1-7) | $2.30 - $11.50 | Varies by DB size |
| Glacier Storage (Days 8-30) | $1.84 - $9.20 | 77% cheaper than S3 |
| S3 Data Transfer (Upload) | $0.00 | Free inbound |
| S3 Data Transfer (Download) | $0.00 - $9.00 | Only for restores |
| Cross-Region Replication | $2.30 - $11.50 | Doubles storage costs |
| Lifecycle Transitions | $0.30 | $0.01 per 1,000 requests |
| **Total (without replication)** | **$4.44 - $22.00** | Per month |
| **Total (with replication)** | **$6.74 - $33.50** | Per month |

**Assumptions:**
- Database size: 1 GB - 5 GB (uncompressed)
- Compression ratio: 75% (gzip)
- Region: us-east-1 (N. Virginia)
- Daily backups at 2 AM UTC
- 30-day rolling retention

---

## S3 Storage Costs

### Pricing (us-east-1)

| Storage Class | Cost per GB/month | Use Case |
|---------------|-------------------|----------|
| S3 Standard | $0.023/GB | First 7 days (frequent access) |
| S3 Glacier Instant Retrieval | $0.004/GB | Days 8-30 (archive) |
| S3 Glacier Flexible Retrieval | $0.0036/GB | Alternative for longer retention |

### Storage Calculation Formula

```
Daily Backup Size (compressed) = Raw DB Size × (1 - Compression Ratio)
Total S3 Standard Storage = Daily Backup Size × 7 days
Total Glacier Storage = Daily Backup Size × 23 days (days 8-30)
```

### Example Calculations

#### Small Database (1 GB uncompressed)
```
Compressed backup size: 1 GB × 0.25 = 0.25 GB
S3 Standard storage: 0.25 GB × 7 days = 1.75 GB
Glacier storage: 0.25 GB × 23 days = 5.75 GB

Monthly S3 cost: 1.75 GB × $0.023 = $0.04
Monthly Glacier cost: 5.75 GB × $0.004 = $0.023
Total storage: $0.063/month
```

#### Medium Database (3 GB uncompressed)
```
Compressed backup size: 3 GB × 0.25 = 0.75 GB
S3 Standard storage: 0.75 GB × 7 days = 5.25 GB
Glacier storage: 0.75 GB × 23 days = 17.25 GB

Monthly S3 cost: 5.25 GB × $0.023 = $0.12
Monthly Glacier cost: 17.25 GB × $0.004 = $0.069
Total storage: $0.189/month
```

#### Large Database (5 GB uncompressed)
```
Compressed backup size: 5 GB × 0.25 = 1.25 GB
S3 Standard storage: 1.25 GB × 7 days = 8.75 GB
Glacier storage: 1.25 GB × 23 days = 28.75 GB

Monthly S3 cost: 8.75 GB × $0.023 = $0.20
Monthly Glacier cost: 28.75 GB × $0.004 = $0.115
Total storage: $0.315/month
```

#### Enterprise Database (20 GB uncompressed)
```
Compressed backup size: 20 GB × 0.25 = 5 GB
S3 Standard storage: 5 GB × 7 days = 35 GB
Glacier storage: 5 GB × 23 days = 115 GB

Monthly S3 cost: 35 GB × $0.023 = $0.81
Monthly Glacier cost: 115 GB × $0.004 = $0.46
Total storage: $1.27/month
```

### Cost Scaling by Database Size

| DB Size (Uncompressed) | Compressed (75%) | S3 Standard (7d) | Glacier (23d) | **Monthly Total** |
|------------------------|------------------|------------------|---------------|-------------------|
| 1 GB | 0.25 GB | $0.04 | $0.02 | **$0.06** |
| 3 GB | 0.75 GB | $0.12 | $0.07 | **$0.19** |
| 5 GB | 1.25 GB | $0.20 | $0.12 | **$0.32** |
| 10 GB | 2.5 GB | $0.40 | $0.23 | **$0.63** |
| 20 GB | 5 GB | $0.81 | $0.46 | **$1.27** |
| 50 GB | 12.5 GB | $2.01 | $1.15 | **$3.16** |
| 100 GB | 25 GB | $4.03 | $2.30 | **$6.33** |

---

## Glacier Storage Costs

### Current Configuration

Per the [S3 lifecycle policy](/opt/snaptrade-unified/backend/docs/s3-lifecycle-policy.json):
- **Transition:** After 7 days → Glacier Instant Retrieval
- **Duration:** Days 8-30 (23 days)
- **Expiration:** Permanent deletion after 30 days

### Glacier vs S3 Cost Comparison

For a 5 GB compressed backup stored for 23 days:

| Storage Class | Cost per GB | 23 Days (115 GB) | Monthly Cost |
|---------------|-------------|------------------|--------------|
| S3 Standard | $0.023/GB | 115 GB | **$2.65** |
| Glacier Instant Retrieval | $0.004/GB | 115 GB | **$0.46** |
| **Savings** | - | - | **$2.19 (83%)** |

### Glacier Retrieval Costs

Glacier charges for data retrieval during restore operations:

| Retrieval Tier | Speed | Cost per GB | Use Case |
|----------------|-------|-------------|----------|
| Instant | Milliseconds | $0.03/GB | Emergency restore |
| Expedited | 1-5 minutes | $0.03/GB | Urgent restore |
| Standard | 3-5 hours | $0.01/GB | Planned restore |
| Bulk | 5-12 hours | $0.0025/GB | Large-scale restore |

**Example:** Restoring a 5 GB backup from Glacier:
- **Instant retrieval:** 5 GB × $0.03 = **$0.15**
- **Standard retrieval:** 5 GB × $0.01 = **$0.05**
- **Bulk retrieval:** 5 GB × $0.0025 = **$0.0125**

**Recommendation:** Use Standard or Bulk retrieval for non-emergency restores to minimize costs.

### Glacier Alternative: Flexible Retrieval

For even lower costs with slightly longer retrieval times:

| Metric | Glacier Instant | Glacier Flexible |
|--------|-----------------|------------------|
| Storage cost | $0.004/GB/month | $0.0036/GB/month |
| Retrieval speed | Milliseconds | 3-5 hours (standard) |
| Retrieval cost | $0.03/GB | $0.01/GB |
| **Best for** | Recent backups (days 8-14) | Older backups (days 15-30) |

**Potential optimization:** Use tiered lifecycle policy:
- Days 1-7: S3 Standard
- Days 8-14: Glacier Instant Retrieval
- Days 15-30: Glacier Flexible Retrieval

**Additional savings:** ~10% on storage ($0.0004/GB/month difference × 115 GB = $0.046/month)

---

## Data Transfer Costs

### Inbound Transfer (Backup Upload)

✅ **FREE** - All data transfer INTO AWS from the internet is free.

- Daily backups uploaded to S3: **$0.00**
- No charges for cron job uploads from application servers

### Outbound Transfer (Restore Download)

Data transfer OUT of S3 to the internet (e.g., downloading backups for local restore):

| Transfer Volume | Cost per GB | Notes |
|-----------------|-------------|-------|
| First 100 GB/month | $0.09/GB | Most common for restores |
| Next 10 TB/month | $0.085/GB | High-volume scenarios |
| Over 150 TB/month | $0.070/GB | Enterprise-scale |

**Example restore costs:**
- **Small restore (1 GB):** 1 GB × $0.09 = **$0.09**
- **Medium restore (5 GB):** 5 GB × $0.09 = **$0.45**
- **Large restore (20 GB):** 20 GB × $0.09 = **$1.80**

### Transfer Between AWS Services (Same Region)

✅ **FREE** when restoring within us-east-1:
- S3 → EC2 (same region): $0.00
- S3 → RDS (same region): $0.00

**Best practice:** Always restore to instances in the same AWS region to avoid transfer charges.

### Cross-Region Transfer

If downloading from **us-east-1 → us-west-2** replication bucket:

| Scenario | Cost |
|----------|------|
| us-east-1 S3 → us-west-2 EC2 | $0.02/GB |
| us-west-2 S3 → us-east-1 EC2 | $0.02/GB |

**Recommendation:** Use the geographically closest backup copy to minimize transfer costs.

---

## Cross-Region Replication Costs

### Current Configuration

Per the [backup strategy](/opt/snaptrade-unified/backend/docs/BACKUP_STRATEGY.md):
- **Primary region:** us-east-1 (N. Virginia)
- **Replication target:** us-west-2 (Oregon)
- **Purpose:** Disaster recovery and geographic redundancy

### Replication Cost Components

1. **Storage duplication:** Maintains identical copies in both regions
2. **Replication transfer:** Data transfer from us-east-1 → us-west-2
3. **Request costs:** PUT/COPY requests for replication

### Detailed Cost Breakdown

For a 5 GB compressed daily backup over 30 days:

| Cost Component | Calculation | Monthly Cost |
|----------------|-------------|--------------|
| **Primary storage (us-east-1)** | 8.75 GB (S3) + 28.75 GB (Glacier) | $0.32 |
| **Replica storage (us-west-2)** | 8.75 GB (S3) + 28.75 GB (Glacier) | $0.32 |
| **Replication transfer** | 5 GB/day × 30 days × $0.02/GB | $3.00 |
| **PUT requests** | 30 uploads × $0.005/1000 | $0.0002 |
| **Total replication cost** | - | **$3.32** |

**Key insight:** Replication transfer ($3.00) is the dominant cost, not storage duplication ($0.32).

### Replication Cost by Database Size

| DB Size | Daily Backup | Monthly Transfer | Storage (2x) | **Total Replication** |
|---------|--------------|------------------|--------------|----------------------|
| 1 GB | 0.25 GB | $0.15 | $0.12 | **$0.27** |
| 5 GB | 1.25 GB | $0.75 | $0.64 | **$1.39** |
| 10 GB | 2.5 GB | $1.50 | $1.26 | **$2.76** |
| 20 GB | 5 GB | $3.00 | $2.54 | **$5.54** |
| 50 GB | 12.5 GB | $7.50 | $6.32 | **$13.82** |

### Optimization: Selective Replication

To reduce costs, consider:

**Option 1: Weekly replication instead of daily**
- Replicate every 7 days instead of daily
- **Savings:** 6/7 of transfer costs = ~85% reduction
- **Trade-off:** RPO increases to 7 days for regional disaster

**Option 2: Replicate only critical backups**
- Daily replication for days 1-7 (recent backups)
- Weekly replication for days 8-30 (archived backups)
- **Savings:** ~70% reduction in transfer costs

**Option 3: Disable replication for development environments**
- Only enable cross-region replication for production
- **Savings:** 100% for non-production

---

## Total Monthly Cost Estimation

### Scenario 1: Small Database (3 GB) - No Replication

| Cost Component | Amount |
|----------------|--------|
| S3 Standard (7 days) | $0.12 |
| Glacier (23 days) | $0.07 |
| Lifecycle transitions | $0.03 |
| Data transfer (uploads) | $0.00 |
| **Total** | **$0.22/month** |

### Scenario 2: Medium Database (5 GB) - No Replication

| Cost Component | Amount |
|----------------|--------|
| S3 Standard (7 days) | $0.20 |
| Glacier (23 days) | $0.12 |
| Lifecycle transitions | $0.03 |
| Data transfer (uploads) | $0.00 |
| **Total** | **$0.35/month** |

### Scenario 3: Medium Database (5 GB) - With Cross-Region Replication

| Cost Component | Amount |
|----------------|--------|
| Primary S3 Standard (7 days) | $0.20 |
| Primary Glacier (23 days) | $0.12 |
| Replica S3 Standard (7 days) | $0.20 |
| Replica Glacier (23 days) | $0.12 |
| Replication transfer | $0.75 |
| Lifecycle transitions | $0.06 |
| **Total** | **$1.45/month** |

### Scenario 4: Large Database (20 GB) - With Cross-Region Replication

| Cost Component | Amount |
|----------------|--------|
| Primary S3 Standard (7 days) | $0.81 |
| Primary Glacier (23 days) | $0.46 |
| Replica S3 Standard (7 days) | $0.81 |
| Replica Glacier (23 days) | $0.46 |
| Replication transfer | $3.00 |
| Lifecycle transitions | $0.06 |
| **Total** | **$5.60/month** |

### Cost Projection by Database Growth

| Database Size | Without Replication | With Replication | **Difference** |
|---------------|---------------------|------------------|----------------|
| 1 GB | $0.09/month | $0.36/month | +300% |
| 3 GB | $0.22/month | $0.88/month | +300% |
| 5 GB | $0.35/month | $1.45/month | +314% |
| 10 GB | $0.66/month | $2.76/month | +318% |
| 20 GB | $1.30/month | $5.60/month | +331% |
| 50 GB | $3.19/month | $14.19/month | +345% |
| 100 GB | $6.36/month | $28.36/month | +346% |

**Key takeaway:** Cross-region replication costs scale linearly with backup size, adding 300-350% to total backup costs.

---

## Cost Optimization Strategies

### 1. Compression Level Optimization

**Current:** gzip default compression (70-80% reduction)

**Optimization options:**

| Compression Tool | Ratio | Speed | CPU Usage | Recommended |
|------------------|-------|-------|-----------|-------------|
| gzip (default -6) | 75% | Fast | Low | ✅ Current |
| gzip (-9 max) | 78% | Slower | Medium | Small gains |
| bzip2 | 80% | Slow | High | Not worth it |
| xz/lzma | 85% | Very slow | Very high | Large DBs only |
| zstd (--fast) | 72% | Fastest | Very low | Speed priority |
| zstd (default) | 77% | Fast | Low | ⭐ **Recommended** |
| zstd (--ultra) | 82% | Slower | High | Cost priority |

**Cost impact for 20 GB database:**

| Compression | Backup Size | Monthly Cost | Savings |
|-------------|-------------|--------------|---------|
| gzip -6 (75%) | 5 GB | $1.30 | Baseline |
| zstd default (77%) | 4.6 GB | $1.20 | **$0.10 (8%)** |
| zstd --ultra (82%) | 3.6 GB | $0.94 | **$0.36 (28%)** |

**Recommendation:**
```bash
# Replace in backup script:
# OLD: pg_dump | gzip > backup.sql.gz
# NEW: pg_dump | zstd -10 > backup.sql.zst

# For maximum compression (slower):
pg_dump | zstd --ultra -22 > backup.sql.zst
```

**Expected savings:** 5-10% for default zstd, 20-30% for ultra compression

---

### 2. Retention Period Adjustment

**Current:** 30-day retention (7 days S3 + 23 days Glacier)

**Alternative retention strategies:**

#### Option A: Shorter retention (21 days)
```
Configuration: 7 days S3 + 14 days Glacier
Backups retained: 21 instead of 30
Cost reduction: 30% (9 fewer backups)
Risk: Lower compliance coverage
```

**Cost comparison (5 GB database):**
- 30-day retention: $0.35/month
- 21-day retention: $0.25/month
- **Savings: $0.10/month (29%)**

#### Option B: Graduated retention
```
Configuration:
- Daily backups: Last 7 days (S3 Standard)
- Weekly backups: Last 4 weeks (Glacier)
- Monthly backups: Last 12 months (Glacier Deep Archive)

Backups retained: 7 daily + 4 weekly + 12 monthly = 23 backups
Cost reduction: ~25% compared to 30 daily backups
Benefit: Extended historical coverage
```

**Cost comparison (5 GB database):**
- Daily 30-day: $0.35/month
- Graduated retention: $0.27/month
- **Savings: $0.08/month (23%)**

#### Option C: Compliance-driven retention
```
Scenario: Financial services requiring 90-day retention
Configuration: 7 days S3 + 83 days Glacier Flexible
Cost increase: 3x storage costs
Compliance benefit: Meets regulatory requirements
```

**Recommendation:** Evaluate against:
- Legal/compliance requirements (GDPR, SOX, PCI-DSS)
- Business continuity needs (RPO/RTO)
- Historical data recovery use cases

---

### 3. Glacier vs S3 Storage Class Optimization

**Current lifecycle policy:**
- Days 1-7: S3 Standard
- Days 8-30: Glacier Instant Retrieval

**Alternative strategies:**

#### Option A: Faster transition to Glacier
```json
{
  "Transitions": [
    {"Days": 3, "StorageClass": "GLACIER"}
  ]
}
```

**Impact for 5 GB database:**
- Before: 8.75 GB × $0.023 (S3) = $0.20
- After: 3.75 GB × $0.023 (S3) = $0.09
- **Savings: $0.11/month (55% S3 cost reduction)**

**Trade-off:** Recent backups (days 4-7) take 3-5 hours to retrieve instead of instant

#### Option B: Tiered Glacier storage
```json
{
  "Transitions": [
    {"Days": 7, "StorageClass": "GLACIER_IR"},
    {"Days": 14, "StorageClass": "GLACIER"}
  ]
}
```

**Impact:**
- Days 1-7: S3 Standard ($0.023/GB)
- Days 8-14: Glacier Instant ($0.004/GB)
- Days 15-30: Glacier Flexible ($0.0036/GB)

**Savings:** Additional $0.02-0.05/month for large databases

#### Option C: Deep Archive for extended retention
```json
{
  "Transitions": [
    {"Days": 7, "StorageClass": "GLACIER"},
    {"Days": 30, "StorageClass": "DEEP_ARCHIVE"}
  ],
  "Expiration": {"Days": 365}
}
```

**Cost:** Glacier Deep Archive = $0.00099/GB/month (75% cheaper than Glacier)

**Use case:** Annual compliance backups with 12-hour retrieval acceptable

---

### 4. Lifecycle Policy Fine-Tuning

**Current policy analysis:**

```json
{
  "Transitions": [{"Days": 7, "StorageClass": "GLACIER"}],
  "Expiration": {"Days": 30}
}
```

**Optimization opportunities:**

#### Optimization 1: Intelligent-Tiering for unpredictable access
```json
{
  "Transitions": [{"Days": 0, "StorageClass": "INTELLIGENT_TIERING"}]
}
```

**Benefits:**
- Automatic cost optimization based on access patterns
- Moves to Archive Access tier after 90 days (no access)
- Deep Archive tier after 180 days

**Cost:** $0.0025/GB monitoring fee + storage tier costs

**Recommended for:** Environments with unpredictable restore patterns

#### Optimization 2: Abort incomplete multipart uploads
```json
{
  "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
}
```

**Benefits:**
- Cleans up failed uploads automatically
- Prevents storage charges for incomplete uploads
- Saves $0.01-0.05/month for typical usage

#### Optimization 3: Non-current version expiration (if versioning enabled)
```json
{
  "NoncurrentVersionExpiration": {"NoncurrentDays": 7}
}
```

**Benefits:**
- Removes old versions after 7 days
- Prevents accumulation of deleted backups
- Can save 20-50% if frequent overwrites occur

**Implementation:**
```bash
# Apply optimized lifecycle policy
aws s3api put-bucket-lifecycle-configuration \
  --bucket snaptrade-backups-production \
  --lifecycle-configuration file://optimized-lifecycle.json
```

---

### 5. Cross-Region Replication Alternatives

**Current cost:** $0.75 - $3.00/month for data transfer (5-20 GB database)

**Optimization strategies:**

#### Option A: Disable replication for non-production
```bash
# Production: Keep cross-region replication
# Staging/Dev: Disable replication

Cost savings: 100% replication costs for dev/staging
Risk reduction: Minimal (non-critical environments)
```

#### Option B: Weekly replication instead of daily
```bash
# Cron job modification: Replicate every Sunday only
# Reduce transfer frequency from 30x to 4x per month

Savings: 85-90% of replication transfer costs
Trade-off: RPO increases to 7 days for regional disaster
```

**Cost impact (20 GB database):**
- Daily replication: $3.00/month
- Weekly replication: $0.43/month
- **Savings: $2.57/month (86%)**

#### Option C: S3 Batch Replication (scheduled)
```bash
# Replicate only backups from days 1, 7, 14, 30
# Use S3 Batch Operations for selective replication

Backups replicated: 4 per month instead of 30
Savings: 85% of replication costs
Benefit: Maintains key recovery points
```

#### Option D: Use AWS Backup for managed replication
- Potential cost savings through AWS Backup's optimized replication
- Integrated with lifecycle policies
- Additional monitoring features

**Comparison:**
| Method | Monthly Cost (20 GB) | Recovery Points |
|--------|----------------------|-----------------|
| Daily replication | $3.00 | 30 copies |
| Weekly replication | $0.43 | 4 copies |
| Selective (4x) | $0.40 | 4 copies |
| No replication | $0.00 | 0 copies |

**Recommendation:** Weekly replication provides 85% cost savings with acceptable RPO for most use cases.

---

### 6. Compression Before Encryption

**Current backup pipeline:**
```
pg_dump → gzip → encrypt → upload to S3
```

**Optimization:** Ensure compression happens BEFORE encryption for maximum efficiency.

**Why?**
- Encrypted data is incompressible (appears random)
- Compressing encrypted data yields 0% reduction
- Proper order: compress → encrypt → store

**Verification:**
```bash
# Check backup script order
cat /opt/snaptrade-unified/backend/scripts/db-backup.ts

# Should see:
# 1. pg_dump (database extraction)
# 2. gzip/zstd (compression)
# 3. openssl/KMS (encryption)
# 4. aws s3 cp (upload)
```

**Impact if reversed:**
- Compressed backup: 5 GB
- Encrypted-then-compressed: 20 GB (no compression)
- **Cost increase: 4x ($1.30 → $5.20/month)**

**Recommendation:** Audit backup scripts to ensure correct ordering.

---

### 7. Request Cost Minimization

**S3 request pricing (us-east-1):**
- PUT/COPY/POST: $0.005 per 1,000 requests
- GET/SELECT: $0.0004 per 1,000 requests
- Lifecycle transitions: $0.01 per 1,000 transitions
- DELETE: Free

**Monthly request costs for daily backups:**
```
30 PUT requests (daily uploads) = 30 × $0.005/1000 = $0.00015
30 lifecycle transitions (to Glacier) = 30 × $0.01/1000 = $0.0003
30 DELETE requests (expiration) = Free
Total: ~$0.0005/month (negligible)
```

**Optimization:** Request costs are minimal (<$0.01/month). Focus on storage and transfer instead.

---

### 8. Database Size Reduction

**Most impactful optimization:** Reduce source database size before backup.

**Strategies:**

#### A. Archive old data to separate database
```sql
-- Move records older than 1 year to archive database
-- Reduces daily backup size by 30-50%

Example:
- Production DB: 20 GB → 10 GB
- Archive DB: 10 GB (backed up weekly)
- **Savings: 50% daily backup costs**
```

#### B. Enable PostgreSQL built-in compression
```sql
-- Use TOAST compression for large text fields
ALTER TABLE signals ALTER COLUMN metadata SET STORAGE EXTENDED;

-- Typical savings: 10-20% DB size
```

#### C. Remove unnecessary indexes before backup
```bash
# Drop non-critical indexes before pg_dump
# Recreate during restore
# Reduces backup size by 5-15%
```

#### D. Exclude non-critical tables
```bash
# pg_dump with --exclude-table option
pg_dump --exclude-table=audit_logs --exclude-table=temp_* > backup.sql

# Typical savings: 10-30% depending on schema
```

**Impact for 20 GB database:**
- Original: 20 GB → 5 GB compressed → $1.30/month
- After optimization: 12 GB → 3 GB compressed → $0.78/month
- **Savings: $0.52/month (40%)**

---

### 9. Monitoring and Alerting Cost Awareness

**CloudWatch Metrics Costs:**
- Standard metrics: Free (AWS service metrics)
- Custom metrics: $0.30/metric/month
- Dashboard: $3/month per dashboard

**Current backup monitoring:**
- Backup success/failure (custom metric): $0.30
- Backup duration (custom metric): $0.30
- Backup file size (custom metric): $0.30
- CloudWatch dashboard: $3.00
- **Total: $3.90/month**

**Optimization:**
```bash
# Use CloudWatch Logs Insights instead of custom metrics
# Parse logs for metrics instead of publishing them
# Cost: ~$0.50/month for log storage vs $3.90 for custom metrics

Savings: $3.40/month (87%)
```

---

### 10. Use S3 Storage Lens for Cost Visibility

**Free tier:** Organization-level metrics and dashboards

**Advanced tier:** $0.20 per million objects analyzed

**Benefits:**
- Identify oversized backups
- Detect storage class optimization opportunities
- Track cost trends over time

**Recommendation:** Enable S3 Storage Lens free tier for cost monitoring.

---

## Summary: Optimization Impact

### Quick Wins (Implement Immediately)

| Optimization | Effort | Savings | Risk |
|--------------|--------|---------|------|
| 1. Verify compression before encryption | Low | 0-400% | None |
| 2. Transition to Glacier after 3 days (vs 7) | Low | 55% S3 costs | Low |
| 3. Switch to zstd compression | Medium | 5-30% | None |
| 4. Weekly replication (vs daily) | Low | 85% replication | Low |
| 5. Abort incomplete uploads | Low | $0.01-0.05 | None |

### Medium-Term Optimizations (Next Quarter)

| Optimization | Effort | Savings | Risk |
|--------------|--------|---------|------|
| 6. Database archival strategy | High | 30-50% | Medium |
| 7. Graduated retention (daily/weekly/monthly) | Medium | 20-30% | Low |
| 8. CloudWatch Logs vs custom metrics | Medium | 87% monitoring | Low |
| 9. Glacier Flexible for days 15-30 | Low | 10% Glacier | Low |

### Long-Term Optimizations (Next Year)

| Optimization | Effort | Savings | Risk |
|--------------|--------|---------|------|
| 10. Deep Archive for compliance retention | Medium | 75% archive | Low |
| 11. Intelligent-Tiering for unpredictable access | Low | 10-40% | None |
| 12. Database size reduction (schema optimization) | High | 10-30% | Medium |

---

## Cost Monitoring

### AWS Cost Explorer Setup

**Recommended tags for backups:**
```json
{
  "Environment": "production",
  "Service": "backup",
  "CostCenter": "infrastructure",
  "Retention": "30-days"
}
```

**Monthly review checklist:**
- [ ] Compare actual vs estimated costs (within 10%)
- [ ] Identify cost anomalies (>20% variance)
- [ ] Review backup size growth trends
- [ ] Validate lifecycle policy effectiveness
- [ ] Check for orphaned/incomplete uploads

### Budget Alerts

**Recommended AWS Budget configuration:**

```yaml
Budget Name: SnapTrade Backups
Amount: $10.00/month
Alerts:
  - Threshold: 80% ($8.00) → Email notification
  - Threshold: 100% ($10.00) → Email + Slack alert
  - Threshold: 120% ($12.00) → Email + Slack + PagerDuty
```

### Cost Dashboards

**Key metrics to track:**
1. **Storage costs by class:** S3 Standard vs Glacier
2. **Transfer costs:** Replication + restores
3. **Cost per backup:** Total cost / 30 backups
4. **Cost per GB:** Total cost / total storage
5. **Month-over-month growth:** % increase

---

## Conclusion

**For a typical 5 GB database with 30-day retention:**

| Configuration | Monthly Cost |
|---------------|--------------|
| **Baseline (current)** | $0.35 |
| **+ Cross-region replication** | $1.45 |
| **+ Monitoring (custom metrics)** | $5.35 |
| **After optimizations** | $0.18 |

**Total potential savings:** 70-80% through:
- Compression optimization (zstd)
- Faster Glacier transition (day 3 vs 7)
- Weekly replication (vs daily)
- CloudWatch Logs (vs custom metrics)

**Recommended next steps:**
1. Measure current backup size and costs
2. Implement quick wins (compression, lifecycle policy)
3. Evaluate replication strategy (daily vs weekly)
4. Monitor costs monthly with AWS Cost Explorer
5. Review optimization impact quarterly

---

**Document Status:** ✅ Complete
**Next Review:** 2026-06-22 (Quarterly)
**Contact:** devops@snaptrade.io
