# Backup Troubleshooting Guide

This guide covers common issues with the backup system and their solutions.

## 1. Backup Fails - Disk Space Issues

### Symptoms
- Backup process terminates unexpectedly
- Error messages mentioning "no space left on device"
- Incomplete backup files

### Diagnostic Commands
```bash
# Check available disk space
df -h /var/backups
df -h /tmp

# Check disk usage of backup directory
du -sh /var/backups/*

# Check for large files consuming space
find /var/backups -type f -size +1G -exec ls -lh {} \;

# Check inode usage (sometimes space available but no inodes)
df -i
```

### Solutions
- Free up disk space by removing old backups
- Increase disk size or add additional storage
- Configure backup retention policy to remove old backups automatically
- Move backup directory to a larger partition
- Implement backup rotation to manage disk usage

---

## 2. S3 Upload Fails - Credentials/Network Issues

### Symptoms
- Backup completes locally but fails to upload to S3
- "Access Denied" or "Invalid credentials" errors
- Connection timeout errors
- "Signature mismatch" errors

### Diagnostic Commands
```bash
# Test AWS credentials
aws sts get-caller-identity

# Check S3 bucket access
aws s3 ls s3://your-backup-bucket/

# Test network connectivity to S3
curl -I https://s3.amazonaws.com

# Check AWS CLI configuration
aws configure list

# Verify environment variables
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY
echo $AWS_DEFAULT_REGION

# Test upload with a small file
echo "test" > /tmp/test.txt
aws s3 cp /tmp/test.txt s3://your-backup-bucket/test.txt
```

### Solutions
- Verify AWS credentials are correct and not expired
- Check IAM permissions for S3 bucket access (s3:PutObject, s3:GetObject)
- Ensure network connectivity to AWS S3 endpoints
- Verify S3 bucket name and region are correct
- Check firewall rules and security groups
- Rotate credentials if they are compromised or expired
- Verify bucket policy allows uploads from your source

---

## 3. Encryption Errors - Key Length Issues

### Symptoms
- "Invalid key length" errors
- Encryption/decryption failures
- "Bad decrypt" or "wrong final block length" errors

### Diagnostic Commands
```bash
# Check encryption key length (should be 32 bytes for AES-256)
echo -n "$BACKUP_ENCRYPTION_KEY" | wc -c

# Verify key is base64 encoded (if required)
echo "$BACKUP_ENCRYPTION_KEY" | base64 -d | wc -c

# Test encryption with OpenSSL
echo "test" | openssl enc -aes-256-cbc -salt -pbkdf2 -pass pass:"$BACKUP_ENCRYPTION_KEY"

# Check for non-printable characters
echo "$BACKUP_ENCRYPTION_KEY" | od -c

# Verify environment variable is set
env | grep BACKUP_ENCRYPTION_KEY
```

### Solutions
- Ensure encryption key is exactly 32 bytes (256 bits) for AES-256
- Verify key encoding (base64, hex, or raw)
- Check for whitespace or newline characters in the key
- Regenerate encryption key if corrupted
- Update key in all configuration files and environment variables
- Test encryption/decryption before running full backup

---

## 4. pg_dump Permission Errors

### Symptoms
- "permission denied" errors during database dump
- "role does not have permission" errors
- Incomplete database backups

### Diagnostic Commands
```bash
# Check PostgreSQL user permissions
psql -U backup_user -d postgres -c "\du"

# List database permissions
psql -U postgres -c "SELECT datname, datacl FROM pg_database;"

# Check table permissions
psql -U backup_user -d your_database -c "\dp"

# Test connection as backup user
psql -U backup_user -d your_database -c "SELECT 1;"

# Check pg_hba.conf authentication
sudo cat /etc/postgresql/*/main/pg_hba.conf | grep backup

# Verify role membership
psql -U postgres -c "SELECT * FROM pg_roles WHERE rolname = 'backup_user';"
```

### Solutions
- Grant necessary permissions to backup user:
  ```sql
  GRANT CONNECT ON DATABASE your_database TO backup_user;
  GRANT USAGE ON SCHEMA public TO backup_user;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;
  GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_user;
  ```
- Add backup user to required roles (e.g., `pg_read_all_data`)
- Update pg_hba.conf to allow connections from backup user
- Use PostgreSQL superuser if full backup is required
- Check database-specific permissions for locked-down databases

---

## 5. Backup Service Not Running

### Symptoms
- Scheduled backups not executing
- Service status shows "inactive" or "failed"
- No recent backup files

### Diagnostic Commands
```bash
# Check systemd service status
sudo systemctl status backup.service
sudo systemctl status backup.timer

# View service logs
sudo journalctl -u backup.service -n 50
sudo journalctl -u backup.timer -n 50

# Check if service is enabled
sudo systemctl is-enabled backup.service
sudo systemctl is-enabled backup.timer

# List all backup-related services
sudo systemctl list-units | grep backup

# Check cron jobs (if using cron)
crontab -l
sudo crontab -l

# Verify service file syntax
sudo systemd-analyze verify backup.service
```

### Solutions
- Start the service: `sudo systemctl start backup.service`
- Enable service on boot: `sudo systemctl enable backup.service`
- Check service configuration file for syntax errors
- Review logs for specific error messages
- Verify timer configuration (if using systemd timers)
- Restart failed service: `sudo systemctl restart backup.service`
- Check file permissions on service files

---

## 6. Alerts Not Sending

### Symptoms
- Backup failures occur but no notifications received
- Email or webhook alerts not working
- Alert logs show errors

### Diagnostic Commands
```bash
# Check SMTP configuration
nc -zv smtp.example.com 587
telnet smtp.example.com 587

# Test email sending
echo "Test email" | mail -s "Test Subject" admin@example.com

# Verify environment variables for alerts
env | grep -E "SMTP|EMAIL|ALERT|WEBHOOK"

# Check webhook endpoint
curl -X POST -H "Content-Type: application/json" \
  -d '{"test": "message"}' \
  https://your-webhook-endpoint.com

# Review alert service logs
sudo journalctl -u backup-alerts.service -n 50

# Check network connectivity
ping smtp.example.com
curl -I https://your-webhook-endpoint.com
```

### Solutions
- Verify SMTP credentials and server settings
- Check firewall rules for outbound email (port 587/465/25)
- Test webhook URL is accessible and responding
- Verify alert recipient addresses are correct
- Check spam/junk folders for blocked emails
- Review application logs for alert failures
- Ensure alert service has network access
- Validate JSON payload format for webhooks
- Check SSL/TLS certificate issues for secure connections

---

## General Troubleshooting Tips

### Enable Debug Logging
Add verbose flags to backup scripts:
```bash
set -x  # Enable bash debug mode
export DEBUG=1
```

### Check System Resources
```bash
# CPU usage
top -bn1 | head -20

# Memory usage
free -h

# I/O wait
iostat -x 1 5

# Process list
ps aux | grep backup
```

### Review All Logs
```bash
# System logs
sudo journalctl -xe

# Application logs
tail -f /var/log/backup.log

# PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*-main.log
```

### Test Backup Components Individually
- Test database connection separately
- Test S3 upload with small file
- Test encryption/decryption manually
- Verify each step of backup pipeline

---

## Getting Help

If issues persist after following this guide:

1. Collect diagnostic output from relevant commands
2. Review all error logs with timestamps
3. Document steps taken and results observed
4. Contact the infrastructure team with detailed information

**Emergency Contact**: infrastructure@example.com
