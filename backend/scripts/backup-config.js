"use strict";
/**
 * Backup Configuration Settings
 *
 * This file contains all configuration settings for the backup system
 * including S3 storage, encryption, retention, and database connection details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BACKUP_CONFIG = exports.DB_CONFIG = exports.LOCAL_BACKUP_DIR = exports.ENCRYPTION_KEY_ID = exports.ENCRYPTION_ALGORITHM = exports.ENCRYPTION_ENABLED = exports.BACKUP_SCHEDULE = exports.RETENTION_DAYS = exports.AWS_REGION = exports.S3_BUCKET_NAME = void 0;
// Load environment variables
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
// AWS S3 Configuration
exports.S3_BUCKET_NAME = process.env.BACKUP_S3_BUCKET || 'snaptrade-unified-backups';
exports.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
// Backup Retention Configuration
exports.RETENTION_DAYS = 30;
// Backup Schedule Configuration (cron format)
exports.BACKUP_SCHEDULE = process.env.BACKUP_SCHEDULE || '0 2 * * *'; // Daily at 2 AM UTC
// Encryption Settings
exports.ENCRYPTION_ENABLED = process.env.BACKUP_ENCRYPTION_ENABLED !== 'false';
exports.ENCRYPTION_ALGORITHM = 'AES256';
exports.ENCRYPTION_KEY_ID = process.env.BACKUP_KMS_KEY_ID || '';
// Local Backup Directory
exports.LOCAL_BACKUP_DIR = process.env.LOCAL_BACKUP_DIR || '/var/backups/snaptrade';
// Database Connection Configuration
exports.DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'snaptrade_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
};
// Backup Configuration Object
exports.BACKUP_CONFIG = {
    s3: {
        bucket: exports.S3_BUCKET_NAME,
        region: exports.AWS_REGION,
    },
    retention: {
        days: exports.RETENTION_DAYS,
    },
    schedule: exports.BACKUP_SCHEDULE,
    encryption: {
        enabled: exports.ENCRYPTION_ENABLED,
        algorithm: exports.ENCRYPTION_ALGORITHM,
        keyId: exports.ENCRYPTION_KEY_ID,
    },
    local: {
        directory: exports.LOCAL_BACKUP_DIR,
    },
    database: exports.DB_CONFIG,
};
exports.default = exports.BACKUP_CONFIG;
//# sourceMappingURL=backup-config.js.map