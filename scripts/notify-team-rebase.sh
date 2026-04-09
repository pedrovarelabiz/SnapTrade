#!/usr/bin/env bash
# =============================================================================
# notify-team-rebase.sh
# Dispatches the URGENT_REBASE_NOTICE to all team channels:
#   - Telegram (ALERT_BOT_TOKEN / ALERT_CHAT_ID)
#   - Slack    (SLACK_CRITICAL_WEBHOOK)
#   - Prints an email draft for manual send to engineering@company.com
#
# Usage:
#   ALERT_BOT_TOKEN=<tok> ALERT_CHAT_ID=<id> \
#   SLACK_CRITICAL_WEBHOOK=<url> \
#   bash scripts/notify-team-rebase.sh
# =============================================================================

set -euo pipefail

NEW_HEAD="0c1da04"
COMMIT_MSG="security: add .env.example templates and purge tracked .env files"
DATE="2026-03-28"

# ---------------------------------------------------------------------------
# Shared message body
# ---------------------------------------------------------------------------
NOTICE_TEXT="🚨 *URGENT — Repository History Rewritten* 🚨

All existing local clones of *snaptrade-unified* are now invalid.

*New HEAD:* \`${NEW_HEAD}\`
*Commit:* ${COMMIT_MSG}
*Date:* ${DATE}

*Every developer must:*
1️⃣  Delete their old local clone (\`rm -rf snaptrade-unified/\`)
2️⃣  Run a fresh \`git clone <repo_url>\` — do NOT \`git pull\`
3️⃣  Delete any local \`.env\` files that came from this repo
4️⃣  Verify by running \`git log --oneline -1\` and confirming SHA = \`${NEW_HEAD}\`
5️⃣  Reply here with your SHA output to confirm you are on the correct commit

⚠️ \`git pull\` will fail with non-fast-forward errors — do NOT force-merge.

Full instructions: see \`URGENT_REBASE_NOTICE.md\` in the repo root.
Questions? Ping @devops-team or email devops@company.com"

# ---------------------------------------------------------------------------
# 1. Telegram
# ---------------------------------------------------------------------------
send_telegram() {
  if [[ -z "${ALERT_BOT_TOKEN:-}" || -z "${ALERT_CHAT_ID:-}" ]]; then
    echo "[TELEGRAM] Skipped — ALERT_BOT_TOKEN or ALERT_CHAT_ID not set."
    return
  fi

  echo "[TELEGRAM] Sending notice..."
  RESPONSE=$(curl -s -X POST \
    "https://api.telegram.org/bot${ALERT_BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{
      \"chat_id\": \"${ALERT_CHAT_ID}\",
      \"text\": $(echo "${NOTICE_TEXT}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
      \"parse_mode\": \"Markdown\"
    }")

  if echo "${RESPONSE}" | python3 -c 'import json,sys; d=json.load(sys.stdin); exit(0 if d.get("ok") else 1)' 2>/dev/null; then
    echo "[TELEGRAM] ✅ Sent successfully."
  else
    echo "[TELEGRAM] ❌ Failed. Response: ${RESPONSE}"
  fi
}

# ---------------------------------------------------------------------------
# 2. Slack
# ---------------------------------------------------------------------------
send_slack() {
  if [[ -z "${SLACK_CRITICAL_WEBHOOK:-}" ]]; then
    echo "[SLACK] Skipped — SLACK_CRITICAL_WEBHOOK not set."
    return
  fi

  echo "[SLACK] Sending notice to #alerts-critical..."
  RESPONSE=$(curl -s -X POST \
    "${SLACK_CRITICAL_WEBHOOK}" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": \"🚨 URGENT: snaptrade-unified history rewritten — all clones invalid\",
      \"blocks\": [
        {
          \"type\": \"header\",
          \"text\": {
            \"type\": \"plain_text\",
            \"text\": \"🚨 URGENT: Repository History Rewritten\"
          }
        },
        {
          \"type\": \"section\",
          \"text\": {
            \"type\": \"mrkdwn\",
            \"text\": \"*All existing local clones of snaptrade-unified are now invalid.*\n\nNew HEAD: \`${NEW_HEAD}\` (${COMMIT_MSG})\n\nEvery developer must fresh-clone. See \`URGENT_REBASE_NOTICE.md\` for full steps.\"
          }
        },
        {
          \"type\": \"section\",
          \"fields\": [
            {\"type\": \"mrkdwn\", \"text\": \"*Action Required:*\n1. Delete old clone\n2. \`git clone <repo_url>\`\n3. Delete local .env files\n4. Verify SHA = \`${NEW_HEAD}\`\n5. Reply with your SHA output\"},
            {\"type\": \"mrkdwn\", \"text\": \"*Do NOT:*\n:no_entry: \`git pull\`\n:no_entry: Force-merge\n:no_entry: Use old .env files\"}
          ]
        },
        {
          \"type\": \"context\",
          \"elements\": [{
            \"type\": \"mrkdwn\",
            \"text\": \"Questions? Ping @devops-team | devops@company.com | ${DATE}\"
          }]
        }
      ]
    }")

  if [[ "${RESPONSE}" == "ok" ]]; then
    echo "[SLACK] ✅ Sent successfully."
  else
    echo "[SLACK] ❌ Failed. Response: ${RESPONSE}"
  fi
}

# ---------------------------------------------------------------------------
# 3. Email draft (printed — pipe to sendmail / mailx as needed)
# ---------------------------------------------------------------------------
print_email_draft() {
  echo ""
  echo "======================================================================"
  echo " EMAIL DRAFT — send to: engineering@company.com, devops@company.com"
  echo " Subject: [URGENT] snaptrade-unified: History Rewritten — Re-Clone Required"
  echo "======================================================================"
  cat <<EOF

Team,

URGENT: The snaptrade-unified repository history has been force-rewritten
to permanently remove .env files that were previously committed (SHA: ${NEW_HEAD}).

YOUR EXISTING LOCAL CLONE IS INVALID. You must:

  1. Delete your old clone:
       cd .. && rm -rf snaptrade-unified/

  2. Fresh clone (do NOT git pull):
       git clone <repo_url>

  3. Delete any .env files you had locally from this repo.

  4. Verify you are on the correct commit:
       git log --oneline -1
       # Must output: ${NEW_HEAD} ${COMMIT_MSG}

  5. Reply to this email with your git log output to confirm.

Full instructions: URGENT_REBASE_NOTICE.md in the repo root.

-- DevOps Team | devops@company.com
EOF
  echo "======================================================================"
}

# ---------------------------------------------------------------------------
# Run all channels
# ---------------------------------------------------------------------------
echo "=========================================="
echo "  snaptrade-unified Rebase Team Notifier"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "=========================================="

send_telegram
send_slack
print_email_draft

echo ""
echo "Dispatch complete. Track developer confirmations below:"
echo "  - Each developer must reply with: git log --oneline -1"
echo "  - Expected SHA: ${NEW_HEAD}"
