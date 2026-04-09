# Troubleshooting Guide

This guide covers common issues you may encounter when running the listener service.

## Alerts Not Sending

**Symptoms:**
- No Telegram messages are received
- Logs show successful threshold detection but no message delivery
- "Failed to send alert" errors in logs

**Common Causes & Solutions:**

1. **Invalid Bot Token**
   - Check that `TELEGRAM_BOT_TOKEN` is set correctly
   - Verify the token is valid by testing with Telegram's BotFather
   - Ensure no extra whitespace or quotes in the token
   ```bash
   # Test your token
   curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
   ```

2. **Invalid Chat ID**
   - Verify `TELEGRAM_CHAT_ID` is correct
   - Get your chat ID by sending `/start` to your bot and checking logs
   - Ensure chat ID includes the negative sign for group chats (e.g., `-1001234567890`)

3. **Bot Not Added to Channel/Group**
   - Add the bot to your channel or group
   - Ensure the bot has permission to send messages
   - For channels, make the bot an admin

## Continuous Reconnects

**Symptoms:**
- Connection drops repeatedly
- "Reconnecting..." messages in logs
- Service never stays connected for long

**Common Causes & Solutions:**

1. **Telegram API Access Issues**
   - Check your internet connection
   - Verify Telegram API is not blocked by firewall
   - Test connectivity: `curl https://api.telegram.org/`
   - If behind a proxy, configure HTTP_PROXY environment variable

2. **Network Instability**
   - Check for packet loss: `ping -c 10 api.telegram.org`
   - Verify DNS resolution works correctly
   - Consider using a more stable network connection

3. **Rate Limiting**
   - Reduce message frequency if sending too many alerts
   - Check if you've exceeded Telegram's rate limits
   - Review backoff settings in configuration

## Backoff Not Working

**Symptoms:**
- Connection attempts happen too frequently
- No delay between reconnection attempts
- Service immediately retries after failure

**Common Causes & Solutions:**

1. **Check Logs for Backoff Information**
   ```bash
   # Look for backoff-related messages
   tail -f logs/listener.log | grep -i "backoff\|retry\|delay"
   ```

2. **Verify Backoff Configuration**
   - Ensure `max_retries` is set appropriately
   - Check `initial_delay` and `max_delay` values
   - Confirm exponential backoff multiplier is configured

3. **Logic Errors**
   - Review backoff implementation in code
   - Ensure retry counter is being incremented
   - Check that delays are actually being applied (not skipped)

## Metrics Not Saving

**Symptoms:**
- Metrics file is empty or not updated
- "Permission denied" errors when writing metrics
- Metrics data is lost after restart

**Common Causes & Solutions:**

1. **File Permissions Issues**
   ```bash
   # Check current permissions
   ls -l metrics.json

   # Fix permissions if needed
   chmod 644 metrics.json

   # Ensure parent directory is writable
   chmod 755 .
   ```

2. **Disk Space Full**
   ```bash
   # Check available disk space
   df -h .

   # Clean up old logs if needed
   rm -f logs/*.old
   ```

3. **Invalid File Path**
   - Verify the metrics file path is correct
   - Ensure parent directories exist
   - Check if path is writable by the service user

4. **JSON Serialization Errors**
   - Check logs for JSON-related errors
   - Verify metric data structure is valid
   - Ensure no circular references in data

## General Debugging Tips

### Enable Debug Logging
```bash
# Set environment variable for verbose output
export LOG_LEVEL=debug
```

### Check Service Status
```bash
# View recent logs
tail -f logs/listener.log

# Check if process is running
ps aux | grep listener

# Monitor resource usage
top -p $(pgrep -f listener)
```

### Test Configuration
```bash
# Validate environment variables
env | grep TELEGRAM

# Test bot connectivity
python -c "import telegram; bot = telegram.Bot(token='YOUR_TOKEN'); print(bot.get_me())"
```

### Common Error Messages

| Error | Likely Cause | Solution |
|-------|--------------|----------|
| `Unauthorized` | Invalid bot token | Check TELEGRAM_BOT_TOKEN |
| `Chat not found` | Invalid chat ID | Verify TELEGRAM_CHAT_ID |
| `Connection timeout` | Network issues | Check internet connection |
| `Too Many Requests` | Rate limiting | Implement backoff, reduce frequency |
| `Permission denied` | File access issue | Fix file/directory permissions |

## Getting Help

If you continue to experience issues:

1. Check the logs in `logs/listener.log` for detailed error messages
2. Verify all environment variables are set correctly
3. Review the README.md for setup instructions
4. Test individual components in isolation
5. Open an issue with complete logs and configuration (redact sensitive data)
