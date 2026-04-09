# SnapTrade Backup Strategy

## Overview

This document outlines the comprehensive backup strategy for the SnapTrade platform. Our backup system ensures data durability, business continuity, and disaster recovery capabilities through automated daily backups with encryption at rest and multi-region storage redundancy.

**Key Features:**
- Automated daily PostgreSQL database backups
- AES-256-GCM encryption for data at rest
- 30-day retention policy with configurable archival
- S3-based storage with versioning enabled
- Automated monitoring and alerting
- Point-in-time recovery capability

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SnapTrade Backup Architecture                    │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐
    │  PostgreSQL DB   │
    │  (Production)    │
    └────────┬─────────┘
             │
             │ Daily @ 2AM UTC
             ▼
    ┌──────────────────┐
    │  Backup Service  │◄──── Cron Scheduler
    │  (pg_dump)       │
    └────────┬─────────┘
             │
             │ AES-256-GCM Encryption
             ▼
    ┌──────────────────┐
    │   Compression    │
    │   (gzip)         │
    └────────┬─────────┘
             │
             │ Upload
             ▼
    ┌──────────────────┐       ┌──────────────────┐
    │   S3 Primary     │──────▶│  S3 Replication  │
    │   (us-east-1)    │       │  (us-west-2)     │
    │   - Versioning   │       │  - Cross-region  │
    │   - Lifecycle    │       │  - Redundancy    │
    └────────┬─────────┘       └──────────────────┘
             │
             │ Retention (30 days)
             ▼
    ┌──────────────────┐
    │  Auto-deletion   │
    │  (Lifecycle)     │
    └──────────────────┘
             │
             │ Monitoring
             ▼
    ┌──────────────────┐
    │  CloudWatch      │──────▶ SNS Alerts
    │  Metrics & Logs  │       (Email/Slack)
    └──────────────────┘
```

---

## Data Backed Up

All PostgreSQL database tables are included in the backup, covering the following Prisma models:

### Core User Data
- **User** - User accounts, authentication, roles, and profiles
- **Subscription** - Premium subscriptions and plan details
- **Payment** - Transaction history (crypto, PayPal)
- **ApiKey** - User API keys for platform integration

### Trading Data
- **Signal** - Trading signals from channels (entries, results, outcomes)
- **Trade** - User trade executions and performance tracking
- **Channel** - Signal source channels and configuration
- **ExtensionConfig** - Browser extension settings per user

### Analytics & Reporting
- **DailyReport** - Aggregated daily performance metrics
- **MasanielloState** - Money management strategy states

### Platform Configuration
- **PlatformConfig** - System-wide configuration key-value pairs

### Backup Scope
- **Full database dump** using `pg_dump` with custom format
- **All schemas, tables, indexes, and constraints**
- **Sequences and enums** (Role, SignalStatus, PaymentStatus, etc.)
- **Relations and foreign keys** preserved

---

## Backup Schedule

### Frequency
- **Daily automated backups** at **2:00 AM UTC**
- Scheduled via cron job on backup service
- Typical backup duration: 5-15 minutes depending on data volume

### Timing Rationale
- 2AM UTC selected for minimal user activity globally
- Off-peak hours reduce database load impact
- Ensures fresh backup before US/EU business hours

### Backup Process
1. **Pre-backup health check** - Verify database connectivity
2. **Database dump** - Execute pg_dump with --format=custom
3. **Compression** - gzip compression (typically 70-80% reduction)
4. **Encryption** - AES-256-GCM with managed keys
5. **Upload to S3** - Primary bucket with metadata tagging
6. **Verification** - Checksum validation
7. **Notification** - Success/failure alerts sent

---

## Backup File Naming Convention

All backup files follow a standardized naming convention that embeds critical metadata directly in the filename for easy identification and retrieval.

### Naming Format

```
snaptrade-postgres-YYYY-MM-DD-HHmmss.dump.enc
```

### Format Components

| Component | Description | Example |
|-----------|-------------|---------|
| `snaptrade-postgres` | Fixed prefix identifying the application and database | `snaptrade-postgres` |
| `YYYY-MM-DD` | Date in ISO 8601 format (UTC timezone) | `2026-03-22` |
| `HHmmss` | Time in 24-hour format with no separators (UTC timezone) | `020000` for 2:00 AM UTC |
| `.dump` | Indicates pg_dump custom format (binary) | `.dump` |
| `.enc` | Indicates file is encrypted with AES-256-GCM | `.enc` |

### Timestamp Details

- **Timezone:** All timestamps are in **UTC** (Coordinated Universal Time)
- **Format:** `YYYY-MM-DD-HHmmss` ensures lexicographic sorting matches chronological order
- **Precision:** Second-level granularity for unique identification
- **Example:** `2026-03-22-020000` = March 22, 2026 at 2:00:00 AM UTC

### File Extensions

- **`.dump`** - PostgreSQL custom format dump (created with `pg_dump --format=custom`)
  - Binary format, not human-readable
  - Supports parallel restore and selective restoration
  - More efficient than plain SQL format

- **`.enc`** - Encrypted file
  - AES-256-GCM encryption applied
  - Requires KMS key for decryption
  - Cannot be restored without decryption step

### Filename Examples

```
snaptrade-postgres-2026-03-22-020000.dump.enc  # March 22, 2026 daily backup
snaptrade-postgres-2026-03-15-020000.dump.enc  # March 15, 2026 daily backup
snaptrade-postgres-2026-02-28-020000.dump.enc  # February 28, 2026 daily backup
```

### Parsing Filenames to Find Backups

To locate a backup for a specific date, you can parse the filename pattern:

**Example: Find backup from March 15, 2026**
```bash
# List backups for specific date
aws s3 ls s3://snaptrade-backups-production/daily/ --recursive | grep "2026-03-15"

# Expected result:
# snaptrade-postgres-2026-03-15-020000.dump.enc
```

**Example: Find all backups from March 2026**
```bash
aws s3 ls s3://snaptrade-backups-production/daily/ --recursive | grep "2026-03"
```

**Example: Extract date from filename in scripts**
```bash
# Extract date components
filename="snaptrade-postgres-2026-03-22-020000.dump.enc"
date_part=$(echo $filename | grep -oP '\d{4}-\d{2}-\d{2}')  # Returns: 2026-03-22
time_part=$(echo $filename | grep -oP '(?<=-)(\d{6})(?=\.)')  # Returns: 020000
```

### Sorting and Organization

- Filenames sort chronologically when listed alphabetically
- Easy to identify backup age at a glance
- Scripting-friendly for automated retention and cleanup
- Human-readable date format for operational clarity

---

## Retention Policy

### Standard Retention: 30-Day Rolling Window
- **30 days** of rolling backups maintained at all times
- Daily backups are retained for the full 30-day period
- Oldest backup is automatically removed when a new backup is created
- Ensures consistent storage footprint and predictable costs

### Automated Cleanup Process
The backup retention system operates on a dual-layer cleanup strategy:

#### Primary Cleanup: Daily Automated Deletion
- **Schedule:** Runs daily at **3:00 AM UTC**
- **Process:** Automated script identifies and deletes backups older than 30 days
- **Execution:** Runs via cron job on backup service (1 hour after backup completion)
- **Logging:** All deletions logged to CloudWatch with backup filename and age
- **Verification:** Post-cleanup verification ensures exactly 30 backups remain

#### Failsafe: S3 Lifecycle Policy
- **Purpose:** Secondary enforcement layer if automated cleanup fails
- **Configuration:** S3 Lifecycle rule set to expire objects after 31 days
- **Protection:** Prevents runaway storage costs from script failures
- **Audit:** Lifecycle actions logged separately in S3 access logs

### Retention Tiers
| Tier | Period | Description |
|------|--------|-------------|
| Daily | Days 1-7 | Most recent week, rapid recovery |
| Weekly | Weeks 2-4 | Last 3 weeks, standard recovery |
| Monthly | Day 30 | End-of-month snapshot before deletion |

### Regulatory and Compliance Considerations

#### Data Retention Requirements
Organizations subject to regulatory oversight should evaluate whether the 30-day retention period meets their compliance obligations:

- **Financial Services (PCI-DSS, SOX):** May require 90+ days or longer
- **Healthcare (HIPAA):** Typically requires 6+ years for patient records
- **GDPR/Privacy Laws:** Backup retention must align with data minimization principles
- **Industry-Specific:** Insurance, legal, and government sectors often have extended requirements

**Recommendation:** Consult with your legal and compliance teams before implementing this backup strategy in production.

#### Adjusting the Retention Period

To modify the retention period from the default 30 days:

1. **Update Environment Variable:**
   ```bash
   # In your .env or deployment configuration
   BACKUP_RETENTION_DAYS=90  # Example: change to 90 days
   ```

2. **Update S3 Lifecycle Policy:**
   ```bash
   # Update Terraform/CloudFormation or use AWS CLI
   aws s3api put-bucket-lifecycle-configuration \
     --bucket snaptrade-backups-production \
     --lifecycle-configuration file://lifecycle-policy.json
   ```

   Update `lifecycle-policy.json` to match `BACKUP_RETENTION_DAYS + 1` days.

3. **Verify Configuration:**
   ```bash
   # Check cron job picks up new value
   echo $BACKUP_RETENTION_DAYS

   # Verify S3 lifecycle policy
   aws s3api get-bucket-lifecycle-configuration \
     --bucket snaptrade-backups-production
   ```

4. **Monitor Transition:** Existing backups will age out naturally under the new policy.

#### Legal Hold Process

In certain situations (litigation, regulatory investigation, security incident), you may need to preserve specific backups beyond the standard retention period.

**To Place a Legal Hold:**

1. **Identify Target Backups:**
   ```bash
   # List backups for specific date range
   aws s3 ls s3://snaptrade-backups-production/daily/ --recursive | grep "2026-03-15"
   ```

2. **Enable Object Lock (if configured):**
   ```bash
   aws s3api put-object-legal-hold \
     --bucket snaptrade-backups-production \
     --key daily/snaptrade-postgres-2026-03-15-020000.dump.enc \
     --legal-hold Status=ON
   ```

3. **Alternative: Copy to Separate Bucket:**
   ```bash
   # Create isolated legal-hold bucket with no lifecycle policies
   aws s3 cp \
     s3://snaptrade-backups-production/daily/snaptrade-postgres-2026-03-15-020000.dump.enc \
     s3://snaptrade-backups-legal-hold/case-12345/
   ```

4. **Document the Hold:**
   - Record case number, date range, legal justification
   - Update internal tracking system
   - Set calendar reminder for hold review/release

5. **Release Legal Hold:**
   ```bash
   aws s3api put-object-legal-hold \
     --bucket snaptrade-backups-production \
     --key daily/snaptrade-postgres-2026-03-15-020000.dump.enc \
     --legal-hold Status=OFF
   ```

**Important:** Legal holds should only be placed under guidance from legal counsel. Improper holds can lead to unnecessary storage costs, while premature release may result in spoliation of evidence.

### Extended Retention (Future)
- **Long-term archival** to Glacier for compliance (planned)
- **Annual snapshots** for historical reference (planned)
- **Configurable retention** per customer tier (enterprise feature)

---

## Encryption Details

### Encryption at Rest
- **Algorithm:** AES-256-GCM (Galois/Counter Mode)
- **Key Management:** AWS KMS with automatic rotation
- **Encryption Scope:** All backup files encrypted before S3 upload

### Key Management
- **Master Key:** AWS KMS Customer Master Key (CMK)
- **Key Rotation:** Automatic annual rotation enabled
- **Access Control:** IAM policies restrict key access to backup service only
- **Audit Trail:** All key usage logged in CloudTrail

### Encryption Process
1. Generate data encryption key (DEK) from KMS
2. Encrypt backup file using AES-256-GCM with DEK
3. Encrypt DEK with master key
4. Store encrypted DEK alongside backup metadata
5. Secure deletion of plaintext DEK from memory

### Security Benefits
- **Data protection** at rest in S3
- **Compliance** with PCI-DSS, SOC 2 requirements
- **Zero-knowledge** architecture - AWS cannot decrypt without key access

---

## Storage Location

### Primary Storage
- **Provider:** Amazon S3
- **Region:** us-east-1 (N. Virginia)
- **Bucket:** `snaptrade-backups-production`
- **Storage Class:** S3 Standard for frequent access
- **Versioning:** Enabled for accidental deletion protection

### Bucket Configuration
```
Bucket: snaptrade-backups-production
├── daily/
│   ├── 2026-03-22/
│   │   └── postgres-backup-20260322-020000.sql.gz.enc
│   ├── 2026-03-21/
│   └── ... (30 days)
├── metadata/
│   └── checksums.json
└── logs/
    └── backup-execution.log
```

### Cross-Region Replication
- **Replication Target:** us-west-2 (Oregon)
- **Purpose:** Disaster recovery, geographic redundancy
- **Mode:** Automatic, near real-time replication
- **Retention:** Matches primary (30 days)

### Access Controls
- **Encryption:** S3 server-side encryption (SSE-KMS)
- **Access:** IAM role-based, least privilege principle
- **Public Access:** Blocked via bucket policies
- **MFA Delete:** Enabled for versioned object protection

---

## Monitoring and Alerts

### Metrics Tracked
- **Backup completion status** (success/failure)
- **Backup file size** and growth trends
- **Backup duration** (execution time)
- **Storage utilization** (S3 bucket size)
- **Encryption key usage** (KMS API calls)
- **Replication lag** (cross-region delay)

### CloudWatch Dashboards
- Real-time backup job status
- Historical success rate (30-day rolling)
- Storage cost analysis
- Performance trends

### Alert Configuration

#### Critical Alerts (Immediate)
- ❌ **Backup failure** - SNS → Email + Slack
- ❌ **Encryption failure** - SNS → Email + Slack + PagerDuty
- ❌ **Upload failure** - SNS → Email + Slack

#### Warning Alerts (Monitor)
- ⚠️ **Backup duration exceeds 30 minutes**
- ⚠️ **File size anomaly** (>50% deviation from average)
- ⚠️ **Storage approaching quota** (>80% capacity)

#### Notification Channels
- **Email:** ops-team@snaptrade.io
- **Slack:** #alerts-backups channel
- **PagerDuty:** Critical incidents only

### Automated Recovery Testing
- **Monthly:** Automated restore test to staging environment
- **Quarterly:** Full disaster recovery drill
- **Validation:** Checksum verification, schema integrity checks

---

## Recovery Procedures

### Point-in-Time Recovery (PITR)
1. Identify target backup date from S3
2. Download encrypted backup file
3. Decrypt using KMS key
4. Decompress gzip archive
5. Restore using `pg_restore` to target database
6. Verify data integrity and application connectivity

### Recovery Time Objective (RTO)
- **Target:** < 4 hours for full database restoration
- **Actual:** ~1-2 hours based on testing

### Recovery Point Objective (RPO)
- **Target:** < 24 hours (daily backup cycle)
- **Consideration:** Transaction logs for sub-daily recovery (future enhancement)

---

## Compliance and Auditing

### Compliance Standards
- **SOC 2 Type II** - Annual audit readiness
- **GDPR** - Right to erasure support via backup policies
- **PCI-DSS** - Encrypted storage for payment data

### Audit Logs
- All backup operations logged to CloudWatch Logs
- S3 access logs enabled for security auditing
- KMS key usage tracked in AWS CloudTrail
- Retention: 1 year for audit logs

---

## Maintenance and Testing

### Regular Maintenance
- **Weekly:** Backup log review
- **Monthly:** Restore testing to staging
- **Quarterly:** Disaster recovery drills
- **Annually:** Backup strategy review and optimization

### Version Control
- Backup scripts stored in Git repository
- Infrastructure as Code (Terraform) for S3/KMS config
- Change management via pull requests

---

## Contact and Support

For backup-related issues or questions:
- **Primary:** DevOps Team - devops@snaptrade.io
- **Emergency:** On-call rotation via PagerDuty
- **Documentation:** Internal wiki at docs.snaptrade.internal/backups

**Last Updated:** 2026-03-22
**Document Version:** 1.0
**Owner:** Platform Infrastructure Team
