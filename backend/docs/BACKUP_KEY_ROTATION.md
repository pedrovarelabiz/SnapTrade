# Backup Key Rotation Procedure

## Overview

This document outlines the procedure for rotating encryption keys used to secure database backups. **Recommended frequency: Annually**

## Prerequisites

- Access to backup storage (S3/GCS)
- Current `BACKUP_ENCRYPTION_KEY` value
- Sufficient storage space for temporary re-encrypted backups
- Access to update environment variables in production

## Rotation Procedure

### 1. Generate New Encryption Key

```bash
# Generate a new 256-bit encryption key
openssl rand -base64 32
```

Save this key securely - you'll need it for steps 2-6.

### 2. Download All Backups with Old Key

```bash
# Download all existing encrypted backups
aws s3 sync s3://your-backup-bucket/ ./backups-old-key/

# Verify download
ls -lh ./backups-old-key/
```

### 3. Re-encrypt Backups with New Key

```bash
# Decrypt with old key and re-encrypt with new key
for backup in ./backups-old-key/*.enc; do
  filename=$(basename "$backup" .enc)

  # Decrypt with old key
  openssl enc -d -aes-256-cbc -in "$backup" \
    -out "./decrypted/$filename" \
    -pass pass:"$OLD_BACKUP_ENCRYPTION_KEY"

  # Re-encrypt with new key
  openssl enc -aes-256-cbc -salt -in "./decrypted/$filename" \
    -out "./backups-new-key/$filename.enc" \
    -pass pass:"$NEW_BACKUP_ENCRYPTION_KEY"
done
```

### 4. Upload Re-encrypted Backups

```bash
# Upload backups encrypted with new key
aws s3 sync ./backups-new-key/ s3://your-backup-bucket-new/

# Verify upload
aws s3 ls s3://your-backup-bucket-new/ --recursive
```

### 5. Update BACKUP_ENCRYPTION_KEY Environment Variable

Update the environment variable in all relevant environments:

```bash
# For Docker/K8s secrets
kubectl create secret generic backup-encryption-key \
  --from-literal=BACKUP_ENCRYPTION_KEY="$NEW_BACKUP_ENCRYPTION_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

# For .env files (development)
# Update BACKUP_ENCRYPTION_KEY=<new-key-value>
```

Restart services to pick up the new key:

```bash
kubectl rollout restart deployment/backup-service
```

### 6. Test Restore with New Key

```bash
# Attempt to restore a backup using the new key
./scripts/restore-backup.sh --backup latest --verify-only

# Verify the restored data integrity
./scripts/verify-backup-integrity.sh
```

**Critical**: Do not proceed to step 7 until restore is successful.

### 7. Delete Old Encrypted Backups

```bash
# After successful verification, remove old encrypted backups
aws s3 rm s3://your-backup-bucket/ --recursive

# Clean up local temporary files
rm -rf ./backups-old-key ./decrypted ./backups-new-key
```

### 8. Document Rotation Date

Update the rotation log:

```bash
echo "$(date -u +%Y-%m-%d): Backup encryption key rotated" >> BACKUP_KEY_ROTATION_LOG.txt
git add BACKUP_KEY_ROTATION_LOG.txt
git commit -m "docs: record backup key rotation on $(date -u +%Y-%m-%d)"
```

## Rotation Schedule

| Rotation Date | Performed By | Notes |
|---------------|--------------|-------|
| YYYY-MM-DD    | Name         | Initial key setup |
| YYYY-MM-DD    | Name         | First annual rotation |

## Rollback Procedure

If issues arise after rotation:

1. Stop all backup operations
2. Restore `BACKUP_ENCRYPTION_KEY` to previous value
3. Revert to old backup bucket: `s3://your-backup-bucket/`
4. Restart services
5. Investigate issues before re-attempting rotation

## Security Considerations

- **Never commit encryption keys to version control**
- Store old key securely for 90 days after rotation (in case of emergency recovery)
- Use encrypted channels when sharing keys with team members
- Audit access logs to backup storage before and after rotation
- Consider using a key management service (AWS KMS, GCP KMS, HashiCorp Vault)

## Troubleshooting

### Decryption Fails
- Verify you're using the correct old key
- Check file integrity: `md5sum backup.enc`

### Re-encryption Fails
- Ensure sufficient disk space
- Verify new key format (base64, 32 bytes)

### Restore Test Fails
- Confirm new key matches what was used for re-encryption
- Check environment variable was properly updated
- Verify services picked up new environment variable (restart if needed)

## Contact

For questions or issues during rotation, contact the DevOps team.
