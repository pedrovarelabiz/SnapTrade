# Telegram Alerting Setup Guide

This guide walks you through setting up Telegram bot alerts for crash notifications and system monitoring.

## Overview

The listener uses a Telegram bot to send real-time alerts when crashes occur, connections fail, or other critical events happen. This requires:
1. A Telegram bot (created via BotFather)
2. A bot token (provided by BotFather)
3. A chat ID (where alerts will be sent)
4. Environment configuration

---

## Step 1: Create a Telegram Bot

### 1.1 Open BotFather

1. Open Telegram on your phone or desktop
2. Search for **@BotFather** (verified account with blue checkmark)
3. Start a chat by clicking **START**

### 1.2 Create Your Bot

Send the `/newbot` command to BotFather:

```
/newbot
```

BotFather will guide you through the setup:

**Example conversation:**
```
You: /newbot

BotFather: Alright, a new bot. How are we going to call it?
           Please choose a name for your bot.

You: SnapTrade Alerts

BotFather: Good. Now let's choose a username for your bot.
           It must end in `bot`. Like this, for example: TetrisBot or tetris_bot.

You: snaptrade_alerts_bot

BotFather: Done! Congratulations on your new bot. You will find it at
           t.me/snaptrade_alerts_bot. You can now add a description,
           about section and profile picture for your bot, see /help for a list of commands.

           Use this token to access the HTTP API:
           1234567890:ABCdefGHIjklMNOpqrsTUVwxyzABCDEFGH

           Keep your token secure and store it safely, it can be used by
           anyone to control your bot.
```

### 1.3 Save Your Bot Token

**IMPORTANT:** Copy the bot token immediately. It looks like:
```
1234567890:ABCdefGHIjklMNOpqrsTUVwxyzABCDEFGH
```

This is your `ALERT_BOT_TOKEN`.

⚠️ **Security Note:** Never commit this token to git or share it publicly. Anyone with this token can control your bot.

---

## Step 2: Get Your Chat ID

The chat ID identifies where the bot should send messages. You can send alerts to:
- Your personal chat (personal user ID)
- A group chat (group chat ID)
- A channel (channel ID)

### Method 1: Personal Chat (Recommended for Testing)

1. Search for your bot username (e.g., `@snaptrade_alerts_bot`)
2. Click **START** to initiate a chat
3. Send any message to your bot (e.g., "Hello")
4. Get your chat ID using the Telegram API:

```bash
# Replace YOUR_BOT_TOKEN with your actual token
curl https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
```

**Example response:**
```json
{
  "ok": true,
  "result": [
    {
      "update_id": 123456789,
      "message": {
        "message_id": 1,
        "from": {
          "id": 987654321,
          "is_bot": false,
          "first_name": "John",
          "username": "john_doe"
        },
        "chat": {
          "id": 987654321,
          "first_name": "John",
          "username": "john_doe",
          "type": "private"
        },
        "date": 1234567890,
        "text": "Hello"
      }
    }
  ]
}
```

Your chat ID is the `"id"` field under `"chat"`. In this example: `987654321`

### Method 2: Group Chat

1. Create a new Telegram group
2. Add your bot to the group (search by username, e.g., `@snaptrade_alerts_bot`)
3. Send a message to the group (e.g., "Test")
4. Use the same `getUpdates` API call:

```bash
curl https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
```

**Example response:**
```json
{
  "ok": true,
  "result": [
    {
      "update_id": 123456790,
      "message": {
        "message_id": 2,
        "from": {
          "id": 987654321,
          "first_name": "John"
        },
        "chat": {
          "id": -1001234567890,
          "title": "SnapTrade Monitoring",
          "type": "supergroup"
        },
        "date": 1234567891,
        "text": "Test"
      }
    }
  ]
}
```

Group chat IDs are negative numbers starting with `-100`. In this example: `-1001234567890`

### Method 3: Using a Bot (Alternative)

1. Add **@userinfobot** to your chat or group
2. It will automatically send the chat ID
3. Remove the bot after getting the ID

---

## Step 3: Configure the Listener

### 3.1 Edit Environment Variables

Open your `.env` file in the `listener` directory:

```bash
cd listener
nano .env  # or use your preferred editor
```

### 3.2 Add Your Credentials

Add or update the following variables:

```bash
# Alert Bot Configuration
ALERT_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyzABCDEFGH
ALERT_CHAT_ID=987654321

# Enable crash alerts
ENABLE_CRASH_ALERTS=true
```

**For group chats**, use the negative group ID:
```bash
ALERT_CHAT_ID=-1001234567890
```

### 3.3 Optional: Customize Alert Behavior

```bash
# Reconnection settings
INITIAL_RECONNECT_DELAY_SECONDS=1
MAX_RECONNECT_DELAY_SECONDS=60

# Health monitoring
HEALTHCHECK_PORT=8080
```

### 3.4 Save and Secure

1. Save the `.env` file
2. Verify permissions (should not be world-readable):
   ```bash
   chmod 600 .env
   ```
3. Ensure `.env` is in `.gitignore`:
   ```bash
   grep -q "^\.env$" .gitignore || echo ".env" >> .gitignore
   ```

---

## Step 4: Test Your Alert Setup

### 4.1 Test Alert Delivery

Run the test script to verify your configuration:

```bash
python test_alert_delivery.py
```

**Expected output:**
```
Testing alert delivery...
✓ Alert sent successfully
Check your Telegram chat for the test message
```

You should receive a message in your Telegram chat that looks like:
```
🚨 Test Alert

This is a test message from SnapTrade Listener.
If you see this, alerts are working correctly!

Time: 2026-03-22 14:30:45 UTC
```

### 4.2 Test with Mock Crash

Run the mock crash test:

```bash
python test_alert_mock.py
```

This simulates a crash and verifies that alerts are sent properly.

### 4.3 Manual Test with Curl

Send a test message directly using curl:

```bash
BOT_TOKEN="your_bot_token_here"
CHAT_ID="your_chat_id_here"
MESSAGE="Test alert from SnapTrade Listener"

curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"${CHAT_ID}\", \"text\": \"${MESSAGE}\"}"
```

**Expected response:**
```json
{
  "ok": true,
  "result": {
    "message_id": 123,
    "chat": {
      "id": 987654321,
      "type": "private"
    },
    "date": 1234567890,
    "text": "Test alert from SnapTrade Listener"
  }
}
```

---

## Step 5: Start the Listener with Alerts

### 5.1 Start the Listener

```bash
python listener.py
```

### 5.2 Verify Startup

Check the logs for confirmation:
```
INFO: Crash recovery enabled with alerts
INFO: Alert bot configured for chat ID: 987654321
INFO: Connected to Telegram successfully
```

### 5.3 Monitor Alerts

You should receive alerts for:
- ✅ **Successful startup** - "Listener started successfully"
- 🔄 **Reconnection attempts** - "Connection lost, attempting to reconnect"
- ⚠️ **Connection failures** - "Failed to reconnect after N attempts"
- 🚨 **Crashes** - "Listener crashed" with error details
- ❌ **Critical errors** - Various critical system issues

---

## Alert Message Examples

### Startup Alert
```
✅ Listener Started

SnapTrade Listener has started successfully.

Time: 2026-03-22 14:30:45 UTC
Status: Connected
```

### Connection Lost Alert
```
⚠️ Connection Lost

The Telegram connection was lost.

Time: 2026-03-22 15:45:12 UTC
Reconnection: Attempting in 1 seconds...
Attempt: 1/∞
```

### Crash Alert
```
🚨 Listener Crashed

The listener encountered a critical error and stopped.

Time: 2026-03-22 16:20:33 UTC
Error: ConnectionError: Network is unreachable

Stack Trace:
  File "listener.py", line 245, in run
    client.start()
  ...

The listener will attempt automatic recovery.
```

---

## Troubleshooting

### Problem: "Unauthorized" Error

**Symptom:**
```json
{"ok":false,"error_code":401,"description":"Unauthorized"}
```

**Solution:**
- Verify your `ALERT_BOT_TOKEN` is correct
- Ensure there are no extra spaces or quotes
- Generate a new token from BotFather if needed: `/token`

### Problem: "Chat not found" Error

**Symptom:**
```json
{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}
```

**Solution:**
- Ensure you've sent at least one message to your bot (personal chat) or added the bot to the group
- Verify the chat ID is correct (positive for personal, negative for groups)
- Try using `@userinfobot` to confirm your chat ID

### Problem: Bot Not Responding

**Checklist:**
1. Verify bot is not blocked: Search for your bot in Telegram and click "Restart"
2. Check bot is in the group (for group chats)
3. Ensure the bot has permission to send messages in the group
4. Test with curl to isolate the issue

### Problem: Alerts Not Sent

**Debug steps:**
1. Check `ENABLE_CRASH_ALERTS=true` in `.env`
2. Verify no Python errors in startup logs
3. Check network connectivity: `curl https://api.telegram.org/bot`
4. Run `test_alert_delivery.py` to isolate configuration issues
5. Review listener logs for alert-related errors

### Problem: Rate Limiting

**Symptom:** Too many alerts, getting rate limited by Telegram

**Solution:**
- Telegram allows ~30 messages per second to the same chat
- For frequent alerts, consider implementing alert batching
- Check `test_rate_limiting.py` for rate limit behavior

---

## Security Best Practices

1. **Never commit tokens**: Always keep `.env` in `.gitignore`
2. **Restrict token access**: Only share with authorized team members
3. **Use group chats for teams**: Avoid sharing personal chat IDs
4. **Regenerate compromised tokens**: Use BotFather's `/revoke` command
5. **Monitor bot activity**: Regularly check BotFather for unauthorized access
6. **Set file permissions**: Keep `.env` at 600 (owner read/write only)

---

## Advanced Configuration

### Customize Alert Messages

Edit `listener.py` to customize alert formatting:
- Modify the `send_alert()` function
- Add custom emoji or formatting
- Include additional context or metrics

### Multiple Alert Destinations

To send alerts to multiple chats:
1. Create separate environment variables: `ALERT_CHAT_ID_1`, `ALERT_CHAT_ID_2`
2. Modify `send_alert()` to loop through all chat IDs
3. Consider different severity levels for different groups

### Alert Filtering

Implement alert filtering by error type:
```python
if not should_alert(error_type):
    return
```

### Integration with Monitoring Tools

- Forward alerts to PagerDuty, Slack, or other tools
- Use webhook bridges if needed
- Consider Telegram Bot API webhooks for bidirectional communication

---

## Additional Resources

- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [BotFather Commands Reference](https://core.telegram.org/bots#6-botfather)
- [Telegram Chat ID FAQ](https://core.telegram.org/bots/faq#how-do-i-get-chat-id)
- Project crash recovery documentation: `CRASH_RECOVERY_RUNBOOK.md`

---

## Quick Reference

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `ALERT_BOT_TOKEN` | Yes* | `123456:ABC...` | Bot token from BotFather |
| `ALERT_CHAT_ID` | Yes* | `987654321` | Personal/group chat ID |
| `ENABLE_CRASH_ALERTS` | No | `true` | Enable/disable alerts |
| `HEALTHCHECK_PORT` | No | `8080` | Health monitoring port |

*Required only when `ENABLE_CRASH_ALERTS=true` (default)

---

**Need Help?**
- Test your setup: `python test_alert_delivery.py`
- Check logs: `tail -f listener.log`
- Review crash recovery: See `CRASH_RECOVERY_RUNBOOK.md`
