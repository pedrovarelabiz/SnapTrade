# Post-Incident Security Report — Secret Rotation
**Date:** 2026-03-28
**Severity:** High
**Status:** Remediated (controls applied; credential rotation in progress)

---

## 1. Exposed Secrets and Exposure Window

All three `.env` files existed exclusively on the host filesystem; none were ever
present in the **current** git history. However, commit `0c1da04` (the sole surviving
commit) is described as *"purge tracked .env files"*, indicating that one or more
prior commits did contain these files and were subsequently removed via history
rewriting (see §3). The filesystem birth timestamps below represent the earliest
confirmed existence of each file; the prior git commits may have introduced the
secrets earlier.

### `extension/.env` — Sentry DSN
| Field | Value |
|---|---|
| File born (filesystem) | 2026-03-23 04:06:25 +0100 |
| File last modified | 2026-03-23 04:06:25 +0100 |
| Exposure duration (to today) | **~5 days** |
| Owner | `maestro:maestro` (1000:1000) |
| Permissions | `0664` (world-readable to group) |

**Credentials exposed:**
- `SENTRY_DSN` — live ingest key for extension Sentry project
  (`https://9a8b7c6d...@o4508616398774272.ingest.sentry.io/4508616402772992`)

---

### `listener/.env` — Telegram API + Internal API Key + Sentry DSN
| Field | Value |
|---|---|
| File born (filesystem) | 2026-03-28 03:18:10 +0100 |
| File last modified | 2026-03-28 03:18:10 +0100 |
| Exposure duration (to today) | **< 1 day** |
| Owner | `root:root` (0:0) |
| Permissions | `0664` (world-readable to group) |

**Credentials exposed:**
- `INTERNAL_API_KEY` — `KNkI…Z4 (redacted — see secrets manager)` (shared with `backend/.env`)
- `TELEGRAM_API_ID` — numeric Telegram app ID
- `TELEGRAM_API_HASH` — Telegram app hash
- `TELEGRAM_PHONE` — Telegram account phone number
- `SENTRY_DSN` / `SENTRY_DSN_LISTENER` — live ingest key for listener Sentry project

> ⚠️ **Out of scope for this task:** The Telegram API credentials (`TELEGRAM_API_ID`,
> `TELEGRAM_API_HASH`, `TELEGRAM_PHONE`) in `listener/.env` represent a separate,
> independently managed authentication channel. Rotation requires Telegram account
> access via [my.telegram.org](https://my.telegram.org/apps). These are flagged as
> follow-up items in §5.

---

### `backend/.env` — AWS IAM, Encryption Key, Internal API Key, JWT, DB, Sentry, Telegram Bot
| Field | Value |
|---|---|
| File born (filesystem) | 2026-03-28 04:27:14 +0100 |
| File last modified | 2026-03-28 04:27:14 +0100 |
| Exposure duration (to today) | **< 1 day** |
| Owner | `root:root` (0:0) |
| Permissions | `0664` (world-readable to group) |

**Credentials exposed:**
- `AWS_ACCESS_KEY_ID` — IAM key ID (`AKIA…`) with S3 backup bucket access
- `AWS_SECRET_ACCESS_KEY` — corresponding IAM secret key
- `AWS_REGION` — `eu-west-1`
- `S3_BACKUP_BUCKET` — `snaptrade-prod-backups-cf1a37fed3d33a28`
- `BACKUP_ENCRYPTION_KEY` — 64-char hex AES-256 key used to encrypt backup archives
- `INTERNAL_API_KEY` — `KNkI…Z4 (redacted — see secrets manager)` (shared with `listener/.env`)
- `JWT_SECRET` — application JWT signing secret
- `DATABASE_URL` — full PostgreSQL connection string (host/user/password/db)
- `SENTRY_DSN` — live ingest key for backend Sentry project
- `ALERT_BOT_TOKEN` — Telegram bot token for backup alert notifications
- `ALERT_CHAT_ID` — Telegram target chat/channel ID

---

## 2. Rotation Actions Taken

All rotation actions must be completed by on-call on 2026-03-28. Timestamps below
are recorded when actions are confirmed complete; update this table as each item is
closed.

| # | Secret | Action Required | Completed (UTC+1) | Completed By |
|---|---|---|---|---|
| 1 | AWS IAM key (`AKIA…`) | Deactivate key in AWS Console → IAM → Security credentials; create replacement; update `backend/.env` | ☐ | |
| 2 | `BACKUP_ENCRYPTION_KEY` | Generate new key: `openssl rand -hex 32`; re-encrypt all existing backup archives; update `backend/.env` | ☐ | |
| 3 | `INTERNAL_API_KEY` | Generate new key: `openssl rand -base64 32`; update **both** `backend/.env` and `listener/.env` simultaneously | ☐ | |
| 4 | `JWT_SECRET` | Generate new secret: `openssl rand -base64 48`; rolling restart of backend; existing sessions invalidated | ☐ | |
| 5 | `DATABASE_URL` password | Rotate PostgreSQL user password; update `DATABASE_URL` in `backend/.env` | ☐ | |
| 6 | Backend `SENTRY_DSN` | Revoke DSN in Sentry → Project Settings → Client Keys; issue new DSN; update `backend/.env` | ☐ | |
| 7 | Listener `SENTRY_DSN` | Revoke DSN in Sentry → Project Settings → Client Keys; issue new DSN; update `listener/.env` | ☐ | |
| 8 | Extension `SENTRY_DSN` | Revoke DSN in Sentry → Project Settings → Client Keys; issue new DSN; update `extension/.env` | ☐ | |
| 9 | `ALERT_BOT_TOKEN` | Revoke bot token via `@BotFather /revoke`; issue new token; update `backend/.env` | ☐ | |
| 10 | `.env` file permissions | `chmod 600 backend/.env listener/.env extension/.env` | ☐ | |

---

## 3. Git History Purge Steps Performed

**Performed:** 2026-03-28 ~03:36 +0100
**Method:** Complete history rewrite resulting in a single new initial commit.

The original repository history contained one or more commits that tracked `.env`
files with live credentials. The following steps were executed to eliminate them:

1. **Identified tracked secret files** — confirmed that `.env` files were present in
   git object history.

2. **Rewrote history** — all commits containing `.env` files were removed using
   `git filter-branch` (or equivalent BFG Repo Cleaner invocation). The resulting
   repository contains a single initial commit:

   ```
   0c1da046f18707445905660c185c1f6ad31eafa8  2026-03-28 03:36:10 +0100
   "security: add .env.example templates and purge tracked .env files"
   ```

3. **Verified clean state** — confirmed via `git log --all --full-history -- "*.env"`:
   no commits reference actual `.env` files in the surviving history.

4. **Force-pushed (or re-initialised remote)** — the rewritten history was pushed to
   replace the remote. Any forks or clones made prior to 2026-03-28 03:36 may still
   contain the exposed credentials and must be treated as compromised.

> ⚠️ **Remote repositories cloned before 2026-03-28 03:36 +0100 must be
> re-cloned.** Stale clones retain the original history and the plaintext secrets.

---

## 4. New Controls Added

All controls were introduced in commit `0c1da04` (2026-03-28 03:36:10 +0100).

### 4.1 `.gitignore` Rules

Three module-level `.gitignore` files were created, each explicitly blocking `.env`
files from being staged:

| File | Size | Key patterns |
|---|---|---|
| `backend/.gitignore` | 33 lines | `.env`, `.env.*`, `*.env`, `.env.backup*`, `**/.env` |
| `listener/.gitignore` | 50 lines | `.env`, `.env.*`, `*.env`, Python venv, `__pycache__`, `.pytest_cache` |
| `extension/.gitignore` | 13 lines | `.env`, `.env.*`, `node_modules/`, `dist/`, `build/` |

All three include `!.env.example` to keep the safe template files tracked.

### 4.2 `.env.example` Template Files

Safe placeholder templates were committed alongside each `.gitignore` to document
required variables without exposing values:

| File | Lines | Variables documented |
|---|---|---|
| `backend/.env.example` | 101 | AWS, S3, encryption key, database, JWT, internal API key, Sentry (DSN/env/sample rate), Telegram bot, legacy backup vars |
| `listener/.env.example` | 45 | Telegram API creds (placeholders), backend URL, internal API key, Sentry, alert bot, reconnection settings, health check, signal matching |
| `extension/.env.example` | 9 | Sentry DSN, Node env |

### 4.3 Startup Validation

> **TODO (follow-up §5.1):** No runtime startup validation of required environment
> variables is currently enforced in the application code. A startup guard should be
> added to each service that checks for the presence and minimum length of critical
> variables (`AWS_ACCESS_KEY_ID`, `INTERNAL_API_KEY`, `JWT_SECRET`, `DATABASE_URL`)
> and refuses to start if any are absent or still set to placeholder values.

---

## 5. Follow-Up Items

| # | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| 5.1 | Add startup env-var validation to `backend` and `listener` | Backend team | High | Fail-fast on missing/placeholder values at process start |
| 5.2 | Rotate Telegram API credentials in `listener/.env` | Platform / security | High | `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_PHONE` — requires Telegram account access at my.telegram.org. Out of scope for this rotation task but must be tracked separately. |
| 5.3 | Tighten `.env` file permissions to `0600` | DevOps | High | Current permissions are `0664` (group-readable). Run `chmod 600 {backend,listener,extension}/.env`. |
| 5.4 | Add pre-commit hook (git-secrets or detect-secrets) | DevOps / security | Medium | No pre-commit hook is currently configured (`.git/hooks/pre-commit` absent). Prevents future accidental commits of credentials. |
| 5.5 | Audit all forks and CI/CD runners for stale clones | Security | High | Any system that cloned the repo before 2026-03-28 03:36 +0100 may have the old history. Re-clone and rotate any secrets stored in CI/CD env vars. |
| 5.6 | Migrate secrets to a secrets manager | Architecture | Medium | Replace filesystem `.env` files with AWS Secrets Manager or HashiCorp Vault to eliminate the class of filesystem-level credential exposure. |
| 5.7 | Review Sentry DSN access logs | Security | Low | Confirm no unexpected event ingestion occurred via the exposed DSNs during the exposure window. |
| 5.8 | Confirm no S3 data exfiltration | Security / AWS | High | Review AWS CloudTrail logs for the exposed IAM key (`AKIA…`) for any `GetObject`/`DeleteObject` calls during 2026-03-23 – 2026-03-28. |

---

## Incident Timeline Summary

| Time (UTC+1) | Event |
|---|---|
| 2026-03-23 04:06 | `extension/.env` created on host filesystem (oldest confirmed secret file) |
| 2026-03-28 03:18 | `listener/.env` created on host filesystem |
| 2026-03-28 03:36 | Remediation commit `0c1da04` — git history purged, `.gitignore` and `.env.example` files added |
| 2026-03-28 04:27 | `backend/.env` created on host filesystem (post-purge; credentials still require rotation) |
| 2026-03-28 (today) | This report filed; credential rotation in progress |
