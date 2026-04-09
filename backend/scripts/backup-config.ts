/**
 * Backup Configuration Settings
 *
 * This file contains all configuration settings for the backup system
 * including S3 storage, encryption, retention, and database connection details.
 */

// Load environment variables
import { config } from 'dotenv';
config();

// AWS S3 Configuration
export const S3_BUCKET_NAME = process.env.BACKUP_S3_BUCKET || 'snaptrade-unified-backups';
export const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Backup Retention Configuration
export const RETENTION_DAYS = 30;

// Backup Schedule Configuration (cron format)
export const BACKUP_SCHEDULE = process.env.BACKUP_SCHEDULE || '0 2 * * *'; // Daily at 2 AM UTC

// Encryption Settings
export const ENCRYPTION_ENABLED = process.env.BACKUP_ENCRYPTION_ENABLED !== 'false';
export const ENCRYPTION_ALGORITHM = 'AES256';
export const ENCRYPTION_KEY_ID = process.env.BACKUP_KMS_KEY_ID || '';

// Local Backup Directory
export const LOCAL_BACKUP_DIR = process.env.LOCAL_BACKUP_DIR || '/var/backups/snaptrade';

// Database Connection Configuration
export const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'snaptrade_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true',
};

// Backup Configuration Object
export const BACKUP_CONFIG = {
  s3: {
    bucket: S3_BUCKET_NAME,
    region: AWS_REGION,
  },
  retention: {
    days: RETENTION_DAYS,
  },
  schedule: BACKUP_SCHEDULE,
  encryption: {
    enabled: ENCRYPTION_ENABLED,
    algorithm: ENCRYPTION_ALGORITHM,
    keyId: ENCRYPTION_KEY_ID,
  },
  local: {
    directory: LOCAL_BACKUP_DIR,
  },
  database: DB_CONFIG,
};

export default BACKUP_CONFIG;
