# SnapTrade Unified

## Database Backup & Disaster Recovery

This project implements comprehensive database backup and disaster recovery procedures to ensure data integrity and business continuity.

**Key Features:**
- **Automated Daily Backups**: Backups run automatically every day
- **30-Day Retention**: All backups are retained for 30 days
- **Encrypted S3 Storage**: Backups are securely stored in Amazon S3 with encryption

**Documentation:**
- [Backup Strategy](backend/docs/BACKUP_STRATEGY.md) - Detailed backup architecture, scheduling, and procedures
- [Disaster Recovery Runbook](backend/docs/DISASTER_RECOVERY_RUNBOOK.md) - Step-by-step recovery procedures for various failure scenarios

For implementation details, configuration, and recovery procedures, please refer to the documentation links above.

## Error Monitoring

This project uses Sentry for comprehensive error tracking and monitoring across all services.

**Key Features:**
- **Real-time Error Tracking**: Automatic capture and reporting of errors and exceptions
- **Performance Monitoring**: Track application performance and identify bottlenecks
- **Release Tracking**: Monitor errors by deployment version

**Configuration:**
- Requires `SENTRY_DSN_*` environment variables for each service (backend, frontend, listener)
- See [Sentry Setup Guide](docs/SENTRY_SETUP.md) for detailed configuration instructions

For complete setup instructions and best practices, please refer to the documentation link above.

## Chrome Extension

The browser extension source lives in `extension/` at the repository root. This is the **only** canonical location — do not create copies under `frontend/` or any other subdirectory.

**Build:**
```bash
cd extension
npm ci
npm run build   # output → extension/dist/
```

**Architecture note:** See [Extension Canonical Path](docs/architecture/extension-canonical-path.md) for the history of why a former duplicate at `frontend/extension/` was removed and why it must not be recreated.
