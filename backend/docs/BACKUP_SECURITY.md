# Backup Security Documentation

## Overview
This document outlines security best practices and requirements for database backup operations at SnapTrade. All team members handling backups must follow these guidelines to ensure data protection and regulatory compliance.

## 1. Encryption Key Management

### Key Storage
- **NEVER** commit encryption keys or passphrases to git repositories
- Store encryption keys in secure secret management systems (e.g., AWS Secrets Manager, HashiCorp Vault)
- Use environment variables for runtime key access, never hardcode in application code
- Maintain separate encryption keys for different environments (dev, staging, production)

### Key Rotation
- Rotate encryption keys **annually** at minimum
- Document key rotation procedures and maintain rotation logs
- Re-encrypt existing backups with new keys after rotation
- Maintain secure archive of previous keys for disaster recovery scenarios (with strict access controls)

### Key Access Control
- Limit key access to authorized personnel only (principle of least privilege)
- Implement multi-factor authentication for key management system access
- Audit all key access attempts and usage
- Revoke access immediately upon personnel changes

## 2. AWS Credential Security

### IAM Best Practices
- **Use IAM roles when possible** instead of long-lived access keys
- For EC2/ECS instances, assign IAM roles directly to compute resources
- For local development, use temporary credentials via AWS SSO or `aws sts assume-role`
- Never share IAM credentials between team members

### Credential Management
- Rotate AWS access keys every 90 days if IAM roles cannot be used
- Store AWS credentials in `~/.aws/credentials` with appropriate file permissions (600)
- Never commit AWS credentials to version control
- Use AWS Secrets Manager or Parameter Store for application-level credential access

### Least Privilege Policies
- Grant only the minimum S3 permissions required for backup operations:
  - `s3:PutObject` for uploads
  - `s3:GetObject` for downloads
  - `s3:ListBucket` for bucket operations
- Restrict permissions to specific backup bucket ARNs
- Use resource-based policies to limit access by IP or VPC when possible

## 3. S3 Bucket Security Policies

### Bucket Configuration
- All backup buckets must be **private** with no public access
- Enable S3 Block Public Access settings at both bucket and account levels
- Disable ACLs and use bucket policies for access control
- Enable S3 bucket versioning for accidental deletion protection

### Encryption
- Enable S3 server-side encryption (SSE-S3 or SSE-KMS) as default
- For sensitive data, use SSE-KMS with customer-managed keys
- Enforce encryption in transit (HTTPS only) via bucket policies

### Example Bucket Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::backup-bucket-name/*",
        "arn:aws:s3:::backup-bucket-name"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    },
    {
      "Sid": "DenyUnencryptedObjectUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::backup-bucket-name/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        }
      }
    }
  ]
}
```

## 4. Access Logs for Backups

### S3 Access Logging
- Enable S3 server access logging on all backup buckets
- Store access logs in a separate, dedicated logging bucket
- Configure log retention policies (minimum 90 days, recommended 1 year)
- Restrict access to log buckets to security and compliance teams only

### Application Logging
- Log all backup operations with timestamps and user identifiers
- Include operation type (create, download, delete), file names, and sizes
- Log authentication and authorization events
- Never log sensitive data (passwords, encryption keys, PII)

### Monitoring and Alerting
- Set up CloudWatch alarms for unusual backup access patterns
- Monitor for failed authentication attempts
- Alert on large-scale downloads or deletions
- Review access logs quarterly for compliance audits

## 5. Compliance Considerations

### GDPR Requirements
- Document personal data contained in backups
- Implement data subject access request (DSAR) procedures for backup data
- Maintain data processing records that include backup operations
- Ensure backup retention aligns with GDPR data minimization principles
- Provide mechanisms for data deletion/anonymization in backups when required

### Data Retention Policies
- Production backups: Retain for **30 days** (daily), **12 months** (monthly snapshots)
- Development/staging backups: Retain for **7 days** maximum
- Document legal hold requirements that may override standard retention
- Automatically delete backups after retention period expires
- Maintain deletion logs for compliance verification

### Geographic Considerations
- Store EU customer backups in EU AWS regions (GDPR compliance)
- Document cross-border data transfers and legal basis
- Implement region-specific retention policies as required by local regulations

### Audit Trail
- Maintain comprehensive audit logs of all backup-related activities
- Ensure logs are tamper-proof and stored separately from backup data
- Retain audit logs for minimum **7 years** per SOC 2 requirements
- Make audit logs available for compliance reviews and external audits

## 6. Secure Deletion of Local Backup Files

### Immediate Deletion
- Delete local backup files immediately after successful upload to S3
- Do not retain unencrypted backups on local systems
- Use secure deletion methods that overwrite file data

### Secure Deletion Methods
```bash
# Linux/Unix: Use shred to securely delete files
shred -vfz -n 3 backup_file.sql.gz

# macOS: Use srm (if available) or rm with additional cleanup
srm -v backup_file.sql.gz
# or
rm -P backup_file.sql.gz

# Additional: Clear any temporary files
find /tmp -name "*backup*" -type f -exec shred -vfz -n 3 {} \;
```

### Verification
- Verify files are completely removed from filesystem
- Check for copies in temporary directories, trash/recycle bins
- Clear bash history entries that may contain sensitive commands
- Verify no backup fragments remain in swap or memory dumps

### Disk Decommissioning
- Before decommissioning any systems that handled backups:
  - Perform full disk encryption wipe or physical destruction
  - Use tools like `shred`, `dd`, or DBAN for software-based wiping
  - Maintain certificates of destruction for audit purposes

## Incident Response

### Security Incident Procedures
1. Immediately isolate affected systems and revoke compromised credentials
2. Notify security team and compliance officer
3. Assess scope of potential data exposure
4. Document all actions taken during incident response
5. Conduct post-incident review and update security procedures

### Emergency Contacts
- Security Team: security@snaptrade.com
- Compliance Officer: compliance@snaptrade.com
- On-call rotation: See internal documentation

## Review and Updates

- Review this document annually or after significant infrastructure changes
- Update procedures based on security audits and incident learnings
- Ensure all team members are trained on current security practices
- Version control this document and maintain change history

---

**Last Updated**: 2026-03-22
**Document Owner**: Security Team
**Review Cycle**: Annual
